#!/bin/sh
# Restore a full dump to a NEW, isolated database for verification/selective recovery.
# This script NEVER overwrites an existing database or production.
set -eu
: "${PGHOST:?Set PGHOST}"
: "${PGUSER:?Set PGUSER}"
: "${PGDATABASE:?Set current production PGDATABASE}"
: "${BACKUP_FILE:?Set BACKUP_FILE to a .dump file}"
: "${RESTORE_DATABASE:?Set RESTORE_DATABASE to a new disposable database name}"

case "$RESTORE_DATABASE" in
  *[!a-zA-Z0-9_]*|'') echo 'RESTORE_DATABASE must contain only letters, numbers and underscores' >&2; exit 1;;
esac
[ "$RESTORE_DATABASE" != "$PGDATABASE" ] || { echo 'Refusing to restore over the active database' >&2; exit 1; }
case "$RESTORE_DATABASE" in postgres|template0|template1|sponsor_studio) echo 'Refusing to overwrite a production/system database' >&2; exit 1;; esac
[ -f "$BACKUP_FILE" ] || { echo 'Backup file not found' >&2; exit 1; }

pg_restore --list "$BACKUP_FILE" >/dev/null
present="$(psql --dbname=postgres --no-psqlrc --tuples-only --no-align \
  --command="SELECT 1 FROM pg_database WHERE datname = '$RESTORE_DATABASE'" )"
[ -z "$present" ] || { echo 'Database already exists. Refusing to overwrite.' >&2; exit 1; }
createdb --maintenance-db=postgres "$RESTORE_DATABASE"
pg_restore --exit-on-error --no-owner --no-acl --dbname="$RESTORE_DATABASE" "$BACKUP_FILE"
psql --dbname="$RESTORE_DATABASE" --no-psqlrc --command='SELECT COUNT(*) AS annotation_count FROM "Annotation"'
psql --dbname="$RESTORE_DATABASE" --no-psqlrc --command='SELECT COUNT(*) AS revision_count FROM "AnnotationRevision"'
echo "Archive restored to isolated database $RESTORE_DATABASE. Original database is unchanged."
