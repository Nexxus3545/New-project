# MWOS API deployment

The MWOS web application and API are separate Vercel projects. The public patient/staff portal is deployed from `frontend`; the Express API must be deployed from `backend`.

## Deploy the API

1. In Vercel, create a new project from the MWOS GitHub repository.
2. Set the project root directory to `backend`.
3. Leave framework detection enabled. Vercel detects `src/index.js` as the Express entry point.
4. Add the production environment variables from the clinic's secure password manager:
   - `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
   - `JWT_SECRET`, `JWT_REFRESH_SECRET`
   - Email settings only if email delivery is enabled
   - `FRONTEND_URL=https://tmc-copino-mwos.vercel.app`
   - `NODE_ENV=production`
   - `AUTO_MIGRATE_ON_START=false`
   - Optional Google sign-in: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_CALLBACK_URL=https://<your-api-domain>/api/v1/auth/google/callback`
   - Optional Facebook sign-in: `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, and `FACEBOOK_CALLBACK_URL=https://<your-api-domain>/api/v1/auth/facebook/callback`
5. Run the MWOS database migration against the production database from an approved administrative environment before sending users to the new API.
6. Deploy and confirm that `https://<your-api-domain>/health` responds with JSON and `database: "connected"`.

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
