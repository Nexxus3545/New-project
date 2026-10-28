# PhilHealth preparation and live connection requirements

Reviewed against official public guidance on 28 October 2026.

## Available in MWOS

Admin and Doctor accounts open **Billing & Payments → PhilHealth preparation**.
The existing authenticated patient, document and billing APIs supply saved data.
No database migration or new backend endpoint is required.

- Search and select an existing patient. The PIN starts masked.
- Inspect PIN formatting and recorded membership type. Neither establishes membership or eligibility.
- Match saved document classifications for ANCR (antenatal), PPCR (postpartum) and CF4 (delivery).
- Exclude rejected documents from matches. File contents and authenticity are not verified here.
- Display existing billing claim references and PhilHealth amounts, without presenting them as approved claims or paid reimbursements.
- Link directly to official forms, enrollment information and current guidance.

The page displays **Not connected to PhilHealth**. It performs no eligibility inquiry,
claim submission, live status polling, automatic deduction or electronic SOA generation.
Data is not sent to PhilHealth. No provider credentials are collected or stored by this page.

## Live connection still required

The clinic has not confirmed an accredited facility account or eClaims provider.
Before implementing a live connector, obtain the clinic's applicable facility enrollment,
certified provider or in-house software certification arrangements, approved current
eClaims 3.0 API/service implementation package, and authorized test access.
Use that contract to implement server-side authentication, encryption/signing,
payload validation, idempotent submissions, response reconciliation and audit trails.
Provider secrets and cipher material must remain server-side. Complete compliance
testing and authorized production enrollment before enabling a live connection.

Do not infer a working production endpoint from old public test-service examples.
Do not substitute a generic JSON API for the actual PhilHealth specification.
Do not hard-code benefit amounts or infer clinical eligibility from profile fields.

## Official references

- [eClaims 3.0 implementation and electronic SOA](https://www.philhealth.gov.ph/advisories/2025/PA2025-0076.pdf): earlier eClaims versions were disabled after March 2026; applicable admissions from April 2026 require electronic SOA. A scanned PDF is not a compliant substitute.
- [2026 maternal filing clarification](https://www.philhealth.gov.ph/advisories/2026/PA2026-0046.pdf): delivery claims use CF4, while antenatal/postpartum records use ANCR/PPCR. This workspace is not a complete claim checklist.
- [Software certification application](https://www.philhealth.gov.ph/downloads/eclaims/AnnexA-SCAF.pdf): supports in-house and outsourced software arrangements.
- [Cloud storage application](https://www.philhealth.gov.ph/downloads/eclaims/PCSS_ApplicationForm.pdf).
- [Official forms and downloads](https://www.philhealth.gov.ph/downloads/).

## Verification

`node --test tests/philhealthPreparation.test.js` checks PIN formatting, package-specific
document matching, rejected documents, and the absence of inferred eligibility/eSOA approval.
The isolated `tests/browser/philhealth-preparation-smoke.cjs` uses synthetic records and
intercepts all API/external traffic to check the complete preparation UI and route restrictions.
