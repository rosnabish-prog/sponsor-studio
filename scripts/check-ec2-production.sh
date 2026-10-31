#!/usr/bin/env bash
# Read-only production deployment readiness check. Does not pull, build, migrate or restart.
set -Eeuo pipefail

app_dir="/home/ec2-user/sponsor-studio"
expected_project="sponsor-studio"
expected_origin="https://sponsor-studio.seebot.ai/api/health"

check() { printf '[ec2-preflight] %s\n' "$*"; }
fail() { printf '[ec2-preflight] FAILED: %s\n' "$*" >&2; exit 1; }

for program in git docker python3 curl flock; do
  command -v "$program" >/dev/null 2>&1 || fail "Missing command: $program"
done
[[ -d "$app_dir/.git" ]] || fail "Repository missing: $app_dir"
cd "$app_dir"

[[ "$(git branch --show-current)" == development ]] || fail 'Existing checkout is not on development.'
[[ -z "$(git status --porcelain --untracked-files=normal)" ]] || fail 'Repository has local modifications/untracked files; the deployment script will stop.'
[[ -f .env ]] || fail 'Production .env is missing.'
[[ -f Caddyfile ]] || fail 'Production Caddyfile is missing.'
grep -Eq '^[[:space:]]*COMPOSE_PROJECT_NAME[[:space:]]*=[[:space:]]*sponsor-studio[[:space:]]*$' .env || fail 'Set COMPOSE_PROJECT_NAME=sponsor-studio in .env (after verifying it is the existing project).'
grep -Fq 'sponsor-studio.seebot.ai' Caddyfile || fail 'Caddyfile does not mention the expected production hostname.'

compose=(docker compose -f compose.yaml -f compose.prod.yaml)
"${compose[@]}" config --quiet || fail 'Production Compose configuration invalid. Check required variables privately.'
actual_project="$("${compose[@]}" config --format json | python3 -c 'import json,sys; print(json.load(sys.stdin)["name"])')"
[[ "$actual_project" == "$expected_project" ]] || fail "Compose project resolves to $actual_project instead of $expected_project."

pg_container="$("${compose[@]}" ps -q postgres)"
[[ -n "$pg_container" ]] || fail 'No existing postgres container found for this project.'
[[ "$(docker inspect -f '{{.State.Running}}' "$pg_container")" == true ]] || fail 'The existing postgres container is not running.'

check "Git SHA: $(git rev-parse HEAD)"
check "Unix account: $(id -un)"
check "Compose project: $actual_project"
check "Existing PostgreSQL container: $pg_container"
check "Docker Compose and Caddyfile configuration: valid"

curl --fail --silent --show-error --max-time 15 "$expected_origin" >/dev/null || fail "Public health endpoint unavailable: $expected_origin"
check 'Public HTTPS health endpoint: OK'
check 'PASS: host prerequisites are present. This does not prove AWS IAM/SSM or backup restore readiness.'
