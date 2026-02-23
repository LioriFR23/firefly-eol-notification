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

// Map API name/badge to segment. API often puts time bucket in name: "Ended - ...", "Imminent (<3 months) - ...", "Upcoming (3-9 months) - ..."
function segmentLabel(days, policy) {
  if (days !== null) {
    if (days < 0) return 'Overdue';
    if (days <= 90) return '0-90 days';
    if (days <= 180) return '90d-6mo';
    return '6+ months';
  }
  if (policy) {
    const name = (policy.name || '').toLowerCase();
    if (name.startsWith('ended') || name.startsWith('deprecated -') || name.includes('ended -') || name.includes('past eos')) return 'Overdue';
    if (name.startsWith('imminent') || name.includes('imminent (<3') || name.includes('0-90') || name.includes('due soon')) return '0-90 days';
    if (name.startsWith('upcoming (3-9') || name.includes('upcoming (3-9 months)') || name.includes('3-9 months')) return '90d-6mo';
    if (name.includes('upcoming') || name.includes('6+ months') || name.includes('backlog')) return name.includes('6+') || name.includes('backlog') ? '6+ months' : '90d-6mo';
    if (policy.badge && policy.badge.trim()) return policy.badge.trim();
  }
  return '';
}

function segmentFallback(seg, policyName, policyBadge, policyCategory) {
  if (seg && seg.trim()) return seg;
  const n = (policyName || '').toLowerCase();
  if (n.startsWith('ended') || n.startsWith('deprecated -') || n.includes('ended -') || n.includes('past eos')) return 'Overdue';
  if (n.startsWith('imminent') || n.includes('imminent (<3') || n.includes('0-90') || n.includes('due soon')) return '0-90 days';
  if (n.startsWith('upcoming (3-9') || n.includes('upcoming (3-9 months)') || n.includes('3-9 months')) return '90d-6mo';
  if (n.includes('6+ months') || n.includes('backlog')) return '6+ months';
  if (n.includes('upcoming')) return '90d-6mo';
  if (policyBadge && policyBadge.trim()) return policyBadge.trim();
  return '';
}

function csvEscape(s) {
  const t = String(s ?? '');
  if (/^[=+\-@\t]/.test(t) || t.indexOf(',') >= 0 || t.indexOf('"') >= 0 || t.indexOf('\n') >= 0) return '"' + t.replace(/"/g, '""') + '"';
  return t;
}

// EOS key field per asset type (from Firefly inventory tfObject). Policy description attributes
// use these values as keys (e.g. nodejs20.x, 1.34, 8.0.42, POSTGRES_13, glue_version, etc.).
const RUNTIME_TYPES = new Set([
  'aws_lambda_function', 'google_cloudfunctions_function', 'google_cloudfunctions2_function'
]);
const VERSION_TYPES = new Set([
  'aws_eks_cluster'
]);
const ENGINE_VERSION_TYPES = new Set([
  'aws_db_instance', 'aws_rds_cluster', 'aws_elasticache_cluster', 'aws_elasticache_replication_group',
  'aws_docdb_cluster', 'aws_docdb_global_cluster'
]);
const DATABASE_VERSION_TYPES = new Set([
  'google_sql_database_instance'
]);
const MASTER_NODE_VERSION_TYPES = new Set([
  'google_container_cluster'
]);
const GLUE_VERSION_TYPE = 'aws_glue_job';
const AIRFLOW_VERSION_TYPE = 'aws_mwaa_environment';

function getEosKeyFromAsset(asset) {
  if (!asset || !asset.tfObject) return null;
  const tf = asset.tfObject;
  const type = (asset.assetType || asset.type || '').toLowerCase();
  let v;
  if (RUNTIME_TYPES.has(type)) {
    v = tf.runtime;
    if (v == null && type === 'google_cloudfunctions2_function' && tf.service_config) v = tf.service_config.runtime;
  } else if (VERSION_TYPES.has(type)) {
    v = tf.version || tf.kubernetes_version || tf.cluster_version;
  } else if (ENGINE_VERSION_TYPES.has(type)) {
    v = tf.engine_version_actual != null ? tf.engine_version_actual : tf.engine_version;
  } else if (DATABASE_VERSION_TYPES.has(type)) {
    v = tf.database_version;
  } else if (MASTER_NODE_VERSION_TYPES.has(type)) {
    v = tf.master_version || tf.min_master_version || tf.node_version;
  } else if (type === GLUE_VERSION_TYPE) {
    v = tf.glue_version;
  } else if (type === AIRFLOW_VERSION_TYPE) {
    v = tf.airflow_version;
  } else if (type === 'google_composer_environment' && tf.config) {
    const c = tf.config;
    const soft = c.software_config || c.softwareConfig;
    v = soft && (soft.image_version != null ? soft.image_version : soft.airflow_version);
    if (v == null && c.imageVersion) v = c.imageVersion;
  } else {
    v = tf.runtime || tf.version;
  }
  return v != null ? String(v) : null;
}

function formatEosAndDue(eosMap, asset) {
  const eosKey = getEosKeyFromAsset(asset);
  const eosTs = eosKey && eosMap[eosKey] != null ? eosMap[eosKey] : (Object.values(eosMap).length ? Math.min(...Object.values(eosMap)) : null);
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
      const segOut = segmentFallback(segment, policyNameStr, policy.badge, policy.category);
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
