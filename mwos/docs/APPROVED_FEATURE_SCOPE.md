# MWOS Feature And Platform Scope

User-confirmed scope: 26 October 2026. This scope supersedes earlier plans for
staff mobile screens and patient Electron workflows. It is a delivery checklist,
not a claim that every listed feature is production-ready.

## Users And Clients

| User | Primary client | Responsibilities |
| --- | --- | --- |
| Admin | Desktop web/workstation | Account administration, permitted clinic operations, billing, audit review and approved backup operations |
| Doctor | Desktop web/workstation | Authorized EMR, clinical assessments, visits, labor/delivery review, referrals and billing access under current API permissions |
| Midwife | Desktop web/workstation | Authorized maternal visits, labor/delivery documentation and escalation |
| Nurse | Desktop web/workstation | Authorized observations, patient coordination and assigned nursing tasks |
| Patient | Patient mobile app and web browser | Own appointments, clinic-saved records, education, messages, notifications and account settings |

Patient web access remains available on phone and desktop browsers. No viewport
or user-agent check is used as an authorization boundary. API roles, permissions
and patient ownership remain authoritative. Do not create separate databases for
these clients or delete existing patient accounts to enforce this split.

The mobile entry points reject non-patient sessions before persistence and clear
legacy staff credentials locally. The mobile navigator contains no staff routes.
Electron rejects patient/unknown roles at login and server-confirmed restoration.
This does not deactivate accounts or revoke access from their supported client.
The existing Electron renderer is still a limited pilot, not parity with the
desktop web EMR. Its local API configuration and binary release need separate QA.

## Main Feature Matrix

| Requested feature | Evidence in the repository | Work still required |
| --- | --- | --- |
| Patient registration and EMR | Patient registry, patient detail, documents, examinations, lab/ultrasound and authenticated self-service routes | Complete clinician/clinic acceptance tests for the full EMR workflow and record ownership |
| Prenatal and postnatal tracking | Saved-vitals workflow, pregnancy records, postpartum API and patient records | The postnatal web route currently reuses delivery UI; a dedicated follow-up timeline/form is not complete |
| Labor and delivery logging | Delivery records and labor_progress API/table | Complete observation UI, timestamps, input validation and clinician-reviewed workflow; do not mark complete from a route label |
| Digital partograph | Labor-progress storage/endpoints exist | No complete validated charting UI was found. Existing rate-based warnings need clinical review before approval |
| Emergency referral | Location sharing and urgent support threads | Formal referral record, destination, receiving-facility acknowledgment, handover/closure history and printable referral are not implemented end-to-end |
| SMS/email reminders | Appointment-change and sign-in email events, in-app notifications and generic email support | Scheduled pre-visit reminders and their retry/deduplication need development; SMS requires an actual configured provider and delivery tests |
| Health education | Education library and patient-readable saved content | Clinic content approval, relevance and media consent must be confirmed; no invented patient stories or live status |
| Analytics | Staff dashboard and reports over saved data | Reconcile report totals and complete functional exports/acceptance tests; do not infer outcomes from incomplete data |
| Payment | Billing API and saved-payment list; Billing & Payments navigation is available to Admin/Doctor, matching current API read roles | Finish staff billing/payment entry, receipts and reconciliation. Online collection, if requested, additionally needs an approved payment provider; the list is not a gateway |
| Admin controls | User administration, compliance/audit and step-up-protected backup endpoints | Verify durable backup storage, deployed pg_dump/psql availability, restore validation and a non-production restore drill. No live restore is authorized by this scope |

These are source-review findings, not a completed clinical, financial or security
certification. Do not enable test SMS, fabricated delivery receipts or successful
backup badges to fill these gaps.

## Clinical Release Gate

The current labor controller uses a dilation-rate calculation to emit an
"immediate intervention required" warning. It must not be advertised as a
clinically validated digital partograph. WHO guidance does not support a
1 cm/hour dilation rate alone as a trigger for intervention or referral.
Use the clinic-approved protocol and require licensed-clinician review before
replacing or exposing decision-support rules. This platform split does not alter
clinical thresholds, treatment decisions or existing labor data.

Primary references:
- [WHO Labour Care Guide manual](https://www.who.int/publications/i/item/9789240017566)
- [WHO explanation of the updated labor-monitoring approach](https://www.who.int/news/item/15-12-2020-monitoring-childbirth-in-a-new-era-for-maternal-health)

## Completion Criteria

1. Verify the patient journey on mobile and web and each staff role on a desktop.
2. Test read/write permissions and cross-patient isolation on the server, not only menu visibility.
3. Finish clinical modules with clinic sign-off and saved-data provenance; no simulated vital signs.
4. Prove SMS/email delivery, scheduler idempotency and failure states with approved test recipients.
5. Reconcile real payment-provider receipts or clearly identify staff-entered payment records.
6. Test backup restoration in an isolated non-production database before offering restoration to admins.
7. Rebuild and validate native clients; Vercel deployment does not update installed APK/EXE files.

## Platform Baseline Verification

The platform-role baseline passed 85 automated tests (54 web, 26 mobile and
5 desktop renderer tests), all ten isolated browser suites, the production web
build and the desktop JavaScript bundle. These use synthetic users and intercepted
API responses, not live patient records, messages or payments. The native client
source changes still require rebuilt APK/EXE files and real-device acceptance.
Android export was attempted twice but stalled at local Metro startup; both
verification processes were stopped. The changed mobile screens passed Babel
syntax checks, but this is not a successful Android bundle or native build.
