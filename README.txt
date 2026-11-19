Testonic - test series platform (Cloudflare Workers + static assets)

FIRST LOGIN
  Username: aadi6581    Password: 01201
  Right after the first login open Account and change both.

REPO STRUCTURE (delete everything old: functions/, netlify/, netlify.toml, package.json)
  public/            website
  src/worker.js      backend (API) - needs D1 + KV bindings
  wrangler.jsonc     config that declares the bindings

SETUP
  1. Put these files in your GitHub repo root and push.
  2. Open wrangler.jsonc and make "name" EXACTLY the same as your Worker's name in the Cloudflare dashboard.
  3. Workers & Pages > your Worker > Settings > Build:
       Build command: (empty)     Deploy command: npx wrangler deploy
  4. Push a commit (or Retry build). Wrangler creates the D1 database "testonic" and the KV namespace
     automatically. If the build log says it cannot find/create them:
       - Dashboard > Storage & databases > D1: create "testonic", copy its ID into wrangler.jsonc ("database_id")
       - Dashboard > Storage & databases > KV: create a namespace, copy its ID into wrangler.jsonc ("id")
     then push again.
  5. Open https://YOUR-WORKER.workers.dev/api/health   it must show {"ok":true,"db":true,"files":true}

LIMITS (free plan)
  100,000 API requests/day (site refreshes every 20 s only while a tab is visible).
  Files up to 20 MB. A new upload can take up to about a minute to be readable everywhere.
