# Account credentials

## Clinic workflow

- Patients submit one government-issued ID from **Settings → Account and security → Patient identity**. Accepted choices include PhilHealth ID, National ID, passport, driver's license, UMID, SSS, GSIS, postal ID, voter's ID and another named government-issued ID. No full patient ID number or PSN is requested. Optional last four characters help match an in-person review.
- Doctors, nurses and midwives submit one professional ID/license, its license number and a future expiry date. Administrators are managed separately and do not need a clinical license for administrative work.
- A signed-in patient or clinician can submit their own evidence. An administrator can submit for another user after extra account verification and confirmation of permission to submit the file.
- Uploading creates **Pending review**. An administrator opens the user, privately downloads the evidence, checks the credentials, and records a review note before verifying or rejecting it. This is a clinic review, not automatic government, PhilHealth or PRC authentication. PRC's official verification service is linked for manual review.
- A replacement overwrites the one current file, increments its revision and resets approval. An old review cannot approve a newer submission. Patient identity approval is separate from professional qualification and insurance eligibility.

## Access and privacy

- Clinical staff need a clinic-reviewed, current professional license matching their registry record before accessing protected clinical functions. Expiry is checked against the Manila calendar date on each request. Missing or old evidence is not automatically approved.
- Sign-in, account settings, credential submission, security enrollment and own notifications remain available while clinical verification is pending. Admin and patient accounts use their separate requirements; no existing account is deactivated by the migration.
- One JPEG, PNG or PDF of at most 2 MiB is stored privately in PostgreSQL. Bytes and MIME signatures are validated. There are no public upload URLs for these files.
- The evidence table enables row-level security and revokes public/anonymous/authenticated PostgREST grants. The backend database owner accesses it through authenticated, authorized endpoints. Database operators manage storage encryption and backup retention.
- Metadata responses exclude document bytes. Full files require an authenticated own-account request or an administrator request, use attachment downloads with `no-store` and `nosniff`, and are audited. The generic activity log never copies the file, license number, ID suffix or review notes.
- Submission and review use consistent row locks. Review checks the submission revision, pending status, current account role and license expiry. License updates and the audit receipt commit together.
- Legacy license status toggles cannot grant verification without approved matching evidence. Government/professional identity documents use the private flow; medical and training documents retain their separate workflows.

## Implementation and checks

`20261028181230_account_credentials.sql` is additive and runs through the existing production migration build. It creates one current credential record per user; existing users and clinical records are preserved. New installations also receive the table from `schema.sql`.

The authenticated API uses `/api/credentials/mine` for own submissions, `/api/credentials/users/:userId` for administrators, `/document` for private downloads and `/:userId/review` for revision-bound review. Administrative writes use the existing `license-change` extra sign-in verification purpose.

Unit tests cover document validation, role separation, expiry, revisions, private responses, audit redaction and clinical eligibility. The optional local PostgreSQL integration test uses an isolated random schema and executes the migration twice plus submission/review/replacement and cascade cleanup. Browser checks use synthetic files and accounts, block real external traffic, and cover patient/staff/admin flows and 320–1440px layouts.
