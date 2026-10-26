# Maternal Homepage And Account Security Release

Prepared 26 October 2026 from production commit 8342c5e. This release excludes
the separate unreviewed findings-guidance and private-file migration work.

## Scope

- Public maternal homepage at `/` with the five user-supplied clinic photographs.
  No dental marketing, fabricated specialist claims, success counts or reviews.
- `/portal` selects the existing signed-in role destination. Password/passkey
  booking intent is allowlisted; Google completion retains the existing patient
  dashboard destination. The Download Center remains at `/download`; missing
  installers are not advertised as available binaries.
- TMC Copino fixed blush defaults, comfortable spacing, solid surfaces and calm
  motion. Only light/dark/system mode remains selectable. Palette, density,
  motion and restore-default controls were removed in the follow-up appearance
  update. Existing account/browser choices normalize without changing records.
- Patient deactivation and verified deletion requests require an emailed code.
  Sending a code or selecting an action never closes access. Codes are HMAC
  protected, single-use, expire in ten minutes and allow at most five attempts.
  Issuance has a per-account cooldown and route-level rate limits.
- Deactivation can be reversed through `/reactivate-account` with email proof.
  A deletion request or clinic-disabled account cannot use that path to reopen.
  Medical records are not erased and appointments are not cancelled automatically.
- Administrators receive a private deletion-review notice and a bounded review
  queue in Account & Security. Staff self-closure is not offered.
- Google sign-in notices have real recovery, password-change and Google security
  links. Activity log supports email-code confirmation and a verified action to
  end MWOS sessions. MWOS password changes do not change Google credentials or
  disconnect Google sign-in.
- Password reset is atomic/single-use and uses the Google-verified recipient for
  linked accounts. Changing the login email requires the current MWOS password.
- Revocation rejects previous access and refresh tokens after account closure,
  reactivation, password change/reset or the secure-sessions action.
- Mobile Settings includes secure web handoffs without putting app tokens in a
  URL. A Vercel release does not update an installed Android binary.

## Database And Release Order

1. Confirm the existing MWOS project and production database.
2. Apply only `backend/src/config/account-security.sql` transactionally, with a
   five-second lock timeout. The UUID default uses PostgreSQL's built-in
   `pg_catalog.gen_random_uuid`, not an extension search-path assumption.
3. Verify `users.sessions_revoked_at` exists and the new requests table has RLS
   enabled; PUBLIC, anon and authenticated receive no direct table access.
4. Deploy the same reviewed commit to the existing API and web Vercel projects.
5. Verify the production homepage, public API readiness, and protected endpoints.

The additive schema was applied to the user-specified Supabase production
project `ughqnnwxahkulbkxioqm` on 26 October 2026. Its readiness query returned
`session_revocation_ready=true` and `security_requests_rls_enabled=true`.
No patient records or account status values were changed by that migration.

## Email Activation Gate

Required Google email codes stay OFF during this deployment. Credentials alone
are not evidence of inbox delivery. After a clinic-authorized real inbox test and
current mobile compatibility check, record `GOOGLE_EMAIL_DELIVERY_VERIFIED=true`
and then enable `GOOGLE_EMAIL_OTP_REQUIRED=true` in the API production environment.
Never put sender secrets in the web/mobile build or repository. This release
does not claim that a real clinic email has been received.

Without a configured sender, verified closure/recovery fails safely without an
account change. In-app sign-in and appointment notifications remain separate
from email-delivery status. Emails exclude clinical findings and diagnoses.

## Verification

Use explicit localhost-only SQL configuration. SQL checks use isolated schemas
and roll back; browser checks mock all APIs and never send a real email, submit
an appointment or close a real user account.

```powershell
$env:MWOS_RUN_LOCAL_SQL_TEST = '1'
$env:MWOS_LOCAL_TEST_ENV_FILE = '/absolute/path/to/local-test.env'
npm test --prefix backend
npm test --prefix frontend
npm test --prefix mobile
npm run build --prefix frontend
node frontend/tests/browser/account-security-smoke.cjs
```

Run all ten browser suites listed in `frontend/tests/browser/README.md` against
the resulting build. Screenshots contain synthetic accounts only.

Release checks passed: 135 tests (67 API, 47 web, 21 mobile), all nine browser
suites, and the production web build. The API tests included the isolated local
PostgreSQL checks and loopback SMTP delivery, not real clinic email delivery.

The follow-up blush update adds normalization/parity and text contrast tests.
Its checks passed: 137 tests (67 API, 49 web, 21 mobile), nine browser suites,
and the production web build. No new live database migration is required.
The appearance browser suite measures the rendered panel's text and active
controls in both light and dark mode against a 4.5:1 text contrast target
([W3C guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)).
This is focused verification, not a whole-system accessibility certification.

## Clinic Photo Tour

The pictured clinic-spaces section now uses the same four original photographs
in a responsive slideshow. No facility photograph is generated or altered.
The main top-of-page building hero remains unchanged. Crossfades and gentle zoom
are scoped to the photo tour, not the rest of the app's calm-motion defaults.
Rotation runs every seven seconds only when the next image is ready and the
tour/page is visible. Hover temporarily suspends rotation; entering keyboard
focus or choosing a photograph stops it until explicitly played again.

Play/pause, previous/next, arrow-key navigation, numbered thumbnails, real text
captions and loading-failure feedback are available. Operating-system reduced
motion disables autoplay/zoom and retains manual viewing. Narrow phones use a
two-column thumbnail grid. No clinical values, records or booking flows change.
See the [W3C carousel animation guidance](https://www.w3.org/WAI/tutorials/carousels/animations/).

Photo-tour release verification: 49 web tests, all ten browser suites and the
production build passed. The existing profile-alignment suite now waits for
fonts and resized layout frames before measuring; its unchanged alignment
assertions passed three consecutive runs. All browser data remained synthetic.

## Public Hours And Contact

The owner confirmed daily 24-hour opening, the corrected complete phone number
09926821514, and nexxus1122@gmail.com as temporary public contact details.
These values live in `frontend/src/utils/clinicContact.js`. The homepage now
includes working hours in Philippine time, callable/email links, the clinic
Facebook page, a named Google Maps search and menu/footer shortcuts.
Opening hours do not claim continuous provider availability or a confirmed visit.
Public contact publication does not configure SMTP or change authentication.
The screenshot's literal `&nearr;` was replaced by a decorative SVG external-link
icon with a screen-reader new-tab notice.

Contact release verification: 52 web tests, all ten browser suites and the web
production build passed, including contact links, mobile menu navigation,
44px contact targets and 320-1440px layouts. No clinical data or real messages
were accessed or changed by the tests.

If rollback is necessary, redeploy the preceding API and web production commit.
Leave the additive table and nullable column in place; do not reset or reseed the
database. Clinical guidance, medical-record erasure, sender delivery, store
publication, private storage migration and an independently reviewed security
audit are not certified by these checks.
