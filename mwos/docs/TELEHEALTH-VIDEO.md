# Telehealth video consultation

## Patient and clinic flow

1. Open **Telehealth** and choose **Check camera & microphone** or the microphone-only check.
2. Allow device access in the browser. This is a local, muted preview; it does not join a call, record or upload media.
3. Submit or select the consultation request. Patients cannot approve their own request or add other participants.
4. The assigned clinician or a participating administrator creates a real room using the clinic's Google account, then saves its Google Meet link and the confirmed schedule in MWOS.
5. Once scheduled, participants choose **Join Google Meet**. MWOS releases its local camera/microphone tracks synchronously before the external meeting opens. Google Meet handles the live call, admission and host controls.
6. The assigned clinician or participating admin can mark the consultation in progress, complete it or cancel an unstarted session. These are clinic record states, not detection of Meet participant presence.

Existing verified-staff and extra sign-in verification requirements remain in force.
The new admin account's creation does not verify any professional credential.

## Implementation boundaries

- Google Meet opens in a separate tab. It is not embedded in MWOS.
- Room links are created by the clinic in Google Meet; MWOS does not claim automatic Meet API provisioning. That would need separately authorized Google OAuth scopes and setup.
- Only canonical HTTPS `meet.google.com/abc-defg-hij` room URLs are accepted. Other hosts, embedded credentials, non-default ports and lookup/new URLs cannot be saved as consultation rooms.
- Patient names, concerns and identifiers are never used to generate external room URLs.
- New requests have no fabricated meeting URL. Legacy public Jitsi links must be replaced with a valid Meet room before scheduling/starting. Closed sessions no longer offer a join link.
- The backend restricts room lifecycle updates to authenticated, verified admin/assigned clinicians who are conversation participants and pass the existing step-up check. Row locks, audit events and participant notifications accompany changes.
- No schema migration or new video-provider secret is needed for this link-based integration.
- Camera acquisition occurs only after an explicit click, with permission-denied, unsupported, missing/busy-device and insecure-context handling. Stop, unmount, pagehide, session change and late permission grants release media resources.

## Verification

Frontend unit checks cover media lifecycle races, cleanup, audio-only mode, microphone analysis and safe join targets. Backend tests cover URL validation, request ownership, lifecycle/role/participant restrictions and legacy-room cleanup. `frontend/tests/browser/telehealth-video-smoke.cjs` checks the workflow, error cases, local preview and 320–1440px layouts using synthetic devices and intercepted API/external traffic. It does not contact patients or create a real Google Meet call.

## Primary references

- [Google Meet meeting spaces](https://developers.google.com/workspace/meet/api/guides/meeting-spaces-overview)
- [Google Meet API space creation and required OAuth scope](https://developers.google.com/workspace/meet/api/reference/rest/v2/spaces/create)
- [Jitsi production integration guidance](https://jitsi.org/api/)
- [Browser media capture](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
