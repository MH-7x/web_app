# The audit worker

Some features need a real, always-on server with Chrome, which Vercel cannot provide:

| Feature | Why |
|---|---|
| **SEO Audit** | Crawls the site in Chrome and runs Lighthouse speed tests. Takes minutes. |
| **GBP post writing** | Writes weeks of posts in the background while the page shows progress. |
| **Competitor insights** (landing page generator) | Opens competitor pages in Chrome. |

So the app runs in two places:

```
 Browser ──► Vercel (the dashboard) ──forwards──► Worker (this same app, in Docker, with Chrome)
                    │                                   │
                    └────────────► Supabase ◄───────────┘
```

The dashboard checks the user's login as usual, then hands those routes to the worker with a shared secret. The worker
has no logins and no pages: it answers about nine job routes, only to a caller holding the secret, and returns 404 for
everything else. Both share the same database, so finished audits and written posts appear in the dashboard.

With `AUDIT_WORKER_URL` unset (local development) nothing is forwarded and everything runs in one process, as before.

## Set it up

1. **Make a secret** (32+ random characters) and keep it for steps 3 and 4:
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. **Create the worker service** from this repo's `Dockerfile` on any host that runs Docker and stays on
   (Railway, Fly.io, Render, a VPS). Give it **at least 1 GB of memory (2 GB is comfortable)**: Chrome plus Lighthouse
   need it. Expose port 3000 over HTTPS.
3. **Worker environment variables:**

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | The same Supabase **transaction pooler** (port 6543) string the dashboard uses |
   | `JWT_SECRET` | The **same** value as the dashboard (it decrypts the Gemini key saved in Settings) |
   | `AUDIT_WORKER_SECRET` | The secret from step 1 |
   | `CRUX_API_KEY` | Optional: real-user Core Web Vitals in the audit |

   The Dockerfile already sets `WORKER_ONLY=true`, `CHROME_NO_SANDBOX=true` and `PUPPETEER_EXECUTABLE_PATH`.
4. **Dashboard (Vercel) environment variables**, in addition to the existing ones:

   | Variable | Value |
   |---|---|
   | `AUDIT_WORKER_URL` | The worker's public address, e.g. `https://worker.example.com` (https, no trailing slash) |
   | `AUDIT_WORKER_SECRET` | The same secret |

5. **Check it:** open `https://<worker>/api/health`. You want
   `{"ok":true,"mode":"worker","database":true,"browser":true}`. `browser:false` means Chrome was not found in the
   image; `database:false` means the `DATABASE_URL` is wrong.
6. In the dashboard, run an audit on a client with a website.

## Things to know

- **Jobs live in the worker's memory.** If the worker restarts or redeploys during an audit, that audit is lost (the user
  sees "no longer running" and starts it again). Finished audits are saved. GBP posts are saved batch by batch, so a
  restart loses only the batch in progress. Avoid redeploying the worker while someone is mid-audit.
- **One audit runs at a time** (they are heavy), and starting a second for the same client returns the one already running.
- **If the worker is down**, the dashboard keeps working. Only these features report "The audit server is not reachable".
- **Rotating `AUDIT_WORKER_SECRET`:** change it on both sides together.
- **Rotating `JWT_SECRET`:** change it on both sides, then enter the Gemini key again in Settings.
- **Chrome runs without its sandbox** inside the container (containers usually cannot offer one). The worker visits
  websites you give it, so keep it on a dedicated service with no other secrets, and do not add more variables to it than
  the table above.
