#!/usr/bin/env bash
# Invoked by the scoped SponsorStudioDeploy SSM document as the sponsor-deploy user.
# Never deletes Docker volumes, replaces database data, or silently changes Compose projects.
set -Eeuo pipefail
umask 077

log() { printf '[sponsor-studio-deploy] %s\n' "$*"; }
fail() { printf '[sponsor-studio-deploy] ERROR: %s\n' "$*" >&2; exit 1; }
trap 'code=$?; printf "[sponsor-studio-deploy] Failed (exit %s). Existing database volumes and backup archives were not deleted. Investigate before retrying.\n" "$code" >&2' ERR

if [[ $# -ne 1 || ! "$1" =~ ^[0-9a-f]{40}$ ]]; then
  fail 'Expected exactly one full 40-character Git commit SHA.'
fi
target_sha="$1"
app_dir="${SPONSOR_STUDIO_DIR:-/opt/sponsor-studio}"
health_url="${SPONSOR_STUDIO_HEALTH_URL:-https://sponsor-studio.seebot.ai/api/health}"

[[ "$(id -u)" -ne 0 ]] || fail 'Run as the dedicated sponsor-deploy user, not root.'
for program in git docker curl python3 flock; do
  command -v "$program" >/dev/null 2>&1 || fail "Missing required command: $program"
done
[[ -d "$app_dir/.git" ]] || fail "No Git checkout at $app_dir"
cd "$app_dir"
exec 9> "$app_dir/.deploy.lock"
flock -n 9 || fail 'Another deployment is already running on this EC2 host.'
[[ "$(git branch --show-current)" == development ]] || fail 'The EC2 checkout must be on development.'
[[ -z "$(git status --porcelain --untracked-files=normal)" ]] || fail 'EC2 checkout contains local changes. Resolve them manually before deployment.'
[[ -f .env ]] || fail 'Missing server-owned .env file.'
[[ -f Caddyfile ]] || fail 'Missing server-owned Caddyfile for production HTTPS.'
grep -Eq '^[[:space:]]*COMPOSE_PROJECT_NAME[[:space:]]*=[[:space:]]*[^[:space:]#]+' .env || fail 'Pin the existing COMPOSE_PROJECT_NAME in .env to prevent using a new database volume.'

case "$(git remote get-url origin)" in
  https://github.com/rosnabish-prog/sponsor-studio|https://github.com/rosnabish-prog/sponsor-studio.git|git@github.com:rosnabish-prog/sponsor-studio.git|ssh://git@github.com/rosnabish-prog/sponsor-studio.git) ;;
  *) fail 'Unexpected origin remote; refusing to deploy from an unverified repository.' ;;
esac

compose=(docker compose -f compose.yaml -f compose.prod.yaml)
"${compose[@]}" version >/dev/null
"${compose[@]}" config --quiet || fail 'Invalid production Compose configuration (check DB_PASSWORD and other environment variables).'
project_name="$("${compose[@]}" config --format json | python3 -c 'import json,sys; print(json.load(sys.stdin)["name"])')"
log "Using existing Docker Compose project: $project_name"
postgres_container="$("${compose[@]}" ps -q postgres)"
[[ -n "$postgres_container" ]] || fail 'No existing PostgreSQL container in this Compose project. Refusing to start a new/empty database.'
[[ "$(docker inspect -f '{{.State.Running}}' "$postgres_container")" == true ]] || fail 'Existing PostgreSQL container is not running.'

previous_sha="$(git rev-parse HEAD)"
log "Current revision: $previous_sha; requested revision: $target_sha"
git fetch --no-tags origin development
git cat-file -e "${target_sha}^{commit}" || fail 'Requested commit is unavailable after fetching development.'
git merge-base --is-ancestor "$target_sha" origin/development || fail 'Requested commit is not on the current origin/development branch.'
git merge-base --is-ancestor "$previous_sha" "$target_sha" || fail 'Deployment would rewind/diverge from the currently deployed code.'
git merge --ff-only "$target_sha"

"${compose[@]}" config --quiet || fail 'Updated Compose configuration is invalid.'
log 'Building application and migration images before changing running containers.'
"${compose[@]}" build web api migrations

log 'Taking and verifying a full PostgreSQL backup before migration/restart.'
"${compose[@]}" run --rm --no-deps --entrypoint /bin/sh backups /scripts/backup-postgres.sh

log 'Starting the updated stack (Prisma migrations must finish before the API).'
"${compose[@]}" up -d --no-build --wait --wait-timeout 240

log 'Checking the API inside its container.'
"${compose[@]}" exec -T api node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
log "Checking public endpoint: $health_url"
curl --fail --silent --show-error --location --retry 6 --retry-delay 5 --retry-connrefused --max-time 12 "$health_url" >/dev/null

[[ "$(git rev-parse HEAD)" == "$target_sha" ]] || fail 'The checkout no longer matches the deployed commit.'
log "SUCCESS: $target_sha is deployed and healthy. Prior revision: $previous_sha"
