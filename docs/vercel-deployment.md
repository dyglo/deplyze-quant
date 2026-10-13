# Vercel frontend hosting

Production frontend: <https://deplyze-quant.vercel.app> (also available at
<https://deplyze-quant-next-q.vercel.app>).
Vercel team: NextQ; project: `deplyze-quant`.
The deployment uses `chore/vercel-frontend`, based on `chore/remove-pages`.

Vercel builds the repository root with Node.js 24, `npm run build`, and the
`dist` output directory. `vercel.json` preserves browser `/api/*` URLs by
forwarding them to the existing Firebase Hosting gateway rewrite. Firebase
Hosting must stay available as the API ingress while this configuration is used.
Firebase Auth, Firestore, Storage, Cloud Functions, Cloud Run, and scheduled jobs
remain on their existing infrastructure. This does not migrate the backend.

The SPA fallback supports direct visits and refreshes on React Router pages.
API responses are excluded from that fallback. Hashed assets retain immutable
caching; page responses use `no-cache`.

## Configuration

Set these public Firebase web configuration variables in Vercel Production and
Preview: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
`VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`,
`VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, and
`VITE_FIREBASE_MEASUREMENT_ID`. Use the existing Firebase project's web app
configuration. These values are browser configuration, not server credentials.
Do not copy provider keys, service-account credentials, or gateway secrets into
the frontend project. Analytics remains disabled unless explicitly enabled with
`VITE_ENABLE_FIREBASE_ANALYTICS=true`.

Before treating a new hostname as fully operational:

- Add it to Firebase Authentication's authorized domains for Google sign-in.
- Include its origin in the gateway's `ALLOWED_ORIGINS`, retaining all existing
  allowed origins. External rewrites can forward browser Origin headers.
- Verify live API health, authenticated reads and writes, Firestore access,
  Google sign-in, and email links.

Changing the canonical hostname or moving a custom domain also requires
checking the gateway's `APP_BASE_URL`/`PUBLIC_APP_URL` and email links. Existing
email URLs and domains are not changed by this frontend deployment.

The repository's existing GitHub workflow still deploys Firebase and Cloud Run
on pushes to `main`. Vercel should deploy the reviewed frontend branch;
merging or changing the production branch is a separate repository decision.

## Initial verification status

On 2026-10-13, before changing frontend hosting, both
`https://deplyze-quant.web.app/api/health` and
`https://deplyze-quant.web.app/api/v1/agents/registry` returned HTTP 503.
Google Cloud credentials were unavailable in the execution workspace, so the
live gateway failure and hostname authorization require infrastructure access.
A successful frontend build does not establish working backend data flows.

Vercel completed the production build successfully. Local build and lint
(TypeScript checking) passed; all 55 frontend tests passed. Browser checks of
15 surviving route examples returned HTTP 200 for the page documents, with no
uncaught JavaScript exceptions. Protected surfaces showed the existing sign-in
gate. API calls returned the existing upstream 503 responses. The sitemap and
JavaScript assets were served correctly, rather than receiving the SPA fallback.

Firebase Auth's public configuration listed only `localhost`,
`deplyze-quant.firebaseapp.com`, and `deplyze-quant.web.app` as authorized
domains. Add both Vercel production hostnames before verifying Google sign-in.
Authenticated account flows and live backend data could not be verified with
the gateway unavailable. No custom domains or Google Cloud resources were changed.
