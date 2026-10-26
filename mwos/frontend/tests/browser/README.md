# Account And Transport Browser Check

Run the frontend production build first, then run `node tests/browser/account-transport-smoke.cjs`.
An existing Playwright installation is required. Use `MWOS_PLAYWRIGHT_MODULE` for its module path
and optionally `MWOS_CHROME_BINARY` for a Chrome executable.

The test starts a localhost preview on port 4177 with a new, isolated browser context.
Every API request is mocked and all other external traffic is blocked. It never sends a real
clinic request, uses a real login, or changes patient data. Screenshots use synthetic test data
and are written under the system temporary directory.

## Maternal Account Release

Run these ten `*-smoke.cjs` suites after the production build: `account-transport`,
`general-care`, `maternal-care`, `google-email`, `profile-alignment`,
`settings-appearance`, `settings-center`, `landing-page`, `account-security`, and
`clinic-slideshow`.
They disable the application proxy/config, mock API traffic, and use synthetic
identities only. The account-security suite covers verification before closure,
wrong-code retry, truthful deletion receipts, reactivation, recovery links,
sign-in review, default theme, restricted review queue and 320-1280px layouts.
The account-transport suite also verifies all four staff navigation roles and
Admin/Doctor-only Billing visibility and route access; it does not submit payments.
The landing suite covers 320-1440px, public/expired-session entry, real assets,
owner-confirmed hours/contact, callable/email links, mobile contact navigation,
touch targets and SVG external-link icons without literal entity text. It also
checks hero font/color consistency and contrast, automatic phone layout, a
non-shifting single-list menu, outside/Escape dismissal and touch-enabled
portrait/short-landscape booking.
The clinic-slideshow suite checks real-photo rotation, play/pause, hover/focus,
keyboard navigation, offscreen/hidden-page suspension, reduced motion, image
failures, touch-target size and 320-1440px layouts with an isolated browser clock.

The backend's optional SQL check runs only with `MWOS_RUN_LOCAL_SQL_TEST=1`.
Point `MWOS_LOCAL_TEST_ENV_FILE` at explicit local configuration. It refuses remote databases
and uses a transaction-local temporary table that is rolled back, not clinic tables.
