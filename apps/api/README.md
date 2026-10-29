# Sponsor Studio API — P0 foundation

This is a separate NestJS API. The existing React app has **two distinct modes**: the unchanged GitHub Pages demonstration uses browser-local data, while `VITE_BACKEND_ENABLED=true` enables real sessions, workspaces, tasks, annotations and private video playback. Never deploy the demo mode as a production service.

## Local development

Use Node.js 22 or later and Docker Compose.

1. `npm ci` from the repository root.
2. `docker compose up -d postgres` from the repository root.
3. Copy `apps/api/.env.example` to `apps/api/.env` and the root `.env.example` to root `.env`. Change the credentials outside local development.
4. `npm run db:generate` and `npm run db:migrate` from the root.
5. `npm run dev:api` starts NestJS at `http://localhost:3001/api`.
6. `npm run dev` starts Vite at `http://127.0.0.1:5173` with `/api` proxied to NestJS. The UI uses the API only when the root `.env` enables it.

No real AWS credentials are needed for login/task development; video endpoints return HTTP 503 until storage and CloudFront are configured. The database must be reachable to serve requests.

The API validates DTOs, hashes passwords with Argon2id, uses random opaque HTTP-only session cookies (SHA-256 digests in PostgreSQL), applies request rate limits, and checks workspace membership. Cross-origin requests are allowed only from `APP_ORIGIN`. Sessions expire after seven days; logout revokes the current token. Do not use the local example password in production. Password recovery sends a one-use, hashed, 30-minute reset token through Amazon SES and revokes every previous session when the password changes. It returns the same acknowledgment for known and unknown email addresses.

## Implemented routes

Routes below are prefixed with `/api`. Most require a valid session cookie.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Database-aware health check |
| POST | `/auth/register` | Create an account (name, email, password) |
| POST | `/auth/login` | Start session (email, password) |
| GET | `/auth/me` | Current signed-in user |
| POST | `/auth/logout` | Revoke session |
| POST | `/auth/password-reset/request` | Request a 30-minute email recovery link; SES sender required |
| POST | `/auth/password-reset/confirm` | Change password using a one-time token; revoke all existing sessions |
| GET / POST | `/workspaces` | List memberships / create workspace (owner role) |
| POST | `/workspaces/:workspaceId/members` | Owner/admin adds an **already registered** user by email |
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

For annotation creation, send `{"kind":"SPONSOR","labelId":"s_adidas","start":12.5}`. A subsequent `PATCH` with `{"end":17.8}` closes it. `EVENT` and `CAMERA` are also supported. The writer must be an assigned analyst or workspace admin; submitted streams are immutable until an admin reopens them. All task and annotation lookups are scoped to the workspace.

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

## Password recovery and scheduled cleanup

Verify a sending identity/domain in AWS SES, allow the API task role to send through SES, and set `PASSWORD_RESET_SENDER` to the verified sender and `AWS_REGION` to the same SES region. Use a real HTTPS `APP_ORIGIN` in production. The server never returns the reset token in an API response or writes it to its logs. When SES is unconfigured, requesting recovery returns HTTP 503; the local demo password-change option is separate.

Expired/revoked sessions and used/expired recovery tokens are pruned with `npm run maintenance:sessions --workspace @sponsor-studio/api` after compilation. Schedule `node apps/api/dist/maintenance.js` once a day as a separate ECS task (the `migrations` Docker build target includes the compiled job and dependencies). The cleanup command does not remove customer task or annotation data.

## Still P0 work, not yet done

- Provision AWS IAM, S3, CloudFront and production deployment infrastructure; the application-level multipart and signed-playback API is implemented but not verified against real AWS resources.
- Add query pagination for large worker queues, production observability, and database backups. Per-task annotation writes are serialized by database row locks, and an expired-session cleanup job is now available but must be scheduled in AWS.
- Move logos out of the workspace JSON catalog into durable asset storage, and implement server-side analytics aggregation if reports become large.
- Verify AWS SES delivery and sender/domain settings before enabling password reset; implement email verification and organization invitation flows before external rollout.
- The end-to-end Playwright UI/API integration passes on the feature branch; production AWS media access, load tests, and deployment smoke tests remain unverified.
- Next.js and Tailwind migration is **not part of this P0 backend increment**; retaining existing React/Vite/CSS protects the current UI.

The included SQL migration is generated from Prisma schema. `prisma migrate dev` applies it to a local database; production environments should run `prisma migrate deploy` in a controlled deployment process.
