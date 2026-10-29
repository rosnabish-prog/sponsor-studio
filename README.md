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

### Fonts

Fonts are self-hosted in `assets/fonts/` as WOFF2 subsets, with declarations in `assets/fonts.css`.
The page preloads Manrope (interface text) and IBM Plex Mono (metadata); Barlow Condensed
and DM Sans remain bundled for older components. No Google Fonts network requests are
required at runtime. Each family’s Open Font License is included alongside the files.

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

## Analyst workspace – intervals and shortcuts

The tagging workspace has a naturally scrolling (non-sticky) video player, a compact logo-only sponsor rail on the right, and small event/camera chips beneath the player. Sponsor images are shown on dark rectangular cards without white CSS background fills. The rail is a flat list without category headings; hover or focus reveals the brand name through accessible labels/tooltips. Uploaded images with white pixels baked into the asset will still show those pixels; use transparent PNG/SVG assets when possible.

- Sponsor visibility: tap a brand to start, tap again when it is no longer present anywhere in the frame. Multiple identical placements count as one active sponsor.
- Key events: **all newly tagged events are start/end intervals**, including goals, substitutions, replays and celebrations. First tap starts, second tap ends. New event attributes are always intervals. Older historical point annotations are preserved, not assigned invented durations.
- Camera angles: first tap starts an angle; tap the same angle to end it; selecting a different angle closes the previous one and starts the new one at the current timestamp. A camera angle may be left open and closed at submission time.
- Player seeking: choose a **5-second or 10-second** step. The backward/forward buttons and arrow keys follow the selected step. Space toggles play/pause when not typing.
- JSON and reports include event/camera start, end, duration and sponsor overlaps.

Note: this is still a browser-local functional demo. It does not synchronize user edits, videos or uploaded brand images between independent browsers.


## October 29 workspace refinements

- The match title has a right-aligned **Actions** dropdown replacing the multi-button toolbar. Footage, JSON export, submission, admin sponsor editing, task editing, and returning to tasks are there.
- The player **is not sticky**. Both the video and associated controls scroll normally with the page.
- Sponsor cards are small horizontal rectangles with the logo as the only visible label, plus a red or green indicator. The sidebar does not display Main/Sideline group headings or instructional blocks.
- If an already active **sponsor, key event, or camera** is tapped again at the same video timestamp (within **0.2 seconds**), its open annotation is removed and the operator receives a toast near the bottom of the screen. Clicking a *different* camera at the current camera's starting timestamp replaces the camera rather than creating a zero-length angle.
- A genuinely later click ends the open interval. Seeks to timestamps earlier than a tag's start cannot close that tag. Existing closed records are not automatically erased.

## Admin users, assignments, and status flow

**Admin → Team → Add Analyst** creates a demonstration analyst in that browser's local database. The demo requires a name, valid email address, and a password of at least eight characters. **Admin → Matches → New Task** lets an administrator select a fixture or create a custom match, choose sponsor/event/camera presets, and assign a sponsor analyst plus an event/camera analyst. Both assignments may point to the same user. The task can later be edited in its Actions menu.

Task status is automatically derived, not manually changed:

- **Ready**: no sponsor, event or camera annotations, and neither stream submitted (assignment alone does not start it).
- **In Progress**: at least one recorded tag or at least one submitted stream, while both streams are not yet submitted.
- **Completed**: both sponsor and context annotation streams have been submitted.

The demo has no real shared user directory or backend. Users, assignments, uploaded logos and annotations cannot be shared between separate devices through GitHub Pages. Production needs backend authentication, role enforcement and shared storage.

## Insights calculations (October 2026)

Per match, Insights now includes sponsor visibility coverage, combined exposure, a five-minute presence timeline, brand ranking by time and share of combined brand-seconds, appearance counts, longest exposure, overlapping events, camera-angle association, and simultaneously visible sponsor pairs. A collapsible tournament-level comparison appears when at least two matches have recorded sponsor work. JSON exports also contain the advanced derived analytics.

**Interpretation:** these are annotation-based presence metrics, not audience impressions, ad value, logo prominence, or guaranteed absence of sponsorship in unannotated portions. Incomplete matches are marked preliminary; no-sponsor-tagged sections must not be treated as proof of no visible advertisements. Gradients remain restricted to match hero cards.

## In-app confirmation dialogs

Deleting an attribute, sponsor, or recorded annotation, resetting demo data, submitting work, and reopening annotation streams use native **in-platform confirmation overlays** rather than browser `confirm()` popups. Cancel leaves the original data unchanged.

## Prioritized Messi Cup sponsor intelligence metrics

This release focuses on eight measures chosen for low-effort but commercially useful manual match review:

| Metric | Definition and data source |
| --- | --- |
| **Sponsor visibility duration** | Unique visible seconds per sponsor, merged across intervals to avoid double counting identical placements. |
| **Exposure frequency** | Number of separate positive-duration exposure intervals for each brand. |
| **Average exposure duration** | Total unique visible seconds divided by appearances; distinguishes sustained exposures from flashes. |
| **Share of visibility** | The sponsor's unique visible seconds divided by combined visible seconds of all brands. This is not the same as percentage of video. |
| **Sponsorship placement type** | One **optional** dropdown on each sponsor annotation in Recorded Actions: LED/digital, static pitchside, jersey/kit, backdrop/interview, stadium signage, broadcast graphic, other. Insights summarizes time by placement. |
| **Visibility quality** | One **optional** selection per annotation: clear/readable, partially readable, obscured/not readable. Insights shows duration by quality. |
| **Exposure by match period** | Requires explicit first-half end and second-half start video-minute mapping in Admin → Edit Task. Unmapped video cannot be assigned to a half; halftime is shown separately in derived data. |
| **High-value moment exposure** | Sponsor intersection with goal, celebration, penalty, trophy or award event intervals (based on event names), or custom event attributes explicitly marked high-value. |

### Methodology and limitations

- Sponsor presence is counted once per distinct brand even if multiple advertisements of that brand appear simultaneously.
- Placement describes the **primary observed placement** for a given presence interval. This model does **not** count simultaneous same-brand placements independently, and a placement change during an interval should prompt the analyst to split it.
- Visibility quality is a per-interval manual judgment, not a calculated clarity score. If clarity changes during an interval, split the tag.
- Old sponsor annotations with no placement or quality selections remain unclassified. No fake category is assigned.
- The report distinguishes percent of video with a brand from share of combined brand-visible seconds. Simultaneous different brands make the sum of brand seconds greater than footage duration.
- Half mappings are relative to the actual **video timestamps**, not football game clock: examples 30/30 for a 60-minute video without halftime, or 30/60 for a 90-minute footage containing a 30-minute halftime interval. The mapping assumes the video begins at first-half kickoff and ends with second-half play; trim or annotate other footage separately.
- High-value event exposure is based on interval intersections and is **not** a claim of viewership, audience impressions, sponsor ROI, or ad valuation.
- All user accounts, photos, and annotations remain browser-local in this GitHub Pages demo, without shared cloud persistence.

## October 29 reference-inspired orange workspace redesign

The full frontend now shares a single responsive **dark-charcoal and warm-orange** design system in `assets/workspace-theme.css`: 20px-style rounded cards, pill navigation and filters, soft elevated buttons, branded orange call-to-action surfaces, and subtle interaction feedback. The supplied **Seebot logo** now appears as a compact `POWERED BY` lockup immediately beside the Messi Cup logo on the login, admin, and annotation headers (rather than the far right).

The Admin overview has an orange tournament fixture ribbon that opens **Matches**; that page contains the existing searchable/filtered assigned tasks as responsive match cards, followed by the official fixture catalog for task creation. The dashboard retains a production-queue table for operational scanning, avoiding duplicate full catalogs.

The same styling is applied to video controls, sponsor logo sidebar, timeline, event chips, admin/team setup, sponsor and attribute libraries, forms, confirmations, and detailed Insights analytics. All existing annotation rules and local JSON exports remain in place. Brand tags still indicate active intervals through an orange selected border, **without a separate visibility-status dot**. The video remains non-sticky.

This is a visual redesign of the existing browser-local demonstration, **not** deployment of secure multi-device user storage or shared annotation synchronization. Refresh cached styles after deployment if the old square-edged layout persists.

## Local video attachment and uncropped playback

In the public GitHub Pages demonstration, **Open Local Video** opens a file picker for this specific browser session. The chosen video is passed to the browser using `URL.createObjectURL(File)` — **no file bytes are uploaded to a server or shared with another analyst**, and the browser's temporary object URL does not survive a page reload. We retain only the original filename and size as local task metadata so the UI can prompt the analyst to reconnect after reloading; selecting the same file again is supported.

The annotation studio shows explicit **LOCAL VIDEO · NOT UPLOADED** source status, filename, detected resolution and actual duration after browser metadata loads, a reconnect prompt for stale local files, and an actionable video-decoding error when the file is not playable. H.264 MP4 or WebM are the safest formats for broad browser compatibility; some MOV/MKV files use codecs the browser cannot decode. Videos are streamed from the selected file by the browser; large local files are not copied into localStorage.

The video player now has native playback controls and intrinsic/proportional sizing, bounded by available viewport height, with `object-fit: contain` and letterboxing rather than clipping. The placeholder still uses a 16:9 presentation, but a video with any supported aspect ratio is fit in full. The independent studio and sponsor scrolling model remains unchanged.

**A true persistent shared video upload is not implemented.** Production requires authenticated object storage (for example, private AWS S3 with multipart uploads and short-lived signed permissions), shared task records and access controls. Merely choosing a local file or storing its name in the demo does not establish cloud storage.
