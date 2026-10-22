# Mobile Release Status

## Implemented

- Deployed HTTPS API is the default. Use EXPO_PUBLIC_API_URL only for deliberate local testing.
- Google opens the system browser and returns a short-lived, single-use code to tmccopinomwos://oauth.
- The exchange is bound to an S256 verifier generated inside the app. No access/refresh token is placed in a URL.
- New Google patients complete their required birth date before entering the portal.
- Device-enrolled fingerprint/strong face unlock protects a separate refresh-token vault through SecureStore requireAuthentication.
- Background locking removes the usable access/refresh tokens. Private clinical responses are not cached in plain AsyncStorage.
- Contact numbers can be saved after login, but are NOT marked verified. SMS verification/recovery is blocked until the clinic provisions a real SMS provider.
- Facebook login is not offered. The clinic's supplied Facebook page can still be opened for its videos and events.
- The clinic's public Summer Tuli 2026 reel (2538336333249251) was verified on its Facebook page. It is linked as a past-event replay, not a livestream. Facebook's own embed dialog returned Video Unavailable, so this reel opens on Facebook instead of pretending inline playback works.

## Build And Test

- Run npm test in mobile, npm test in backend, and npm test / npm run build in frontend.
- Expo export validates the JavaScript/asset bundle, not the native device behavior.
- New native dependencies and the custom scheme require a new app binary. An old installed APK will not gain them through a Vercel deployment.
- npm run apk:preview creates a standalone, bundled test APK with the deployed API. Its generated signing key is for testing, NOT a public Play Store signing identity.
- A real enrolled phone must test Google callback, cancellation, offline errors, fingerprint cancellation, enrollment changes, background lock, and logout before distributing.
- The user's screenshot shows "Cannot connect to Metro": an installed debug/development APK trying to reach its development server. A standalone bundled APK removes that development-server dependency; real device testing is still required.

### Internal Preview Verification (22 October 2026)

- A standalone APK was built with the deployed HTTPS API, embedded Hermes bundle, Google/crypto native modules, and arm64-v8a/x86_64 libraries. Unsupported 32-bit ABIs are excluded from packaging.
- The APK installed and opened in the Pixel_9a emulator without Metro or a fatal JavaScript/native startup error. The login screen offers Google and does not offer public SMS or Facebook login.
- The Android 16 / 16 KB emulator displayed a compatibility-mode warning for the older native libraries. This is a separate unresolved issue, not the Metro warning and not something to hide before public release.
- All 43 automated tests passed: 24 backend, 10 web, and 9 mobile. This does not prove real-phone Google callback or fingerprint behavior.
- Full Android lint did NOT complete: the build could not download org.robolectric:nativeruntime-dist-compat:1.0.2. Only this internal preview was packaged with the lint tasks explicitly excluded. Normal builds keep lint enabled.
- To reproduce with an already-populated Gradle cache: `npm run apk:preview -- -Offline -SkipAndroidLint`. Do not use those preview exceptions as Play Store release approval.
- The local preview is in `mobile/dist-export/MWOS-Android-Preview.apk`; it uses the generated Android test signing identity. It has not been uploaded to Google Play or published as a public download.

## Not Ready For Google Play Yet (22 October 2026)

1. This project is still Expo SDK 51 / React Native 0.74. It must be upgraded and tested against the current Android API and 16 KB native-library requirements, rather than only increasing targetSdk.
2. Current Google policy requires new apps/updates to target Android 16 / API 36. Expo SDK 54 is an example of a compatible baseline, not a guarantee of app readiness.
3. The current npm production dependency audit reports 80 findings (2 critical, 52 high, 24 moderate, 2 low). Upgrade compatible SDK/dependencies and reassess reachability before release; do not run audit fix --force blindly.
4. A verified clinic-owned Play Console organization account, application signing, and a signed AAB are required. EAS profiles are provided but no Expo/Play account or signing credentials have been provisioned here.
5. Complete the health-app declaration, Data safety, privacy policy, account-deletion workflow, app-access review instructions, clinic authorization, screenshots, and store listing.
6. Any applicable testing/production-access requirements must be completed in Play Console. Google review is external and cannot be guaranteed.
7. Actual SMS needs an approved provider and credentials stored server-side, abuse controls, verified-number ownership records, expiry/attempt limits, recovery risk controls, and delivery tests. No fake or email-substituted SMS verification should be enabled.
8. Actual clinic videos require their direct public video URLs or approved files. A Facebook profile/page URL is not itself a playable video. No event dates, live status, treatment outcomes, or patient-consent claims are fabricated.

## Official References

- https://support.google.com/googleplay/android-developer/answer/11926878
- https://support.google.com/googleplay/android-developer/answer/16679511
- https://support.google.com/googleplay/android-developer/answer/14151465
- https://developer.android.com/guide/practices/page-sizes
- https://docs.expo.dev/versions/v54.0.0/
- https://docs.expo.dev/submit/android/
