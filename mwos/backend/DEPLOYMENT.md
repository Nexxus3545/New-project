# MWOS API deployment

The MWOS web application and API are separate Vercel projects. The public patient/staff portal is deployed from `frontend`; the Express API must be deployed from `backend`.

## Deploy the API

1. In Vercel, create a new project from the MWOS GitHub repository.
2. Set the project root directory to `backend`.
3. Leave framework detection enabled. Vercel detects `src/index.js` as the Express entry point.
4. Add the production environment variables from the clinic's secure password manager:
   - `DATABASE_URL` (preferred). For Supabase on Vercel, open the Supabase project, choose **Connect**, then copy the **Transaction pooler** URI. Replace the password placeholder and keep `sslmode=require` when it is included. Do not put this value in the frontend project or Git.
   - `DATABASE_POOL_MAX=1` for the Vercel serverless API
   - `JWT_SECRET`, `JWT_REFRESH_SECRET`
   - Email settings only if email delivery is enabled
   - `FRONTEND_URL=https://tmc-copino-mwos.vercel.app`
   - `NODE_ENV=production`
   - `AUTO_MIGRATE_ON_START=false`
   - Optional Google sign-in: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_CALLBACK_URL=https://<your-api-domain>/api/auth/google/callback`
   - Optional Facebook sign-in: `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, and `FACEBOOK_CALLBACK_URL=https://<your-api-domain>/api/auth/facebook/callback`
   - Optional SMS sign-in: `SMS_GATEWAY_URL`, `SMS_GATEWAY_TOKEN`, and a unique `OTP_SECRET`. The configured gateway must accept `POST` JSON with `to` and `message` fields and return a successful `2xx` response only after accepting the message for delivery.
5. Run the MWOS database migration against the production database from an approved administrative environment before sending users to the new API:

   ```powershell
   cd backend
   $env:DATABASE_URL='paste-the-supabase-transaction-pooler-uri-here'
   $env:DATABASE_POOL_MAX='1'
   npm run migrate
   ```

   Do not use `migrate:reset` in production because it deletes clinic records.
6. Redeploy the API, then confirm that `https://<your-api-domain>/ready` responds with `"database":"connected"`. Only then test a password login.

## Resolve the current production login outage

The login screen's “clinic service is temporarily unavailable” message means the API cannot reach its database. For the deployed MWOS API, complete these steps in this order:

1. In Supabase, open the clinic project and select **Connect**. Copy the **Transaction pooler** connection URI; this is the appropriate mode for Vercel's serverless functions.
2. In the Vercel project for `tmc-copino-mwos-api`, open **Settings → Environment Variables** and add `DATABASE_URL` with that URI and `DATABASE_POOL_MAX` with `1` for the **Production** environment.
3. Ensure `JWT_SECRET` and `JWT_REFRESH_SECRET` are set to distinct, high-entropy values. Set `FRONTEND_URL=https://tmc-copino-mwos.vercel.app`, `NODE_ENV=production`, and `AUTO_MIGRATE_ON_START=false`.
4. Run the safe migration command above once, then redeploy the API.
5. Visit `/ready`. A `200` with `database: "connected"` confirms that it is safe to allow clinic sign-ins again.

If Supabase has not been created yet, create the project first. The database password and connection URI are clinic secrets: never send them in chat or add them to source files.

## Connect the web portal

In the existing Vercel frontend project, add this production environment variable and redeploy:

```text
VITE_API_BASE_URL=https://<your-api-domain>
```

The frontend automatically adds `/api` to this address. For example, `https://mwos-api.vercel.app` becomes `https://mwos-api.vercel.app/api/auth/login`.

## Security notes

- Never commit database passwords, JWT secrets, mail credentials, or provider keys.
- Keep the API project separate from the static frontend project so `/api` requests never fall through to the Vite app.
- Verify CORS using the exact production portal URL before enabling patient access.
- Social sign-in is patient-only. An existing MWOS password account is never auto-linked by matching its email address.
- Register the exact production callback URLs in the Google Cloud and Meta developer consoles. Keep provider secrets in Vercel's backend environment settings only.

## Activate patient Google and Facebook sign-in

The live frontend is `https://tmc-copino-mwos.vercel.app` and the live API is
`https://tmc-copino-mwos-api.vercel.app`. The provider settings belong in the
**API Vercel project**, not the frontend project. Create clinic-owned OAuth
applications, then set these Production environment variables:

| Variable | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Google OAuth Web application client ID |
| `GOOGLE_CLIENT_SECRET` | Matching Google client secret |
| `GOOGLE_CALLBACK_URL` | `https://tmc-copino-mwos-api.vercel.app/api/auth/google/callback` |
| `FACEBOOK_APP_ID` | Clinic Meta app ID |
| `FACEBOOK_APP_SECRET` | Matching Meta app secret |
| `FACEBOOK_CALLBACK_URL` | `https://tmc-copino-mwos-api.vercel.app/api/auth/facebook/callback` |
| `FRONTEND_URL` | `https://tmc-copino-mwos.vercel.app` |

Register the same exact callback URLs in the respective Google and Meta app
consoles. The Google OAuth client must be a Web application. The Meta app must
have Facebook Login enabled and permission to request `email`. For public
patient use, complete each provider's production publishing requirements.
Never use placeholder IDs or put the secrets in `VITE_*` variables.

Before enabling social sign-in, `/ready` must report `database: "connected"`,
and the safe schema migration must have created `oauth_identities` and
`oauth_login_codes`. The public `/api/auth/providers` endpoint reports whether
each provider is configured and the database is reachable, without exposing
its keys. Provider-side approval and callback validation still require a real
sign-in test. After saving Vercel
environment variables, redeploy the **API**. If the frontend build still uses
an old API URL, set `VITE_API_BASE_URL=https://tmc-copino-mwos-api.vercel.app`
in the **frontend** project and redeploy it too. Finally, test new patient
sign-in with each provider; existing password and staff accounts are not
auto-linked by email.
