# Internal Escalation Notes – Client EOL/EOS Requirements

Summary of gaps between client requirements and current Firefly API/product, for internal product and engineering. **Live API tests were run** (governance/insights + inventory) to verify response shapes and identify missing fields.

---

## 1. Client requirements (short)

- Look ahead for **EOS and EOL dates**; ticket **6 months ahead** with **due dates 90 days out**; if caught late, need to know **due date** to remediate in time.
- Not enough to know “asset is violating”; need to **schedule and prioritize** response.
- Optionally: **fetch EOS/EOL dates for technologies and versions via API** to link policy violations to dates on their side if governance API doesn’t provide them.
- Support for a list of **asset types** (mostly supported) plus **appengine.googleapis.com/Version** and **dataproc.googleapis.com/Cluster** (not well supported).
- **Canonicalized runtime/version** (e.g. “nodejs 24” instead of “nodejs24.x”).
- **Policy data dynamically via endpoint** (we have this).
- **Automation / frequency / last update** (client wants to know how data is updated and when it was last updated).

---

## 2. What we can do today (no escalation)

- **Dynamic EOL policy list:** POST /v2/governance/insights with frameworks EOL, pagination via afterKey.
- **Violating assets per policy:** POST /v2/api/inventory with filters.violatingPoliciesIds + assetTypes + pagination; fallback POST /api/v1.0/inventory with governance when v2 returns no results.
- **Filtering:** frameworks, onlyMatchingAssets; docs mention labels, category, severity, providersAccounts.
- **Auth:** JWT via POST /v2/login.
- **Supported asset types:** Client’s “supported by Firefly” list is aligned (e.g. AWS RDS/Lambda/EKS, GCP functions/Composer/GKE, MongoDB Atlas). No product change needed for those.
- **EOS dates (workaround):** Policy **`description`** is a JSON string with `attributes: [{ key: "<runtime>", value: <unix_timestamp> }]`. Client can parse this to get EOS date per runtime and compute due date (e.g. EOS − 90 days). So “look ahead” and “90-day due date” are achievable without the web app by parsing `description` and joining with asset `tfObject.runtime`. See client technical doc Section 8.

---

## 3. Gaps to escalate

### 3.1 Concrete EOS/EOL and due dates (partially addressed)

- **Current state (verified):** EOS dates **exist** in **`policy.description`** as a JSON string: `description.attributes` is an array of `{ key: "<runtime>", value: <unix_timestamp> }` (e.g. `nodejs20.x` → 1777496400). Client can parse this and join with `asset.tfObject.runtime` to get EOS per asset and compute due date (e.g. EOS − 90 days). So the client can achieve look-ahead and 90-day due dates without the web app.
- **Gap:** No **first-class** field for EOS or due date. Everything is buried in a JSON string inside `description`; no per-asset `eosDate` or `dueDate` when querying inventory with governance.
- **Escalation:** Expose **structured** EOS/due data so clients don’t have to parse `description`:
  - Add a top-level (or nested) field on the policy, e.g. **`runtimeEosDates`** or **`eosDatesByRuntime`**: `{ "<runtime>": "<ISO date or unix_ts>", ... }`.
  - Optionally, when calling inventory with `governance`, include **`eosDate`** and/or **`remediateByDate`** (or **`dueDate`**) on each asset so the client doesn’t have to join policy + asset runtime themselves.

### 3.2 EOS/EOL dates API for technologies/versions

- **Current state:** The same EOS-by-runtime data is effectively available today via **policy.description** (parsed JSON `attributes`). So there is no separate “EOS API” endpoint, but the data is in the governance response.
- **Gap:** No dedicated **endpoint** that returns only EOS/EOL dates by technology/version (e.g. for non–Firefly workflows). No structured field; client must parse `description`.
- **Escalation:** Optional: expose a **read-only endpoint** (e.g. GET/POST for “EOS dates by runtime”) or at least a **structured field** on the policy (see 3.1) so clients don’t depend on parsing `description`.

### 3.3 Scheduling and prioritization

- **Gap:** API provides **severity** and **category** and **asset counts**, but no **due date**, **priority score**, or **recommended remediation date**.
- **Client impact:** Client must implement all scheduling/prioritization logic themselves (e.g. using severity + external EOL dates).
- **Escalation:** Optional: consider adding **due date** or **priority** (or both) to insights or to a new endpoint if we add EOS/EOL dates.

### 3.4 Unsupported asset types

- **Gap:** **appengine.googleapis.com/Version** and **dataproc.googleapis.com/Cluster** are not well supported by Firefly for EOL.
- **Client impact:** Client cannot get EOL visibility for these resources from Firefly.
- **Escalation:** Engineering/Product to confirm roadmap for:
  - **appengine.googleapis.com/Version**
  - **dataproc.googleapis.com/Cluster**  
  and communicate timeline or alternatives.

### 3.5 Canonicalized runtime/version (missing – escalate)

- **Verified:** Inventory asset has **`tfObject.runtime`** with **raw** value only (e.g. `python3.13`, `nodejs20.x`). No separate canonical field.
- **Gap:** Client wants **canonicalized** form (e.g. “nodejs 24” rather than “nodejs20.x”). Current API does not expose this.
- **Escalation:** Add and expose **canonical** runtime/version in API responses, e.g. **`runtimeCanonical`** or **`versionCanonical`** on the asset (or in governance) so clients get a stable, human-friendly form for reporting and ticketing without building their own mapping.

### 3.6 Data freshness (last update / automation)

- **Gap:** No **last update** (or similar) timestamp in governance/insights or inventory responses. Client asked about **automated vs manual** process and **frequency** and **last update**.
- **Client impact:** Client cannot show “EOL data as of &lt;date&gt;” or decide refresh frequency based on our update cycle.
- **Escalation:** Product/API to consider adding **lastUpdated** (or equivalent) to relevant responses and to document how often EOL data is updated (automated vs manual).

---

## 4. Verified API response shapes (from live calls)

**Governance insight (one policy),** `POST /v2/governance/insights` → `hits[]` item keys:

`_id`, `accountId`, `description`, `isDefault`, `isEnabled`, `isSubscribed`, `name`, `labels`, `rego`, `severity`, `badge`, `type`, `providerIds`, `classificationType`, `providers`, `category`, `frameworks`, `backendCalculatedCost`, `excluded_assets`, `total_assets`, `id`, `total_assets_by_types`.

- **EOS dates:** Only inside **`description`** (JSON string with `attributes: [{ key, value }]`, value = Unix timestamp). No top-level `eosDate` or `runtimeEosDates`.
- **`type`** is an array (e.g. `["aws_lambda_function"]`) for this policy.

**Inventory asset (one item),** `POST /v2/api/inventory` or `POST /api/v1.0/inventory` → `responseObjects[]` item keys:

`vcsId`, `vcsRepo`, `resourceCreationDate`, `assetId`, `assetType`, `name`, `providerId`, `state`, `resourceId`, `arn`, `accountId`, `tagsList`, `region`, `lastResourceStateChange`, `owner`, `tfObject`, `consoleURL`, `fireflyLink`, etc.

- **Runtime:** For Lambda, **`tfObject.runtime`** (e.g. `"python3.13"`). No `runtimeCanonical` or `versionCanonical`.
- **Inventory response root keys:** `responseObjects`, `totalObjects`, `afterKey`.

---

## 5. Suggested priority for escalation

| Priority | Item | Reason |
|----------|------|--------|
| P0 | EOS/EOL dates and/or due dates (3.1) | Core to “look ahead” and “90-day due date” use case. |
| P1 | EOS/EOL API for tech/versions (3.2) | Enables client to link violations to dates if we don’t add dates to governance. |
| P1 | Unsupported asset types (3.4) | Blocking for App Engine and Dataproc. |
| P2 | Canonicalized runtime/version (3.5) | Improves usability and integration. |
| P2 | Scheduling/prioritization fields (3.3) | Improves UX if we already add dates. |
| P2 | Last update / freshness (3.6) | Transparency and automation expectations. |

---

## 6. Deliverables produced for client

- **EOL Dashboard app:** `eol-dashboard/` – runnable app (auth, fetch EOL policies, timeline, CSV export).
- **API assessment:** `eol-dashboard/docs/API_ASSESSMENT.md` – can/cannot vs requirements.
- **Client-facing technical doc:** `eol-dashboard/docs/CLIENT_TECHNICAL_DOCUMENTATION.md` – endpoints, auth, request/response, pagination, supported types, limitations.
