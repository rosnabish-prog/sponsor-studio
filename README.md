# Messi Cup 2026 — Sponsor Intelligence Studio

A branded, interactive **frontend demonstration** for sponsor-exposure annotation in football broadcasts.

## What is included

- Admin and analyst demo sign-in, with role-specific navigation and assignment restrictions in the interface.
- Task creation with task number, source metadata (local file, HTTPS MP4 or FTP/SFTP metadata), reusable sponsor groups, key-event sets, and camera-angle sets.
- One analyst for all tags or two analysts split between sponsor visibility and events/camera context.
- Video controls, manual timestamp seeking, and click-on/click-off unique sponsor visibility. Multiple appearances of one brand in a frame are recorded as a **single active sponsor**.
- One unified timeline with filtering for Sponsors, Events, and Camera Angles, plus recorded-action logs.
- Sponsor exposure analytics, associations with match moments, and downloadable JSON.
- Messi Cup 2026 visual treatment; logo references the official asset `https://messicup.com/media/mc26-wordmark.svg` with a visible offline fallback.

## Run locally

Either open `index.html` in a browser, or (recommended) run a local static server:

```bash
python3 -m http.server 8080
```

Visit `http://localhost:8080`.

### Interactive demo credentials

| Role | Email | Password |
|---|---|---|
| Admin | admin@demo.seebot.ai | Demo1234! |
| Sponsor / all-in-one analyst | analyst@demo.seebot.ai | Demo1234! |
| Events / camera analyst | events@demo.seebot.ai | Demo1234! |

Use the demo-account buttons on the login screen to autofill. `Restore demo accounts` clears demo data and restores defaults when previous local changes cause login problems.

## Publish the **demo** with GitHub Pages

1. Create a separate repository for this project, e.g. `messi-cup-sponsor-studio`.
2. Add this repository's files and push to `main`.
3. Go to **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. The included `.github/workflows/deploy-pages.yml` publishes `index.html` on every push to `main`.
5. View the live URL in **Settings → Pages** or the deployment summary of the Actions workflow.

If the GitHub Pages site or repository is public, its JavaScript, demo accounts, and demo data are public too. **Do not load client footage or confidential sponsor data into this prototype.**

## Important production limitations

This is **not** a production-ready multiuser service. It uses browser-local storage, not a shared server database. Sign-in, sign-out, password reset, and role checks are **demo-only UI flows**, not secure backend-enforced authentication. Different browsers do not share assignments or annotations. FTP/SFTP sources are metadata only; the browser cannot ingest them directly. Logo uploads are stored in browser storage and can exceed browser storage limits. Local video attachments are not uploaded or shared.

For real analysts, production deployment requires:

1. A real authentication provider (e.g. Supabase Auth, AWS Cognito), verified email reset/invite flows, and backend-enforced role-based authorization.
2. Durable PostgreSQL storage for tasks, sponsor groups, assignments, timestamp intervals, editing history, and completion state.
3. Secure, resumable API writes and realtime updates, with analyst ownership per track and revision conflict protection.
4. Video storage and private signed URLs; an FTP/SFTP ingest worker to transfer to playable HTTPS media (and transcode if needed).
5. Versioned JSON exports, audit logs, supervisor review and correction workflows.
6. Auth/session, export, and concurrency tests before exposing to a client.

GitHub Pages hosts static frontend files only. It cannot by itself run the authentication and annotation backend. For production, connect this frontend to backend services or deploy the full stack to AWS.


## Visual and demo updates (October 29, 2026)

- Fully dark styling follows the Messi Cup Stats Hub design language: black canvas, heavy condensed headings, mono metadata, thin rules.
- Uses the supplied official `assets/mc26-wordmark.svg` locally; never relies on a third-party logo host for the tournament wordmark.
- Gradient is exclusively used for match overview scorecards, not login or dashboard.
- Demo sign-in form is centrally laid out and uses explicit JavaScript submit listeners, without Google sign-in.
- Sample match tasks use real published Messi Cup 2026 fixtures rather than fabricated pairs, plus a fixture selection control when creating admin tasks. The original bundled fixtures serve as an offline fallback. The page now loads `data/fixtures.json` generated from the public BuildUp read-only match feed. References: https://stats.buildup.club/matches and https://messicup.com/en/schedule.
- Club crests: verified external URLs are displayed where available with initials fallback on failure; replace with approved, locally hosted team logos for production.
- Existing local demo credentials remain admin@demo.seebot.ai, analyst@demo.seebot.ai, and events@demo.seebot.ai; password Demo1234!. Changes remain local to each browser, not shared between people.

**Production blockers:** secure login with a backend, role-enforced API authorization, real password reset by email, fixture feed/API agreement, official club logo assets, shared task/annotation database, storage/FTP ingest. GitHub Pages is static hosting only.

- The River Plate and AFC Ajax club marks load from Wikimedia Commons external URLs. Other badges use remote references when available; all have initial-based fallbacks. For production, host authorized approved club badge assets locally.
## Automatically refreshed BuildUp match catalog

The public data refresh is handled by `.github/workflows/sync-fixtures.yml`:
- Every 15 minutes during October 25–31 and November 1, 2026 (UTC scheduled cadence; runs may be delayed by GitHub).
- Once per day outside the tournament, so changes to published schedules remain discoverable.
- Manual run is available via **Actions → Refresh BuildUp Messi Cup fixtures → Run workflow**.

`scripts/sync_fixtures.py` retrieves public read-only Match and Team entity records from `stats.buildup.club`, then normalizes fixture code, date, scheduled kickoff (ET), team names, logos, venue, status, score, stage and group into `data/fixtures.json`. It refuses to overwrite the known-good snapshot on bad or incomplete responses, and only commits actual changes. GitHub Pages automatically redeploys on that commit. The web page checks for updated fixture JSON every 5 minutes while open, and falls back to the bundled schedule if the file cannot be loaded.

Under **Matches**, administrators can filter the official match catalog by date and prefill a new annotation task. Importing a fixture does not automatically assign analysts or create a task; the administrator still controls that decision.

The supplier has not published an integration SLA for this endpoint. Monitor the sync workflow during the event and seek permission for long-term usage.

## Sponsor logos and full-screen annotation

In the **Sponsor library**, open a sponsor or click **UPLOAD / EDIT** to upload its brand image. Click **DELETE** to remove an unused sponsor; sponsors with historical annotations cannot be deleted from this demo, to protect prior records. Once an image is saved, the analyst sees it on the sponsor card whenever the task includes that sponsor list.

The annotation workspace fills the browser width, places the video above large sponsor cards and the unified timeline, and leaves only an **Insights** navigation button for analytics. Upload footage, export JSON and mark completion remain accessible in the workspace header.

**Demo constraint:** sponsor logo uploads, task assignments and annotations still reside in browser-local storage; different workers on different browsers do **not** see each other's changes until a real shared backend is implemented. The public GitHub Pages demo must not be used for client-confidential videos or live worker authentication.
