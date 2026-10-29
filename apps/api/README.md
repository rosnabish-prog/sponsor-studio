# Sponsor Studio API — P0 foundation

This is a separate NestJS API. The existing React frontend still runs in **demo mode** against browser storage; it is **not** integrated with this API yet. Do not put the demo frontend online as if its authentication were production security.

## Local development

Use Node.js 22 or later and Docker Compose.

1. `npm ci` from the repository root.
2. `docker compose up -d postgres` from the repository root.
3. Copy `apps/api/.env.example` to `apps/api/.env` and change the credentials outside local development.
4. `npm run db:generate` and `npm run db:migrate` from the root.
5. `npm run dev:api` starts NestJS at `http://localhost:3001/api`.
6. `npm run dev` starts the existing Vite frontend at `http://localhost:5173`.

No real AWS resources or credentials are needed for the API foundation. The database must be reachable to serve requests.

The API validates DTOs, hashes passwords with Argon2id, uses random opaque HTTP-only session cookies (SHA-256 digests in PostgreSQL), applies request rate limits, and checks workspace membership. Cross-origin requests are allowed only from `APP_ORIGIN`. Sessions expire after seven days; logout revokes the current token. Do not use the local example password in production.

## Implemented routes

Routes below are prefixed with `/api`. Most require a valid session cookie.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Database-aware health check |
| POST | `/auth/register` | Create an account (name, email, password) |
| POST | `/auth/login` | Start session (email, password) |
| GET | `/auth/me` | Current signed-in user |
| POST | `/auth/logout` | Revoke session |
| GET / POST | `/workspaces` | List memberships / create workspace (owner role) |
| POST | `/workspaces/:workspaceId/members` | Owner/admin adds an **already registered** user by email |
| GET / POST | `/workspaces/:workspaceId/tasks` | Assigned task list / admin creates task |
| GET / PATCH | `/workspaces/:workspaceId/tasks/:taskId` | View task / admin updates task |
| POST | `/workspaces/:workspaceId/tasks/:taskId/submit` | Submit `{"stream":"sponsors"}` or `{"stream":"context"}` |
| POST | `/workspaces/:workspaceId/tasks/:taskId/reopen` | Admin reopens one stream |
| GET / POST | `/workspaces/:workspaceId/tasks/:taskId/annotations` | Read/create sponsor, event, camera annotations |
| PATCH / DELETE | `/workspaces/:workspaceId/tasks/:taskId/annotations/:annotationId` | Update/end or remove annotation |

For annotation creation, send `{"kind":"SPONSOR","labelId":"s_adidas","start":12.5}`. A subsequent `PATCH` with `{"end":17.8}` closes it. `EVENT` and `CAMERA` are also supported. The writer must be an assigned analyst or workspace admin; submitted streams are immutable until an admin reopens them. All task and annotation lookups are scoped to the workspace.

## Still P0 work, not yet done

- Connect React login, workspaces, tasks, annotations and report reads to this API; remove the **demo/localStorage** auth and data layer.
- Implement video ingestion (large multipart S3 uploads) and private CloudFront playback URLs; create AWS IAM, S3, CloudFront, and deployment infrastructure.
- Migrate sponsor/event/camera group definitions, classifications, logos and analytics into persisted per-workspace models.
- Add end-to-end tests against a real PostgreSQL instance, concurrency tests for simultaneous annotations, and production observability/backups.
- Add password reset/email verification and organization invitation flows before external rollout.
- Next.js and Tailwind migration is **not part of this P0 backend increment**; retaining existing React/Vite/CSS protects the current UI.

The included SQL migration is generated from Prisma schema. `prisma migrate dev` applies it to a local database; production environments should run `prisma migrate deploy` in a controlled deployment process.
