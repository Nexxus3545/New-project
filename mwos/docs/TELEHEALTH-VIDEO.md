# Telehealth video consultation

## Patient and clinic flow

1. Open **Telehealth**. Optionally use **Check camera & microphone** for a local, muted device check. It does not join, record or upload media.
2. Submit or select a consultation request. Patients cannot approve their own requests or add participants.
3. The assigned clinician or participating administrator confirms the schedule in MWOS. No external meeting link is needed.
4. For a scheduled or active consultation, choose **Join video consultation**. The local preview stops before the private Daily call loads inside MWOS.
5. Use the embedded call's camera, microphone and leave controls. **In call** appears only after the SDK confirms that this browser joined. Leaving does not complete the consultation record.
6. The assigned clinician or participating admin marks the record in progress, completes it or cancels an unstarted consultation. Completion/cancellation ejects participants and removes its provider room.

Existing verified-staff and extra sign-in verification requirements remain in force. Creating an admin account does not verify professional credentials.

## Configuration and access

- Set `DAILY_API_KEY` only on the backend server. Do not expose it through frontend environment variables, source files, URLs or chat.
- `POST /api/interactions/teleconsults/:id/video/join` checks authentication, thread membership, patient ownership and consultation state before provisioning a room or minting access.
- Rooms are private and use opaque names. Names, clinical concerns and patient identifiers are not sent to Daily. Participants appear as Patient or Care team with opaque user IDs.
- Room-scoped admission tokens expire after 10 minutes and stay in memory; the browser passes them directly to the SDK. An admitted call is bounded by the room's two-hour expiry. Rejoining requests fresh credentials.
- Recording, stored transcription, screen sharing and chat are disabled. Participants do not receive owner or administrative privileges.
- Closed consultations cannot be joined. Existing external links are not used by the new embedded interface.
- No schema migration is required. Existing provider/URL/code columns store the managed room reference; tokens are never stored there.
- Device access requires an explicit user action and browser permission. Leave, errors, session changes and unmount destroy the provider frame and release media resources. Asynchronous cleanup completes before a replacement frame is created.

## Verification

Frontend unit checks cover access validation, SDK events, cancellation races, device cleanup and joining eligibility. Backend tests cover provider requests, room privacy, token restrictions, lifecycle and participant authorization. The browser smoke test uses synthetic accounts, devices and a test-only SDK module; it blocks real external traffic and checks inline calls, errors and responsive layouts.

Run `node src/utils/checkDailyConfiguration.js` explicitly in the configured backend environment to verify actual room creation, both scoped token types, ejection and deletion. It creates a synthetic private test room, attempts cleanup even on failure and prints sanitized PASS/FAIL diagnostics. It does not access patients or alter consultation records. Do not run it automatically on every application startup.

These checks do not replace a two-person audio/video test on the clinic's actual devices and network.

## Primary references

- [Daily private-room creation](https://docs.daily.co/reference/rest-api/rooms/create-room)
- [Daily scoped meeting tokens](https://docs.daily.co/reference/rest-api/meeting-tokens/create-meeting-token)
- [Daily embedded call frame](https://docs.daily.co/reference/daily-js/factory-methods/create-frame)
- [Daily join options](https://docs.daily.co/reference/daily-js/instance-methods/join)
- [Browser media capture](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
