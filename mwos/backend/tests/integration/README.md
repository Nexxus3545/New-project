# Local workflow verification

Run from `backend` with local PostgreSQL configured in `.env`. The database role must be able to create temporary databases. Remote connection URLs are rejected.

`node tests/integration/workflows.cjs` creates and removes an isolated `mwos_verify_<timestamp>` database and runs 80 API checks. It never targets production. `MWOS_TEST_PORT` defaults to 5002.

For browser and extended backup checks, set `MWOS_KEEP_TEST_SERVER=1` before running it. This retains the isolated database and writes synthetic credentials to `../../tmp/workflow-browser-fixture.json` (override with `MWOS_TEST_FIXTURE`). Never publish this fixture. Stop the retained server and drop only its generated test database when finished.

Set `POSTGRES_BIN` to your PostgreSQL binary directory, then run `node tests/integration/extended-local.cjs`. This uses port 5003, verifies signatures/rollback, pending lab results, saved scan notes, balances, and restores a full backup into a separate temporary database which it removes. No external email or SMS adapters are enabled.

From `frontend`, start Vite on port 3001 with `VITE_API_BASE_URL=http://localhost:5002`. Set `MWOS_PLAYWRIGHT_MODULE` and `MWOS_CHROME_BINARY`, then run `node tests/browser/workflows-live-local.cjs`. This script requires the retained synthetic fixture and writes only to the local test API. Tests and fixture paths are developer tools, not patient instructions.
