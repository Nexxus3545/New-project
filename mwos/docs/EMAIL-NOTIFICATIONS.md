# Google Sign-In Checks and Appointment Email

Status: the user approved deploying notification emails with the additional Google
email-code requirement OFF. Real sender delivery is not yet verified.

## Temporary Gmail Sender

The user confirmed `nexxus1122@gmail.com` as the temporary sender. Use a clinic-owned
address for ongoing clinic operations. Never put Gmail credentials, verification codes, or
app passwords in source control, chat, screenshots, or frontend environment variables.

1. Sign in to the intended sender's Google Account.
2. Enable Google 2-Step Verification: https://myaccount.google.com/signinoptions/two-step-verification
3. Open https://myaccount.google.com/apppasswords and create an entry named `MWOS Email`.
4. Put the generated app password directly in Vercel's **backend** project
   `tmc-copino-mwos-api`, under Settings > Environment Variables > Production.
   Use the Secret type for `EMAIL_PASS`. This is not the normal Gmail password
   and is not the Google OAuth client secret.

| Backend Variable | Value |
| --- | --- |
| `EMAIL_HOST` | `smtp.gmail.com` |
| `EMAIL_PORT` | `465` |
| `EMAIL_USER` | `nexxus1122@gmail.com` (temporary) |
| `EMAIL_PASS` | Generated Google App Password, kept secret |
| `EMAIL_FROM` | `TMC Copino MWOS <nexxus1122@gmail.com>` |
| `EMAIL_ALLOW_TEST_TRANSPORT` | `false` |
| `GOOGLE_EMAIL_OTP_REQUIRED` | Keep `false` until the readiness checks below pass |

Google may not offer App Passwords for accounts subject to certain organization,
Advanced Protection, or security-key restrictions. Do not disable account protections
to work around this. Google guide: https://support.google.com/accounts/answer/185833

Saving variables does not update existing Vercel deployments. A later approved
production deployment must include the new variables and this implementation.

## Readiness Checks Before Requiring Codes

- Deploy the compatible backend and website only after approval. The additive build
  migration preserves all existing patient and appointment records. It creates a
  private delivery-receipt table and adds fields to one-time OAuth handoffs.
- Keep `GOOGLE_EMAIL_OTP_REQUIRED=false` while verifying real sender delivery with a
  clinic-controlled test account. Check both inbox and spam folders. Local tests do
  not prove Gmail delivery.
- Build/install a compatible Android APK before enabling required codes for mobile
  users. The previously distributed APK does not have the new code-entry screen.
  Legacy Android clients receive an update-required error rather than bypassing the check.
- A build guard refuses `GOOGLE_EMAIL_OTP_REQUIRED=true` for this approved
  notification-only release. Requiring codes needs a separate approved rollout,
  including removing that build guard after a real delivery test and a compatible
  Android build. If SMTP is unavailable when required codes are later enabled,
  verification fails closed; it never falls back to issuing a session without a code.
- Vercel preview/development deployments never send email, even if sender secrets
  are accidentally inherited. Production and Vercel environments never create
  Ethereal test mailboxes. Local tests mock SMTP rather than emailing patients.

## User Flow

Google identity verification uses the existing `profile` and `email` scopes. No Gmail
inbox or send-as access is requested from patients. If required, a six-digit code is
sent to the verified email returned by Google, not an editable profile address.
The code expires after 10 minutes, permits at most five incorrect attempts, and is
bound to the original one-time sign-in proof, including Android's PKCE verifier.
Only a successful code check creates an authenticated patient session.

This is an additional email check, not an independent phishing-resistant second
factor: the mailbox may be protected by the same Google account used for sign-in.

After sign-in, a saved MWOS notification records the authorization of patient access.
A separate security email is attempted. Google sign-in does not authorize staff
roles. Public registration cannot create staff/admin accounts; creating staff
accounts requires an authenticated administrator with critical step-up access via
`POST /api/users`, and never issues a new user's session to the administrator.

## Appointment Notifications

New requests and actual status/date/time changes create an in-app notification and
attempt an email. Notes-only edits and unchanged statuses do not create new alerts.
Emails contain schedule/status, reference, and a secure portal link, not symptoms,
diagnoses, appointment type, or pregnancy information. Google-linked users receive
mail only at their provider-verified address, never an editable profile address.
Other accounts receive an in-app notification with `no_verified_recipient` status;
no private appointment schedule is sent to an unverified email address.
Patients without a linked MWOS user account have no authenticated notification
inbox or recipient, so no email is sent for that record.

Email sending happens after the appointment transaction commits and releases the
database connection. A mail failure never turns a saved appointment into an error.
Each event has a unique key and an atomic single-send claim. No historical patient
records or appointments are bulk-emailed by this migration.

Delivery states are `pending`, `sending`, `accepted`, `failed`, `unconfigured`, or
`no_verified_recipient`.
`accepted` means the SMTP server accepted the message, not that it reached the inbox.
A saved `sending` event can be ambiguous after a server crash; do not blindly retry
it, because the first message might already have been accepted. There is no automatic
retry worker or scheduled 24-hour reminder in this implementation.

## Verification

Tests use synthetic accounts, isolated database fixtures, and mocked SMTP. No real
patient emails are sent by the automated test suites. The local SQL migration test
uses a separate schema inside a rolled-back transaction and refuses remote databases.

SMTP reference: https://nodemailer.com/smtp
Google OAuth reference: https://developers.google.com/identity/protocols/oauth2/web-server
