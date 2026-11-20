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
BACKUP_ID="${BACKUP_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
umask 077

if [[ ! "$BACKUP_ID" =~ ^[0-9]{8}T[0-9]{6}Z$ ]]; then
	echo "BACKUP_ID must use YYYYMMDDTHHMMSSZ." >&2
	exit 2
fi
if [[ -z "$POSTGRES_CONTAINER" ]]; then
	POSTGRES_CONTAINER="$("$DOCKER_BIN" compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" ps -q postgres)"
fi
if [[ -z "$POSTGRES_CONTAINER" ]]; then
	echo "No PostgreSQL container is running for compose project $COMPOSE_PROJECT." >&2
	exit 1
fi

BACKUP_DIR="${BACKUP_ROOT}/${BACKUP_ID}"
mkdir -p -- "$BACKUP_ROOT"
chmod 700 -- "$BACKUP_ROOT"
STAGING_DIR="$(mktemp -d "${BACKUP_ROOT}/.backup-${BACKUP_ID}.XXXXXX")"
cleanup() {
	if [[ -n "${SNAPSHOT_PID:-}" ]]; then
		exec {SNAPSHOT_IN}>&- 2>/dev/null || true
		wait "$SNAPSHOT_PID" 2>/dev/null || true
	fi
	rm -rf -- "$STAGING_DIR"
}
trap cleanup EXIT

# One session holds a REPEATABLE READ snapshot that pg_dump and the row counts share.
# Closing its input ends the transaction, so no session outlives this script.
coproc SNAPSHOT { "$DOCKER_BIN" exec -i "$POSTGRES_CONTAINER" psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At; }
exec {SNAPSHOT_IN}>&"${SNAPSHOT[1]}"
eval "exec ${SNAPSHOT[1]}>&-"
printf '%s\n' "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;" "SELECT pg_export_snapshot();" >&"$SNAPSHOT_IN"
if ! IFS= read -r -t 30 SNAPSHOT_ID <&"${SNAPSHOT[0]}" || [[ ! "$SNAPSHOT_ID" =~ ^[0-9A-F]+-[0-9A-F]+-[0-9]+$ ]]; then
	echo "Could not export database snapshot." >&2
	exit 1
fi
"$DOCKER_BIN" exec "$POSTGRES_CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --snapshot="$SNAPSHOT_ID" -Fc > "$STAGING_DIR/sirawise.dump"

"$DOCKER_BIN" run --rm -v "${STORAGE_VOLUME}:/data:ro" -v "${STAGING_DIR}:/backup" alpine:3.22 \
	tar -czf /backup/storage.tar.gz -C /data .

"$DOCKER_BIN" exec "$POSTGRES_CONTAINER" psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -F $'\t' \
	-c "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET TRANSACTION SNAPSHOT '$SNAPSHOT_ID'; SELECT schemaname, tablename FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema') ORDER BY schemaname, tablename; COMMIT" \
	> "$STAGING_DIR/tables.tsv"
: > "$STAGING_DIR/table_counts.tsv"
while IFS=$'\t' read -r schema table; do
	[[ -n "$schema" && -n "$table" ]] || continue
	count="$(printf '%s\n' "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET TRANSACTION SNAPSHOT '$SNAPSHOT_ID'; SELECT count(*) FROM :\"schema\".:\"table\"; COMMIT" | "$DOCKER_BIN" exec -i "$POSTGRES_CONTAINER" psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At \
		-v "schema=$schema" -v "table=$table" -f -)"
	printf '%s\t%s\t%s\n' "$schema" "$table" "$count" >> "$STAGING_DIR/table_counts.tsv"
done < "$STAGING_DIR/tables.tsv"
printf '%s\n' "COMMIT;" >&"$SNAPSHOT_IN"
exec {SNAPSHOT_IN}>&-
wait "$SNAPSHOT_PID" 2>/dev/null || true
SNAPSHOT_PID=
rm -f -- "$STAGING_DIR/tables.tsv"

while ! mkdir -- "$BACKUP_DIR" 2>/dev/null; do
	sleep 1
	BACKUP_ID="$(date -u +%Y%m%dT%H%M%SZ)"
	BACKUP_DIR="${BACKUP_ROOT}/${BACKUP_ID}"
done
mv -- "$STAGING_DIR/sirawise.dump" "$BACKUP_DIR/sirawise.dump"
mv -- "$STAGING_DIR/storage.tar.gz" "$BACKUP_DIR/storage.tar.gz"
mv -- "$STAGING_DIR/table_counts.tsv" "$BACKUP_DIR/table_counts.tsv"
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -regextype posix-extended -regex '.*/[0-9]{8}T[0-9]{6}Z' -mmin +20160 -exec rm -rf -- {} +
echo "Backup saved to $BACKUP_DIR."
