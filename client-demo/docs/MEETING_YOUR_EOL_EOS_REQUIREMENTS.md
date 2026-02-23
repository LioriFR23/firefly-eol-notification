# Meeting Your EOL/EOS Requirements with the Firefly API

This document explains how the **current Firefly API** supports your End-of-Life (EOL) and End-of-Support (EOS) requirements, and how you can use it without our web app if you prefer to integrate directly.

---

## Can the current API meet our needs?

**Yes.** The current Firefly API design can support your stated needs:

- Look ahead for **EOS and EOL** and ticket **6 months ahead** with **due dates 90 days out**
- **Schedule and prioritize** remediation (using policy severity, category, and EOS dates)
- Get **EOL policy data dynamically** via an endpoint
- Support for the **asset types** you care about (see list below)

You can achieve this by calling the API from your own systems, scripts, or ticketing integrations. No web app is required.

---

## How your requirements are met

### 1. Look ahead for EOS/EOL and due dates (90 days out)

- **EOL policies** are returned by **POST /v2/governance/insights** with `frameworks: ["EOL"]`. Each policy includes a **`description`** field.
- **EOS dates per runtime** are inside that `description`: it is a JSON string containing an **`attributes`** array where each item has:
  - **`key`**: runtime identifier (e.g. `nodejs20.x`, `python3.13`, `java17`)
  - **`value`**: EOS date as a **Unix timestamp (seconds)**
- **Violating assets** are returned by **POST /api/inventory** ([Firefly Inventory API](https://docs.firefly.ai/general-information/api/inventory)) with `filters.violatingPoliciesIds` set to the policy ID. For Lambda (and similar asset types), each asset has **`tfObject.runtime`** (e.g. `python3.13`).

**How you get a due date (e.g. 90 days before EOS):**

1. Fetch EOL policies from the governance/insights endpoint.
2. Parse each policy’s `description` as JSON and build a map: **runtime → EOS date** from `attributes`.
3. For each violating asset from inventory, read **`asset.tfObject.runtime`**.
4. Look up that runtime in your map to get the **EOS date**.
5. Set your **due date = EOS date − 90 days** (or your preferred rule) and use it for ticketing and prioritization.

So you can ticket **6 months ahead** (e.g. anything with EOS in the next 6 months, including “Imminent” items) and set **due dates 90 days before EOS**—giving teams **more than 90 days** to remediate when you catch things early.

### 2. Schedule and prioritize remediation

- **Severity and category** on each policy (e.g. “Ended” vs “Upcoming”) let you prioritize which policies to remediate first.
- **Asset counts** per policy (`total_assets`) help you size effort.
- By combining **EOS date** (from `description`) with **due date = EOS − 90 days**, you can sort and schedule work in your own tools (e.g. Jira, ServiceNow).

The API gives you the inputs; you keep full control over how you schedule and prioritize.

### 3. Policy data dynamically via an endpoint

- **POST /v2/governance/insights** is the endpoint for **dynamic** EOL policy data.
- Request body: `{ "frameworks": ["EOL"], "onlyMatchingAssets": true }`.
- Response includes an array of policies (`hits`) and an **`afterKey`** for pagination. You can pull all EOL policies by following `afterKey` until it is empty.
- No manual export or one-off report is required; your systems can call this endpoint on the frequency you choose (e.g. daily or before each remediation cycle).

### 4. Asset types you need

The following asset types are supported for EOL in the current API and align with what you listed:

- **AWS:** `aws_db_instance`, `aws_docdb_cluster`, `aws_docdb_global_cluster`, `aws_eks_cluster`, `aws_elasticache_cluster`, `aws_elasticache_replication_group`, `aws_emr_cluster`, `aws_glue_job`, `aws_lambda_function`, `aws_mwaa_environment`, `aws_rds_cluster`
- **Google Cloud:** `google_cloudfunctions_function`, `google_cloudfunctions2_function`, `google_composer_environment`, `google_container_cluster`, `google_sql_database_instance`
- **MongoDB Atlas:** `Mongodbatlas_advanced_cluster`

**Not yet well supported:** `appengine.googleapis.com/Version` and `dataproc.googleapis.com/Cluster` are not fully supported for EOL today. We are tracking these for future support.

### 5. Runtime and version format

- Assets expose the **runtime** in the format provided by the provider (e.g. `nodejs20.x`, `python3.13`) in **`tfObject.runtime`** (or the equivalent field for that asset type).
- A **canonicalized** form (e.g. “nodejs 20”) is not yet exposed in the API; we are considering adding it in a future release. Until then, you can normalize on your side if needed for display or ticketing.

---

## Quick integration flow (without the web app)

1. **Authenticate:** Call **POST /v2/login** with your Firefly `accessKey` and `secretKey`. Use the returned `accessToken` as a Bearer token on all following requests.
2. **Get EOL policies:** Call **POST /v2/governance/insights** with `{"frameworks":["EOL"],"onlyMatchingAssets":true}`. Use `afterKey` in the response to page until you have all policies.
3. **Parse EOS dates:** For each policy, parse the `description` field as JSON and build a runtime → EOS date map from the `attributes` array.
4. **Get violating assets:** For each policy, call **POST /api/v1.0/inventory** with `governance` (policy name), `assetTypes` (the policy’s `type`—use the first value if it’s an array, e.g. `["aws_lambda_function"]` → `aws_lambda_function`), `assetState: "managed"`, and `size` (e.g. 100). Use `afterKey` to paginate.
5. **Compute due dates:** For each asset, read `tfObject.runtime`, look up the EOS date in your map, and set **due date = EOS date − 90 days** (or your rule).
6. **Schedule and ticket:** Use severity, category, due date, and asset counts in your own ticketing and prioritization logic.

For full request/response examples, authentication details, and pagination, see **CLIENT_TECHNICAL_DOCUMENTATION.md** in this folder.

---

## Summary

| Your requirement | Supported? | How |
|------------------|------------|-----|
| Look ahead for EOS/EOL | Yes | EOS dates are in policy `description` (JSON `attributes`: runtime → Unix timestamp). |
| Due dates 90 days out | Yes | Compute as EOS date − 90 days using the date from `description` and asset `tfObject.runtime`. |
| Ticket 6 months ahead | Yes | Use the same EOS dates and your own rules (e.g. only ticket when EOS is within 6 months). |
| Schedule and prioritize | Yes | Use policy severity, category, asset counts, and your computed due dates. |
| Policy data via API | Yes | POST /v2/governance/insights with pagination. |
| Supported asset types (your list) | Yes | As listed above. |
| App Engine / Dataproc EOL | Not yet | Tracked for future support. |
| Canonicalized runtime (e.g. “nodejs 24”) | Not yet | Under consideration; raw runtime is available today. |

If you have questions or want to align on automation frequency or last-update metadata, we can discuss those as part of your integration.
