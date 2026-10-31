#!/bin/sh
# Consistent PostgreSQL archive. Safe to run manually or from the production backup container.
set -eu
umask 077

: "${PGHOST:?Set PGHOST}"
: "${PGUSER:?Set PGUSER}"
: "${PGDATABASE:?Set PGDATABASE}"
: "${PGPASSWORD:?Set PGPASSWORD or configure a pgpass file}"

backup_dir="${BACKUP_DIR:-/backups}"
retention="${BACKUP_RETENTION_DAYS:-30}"
case "$backup_dir" in ''|/|/tmp|/var|/home|/root|.|..) echo 'Unsafe BACKUP_DIR' >&2; exit 1;; esac
case "$retention" in ''|*[!0-9]*) echo 'BACKUP_RETENTION_DAYS must be a number' >&2; exit 1;; esac
[ "$retention" -ge 7 ] || { echo 'Minimum backup retention is seven days' >&2; exit 1; }

mkdir -p "$backup_dir"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
destination="$backup_dir/sponsor_studio_${stamp}_$$.dump"
temporary="$destination.partial"
trap 'rm -f "$temporary"' EXIT HUP INT TERM

pg_dump --format=custom --no-owner --no-acl --file="$temporary"
# This verifies the archive catalog; a separate isolated full restore is still required.
pg_restore --list "$temporary" >/dev/null
mv "$temporary" "$destination"
echo "Verified backup archive: $destination"
find "$backup_dir" -maxdepth 1 -type f -name 'sponsor_studio_*.dump' -mtime "+$retention" -delete
