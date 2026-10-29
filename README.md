# Sponsor Studio

Sponsor Studio is a React and TypeScript application for managing football broadcast annotation, sponsor visibility and match insights. It uses the NestJS API for authentication, shared workspaces, assignments, catalogs and annotations.

## Local development

### Docker

Run `docker compose up -d --build`, then open http://127.0.0.1:8080. Compose starts PostgreSQL, applies migrations, and starts the API and web server. On a new empty database, initialize the first administrator once with:

```sh
docker compose exec -T -e BOOTSTRAP_ADMIN_EMAIL=admin@example.com api node apps/api/bootstrap-admin.cjs
```

The command prints a temporary password once and refuses to modify a database that already contains users. Sign in and change the password, then create a workspace. Stop the services with `docker compose down`; the database volume persists.

### Running outside Docker

1. Install Node.js 22 or later and Docker, then run `npm ci`.
2. Start PostgreSQL with `docker compose up -d postgres`.
3. Copy `apps/api/.env.example` to `apps/api/.env` and configure the API. Copy `.env.example` to `.env` if a custom frontend API URL is needed.
4. Run `npm run db:generate` and `npm run db:migrate`.
5. Start the API with `npm run dev:api` and the frontend with `npm run dev`.

The development server proxies `/api` to the API. For deployment, route `/api` to the API server or set `VITE_API_BASE_URL` when building the frontend. See [the API documentation](apps/api/README.md) for deployment, database and private video storage configuration.

## Getting started

Sign in with an existing administrator account. The workspace owner can create sponsor and attribute lists, add analysts, create matches and assign annotation streams. New analysts receive a temporary password displayed to the administrator once; they must change it at their first sign-in. Administrators can reset analyst passwords from the Team screen.

Video uploads require the private S3 and CloudFront configuration described in the API documentation. Direct HTTPS video sources can also be configured on a match.

Run `npm run build` to typecheck and build the frontend, and `npm run test:api` for the API tests.
