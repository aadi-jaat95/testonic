Testonic - test series platform (Cloudflare Pages)

FIRST LOGIN
  Username: aadi6581    Password: 01201
  Right after the first login open Account and change both.
  (This default works only while no admin exists.)

STRUCTURE (keep exactly like this in your GitHub repo)
  public/                      website (index.html, logo, jszip.min.js)
  functions/api/[[path]].js    backend (runs as a Cloudflare Pages Function)
  Delete the old netlify/ folder, netlify.toml and package.json from the repo.

SETUP (free plan is enough, no card needed)
  1. Cloudflare dashboard > Storage & databases > D1 > Create database. Name: testonic
  2. Storage & databases > KV > Create namespace. Name: testonic-files
  3. Workers & Pages > Create > Pages > Connect to Git > choose your repo.
       Framework preset: None
       Build command: (leave empty)
       Build output directory: public
     Save and Deploy.
  4. Open the project > Settings > Bindings (or Functions > Bindings) and add:
       D1 database binding   variable name: DB      -> testonic
       KV namespace binding  variable name: FILES   -> testonic-files
     Add them for Production (and Preview if shown). The variable names must be exactly DB and FILES.
  5. Deployments > Retry deployment (or push any commit).
  6. Open https://YOUR-SITE.pages.dev/api/health   it must show {"ok":true,"db":true,"files":true}

OPTIONAL
  Settings > Variables > AUTH_SECRET = any long random string.

LIMITS (free plan)
  100,000 backend requests per day (the site refreshes every 20 s only while a tab is visible).
  Files up to 20 MB each. A newly uploaded file can take up to about a minute to be readable everywhere.
