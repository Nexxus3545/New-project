# Settings Center

Web and native mobile Settings contain seven icon-labelled destinations:
Account & security, Language, Privacy checkup, Privacy Center, Activity log,
Content preferences, and Appearance. Profile retains patient/care information
and documents. Native patient biometrics and contact/recovery controls are in
Settings > Account & security.

## Scope

- English and Filipino apply to Settings navigation and the new preference
  panels, not clinical records or a complete translation of legacy screens.
- Browser language/content choices are local to that browser. Native display
  choices are local to that app installation. Neither contains clinical data,
  tokens, activity history, or a patient identifier. Choices are device-wide,
  including when another account uses the same browser or installation.
- Native Appearance changes the new Settings screens: light/dark and three
  accent colours. Legacy native screens retain their existing styling. Web
  Appearance retains its existing account-synced application-wide controls.
- Content switches control optional patient-dashboard media and health-tip
  previews. They never hide appointments, readings, alerts, care tasks, records,
  or the education library; staff queues are unchanged.
- Privacy checkup reports individual controls, not a security certification.
  Native permission review reads current permissions without requesting them.
  A saved phone is explicitly NOT SMS-verified. No SMS provider is connected.
- Privacy Center explains existing controls and routes users to the clinic for
  review. It is not a substitute for the clinic's approved privacy policy and
  does not automatically delete clinical records.

## Own-Account Activity

`GET /api/account/activity` requires the existing authenticated route middleware
and returns `Cache-Control: no-store`. The authenticated user ID scopes both
query branches; client-supplied IDs and limits are ignored. Each branch and the
combined response are limited to 50 entries. Audit events and Google sign-in
notifications are merged in descending timestamp order.

Only `id`, an allowlisted `action`, an allowlisted `area`, and `createdAt` are
returned. Audit payloads, clinical values, target IDs, IPs, and device details
are not selected or returned. This is a limited recorded-action history, not
a complete list of login sessions or devices. Errors are not shown as empty
history. No migration or new production record writes are needed.

## Verification

- Backend: `npm test`. SQL tests require `MWOS_RUN_LOCAL_SQL_TEST=1` and an
  explicit local environment file through `MWOS_LOCAL_TEST_ENV_FILE`; tests
  reject remote hosts and use temporary tables inside rolled-back transactions.
- Web: `npm test`, `npm run build`,
  `node tests/browser/settings-center-smoke.cjs`, and
  `node tests/browser/settings-appearance-smoke.cjs`.
- Browser checks intercept all API traffic, including when
  `MWOS_VERIFY_ORIGIN=https://tmc-copino-mwos.vercel.app` is supplied. No real
  accounts, emails, appointments, or patient mutations are used.
- Native: `npm test` covers preference validation/persistence failures,
  actionable menu destinations, appearance/language controls, own-activity
  query/error handling, and optional content switches with isolated adapters.
- A new standalone Android preview APK must be installed to receive native
  changes. Vercel does not update an installed APK. Real-phone permission,
  biometric, and Google callback testing remains necessary. See
  `mobile/RELEASE_READINESS.md` for preview and public-release limitations.

## Native Build Isolation

The native entry is the checkout-local `mobile/index.js`, which imports its
own `App.js` explicitly. Metro includes the source directory and the physical
dependency target when a managed worktree uses a node_modules junction. This
prevents Expo's dependency-installed default entry from finding an older App
in the original checkout. Experimental Metro worker threads are disabled.

The source-path checks are automated, but are not a substitute for a successful
native build. A failed or interrupted build must never be presented as a new
APK; the previous preview artifact may still exist at the same output path.
