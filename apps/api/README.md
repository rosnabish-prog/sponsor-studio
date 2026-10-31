# Sponsor Studio API — P0 foundation

This NestJS API provides sessions, workspaces, tasks, annotations and private video playback for the React app.

## Local development

Use Node.js 22 or later and Docker Compose.

1. `npm ci` from the repository root.
2. `docker compose up -d postgres` from the repository root.
3. Copy `apps/api/.env.example` to `apps/api/.env` and the root `.env.example` to root `.env`. Change the credentials outside local development.
4. `npm run db:generate` and `npm run db:migrate` from the root.
5. `npm run dev:api` starts NestJS at `http://localhost:3001/api`.
6. `npm run dev` starts Vite at `http://127.0.0.1:5173` with `/api` proxied to NestJS.

No real AWS credentials are needed for login/task development; video endpoints return HTTP 503 until storage and CloudFront are configured. The database must be reachable to serve requests.

The API validates DTOs, hashes passwords with Argon2id, uses random opaque HTTP-only session cookies (SHA-256 digests in PostgreSQL), applies request rate limits, and checks workspace membership. Cross-origin requests are allowed only from `APP_ORIGIN`. Sessions expire after seven days; logout revokes the current token. Do not use the local example password in production. No email is sent. Administrators provision workers using an automatically generated temporary password shown exactly once, then share it through their own secure channel. Those workers must change their password at first login. Admin resets revoke the worker's existing sessions.

## Implemented routes

Routes below are prefixed with `/api`. Most require a valid session cookie.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Database-aware health check |
| GET | `/fixtures/catalog` | Read the shared, persisted public match catalog |
| POST | `/fixtures/sync` | Sync the 2026 BuildUp catalog, adding new matches and updating unfinished fixtures |
| POST | `/auth/login` | Start session (email, password) |
| GET | `/auth/me` | Current signed-in user |
| POST | `/auth/logout` | Revoke session |
| POST | `/auth/change-password` | Change authenticated account password; requires current password and revokes sessions |
| GET / POST | `/workspaces` | List memberships / create workspace (owner role) |
| POST | `/workspaces/:workspaceId/members` | Owner/admin adds an **already registered** user by email |
| POST | `/workspaces/:workspaceId/members/provision` | Admin creates a worker account or joins an existing one; returns one-time temporary credentials only for new accounts |
| POST | `/workspaces/:workspaceId/members/:memberId/reset-password` | Admin generates a new temporary password, revoking previous sessions |
| GET | `/workspaces/:workspaceId/members` | Workspace team list |
| GET / PUT | `/workspaces/:workspaceId/catalog` | Versioned sponsor/event/camera definitions |
| GET / POST | `/workspaces/:workspaceId/tasks` | Assigned task list / admin creates task |
| GET / PATCH | `/workspaces/:workspaceId/tasks/:taskId` | View task / admin updates task |
| POST | `/workspaces/:workspaceId/tasks/:taskId/submit` | Submit `{"stream":"sponsors"}` or `{"stream":"context"}` |
| POST | `/workspaces/:workspaceId/tasks/:taskId/reopen` | Admin reopens one stream |
| GET / POST | `/workspaces/:workspaceId/tasks/:taskId/annotations` | Read/create sponsor, event, camera annotations |
| PATCH / DELETE | `/workspaces/:workspaceId/tasks/:taskId/annotations/:annotationId` | Update/end or remove annotation |
| POST | `/workspaces/:workspaceId/tasks/:taskId/videos` | Start private multipart S3 video upload |
| POST | `/workspaces/:workspaceId/tasks/:taskId/videos/:assetId/parts` | Presign upload parts |
| POST | `/workspaces/:workspaceId/tasks/:taskId/videos/:assetId/complete` | Finalize multipart upload |
| POST | `/workspaces/:workspaceId/tasks/:taskId/videos/:assetId/abort` | Abort failed multipart upload |
| GET | `/workspaces/:workspaceId/tasks/:taskId/videos/:assetId/playback` | Short-lived private CloudFront URL |
| GET | `/workspaces/:workspaceId/tasks/:taskId/videos/buildup/stream` | Authorized BuildUp video stream with byte-range support |

For annotation creation, send `{"kind":"SPONSOR","labelId":"s_adidas","start":12.5}`. A subsequent `PATCH` with `{"end":17.8}` closes it. `EVENT` and `CAMERA` are also supported. The writer must be an assigned analyst or workspace admin; submitted streams are immutable until an admin reopens them. All task and annotation lookups are scoped to the workspace.

## Shared match catalog synchronization

The **Sync matches** button reads public 2026 tournament matches and club metadata from BuildUp. New fixture codes become available in the Match Catalog, and unfinished fixtures can receive updated scores, statuses, dates, and venues. Published final results (a final status and numeric score) are immutable. Sync writes only `FixtureSnapshot` rows; it cannot create, reassign, delete, or edit annotation tasks. The browser combines these saved records with the bundled fixture snapshot, so matches remain visible if BuildUp is temporarily unavailable.

Migration `20261031_000010_fixture_catalog` creates the `FixtureSnapshot` table. Run `npm run db:deploy` as part of the controlled database deployment **before** starting the updated API. Existing task and annotation tables are not modified. Synchronization is manual: no EC2 auto-deployment or background sync is installed by this feature.

## BuildUp match video

Set `BUILDUP_API_TOKEN` in the API environment (`apps/api/.env` for local development, or the root `.env` for Docker Compose) and restart the API. Keep this token server-side. In the match editor, select **BuildUp match video** and enter the numeric BuildUp match ID. Authorized users can then open the match in Annotation Studio. The API obtains and caches a temporary BuildUp CDN link, refreshes it before expiry or after a 403, and streams byte ranges to the browser without storing the file. The CDN URL is restricted to the expected BuildUp host and match path.

The deployment server must be permitted by BuildUp/CDN to request the video. Playback and seeking also require the CDN to honor range requests and the browser to support the video's codecs. Proxy bandwidth is consumed while viewing; the API does not transcode the video. For cross-origin API deployments, session cookies and credentialed CORS must be configured for the frontend origin.

## Private video prerequisites (AWS)

1. Create a **private** S3 bucket, block all public access, enable default encryption and a lifecycle rule that aborts incomplete multipart uploads after seven days.
2. Give the API runtime's IAM role only the required multipart permissions on the bucket and the `private/workspaces/*` object prefix. Do **not** provide AWS keys to Vite or any browser.
3. Configure the bucket CORS policy to allow `PUT` from the actual React app origin and expose the `ETag` response header. The browser needs that header to complete multipart uploads.
4. Set up CloudFront with an S3 Origin Access Control (OAC), deny public S3 origin reads, require a trusted CloudFront key group and provide its key-pair ID and private key to the API runtime through a secrets manager.
5. Set `S3_VIDEO_BUCKET`, `AWS_REGION`, `CLOUDFRONT_VIDEO_DOMAIN` (for example `https://media.example.com`), `CLOUDFRONT_KEY_PAIR_ID`, and `CLOUDFRONT_PRIVATE_KEY` in the **API** environment. Only the latter three allow private signed playback.

Uploaded files are kept private. The client uploads 16 MiB chunks with up to three concurrent requests, and the server signs the resulting CloudFront URL for up to three hours. Browser playback requires a supported codec (for example H.264/AAC MP4); transcoding and HLS packaging are not implemented yet.

### Example S3 CORS configuration

```json
[
  {
    "AllowedOrigins": ["https://your-studio.example.com"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

Use the actual deployed origin, not the example value. The video bucket and CloudFront distribution are **not provisioned** by this repository.

## Manual account provisioning and scheduled cleanup

Open **Team → Add analyst**, enter the name and email, and save. The API generates a strong temporary password for a new user and shows it once in the administrator's browser. The administrator must share it separately. Existing registered users retain their password when added to another workspace. Temporary credentials expire after seven days, and a worker cannot access tasks until they choose a new personal password. Use **Team → Reset password** to replace a lost or expired credential; this revokes existing sessions and again shows the new password once. Temporary passwords are Argon2id-hashed in PostgreSQL; they are not emailed or stored in the client. An existing administrator account is required to provision workers.

Expired/revoked sessions are pruned with `npm run maintenance:sessions --workspace @sponsor-studio/api` after compilation. Schedule `node apps/api/dist/maintenance.js` once a day as a separate ECS task (the `migrations` Docker build target includes the compiled job and dependencies). The cleanup command does not remove customer task or annotation data.

## Still P0 work, not yet done

- Provision AWS IAM, S3, CloudFront and production deployment infrastructure; the application-level multipart and signed-playback API is implemented but not verified against real AWS resources.
- Add query pagination for large worker queues, production observability, and database backups. Per-task annotation writes are serialized by database row locks, and an expired-session cleanup job is now available but must be scheduled in AWS.
- Move logos out of the workspace JSON catalog into durable asset storage, and implement server-side analytics aggregation if reports become large.
- Agree on a secure out-of-band method for administrators to share one-time credentials; the platform intentionally does not send emails or invitations.
- The end-to-end Playwright UI/API integration passes on the feature branch; production AWS media access, load tests, and deployment smoke tests remain unverified.
- Next.js and Tailwind migration is **not part of this P0 backend increment**; retaining existing React/Vite/CSS protects the current UI.

The SQL migrations include schema changes and the bundled web demo catalog. Migration `20261029_000007_demo_workspace_catalog` populates missing or empty workspace catalogs with two sponsor lists (eight sponsors), five match events, and seven camera angles. Existing non-empty catalogs are preserved. A database trigger initializes the same catalog for newly created workspaces. Existing empty catalogs receive a version increment so stale clients reload before saving.

`prisma migrate dev` applies migrations to a local database; production environments should run `prisma migrate deploy` in a controlled deployment process. From the repository root, use `npm run db:deploy` to apply pending migrations.
