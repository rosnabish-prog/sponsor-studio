#!/bin/sh
# Daily production backup with hourly retry after failure.
set -eu
while :; do
  if /bin/sh /scripts/backup-postgres.sh; then
    sleep "${BACKUP_INTERVAL_SECONDS:-86400}"
  else
    echo 'Database backup failed; retrying in one hour' >&2
    sleep 3600
  fi
done
