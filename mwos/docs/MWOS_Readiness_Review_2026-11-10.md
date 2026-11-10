# MWOS readiness review — 10 November 2026

## Decision

The core web workflows have passed the automated and local database checks listed below. This is **not a certification that every feature is 100% ready for clinical production use**. External service acceptance, clinical approval, native distribution, and operational recovery requirements remain open.

Testing used isolated synthetic accounts and records. No real patient record, password, or provider secret is included in this report. The earlier 1 November release report remains historical evidence.

## Changes in this release

- Patients can change an unconfirmed appointment and cancel an open appointment, with confirmation, conflict handling, persistence after reload, Philippine date handling, and paginated history. Confirmed visits require clinic assistance to reschedule.
- Dashboard charts show recorded system activity and completed births. Artificial follow-up percentages and audit-derived patient counts were removed.
- Birth reports include NSD, CS, forceps, vacuum, and unspecified categories. Only recorded births through the current Philippine date are included; six- and twelve-calendar-month boundaries are consistent.
- Labor charts use actual observation timestamps, preserving uneven observation intervals and missing values.
- Newly saved vital signs are marked for clinician review rather than assigned an unapproved automatic diagnosis. Staff receive a visible review notice. Historical classifications are preserved. Other existing clinical alert rules still require clinic validation.
- Generic recommendations no longer invent a mandatory Birthing ID or assume that old prescriptions are still current.
- Hosted database connections verify the certificate authority and hostname. Untrusted certificates and wrong hostnames fail closed. A trusted provider CA can be configured without disabling verification.
- Audit logging includes authenticated reads, denials, and server errors without copying clinical request bodies, credentials, messages, or query strings. Failure reporting avoids sensitive error details.
- The frontend HTTP redirect dependency was updated to its patched version.
- Slideshow buttons no longer jump during a pointer click when section fade motion and focus interact; keyboard focus keeps its immediate reveal. Missing-photo navigation remains usable.

## Verification evidence

| Check | Observed result | Evidence / limits |
| --- | --- | --- |
| Backend regression including local SQL tests | 194 passed; 0 failed; 0 skipped | `readiness/backend-unit-sql.log`; includes database constraints, authorization, scheduling, audit privacy, reports, and actual PostgreSQL TLS handshakes |
| Frontend regression | 105 passed | `readiness/frontend-unit.log` |
| Real API and database workflows | 80 checks passed | `readiness/api-workflows-final.log`; new isolated database, migrations, synthetic logins, clinical writes, ownership, billing, scheduling, export; includes new vitals review assertions |
| Patient appointment browser workflow | Passed | `readiness/patient-appointments-browser.log`; request, reload, reschedule, collision, confirmed restriction, cancellation, foreign-patient denial, phone layout |
| Staff and patient browser workflows with real API | Passed | `readiness/staff-patient-browser.log`; billing/payment, postpartum, pediatric, scheduling, export, protected patient access |
| Backup and restore | Passed locally | `readiness/backup-extended.log`; separate empty restore database, reconciliation, clinician signatures and rollback; no production restore performed |
| Browser fixtures | All 18 suites passed | Includes slideshow, scrolling, telehealth scheduling/video, credentials, account security, patient care, installation and settings; API/provider fixtures are not live third-party acceptance tests |
| Frontend production build | Passed | `readiness/frontend-build.log`; build success is not a load-capacity measurement |
| Mobile source regression | 26 passed | `readiness/mobile-unit.log`; not full real-device acceptance |
| Desktop source regression | 5 passed | `readiness/desktop-unit.log`; not a signed installer/runtime acceptance test |
| Backend and frontend production dependency audit | 0 reported vulnerabilities | `readiness/backend-dependencies.json`, `readiness/frontend-dependencies.json`; snapshot only, not penetration testing |

## Feature status and remaining acceptance

| Area | Working scope verified | Remaining requirement |
| --- | --- | --- |
| Public clinic pages, photographs, contact and downloads | Responsive layouts, navigation, installation guidance and web access tested | Signed native downloads must not be advertised until built, signed and tested |
| Sign-in, accounts and passwords | Local authentication, role restrictions, password policy and account security checks | Real provider sign-in and recovery delivery must be checked with clinic-owned accounts |
| Patient identity and professional credentials | Submission, restricted access, scan-result handling and human review workflow tested | OCR is not proof an ID is genuine; authoritative identity/license verification requires an approved provider and clinic review |
| Patient records and clinical modules | Pregnancy, recorded vitals, labs, prescriptions, labor/delivery, postpartum and pediatric workflows tested | Authorized clinicians must validate measurement limits, clinical alert rules, terminology and permissions before relying on them for care |
| Appointments and telehealth scheduling | Request, review/accept, duration, conflict checks and patient changes tested | Clinic staff must accept scheduling policy and conduct actual patient/staff trials |
| Embedded telehealth video | Admission, private access, preview release, join/leave, failure handling and responsive layout tested using a simulated Daily adapter | A real two-person camera/microphone consultation over the clinic network remains unverified |
| Billing and pharmacy | Ledger, cumulative payments, receipts and pickup states tested | Recorded payments are not proof of a bank/payment-gateway transaction |
| Messaging, reminders and notifications | Internal records and configured-delivery handling tested | Actual email/SMS/push delivery receipts and failure recovery are not established by these tests; no live message was sent |
| Emergency referrals | Staff-entered referral status progression and access tested | This does not establish an external hospital/ambulance dispatch or acceptance connection |
| PhilHealth | Preparation and credential workflow tested | Accreditation/provider credentials and an actual eClaims interface are not configured or certified |
| Reports and dashboard | Synthetic SQL reconciliation, category totals and date boundaries tested | Clinic review of reporting definitions and reconciliation against authorized real records remains required |
| Audit and security | Body minimization, authenticated read/denial/error events, ownership checks and verified database TLS tested | Audit writes after response completion are best effort; login failures before this middleware and durable centralized audit retention remain separate work |
| Backup and recovery | Local full backup and isolated restore tested | Production backup schedule, retention, recovery owner, recovery time/data-loss targets and a managed-provider recovery drill remain unverified |
| Android/iOS/desktop | Source tests passed; Android Expo development launch was previously verified | Full logged-in native acceptance, supported-device matrix, signing and distribution remain incomplete; Windows/macOS/iOS releases are not established by web tests |
| Performance and security acceptance | Functional regression and dependency scans passed | Target-user concurrency, capacity, independent penetration testing and clinic acceptance have not been demonstrated |

## Online release

Before deployment, the existing public login returned HTTP 200 and the API `/ready` returned HTTP 200 with `database: connected`. Final release identifiers and post-deployment checks will be added after deployment succeeds.

## Remaining sign-off

The clinic should record named approval for clinical rules and permissions, actual patient/staff workflow trials, a two-person video call, configured notification deliveries, and production recovery. Provider-dependent services must remain visibly unavailable or described as preparation until their own acceptance evidence exists. No missing approval, delivery receipt, identity-verification result or accreditation has been fabricated.
