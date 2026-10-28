# Telehealth video consultation

## Patient and clinic flow

1. Open **Telehealth**. Optionally use **Check camera & microphone** for a local, muted device check. It does not join, record or upload media.
2. Submit or select a consultation request. Patients can suggest a future date/time and a 15, 30, 45 or 60 minute duration. This remains a request until reviewed; patients cannot approve it or add participants.
3. Administrators use **Review consultation requests**, choose the confirmed time and duration, **Check availability**, then **Accept consultation**. The assigned clinician can also schedule from the consultation details. No external meeting link is needed.
4. For a scheduled or active consultation, choose **Join video consultation**. The local preview stops before the private Daily call loads inside MWOS.
5. Use the embedded call's camera, microphone and leave controls. **In call** appears only after the SDK confirms that this browser joined. Leaving does not complete the consultation record.
6. The assigned clinician or participating admin marks the record in progress, completes it or cancels an unstarted consultation. Completion/cancellation ejects participants and removes its provider room.

Admin acceptance requires extra sign-in verification for teleconsultation. It is administrative booking and does not require professional credentials. Clinical management keeps the existing verified-staff requirements. Accepting a request does not add the reviewing administrator to its private conversation or give them video access.

## Schedule review and conflict protection

- The administrator queue includes up to 100 pending or confirmed consultations, with pending requests first. It exposes scheduling details, not private conversation messages or video credentials.
- Preferred times do not reserve a slot. The administrator can choose another time before accepting. Summaries use Asia/Manila; date/time inputs state the device timezone used for entry.
- An availability check belongs to the selected request, time and duration and expires after one minute. Editing those fields requires a new check.
- Acceptance checks again inside a database transaction. All consultation and appointment booking writes share a transaction lock, so concurrent requests cannot both approve overlapping times for the same patient or clinician.
- Scheduled/active consultations reserve their selected duration. Scheduled/confirmed clinic appointments reserve 30 minutes, interpreted in Asia/Manila. Adjacent slots are allowed. Cancelled/completed records do not block future bookings.
- Acceptance, the audit record and notifications commit together. A missing patient or unavailable assigned clinician prevents acceptance. The patient and assigned clinician receive in-app confirmation without clinical details in the notification.
- Starting a consultation preserves its confirmed schedule. Actual completion remains a separate lifecycle action.
- The additive `20261028153742_teleconsult_scheduling.sql` migration adds preference/duration fields and booking indexes. The production backend build runs it through `migratePatientCare.js`; it does not reset or seed the database.

## Configuration and access

- Set `DAILY_API_KEY` only on the backend server. Do not expose it through frontend environment variables, source files, URLs or chat.
- `POST /api/interactions/teleconsults/:id/video/join` checks authentication, thread membership, patient ownership and consultation state before provisioning a room or minting access.
- Rooms are private and use opaque names. Names, clinical concerns and patient identifiers are not sent to Daily. Participants appear as Patient or Care team with opaque user IDs.
- Room-scoped admission tokens expire after 10 minutes and stay in memory; the browser passes them directly to the SDK. An admitted call is bounded by the room's two-hour expiry. Rejoining requests fresh credentials.
- Recording, stored transcription, screen sharing and chat are disabled. Participants do not receive owner or administrative privileges.
- Closed consultations cannot be joined. Existing external links are not used by the new embedded interface.
- Video calling uses the existing provider/URL/code columns for the managed room reference; tokens are never stored there. Scheduling uses the additive migration described above.
- Device access requires an explicit user action and browser permission. Leave, errors, session changes and unmount destroy the provider frame and release media resources. Asynchronous cleanup completes before a replacement frame is created.

## Verification

Frontend unit checks cover access validation, SDK events, cancellation races, device cleanup, joining eligibility and schedule-review freshness. Backend tests cover provider requests, room privacy, token restrictions, lifecycle, participant authorization and atomic booking. The isolated local PostgreSQL check applies the migration twice and verifies cross-table conflicts and concurrent booking locks. Browser smoke tests use synthetic accounts and APIs, block real external traffic and check inline calls, schedule review, errors and responsive layouts.

Run `node src/utils/checkDailyConfiguration.js` explicitly in the configured backend environment to verify actual room creation, both scoped token types, ejection and deletion. It creates a synthetic private test room, attempts cleanup even on failure and prints sanitized PASS/FAIL diagnostics. It does not access patients or alter consultation records. Do not run it automatically on every application startup.

These checks do not replace a two-person audio/video test on the clinic's actual devices and network.

## Primary references

- [Daily private-room creation](https://docs.daily.co/reference/rest-api/rooms/create-room)
- [Daily scoped meeting tokens](https://docs.daily.co/reference/rest-api/meeting-tokens/create-meeting-token)
- [Daily embedded call frame](https://docs.daily.co/reference/daily-js/factory-methods/create-frame)
- [Daily join options](https://docs.daily.co/reference/daily-js/instance-methods/join)
- [Browser media capture](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
