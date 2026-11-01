# MWOS finalization — 1 November 2026

User request: finalize the whole system and implement visible controls and missing workflows.

## Release approach

- Preserve existing records and credentials. Test using local synthetic data.
- Complete web patient/staff workflows and backend validation together.
- Keep external integrations truthful: PhilHealth accreditation/eClaims, SMS, payment gateways, native signing, and official identity verification require provider setup. Never fabricate approvals or delivery receipts.
- Publish only the verified release; do not run a live database restore.

## Work checklist

- [x] Verify the local source against the current online release and establish local database checks.
- [x] Enforce patient ownership on clinical record reads and linked-record writes.
- [x] Complete pregnancy history/create/update, delivery entry, timed labor observations, and dedicated postpartum follow-up.
- [x] Complete newborn/pediatric records and patient-facing read-only views.
- [x] Complete prescription entry and health education create/edit/publish/read.
- [x] Implement reports export, reconcile delivery types, and align report permissions.
- [x] Complete billing entry, cumulative payment ledger, receipts, and reconciliation.
- [x] Add staff creation and safe account administration; preserve credential verification.
- [x] Complete pharmacy pickup handling, emergency referral workflow, and appointment review/reminders where configured.
- [x] Make backup controls operational for supported environments with clear status and isolated restore verification.
- [x] Audit remaining visible controls, error/loading states, and client compatibility.
- [x] Run meaningful API/database and browser workflow checks, builds, and security regression tests.
- [x] Update the user guide (32 sections, Word and PDF).
- [x] Publish and verify the online release.

## Initial confirmed defects

- Delivery form sends an empty pregnancy ID although the API requires it.
- Patient detail has a Pregnancies tab with no rendered panel.
- Postnatal and pediatric navigation reuse delivery/immunization pages.
- Reports export has no click handler; totals omit forceps/vacuum deliveries; API roles exclude some users with the Reports menu.
- Billing has no entry/payment UI; the payment endpoint does not retain cumulative payments.
- Health education cards truncate content with no full article or editor.
- Admin account creation API exists but has no interface.
- Several clinical read endpoints omit patient-ownership enforcement.
- Labor-progress endpoint uses an unvalidated dilation-rate action rule; replace with observational charting and clinician-entered assessment.

## Verification evidence

- Backend regression: 178 passed, 8 environment-dependent tests skipped, 0 failures.
- Frontend regression: 104 passed, 0 failures; production build passed.
- Real local PostgreSQL/API: 80 checks passed in a newly created, isolated synthetic database.
- Additional checks: verified-clinician signature, rollback on signing failure, patient balances, pending labs, ultrasound notes, PostgreSQL backup and restore into a separate empty test database.
- Browser: actual local writes for billing/payment, postpartum/pediatric records, staff creation and appointment rescheduling; statement/report downloads; patient read-only records; 390px layouts.
- Existing 19 browser regression suites: landing/gallery/motion, credentials/OCR review, password rules, role guards, account security, settings, PhilHealth preparation, PWA platforms and embedded telehealth/scheduling.
- No real patient writes, outgoing clinic messages, or production restore were used for verification.

## External setup boundaries

PhilHealth claims transmission, official identity-registry verification, payment processing, signed native installers, SMS delivery, and provider-managed disaster recovery require their respective service setup. Existing embedded video integration still needs a successful two-participant camera/microphone acceptance test with the clinic's configured account. Browser SDK fixtures are not proof of a completed live call.

## Release

Prepared against production source commit `7731e1c4b668efa7972351610d2c004071d68654`. Deployment evidence is recorded separately after publication.


Production published 1 November 2026. Release commit: `9ba8697b0913473b1b48de62ded52db625e5ee5d`.

- Frontend deployment: `dpl_4twnBLXootxzHGAbEEtVYfzoGR5h` — READY.
- Backend deployment: `dpl_C5xyBegFpktHjSbpxddGSFeGfof7` — READY.
- Build logs confirmed additive migration and synthetic credential scanner check passed.
- Canonical API health returned HTTP 200 and `database: connected`. Anonymous new-record endpoints returned HTTP 401.
- Actual production browser verified the new release bundle, login, Windows/Android/macOS/iOS setup, and unauthenticated Billing redirect. No page errors.
- Clinical writes and payments were verified only in the isolated local test database. No real patient mutation was used for production verification.

Live log review found a Vercel forwarding-header configuration issue. The follow-up fix trusts exactly one Vercel proxy hop so visitor rate limits remain separate, keeps direct-server proxy trust disabled, and returns HTTP 403 for disallowed origins.
