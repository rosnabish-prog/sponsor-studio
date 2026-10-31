# Annotation retention, backups, and recovery

This app has two *separate* recovery mechanisms:

1. **Per-item revisions** — `AnnotationRevision` records every create, edit, soft-delete, and restore. The Studio's **Annotation history** panel can restore one selected annotation ID to an earlier revision without touching neighboring intervals, later camera angles, or other annotation streams. A deleted annotation is hidden (`deletedAt`) rather than physically removed. A task that has ever had annotations cannot be deleted through the ordinary API, protecting its revision history.
2. **Database archives (optional)** — when explicitly started, the production Docker Compose `backups` service takes a consistent `pg_dump` custom-format archive at startup, then every 24 hours. Archives live in a **separate named volume** (`sponsor_studio_backups`), are restricted to the container user (`umask 077`), are verified with `pg_restore --list`, and older archives are pruned after 30 days (never less than 7). Failure logs an error and retries after an hour.

## Deploy and verify

**Automatic EC2 deployment currently skips this service.** The operator chose
not to require backups for automatic releases. The Compose service remains
available for an explicitly initiated backup setup, but the EC2 deploy script
starts only `postgres`, `migrations`, `api`, `web`, and `caddy` and does not run
`pg_dump`. No new deployment backup should be assumed to exist.

To opt in to backups, start and verify the optional backup service using the production Compose files. The automatic EC2 deployment workflow does not enable this service.

```sh
docker compose -f compose.yaml -f compose.prod.yaml up -d backups
docker compose -f compose.yaml -f compose.prod.yaml logs --tail=100 backups
docker compose -f compose.yaml -f compose.prod.yaml exec backups ls -lh /backups
```

Verify a fresh `.dump` file appears with current UTC time. The `pg_restore --list` check detects a broken archive catalog; it **does not replace a full recovery drill**.

## Important: offsite copies

The Compose volume lives on the application host. It will **not** protect against host/volume loss, disk encryption compromise, ransomware, or accidental deletion of the Docker host. Configure a private, encrypted, versioned **offsite copy** of these archives (for example, S3 with restricted IAM, SSE-KMS, versioning/Object Lock and a separate retention policy). Use a host-level backup agent or encrypted transfer from the volume; do not expose backup files through the website. Monitor success/failure independently, and alert if a verified backup is older than 26 hours. If moving PostgreSQL to Amazon RDS, also enable automated backups/PITR and test restoring a snapshot to a different instance. None of these external services can be asserted as running from this repository alone.

## Selective restore of just one damaged camera/sponsor/event item

**For edits made after the migration:** Open task → **Recorded actions** → **HISTORY** for the affected item → select the earlier version → **RESTORE THIS VERSION**. The API checks the task, annotation ID, current revision, and stream permissions. A restore writes a new revision and changes exactly one annotation record. No bulk import is needed.

**For a pre-migration data loss / destroyed database:**

1. Copy a verified archive securely to a **separate database server**. Do not point the recovery script at production unless you explicitly accept the resource impact of creating a new database there.
2. On the recovery server, set `PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` (name of the live database, used for the safety check), `BACKUP_FILE`, and `RESTORE_DATABASE=sponsor_recovery_yyyymmdd`. Run `sh scripts/restore-isolated-postgres.sh`. It rejects an existing destination database and never drops or replaces one. Ensure there is enough free disk space for the full restore.
3. Query only the affected task and annotation rows in this *isolated* database:

   ```sql
   SELECT "id", "kind", "labelId", "start", "end", "revision", "deletedAt"
   FROM "Annotation"
   WHERE "taskId" = '49bcad2f-eb81-4da7-8440-1cc4baae282b'::uuid
     AND "kind" = 'CAMERA'
   ORDER BY "start";

   SELECT "annotationId", "version", "action", "snapshot", "createdAt"
   FROM "AnnotationRevision"
   WHERE "taskId" = '49bcad2f-eb81-4da7-8440-1cc4baae282b'::uuid
   ORDER BY "createdAt";
   ```

4. Compare the recovered rows with production by **annotation ID** and timestamp. Restore only missing/affected IDs using a separately reviewed, transactional migration. Preserve UUIDs, author information, and existing production revisions. Never run a wholesale `TRUNCATE`, `DELETE`, or `INSERT ... SELECT` against all annotations; do not replace an entire task's camera stream.
5. Verify the selected item and every other timeline are unchanged before publishing recovered work. Log the administrator, backup source, reason, and exact IDs restored.

The two examples above identify the previously reported M3 task; they are **read-only** queries. A backup can recover only data that existed when that backup was taken, so the older lost labels cannot be promised back without a suitable historical archive.

## Routine recovery drill

At least monthly, restore the newest archive on a separate environment. Compare row counts for `Task`, `Annotation`, and `AnnotationRevision`, inspect representative camera and sponsor streams, and exercise one item-specific restore. Capture the backup timestamp, time needed to restore, errors, and sign-off. Production restores are a reviewed incident procedure, not an annotation-editor action.
