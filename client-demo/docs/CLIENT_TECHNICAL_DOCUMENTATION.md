# Firefly API – Technical Documentation for EOL/EOS Use Cases

This document describes how to use the Firefly API to retrieve EOL (End of Life) governance insights and related inventory so you can integrate with your ticketing and remediation workflows.

---

## Base URL and authentication

- **Base URL:** `https://api.firefly.ai`
- **Authentication:** JWT-style bearer token obtained via login. All endpoints below (except login) require the `Authorization` header.

### 1. Obtain an access token

**Endpoint:** `POST /v2/login`

**Request body:**

```json
{
  "accessKey": "YOUR_ACCESS_KEY",
  "secretKey": "YOUR_SECRET_KEY"
}
```

**Response (success):**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Usage:** Send `accessToken` in subsequent requests as:

```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

---

## 2. Retrieve EOL governance insights (dynamic policy data)

Use this endpoint to get EOL policies and asset counts. This is the primary way to get policy data dynamically.

**Endpoint:** `POST /v2/governance/insights`

**Request body:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `frameworks` | string[] | Yes | Use `["EOL"]` for End-of-Life policies. |
| `onlyMatchingAssets` | boolean | No | If `true`, only policies that have matching assets in your inventory are returned. Default `true` recommended. |
| `afterKey` | string | No | Opaque cursor for the next page. Omit on first request; use value from previous response for pagination. |

**Example request:**

```json
{
  "frameworks": ["EOL"],
  "onlyMatchingAssets": true
}
```

**Example response:**

```json
{
  "hits": [
    {
      "name": "Upcoming (3-9 months) - AWS Lambda Functions",
      "type": "aws_lambda_function",
      "total_assets": 42,
      "severity": "high",
      "badge": "Upcoming",
      "category": "EOL"
    },
    {
      "name": "Ended - AWS Lambda Functions",
      "type": "aws_lambda_function",
      "total_assets": 5,
      "severity": "critical",
      "badge": "Ended",
      "category": "EOL"
    }
  ],
  "afterKey": "optional-opaque-cursor-for-next-page"
}
```

**Pagination:** If `afterKey` is present in the response, send it back in the next request body to retrieve the next page. Repeat until `afterKey` is null or absent.

**Fields per hit (typical):**

| Field | Description |
|-------|-------------|
| `name` | Policy name (often includes time bucket, e.g. "Upcoming (3-9 months)" or "Ended"). |
| `type` | Asset type (e.g. `aws_lambda_function`). Use this when querying inventory. |
| `total_assets` | Number of assets in your account that violate this policy. |
| `severity` | e.g. `high`, `critical`. |
| `badge` | Short label (e.g. "Upcoming", "Ended"). |
| `category` | e.g. "EOL". |

**Note:** Policy names are categorical (e.g. “Upcoming 3–9 months”); the API does not return concrete EOS/EOL or due dates. Scheduling (e.g. 90-day due dates) must be implemented on your side using severity/category or external data.

---

## 3. Retrieve violating assets for a policy (inventory)

Use this endpoint to get the actual assets that violate a given EOL policy. You need the policy `name` and `type` from the governance/insights response.

**Endpoint:** `POST /api/v1.0/inventory`

**Request body:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `assetState` | string | No | e.g. `"managed"`. Recommended for governance. |
| `assetTypes` | string | No | Asset type from the policy (e.g. `aws_lambda_function`). Restricts to that type. |
| `governance` | string | No | Exact policy `name` from governance/insights. Returns only assets that violate this policy. |
| `size` | number | No | Max number of assets to return per request. |
| `afterKey` | string | No | Pagination cursor from previous inventory response. |

**Example request:**

```json
{
  "assetState": "managed",
  "assetTypes": "aws_lambda_function",
  "governance": "Upcoming (3-9 months) - AWS Lambda Functions",
  "size": 100
}
```

**Example response (conceptual):**

```json
{
  "responseObjects": [
    {
      "name": "my-lambda",
      "assetId": "...",
      "resourceId": "...",
      "assetType": "aws_lambda_function",
      "owner": "team@example.com",
      "tfObject": { "tags": {} },
      "tagsList": []
    }
  ],
  "afterKey": "optional-cursor"
}
```

**Pagination:** Same pattern as governance: include `afterKey` from the response in the next request until no more pages.

---

## 4. Optional: create/update/delete insights

Firefly also supports managing insights (create/update/delete). These are documented in the official API spec. For read-only EOL use cases, the main flow is:

1. `POST /v2/login` → get token  
2. `POST /v2/governance/insights` (with optional pagination) → list EOL policies  
3. For each policy, `POST /api/v1.0/inventory` with `governance` and `assetTypes` → list violating assets  

---

## 5. Supported EOL asset types (reference)

Asset types that are typically supported for EOL insights and inventory filters include:

- **AWS:** `aws_db_instance`, `aws_docdb_cluster`, `aws_docdb_global_cluster`, `aws_eks_cluster`, `aws_elasticache_cluster`, `aws_elasticache_replication_group`, `aws_emr_cluster`, `aws_glue_job`, `aws_lambda_function`, `aws_mwaa_environment`, `aws_rds_cluster`
- **Google:** `google_cloudfunctions_function`, `google_cloudfunctions2_function`, `google_composer_environment`, `google_container_cluster`, `google_sql_database_instance`
- **MongoDB Atlas:** `Mongodbatlas_advanced_cluster`

Other types (e.g. `appengine.googleapis.com/Version`, `dataproc.googleapis.com/Cluster`) may not be fully supported; confirm with Firefly if needed.

---

## 6. Rate limits and errors

- Rate limiting may apply (e.g. 500 requests per minute per IP; confirm in Firefly docs).
- Use exponential backoff on 429 responses.
- 401: invalid or expired token; re-authenticate with `/v2/login`.

---

## 7. Using the API without the web app (step-by-step)

You can achieve EOL look-ahead and scheduling entirely with API calls—no web app required.

### Step 1: Authenticate

```bash
curl -s -X POST https://api.firefly.ai/v2/login \
  -H "Content-Type: application/json" \
  -d '{"accessKey":"YOUR_ACCESS_KEY","secretKey":"YOUR_SECRET_KEY"}' \
  | jq -r '.accessToken'
```

Use the returned token as `Authorization: Bearer <token>` on all following requests.

### Step 2: Fetch all EOL policies (with pagination)

- First request: `POST /v2/governance/insights` with body `{"frameworks":["EOL"],"onlyMatchingAssets":true}`.
- If the response includes `afterKey`, send another request with the same body plus `"afterKey": "<value>"`.
- Repeat until there is no `afterKey`. Combine all `hits` arrays.

Each policy in `hits` has: `name`, `type` (asset type, e.g. `aws_lambda_function`), `total_assets`, `severity`, `badge`, `category`, and **`description`** (see Section 8 for EOS dates).

### Step 3: For each policy, fetch violating assets

- `POST /api/v1.0/inventory` with body:
  - `assetState`: `"managed"`
  - `assetTypes`: the policy’s `type` (e.g. `aws_lambda_function`)
  - `governance`: the policy’s exact `name`
  - `size`: e.g. `100`
- Use `afterKey` from the response for the next page until done.

Each asset has `arn`, `name`, `assetType`, `owner`, and—for Lambda—`tfObject.runtime` (e.g. `"python3.13"`). Use the policy’s `description` (Section 8) to get that runtime’s EOS date and compute a due date (e.g. EOS − 90 days).

### Step 4: Schedule and prioritize

- **Priority:** Use policy `severity` and `badge` (e.g. “Ended” vs “Upcoming”).
- **Due date:** Parse `description` (Section 8), match asset’s `tfObject.runtime` to the runtime key, get EOS timestamp, then set **due date = EOS date − 90 days** (or your rule).
- **6‑month look-ahead:** Only consider policies whose EOS dates (from `description`) fall within the next 6 months, or use the policy name bucket (“Upcoming (3-9 months)”).

This flow gives you: list of EOL policies, list of violating assets per policy, EOS date per runtime (from description), and the ability to set due dates and prioritize without the web app.

---

## 8. EOS/EOL dates in policy description (verified via API)

**Verified with live API calls.** For EOL policies (e.g. AWS Lambda Functions), the **`description`** field is a **JSON string** that contains End-of-Support (EOS) dates per runtime.

### Structure

After parsing `policy.description` as JSON you get:

- **`title`:** Human-readable text (e.g. “Security patches or other updates are no longer applied…”).
- **`attributes`:** Array of `{ "key": "<runtime>", "value": <unix_timestamp> }`.

The **`key`** is the runtime identifier (e.g. `nodejs20.x`, `python3.13`, `java17`). The **`value`** is the **EOS date as a Unix timestamp (seconds)**.

### Example (parsed)

```json
{
  "title": "Security patches or other updates are no longer applied...",
  "attributes": [
    { "key": "nodejs22.x", "value": 1809032400 },
    { "key": "python3.13", "value": 1877461200 },
    { "key": "nodejs20.x", "value": 1777496400 }
  ]
}
```

- `1809032400` → 2027-04-30 (example)
- `1777496400` → 2026-04-30 (example)

### How to use it

1. Get EOL policies from `POST /v2/governance/insights` (Section 2).
2. For each policy, parse `description`: `const desc = JSON.parse(policy.description);`.
3. Build a map: `runtime → EOS date` from `desc.attributes` (convert `value` to a date: `new Date(value * 1000)`).
4. For each violating asset from inventory, read **`asset.tfObject.runtime`** (e.g. `"python3.13"`).
5. Look up that runtime in your map to get the **EOS date**.
6. Set **due date = EOS date − 90 days** (or your rule) for ticketing.

So you **can** achieve “look ahead for EOS/EOL” and “due dates 90 days out” with the **current** API by using `description` + `tfObject.runtime`. A first-class field (e.g. `runtimeEosDates`) would simplify this and is recommended for escalation (see internal notes).

---

## 9. What the API does not provide (as of this doc)

- **First-class EOS/due date fields:** EOS dates exist inside `description` (Section 8); there is no top-level `eosDate` or `dueDate` on the policy or asset. Exposing these would simplify integration.
- **Canonicalized runtime/version:** Assets expose raw runtime (e.g. `nodejs20.x`); there is no canonical form (e.g. “nodejs 20”) in the response.
- **Last-update** (or similar) metadata for policy or EOL data freshness.
- **Unsupported asset types:** e.g. `appengine.googleapis.com/Version`, `dataproc.googleapis.com/Cluster` (not well supported for EOL).
