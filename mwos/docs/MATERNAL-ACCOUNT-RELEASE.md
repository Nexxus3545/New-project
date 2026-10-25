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
- TMC Copino logo-based rose/blush defaults, a restore-defaults control, light/
  dark/system, density and reduced motion. Unrelated color and glass options are
  removed. Other clinical modules are not deleted.
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

Run all nine browser suites listed in `frontend/tests/browser/README.md` against
the resulting build. Screenshots contain synthetic accounts only.

Release checks passed: 135 tests (67 API, 47 web, 21 mobile), all nine browser
suites, and the production web build. The API tests included the isolated local
PostgreSQL checks and loopback SMTP delivery, not real clinic email delivery.

If rollback is necessary, redeploy the preceding API and web production commit.
Leave the additive table and nullable column in place; do not reset or reseed the
database. Clinical guidance, medical-record erasure, sender delivery, store
publication, private storage migration and an independently reviewed security
audit are not certified by these checks.
