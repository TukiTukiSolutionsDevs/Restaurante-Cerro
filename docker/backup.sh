#!/bin/sh
# Backup loop: dumps the DB every 24h and purges files older than 14 days.
# Runs as the entrypoint of the `backup` service in docker-compose.prod.yml.

DB_HOST="${DB_HOST:-db}"
DB_NAME="${DB_NAME:-cerro}"
BACKUP_DIR="/backups"
RETENTION_DAYS=14

while true; do
  TIMESTAMP=$(date +"%Y-%m-%d_%H-%M")
  FILE="$BACKUP_DIR/cerro-$TIMESTAMP.sql.gz"

  if pg_dump -U "$POSTGRES_USER" -h "$DB_HOST" "$DB_NAME" | gzip > "$FILE"; then
    echo "[backup $(date -u +%H:%M:%SZ)] OK  → $FILE"
  else
    echo "[backup $(date -u +%H:%M:%SZ)] ERROR: pg_dump failed for $DB_NAME" >&2
    rm -f "$FILE"
  fi

  # Remove backups older than RETENTION_DAYS
  find "$BACKUP_DIR" -name "cerro-*.sql.gz" -mtime "+$RETENTION_DAYS" -delete
  echo "[backup $(date -u +%H:%M:%SZ)] Cleanup done: removed files older than ${RETENTION_DAYS}d"

  sleep 86400
done
