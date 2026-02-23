# Firefly EOL Dashboard

EOL/EOS timeline and planning app: sign in with your Firefly API credentials, load EOL policies, view assets by due date, and export policy summary or full per-asset CSV (with EOS and due dates). Runs as a subfolder of the main project.

## Folder structure

| Path | Purpose |
|------|--------|
| `README.md` | This file – overview and how to run |
| `server.js` | Express server: auth, governance/insights, inventory, full CSV export |
| `public/index.html` | Dashboard UI: sign in, load EOL policies, timeline, View resources, Export CSV |
| `docs/API_ASSESSMENT.md` | Can/cannot assessment of Firefly API vs client requirements |
| `docs/CLIENT_TECHNICAL_DOCUMENTATION.md` | Client-facing technical doc: endpoints, auth, request/response, pagination |
| `docs/MEETING_YOUR_EOL_EOS_REQUIREMENTS.md` | **Customer-facing:** How the current API meets their EOL/EOS needs (share with client) |
| `docs/INTERNAL_ESCALATION_NOTES.md` | Internal summary of gaps and what to escalate for development |
| `start.sh` | Start the demo server (port 3001); checks Node, installs deps |
| `clear-cache.sh` | Clear cached tokens (use before switching API keys) |

## How to run

From the project root, run the dashboard (it lives in the `eol-dashboard` subfolder):

```bash
cd eol-dashboard
./start.sh
```

Or: `npm install && npm start`. Open **http://localhost:3001**, sign in with your Firefly API credentials, then **Load EOL policies** to build the timeline. Use **Export CSV** for a policy summary or **Export full CSV (per asset)** for one row per asset with EOS and due dates.

**Clear cache** (e.g. before using different API keys):

```bash
./clear-cache.sh
```

Then run `./start.sh` again to restart with fresh authentication.

## Dependencies

The demo uses only the Firefly **v2** API. It depends on:

- **POST /v2/login** – authentication
- **POST /v2/governance/insights** – EOL policies (with pagination)
- **POST /v2/api/inventory** – assets (filters: assetState, assetTypes, violatingPoliciesIds; optional **governance** = policy name for per-policy results when ID is missing or unsupported)

See `docs/CLIENT_TECHNICAL_DOCUMENTATION.md` for full endpoint details.
