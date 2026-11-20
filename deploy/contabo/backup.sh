#!/usr/bin/env bash
set -euo pipefail

REMOTE_DIR="${REMOTE_DIR:-/opt/sirawise}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-sirawise}"
COMPOSE_FILE="${COMPOSE_FILE:-${REMOTE_DIR}/compose.yml}"
POSTGRES_DB="${POSTGRES_DB:-sirawise}"
POSTGRES_USER="${POSTGRES_USER:-sirawise}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-}"
STORAGE_VOLUME="${STORAGE_VOLUME:-sirawise_storage}"
BACKUP_ROOT="${BACKUP_ROOT:-${REMOTE_DIR}/backups}"
DOCKER_BIN="${DOCKER_BIN:-docker}"
BACKUP_DATE="${BACKUP_DATE:-$(date -u +%F)}"
umask 077

if [[ ! "$BACKUP_DATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
	echo "BACKUP_DATE must use YYYY-MM-DD." >&2
	exit 2
fi
if [[ -z "$POSTGRES_CONTAINER" ]]; then
	POSTGRES_CONTAINER="$("$DOCKER_BIN" compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" ps -q postgres)"
fi
if [[ -z "$POSTGRES_CONTAINER" ]]; then
	echo "No PostgreSQL container is running for compose project $COMPOSE_PROJECT." >&2
	exit 1
fi

BACKUP_DIR="${BACKUP_ROOT}/${BACKUP_DATE}"
mkdir -p -- "$BACKUP_ROOT"
chmod 700 -- "$BACKUP_ROOT"
STAGING_DIR="$(mktemp -d "${BACKUP_ROOT}/.backup-${BACKUP_DATE}.XXXXXX")"
cleanup() { rm -rf -- "$STAGING_DIR"; }
trap cleanup EXIT

"$DOCKER_BIN" exec "$POSTGRES_CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$STAGING_DIR/sirawise.dump"

"$DOCKER_BIN" run --rm -v "${STORAGE_VOLUME}:/data:ro" -v "${STAGING_DIR}:/backup" alpine:3.22 \
	tar -czf /backup/storage.tar.gz -C /data .
"$DOCKER_BIN" exec "$POSTGRES_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -F $'\t' \
	-c "SELECT schemaname, tablename FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema') ORDER BY schemaname, tablename" \
	> "$STAGING_DIR/tables.tsv"
: > "$STAGING_DIR/table_counts.tsv"
while IFS=$'\t' read -r schema table; do
	[[ -n "$schema" && -n "$table" ]] || continue
	count="$(printf '%s\n' 'SELECT count(*) FROM :"schema".:"table";' | "$DOCKER_BIN" exec -i "$POSTGRES_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At \
		-v "schema=$schema" -v "table=$table" -f -)"
	printf '%s\t%s\t%s\n' "$schema" "$table" "$count" >> "$STAGING_DIR/table_counts.tsv"
done < "$STAGING_DIR/tables.tsv"
rm -f -- "$STAGING_DIR/tables.tsv"

mkdir -p -- "$BACKUP_DIR"
mv -f -- "$STAGING_DIR/sirawise.dump" "$BACKUP_DIR/sirawise.dump"
mv -f -- "$STAGING_DIR/storage.tar.gz" "$BACKUP_DIR/storage.tar.gz"
mv -f -- "$STAGING_DIR/table_counts.tsv" "$BACKUP_DIR/table_counts.tsv"
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -regextype posix-extended -regex '.*/[0-9]{4}-[0-9]{2}-[0-9]{2}' -mmin +20160 -exec rm -rf -- {} +
echo "Backup saved to $BACKUP_DIR."
