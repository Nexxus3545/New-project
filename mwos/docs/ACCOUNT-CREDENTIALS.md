# Account credentials

## Clinic workflow

- Patients submit one government-issued ID from **Settings → Account and security → Patient identity**. Accepted choices include PhilHealth ID, National ID, passport, driver's license, UMID, SSS, GSIS, postal ID, voter's ID and another named government-issued ID. No full patient ID number or PSN is requested. Optional last four characters help match an in-person review.
- Doctors, nurses and midwives submit one professional ID/license, its license number and a future expiry date. Administrators are managed separately and do not need a clinical license for administrative work.
- A signed-in patient or clinician can submit their own evidence. An administrator can submit for another user after extra account verification and confirmation of permission to submit the file.
- Uploading creates **Pending review** and runs private automated document checks. An administrator opens the user, reviews the findings and original evidence, confirms either an issuing-authority check or an in-person original-ID check, and records a review note before verifying or rejecting it. Concerns or unreadable details need a separate acknowledgement. This is a clinic review, not automatic government, PhilHealth or PRC authentication.
- A replacement overwrites the one current file, increments its revision and resets approval. An old review cannot approve a newer submission. Patient identity approval is separate from professional qualification and insurance eligibility.
- Changes to an account name, role, or patient name/date of birth also reset credential approval and scan results. Clinical license verification returns to pending until the revised identity is reviewed.

## Automated document checks

- OCR runs on the MWOS server using bundled English language data. It does not send IDs to an external AI or OCR service, and network fallback is disabled. JPEG/PNG images and PDFs are supported. At most two PDF pages are read, within a 25-second worker deadline and bounded image dimensions; only one heavy OCR job runs per server instance.
- Checks compare readable document type, account name, optional date of birth, professional role/license number, expiry and exact duplicate-file evidence. Results are **Ready for review**, **Needs attention**, or **Manual review needed**. OCR confidence is a readability measure, never a probability that an ID is genuine.
- Raw OCR text, extracted personal details, document hashes and diagnostics are excluded from responses and audit logs. Results contain fixed findings only. A mismatch does not establish fraud; a readable forgery can pass consistency checks. Scans never approve credentials automatically and do not perform face matching or liveness verification.
- Approval requires a completed scan attempt for the current submission revision within 30 minutes, plus the administrator's explicit original-ID or issuer-check attestation. Unreadable or unavailable scans remain eligible for a documented manual decision after concerns are resolved. Abandoned processing can be retried after its lease expires. Replacements or identity edits invalidate older results.
- Official manual services are [National ID Check](https://everify.gov.ph/check) and [PRC verification](https://verification.prc.gov.ph/). Direct National ID authentication requires authorized PSA relying-party/API onboarding; no official PSA, PRC or PhilHealth authenticity API is configured by this feature. Patient identity review does not establish PhilHealth benefit eligibility.

## Password requirements

New and changed passwords require at least eight characters, a letter, a number and a symbol. Whitespace does not count as a symbol. Control characters and values exceeding bcrypt's 72-byte input limit are rejected. Registration, administrator-created accounts, password changes and password resets enforce the same rule on the server, with a live checklist in the browser. Existing login passwords remain usable until changed; this release does not reset account passwords. Composition checks are not a guarantee against password compromise.

## Access and privacy

- Clinical staff need a clinic-reviewed, current professional license matching their registry record before accessing protected clinical functions. Expiry is checked against the Manila calendar date on each request. Missing or old evidence is not automatically approved.
- Sign-in, account settings, credential submission, security enrollment and own notifications remain available while clinical verification is pending. Admin and patient accounts use their separate requirements; no existing account is deactivated by the migration.
- One JPEG, PNG or PDF of at most 2 MiB is stored privately in PostgreSQL. Bytes and MIME signatures are validated. There are no public upload URLs for these files.
- The evidence table enables row-level security and revokes public/anonymous/authenticated PostgREST grants. The backend database owner accesses it through authenticated, authorized endpoints. Database operators manage storage encryption and backup retention.
- Metadata responses exclude document bytes. Full files require an authenticated own-account request or an administrator request, use attachment downloads with `no-store` and `nosniff`, and are audited. The generic activity log never copies the file, license number, ID suffix or review notes.
- Submission and review use consistent row locks. Review checks the submission revision, pending status, current account role and license expiry. License updates and the audit receipt commit together.
- Legacy license status toggles cannot grant verification without approved matching evidence. Government/professional identity documents use the private flow; medical and training documents retain their separate workflows.

## Implementation and checks

`20261028181230_account_credentials.sql` and `20261028233717_credential_scanning.sql` are additive and run through the existing production migration build. They create one current credential record per user and revision-bound scan metadata; existing users and clinical records are preserved. New installations also receive these definitions from `schema.sql`. Each backend build runs a real offline OCR smoke check using embedded synthetic pixels before deployment.

The authenticated API uses `/api/credentials/mine` for own submissions and `/api/credentials/users/:userId` for administrators, with `/document` for private downloads and `/scan` for revision-bound rescanning. Administrators review through `/api/credentials/users/:userId/review`. Administrative writes use the existing `license-change` extra sign-in verification purpose.

Unit tests cover document validation, role separation, expiry, revisions, private responses, audit redaction and clinical eligibility. The optional local PostgreSQL integration test uses an isolated random schema and executes the migration twice plus submission/review/replacement and cascade cleanup. Browser checks use synthetic files and accounts, block real external traffic, and cover patient/staff/admin flows and 320–1440px layouts.
