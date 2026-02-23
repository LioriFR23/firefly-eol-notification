# API Capability Assessment: Firefly vs Client EOL/EOS Requirements

## Summary

| Requirement | Supported by current API? | Notes |
|-------------|---------------------------|--------|
| Look ahead for EOS/EOL | **Partially** | Policies expose *categories* (e.g. "Upcoming 3–9 months", "Ended") but not concrete EOS/EOL or due dates. |
| Ticket 6 months ahead, due dates 90 days out | **No** | No due-date or EOS/EOL date fields in governance/insights or inventory. Client would need to derive from policy name or external source. |
| Schedule and prioritize beyond “violating” | **Partially** | Can list policies and count assets per policy; severity/category exist. No built-in due dates or priority scores. |
| Fetch EOS/EOL dates via API to link to violations | **No** | No dedicated endpoint that returns technology/version EOS or EOL dates. Policy names are categorical only. |
| Supported asset types (client list) | **Mostly yes** | See “Asset types” below. |
| appengine.googleapis.com/Version, dataproc.googleapis.com/Cluster | **No** | Not well supported by Firefly today. |
| Canonicalized runtime/version (e.g. nodejs 24) | **Unknown / No** | Not observed in current governance or inventory responses; would need confirmation or enhancement. |
| Policy data dynamically via endpoint | **Yes** | **POST /v2/governance/insights** returns EOL policies with pagination (`afterKey`). |
| Automation / frequency / last update | **N/A** | API is pull-based; client controls frequency. No “last update” field observed in responses. |

---

## What the current API can do

1. **Authentication**  
   - **POST /v2/login** with `accessKey` and `secretKey` returns a JWT-style `accessToken` for subsequent requests.

2. **List EOL policies dynamically**  
   - **POST /v2/governance/insights** with `frameworks: ["EOL"]` and `onlyMatchingAssets: true` returns:
     - `hits`: array of policies (each with at least `name`, `type`, `total_assets`, `severity`, `badge`, `category`).
     - `afterKey`: for pagination (send in next request to get more).
   - No separate “policy by ID” needed for listing; client can page through all EOL policies.

3. **Get violating assets per policy**  
   - **POST /api/v1.0/inventory** with:
     - `governance`: policy name from insights
     - `assetTypes`: policy type (e.g. `aws_lambda_function`)
     - `size`, `assetState: "managed"`
   - Returns `responseObjects` (assets) and supports `afterKey` for pagination.

4. **Filtering**  
   - Governance: `frameworks`, `onlyMatchingAssets`; docs also mention labels, category, severity, providersAccounts (exact support to be confirmed per OpenAPI).
   - Inventory: assetTypes, governance, assetState, pagination.

5. **Asset types**  
   - Firefly EOL supports asset types such as:  
     `aws_db_instance`, `aws_docdb_cluster`, `aws_docdb_global_cluster`, `aws_eks_cluster`, `aws_elasticache_cluster`, `aws_elasticache_replication_group`, `aws_emr_cluster`, `aws_glue_job`, `aws_lambda_function`, `aws_mwaa_environment`, `aws_rds_cluster`, `google_cloudfunctions_function`, `google_cloudfunctions2_function`, `google_composer_environment`, `google_container_cluster`, `google_sql_database_instance`, `Mongodbatlas_advanced_cluster`.  
   - These align with the client’s “Asset Types supported by Firefly” list.

---

## Gaps (cannot meet with current API)

1. **Concrete EOS/EOL dates**  
   - Policy names are buckets (e.g. “Upcoming (3-9 months)”, “Ended”), not a specific EOS or EOL date per asset or per technology/version.

2. **Due dates (e.g. 90 days out)**  
   - No field for “remediate by” or “due date”; client cannot drive 90-day due dates from the API.

3. **EOS/EOL dates for technologies/versions via API**  
   - No endpoint that returns EOS/EOL dates by technology or version so the client can link violations to dates on their side.

4. **Unsupported asset types**  
   - `appengine.googleapis.com/Version` and `dataproc.googleapis.com/Cluster` are not well supported.

5. **Canonicalized runtime/version**  
   - e.g. “nodejs 24” instead of “nodejs24.x” is not clearly exposed in current responses; would need product/API confirmation or enhancement.

6. **Last update / freshness metadata**  
   - No observed “last update” (or similar) for policy or EOL data; client question on “frequency / last update” cannot be answered from API alone.

---

## Conclusion

- **Feasible today:** Dynamic listing of EOL policies, fetching violating assets per policy, pagination, filtering by framework/severity/category, and use of the supported asset types above. Client can build dashboards and basic prioritization (e.g. by severity/category).
- **Not feasible without changes:** Concrete EOS/EOL dates, due dates, technology/version EOS/EOL API, support for App Engine Version and Dataproc Cluster, and canonicalized runtime/version. These require product/API roadmap decisions and are documented in `INTERNAL_ESCALATION_NOTES.md`.
