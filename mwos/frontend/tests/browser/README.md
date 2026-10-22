# Account And Transport Browser Check

Run the frontend production build first, then run `node tests/browser/account-transport-smoke.cjs`.
An existing Playwright installation is required. Use `MWOS_PLAYWRIGHT_MODULE` for its module path
and optionally `MWOS_CHROME_BINARY` for a Chrome executable.

The test starts a localhost preview on port 4177 with a new, isolated browser context.
Every API request is mocked and all other external traffic is blocked. It never sends a real
clinic request, uses a real login, or changes patient data. Screenshots use synthetic test data
and are written under the system temporary directory.

The backend's optional SQL check runs only with `MWOS_RUN_LOCAL_SQL_TEST=1`.
Point `MWOS_LOCAL_TEST_ENV_FILE` at explicit local configuration. It refuses remote databases
and uses a transaction-local temporary table that is rolled back, not clinic tables.
