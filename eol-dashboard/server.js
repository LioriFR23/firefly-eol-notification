/**
 * Firefly EOL Dashboard – EOL/EOS timeline, policy view, and CSV export.
 * Endpoints: auth, governance/insights (EOL), inventory, full CSV export.
 * Run: npm install && npm start  (serves on port 3001)
 */
const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const FIREFLY_BASE_URL = 'https://api.firefly.ai';

app.use(require('cors')());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ——— Auth ———
app.post('/api/auth', async (req, res) => {
  try {
    const { accessKey, secretKey } = req.body;
    if (!accessKey || !secretKey) {
      return res.status(400).json({ error: 'accessKey and secretKey required' });
    }
    const authResponse = await axios.post(`${FIREFLY_BASE_URL}/v2/login`, {
      accessKey,
      secretKey
    });
    const token = authResponse.data.accessToken;
    if (!token) return res.status(401).json({ error: 'No access token in response' });
    res.json({ accessToken: token });
  } catch (e) {
    res.status(401).json({ error: e.response?.data?.message || e.message || 'Auth failed' });
  }
});

// ——— Governance insights (EOL) – dynamic policy data ———
app.post('/api/governance/insights', async (req, res) => {
  try {
    const { accessToken, frameworks = ['EOL'], onlyMatchingAssets = true, afterKey } = req.body;
    if (!accessToken) return res.status(401).json({ error: 'accessToken required' });
    const body = { frameworks, onlyMatchingAssets };
    if (afterKey) body.afterKey = afterKey;
    const response = await axios.post(`${FIREFLY_BASE_URL}/v2/governance/insights`, body, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
    });
    res.json(response.data);
  } catch (e) {
    res.status(e.response?.status || 500).json(e.response?.data || { error: e.message });
  }
});

// ——— Helpers for full CSV: EOS/due from policy description ———
function getEosMapFromPolicy(policy) {
  try {
    const desc = policy.description;
    if (!desc || typeof desc !== 'string') return {};
    const parsed = JSON.parse(desc);
    const attrs = parsed && parsed.attributes;
    if (!Array.isArray(attrs)) return {};
    const map = {};
    attrs.forEach(a => { if (a && a.key != null && typeof a.value === 'number') map[String(a.key)] = a.value; });
    return map;
  } catch (_) { return {}; }
}

function getDaysUntilEos(policy) {
  return getDaysUntilEosFromMap(getEosMapFromPolicy(policy));
}

function getDaysUntilEosFromMap(eosMap) {
  const values = Object.values(eosMap);
  if (values.length === 0) return null;
  const minTs = Math.min(...values);
  return Math.floor((minTs - Math.floor(Date.now() / 1000)) / 86400);
}

function segmentLabel(days, policy) {
  if (days !== null) {
    if (days < 0) return 'Overdue';
    if (days <= 90) return '0-90 days';
    if (days <= 180) return '90d-6mo';
    return '6+ months';
  }
  if (policy) {
    const badge = (policy.badge || '').toLowerCase();
    const name = (policy.name || '').toLowerCase();
    if (badge.includes('ended') || name.includes('overdue') || name.includes('past')) return 'Overdue';
    if (badge.includes('imminent') || name.includes('0-90') || name.includes('0–90')) return '0-90 days';
    if (badge.includes('90d') || badge.includes('6mo') || badge.includes('upcoming') || name.includes('90d') || name.includes('6mo') || name.includes('bitnami')) return '90d-6mo';
    if (badge.includes('6+') || name.includes('6+')) return '6+ months';
    if (policy.badge) return policy.badge;
  }
  return 'See policy name';
}

function segmentFallback(seg, policyName, policyBadge) {
  if (seg && seg.trim()) return seg;
  const badge = (policyBadge || '').toLowerCase();
  const n = (policyName || '').toLowerCase();
  if (badge.includes('ended') || badge.includes('overdue') || n.includes('overdue') || n.includes('ended') || n.includes('past')) return 'Overdue';
  if (badge.includes('imminent') || n.includes('imminent') || n.includes('0-90') || n.includes('0–90')) return '0-90 days';
  if (badge.includes('90d') || badge.includes('6mo') || badge.includes('upcoming') || n.includes('90d') || n.includes('6mo') || n.includes('upcoming') || n.includes('bitnami') || n.includes('image risk')) return '90d-6mo';
  if (badge.includes('6+') || n.includes('6+')) return '6+ months';
  if (policyBadge && policyBadge.trim()) return policyBadge.trim();
  return '';
}

function csvEscape(s) {
  const t = String(s ?? '');
  if (/^[=+\-@\t]/.test(t) || t.indexOf(',') >= 0 || t.indexOf('"') >= 0 || t.indexOf('\n') >= 0) return '"' + t.replace(/"/g, '""') + '"';
  return t;
}

function formatEosAndDue(eosMap, asset) {
  const runtime = asset && asset.tfObject && asset.tfObject.runtime ? String(asset.tfObject.runtime) : null;
  const eosTs = runtime && eosMap[runtime] != null ? eosMap[runtime] : (Object.values(eosMap).length ? Math.min(...Object.values(eosMap)) : null);
  if (eosTs == null) return { eosDate: '', dueDate: '', daysUntilEos: '' };
  const eosDate = new Date(eosTs * 1000).toISOString().split('T')[0];
  const dueTs = eosTs - 90 * 86400;
  const dueDate = new Date(dueTs * 1000).toISOString().split('T')[0];
  const days = Math.floor((eosTs - Math.floor(Date.now() / 1000)) / 86400);
  return { eosDate, dueDate, daysUntilEos: String(days) };
}

// ——— Inventory: try v2 first (violatingPoliciesIds); if no results and we have policy name, fallback to v1 (governance) ———
const FIREFLY_INVENTORY_V2 = '/v2/api/inventory';
const FIREFLY_INVENTORY_V1 = '/api/v1.0/inventory';

function buildInventoryBodyV2(opts) {
  const { assetState = 'managed', assetTypes, violatingPoliciesIds, governance, afterKey, size } = opts || {};
  const body = { filters: {} };
  if (assetState) body.filters.assetState = assetState;
  if (assetTypes) body.filters.assetTypes = Array.isArray(assetTypes) ? assetTypes : [assetTypes];
  if (violatingPoliciesIds && violatingPoliciesIds.length) body.filters.violatingPoliciesIds = violatingPoliciesIds;
  if (governance && typeof governance === 'string' && governance.trim()) body.governance = governance.trim();
  if (size != null) body.size = size;
  if (afterKey != null) body.afterKey = afterKey;
  return body;
}

function buildInventoryBodyV1(opts) {
  const { assetState = 'managed', assetTypes, governance, afterKey, size } = opts || {};
  const body = { assetState: assetState || 'managed' };
  if (assetTypes) body.assetTypes = Array.isArray(assetTypes) ? assetTypes[0] : assetTypes;
  if (governance && typeof governance === 'string' && governance.trim()) body.governance = governance.trim();
  if (size != null) body.size = size;
  if (afterKey != null) body.afterKey = afterKey;
  return body;
}

app.post('/api/inventory', async (req, res) => {
  try {
    const { accessToken, assetTypes, size = 50, assetState = 'managed', afterKey, policyId, governance } = req.body;
    if (!accessToken) return res.status(401).json({ error: 'accessToken required' });
    const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
    const hasGovernance = governance && (typeof assetTypes === 'string' || (Array.isArray(assetTypes) && assetTypes.length));
    const hasPolicyId = policyId != null && policyId !== '';

    let data;
    if (hasGovernance) {
      try {
        const bodyV1 = buildInventoryBodyV1({
          assetState,
          assetTypes: assetTypes || undefined,
          governance,
          size: size || 200,
          afterKey
        });
        const response = await axios.post(`${FIREFLY_BASE_URL}${FIREFLY_INVENTORY_V1}`, bodyV1, { headers });
        data = response.data;
      } catch (_) {
        data = { responseObjects: [] };
      }
    }
    if (!data || !(data.responseObjects || []).length) {
      const bodyV2 = buildInventoryBodyV2({
        assetState,
        assetTypes: assetTypes || undefined,
        violatingPoliciesIds: hasPolicyId ? [policyId] : undefined,
        governance: governance || undefined,
        size,
        afterKey
      });
      const response = await axios.post(`${FIREFLY_BASE_URL}${FIREFLY_INVENTORY_V2}`, bodyV2, { headers });
      data = response.data;
    }

    res.json(data);
  } catch (e) {
    res.status(e.response?.status || 500).json(e.response?.data || { error: e.message });
  }
});

// ——— Fetch all assets for one policy (used for parallel export) ———
const policyType = (p) => Array.isArray(p.type) ? (p.type[0] || '') : (p.type || '');

async function fetchAssetsForPolicy(policy, headers) {
  const pType = policyType(policy);
  if (!policy.name || !pType) return { policy, assets: [] };
  let inventoryAfterKey = null;
  let assets = [];
  do {
    let data = null;
    try {
      const v1Body = buildInventoryBodyV1({
        assetState: 'managed',
        assetTypes: pType,
        governance: policy.name,
        size: 500,
        afterKey: inventoryAfterKey
      });
      const v1Res = await axios.post(`${FIREFLY_BASE_URL}${FIREFLY_INVENTORY_V1}`, v1Body, { headers });
      data = v1Res.data;
    } catch (_) {
      data = { responseObjects: [] };
    }
    if (!(data.responseObjects && data.responseObjects.length)) {
      try {
        const v2Body = buildInventoryBodyV2({
          assetState: 'managed',
          assetTypes: pType,
          violatingPoliciesIds: (policy.id || policy._id) ? [policy.id || policy._id] : undefined,
          governance: policy.name,
          size: 500,
          afterKey: inventoryAfterKey
        });
        const v2Res = await axios.post(`${FIREFLY_BASE_URL}${FIREFLY_INVENTORY_V2}`, v2Body, { headers });
        data = v2Res.data;
      } catch (_) {
        data = { responseObjects: [] };
      }
    }
    const list = (data && data.responseObjects) ? data.responseObjects : (data && data.assets) ? data.assets : (data && data.items) ? data.items : [];
    assets = assets.concat(Array.isArray(list) ? list : []);
    inventoryAfterKey = data && data.afterKey != null ? data.afterKey : null;
  } while (inventoryAfterKey);
  return { policy, assets };
}

// Run up to concurrency promises at a time, preserve order
async function runWithLimit(items, concurrency, fn) {
  const results = new Array(items.length);
  let index = 0;
  async function runNext() {
    const i = index++;
    if (i >= items.length) return;
    results[i] = await fn(items[i]);
    await runNext();
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runNext));
  return results;
}

// ——— Full CSV export: one row per asset, with EOS and due date ———
app.post('/api/export-full-csv', async (req, res) => {
  try {
    const { accessToken } = req.body;
    if (!accessToken) return res.status(401).json({ error: 'accessToken required' });
    const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

    let allPolicies = [];
    let afterKey = null;
    do {
      const body = { frameworks: ['EOL'], onlyMatchingAssets: true };
      if (afterKey) body.afterKey = afterKey;
      const r = await axios.post(`${FIREFLY_BASE_URL}/v2/governance/insights`, body, { headers });
      const hits = r.data.hits || [];
      allPolicies = allPolicies.concat(hits);
      afterKey = r.data.afterKey || null;
    } while (afterKey);

    const policiesWithTypes = allPolicies.filter(p => policyType(p) && (p.name || p.policyName));
    const CONCURRENCY = 4;
    const policyAssetsList = await runWithLimit(policiesWithTypes, CONCURRENCY, (policy) => fetchAssetsForPolicy(policy, headers));

    const rows = [];
    const csvHeader = 'Policy Name,Segment,Asset Type,Asset Name,ARN,Severity,Badge,EOS Date,Due Date,Days Until EOS';

    for (const { policy, assets } of policyAssetsList) {
      const eosMap = getEosMapFromPolicy(policy);
      const days = getDaysUntilEosFromMap(eosMap);
      const segment = segmentLabel(days, policy);
      const pType = policyType(policy);
      const policyNameStr = policy.name || policy.policyName || '';
      const segOut = segmentFallback(segment, policyNameStr, policy.badge);
      const badgeOut = (policy.badge || segment || segOut || '').trim() || segOut;

      for (const asset of assets) {
        const name = asset.name || asset.resourceId || asset.assetId || '—';
        const arn = asset.arn || asset.resourceId || asset.assetId || asset.frn || '—';
        const { eosDate, dueDate, daysUntilEos } = formatEosAndDue(eosMap, asset);
        rows.push([
          csvEscape(policyNameStr),
          csvEscape(segOut),
          csvEscape(pType),
          csvEscape(name),
          csvEscape(arn),
          csvEscape(policy.severity || ''),
          csvEscape(badgeOut),
          csvEscape(eosDate),
          csvEscape(dueDate),
          csvEscape(daysUntilEos)
        ].join(','));
      }
    }

    const csv = [csvHeader].concat(rows).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="eol-assets-full-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (e) {
    res.status(e.response?.status || 500).json(e.response?.data || { error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Firefly EOL Dashboard at http://localhost:${PORT}`);
});
