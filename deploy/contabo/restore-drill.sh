#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 || ! "$1" =~ ^[0-9]{8}T[0-9]{6}Z$ ]]; then
	echo "Usage: $0 YYYYMMDDTHHMMSSZ" >&2
	exit 2
fi

REMOTE_DIR="${REMOTE_DIR:-/opt/sirawise}"
POSTGRES_DB="${POSTGRES_DB:-sirawise}"
POSTGRES_USER="${POSTGRES_USER:-sirawise}"
BACKUP_ROOT="${BACKUP_ROOT:-${REMOTE_DIR}/backups}"
DRILL_CONTAINER="${DRILL_CONTAINER:-sirawise-restore-drill}"
DRILL_STORAGE_VOLUME="${DRILL_STORAGE_VOLUME:-sirawise_restore_drill_storage}"
DRILL_IMAGE="${DRILL_IMAGE:-postgres:17-alpine}"
DOCKER_BIN="${DOCKER_BIN:-docker}"
BACKUP_DIR="${BACKUP_ROOT}/$1"

for file in sirawise.dump storage.tar.gz table_counts.tsv; do
	if [[ ! -s "${BACKUP_DIR}/${file}" ]]; then
		echo "Required backup file is missing or empty: ${BACKUP_DIR}/${file}" >&2
		exit 1
	fi
done

DRILL_PASSWORD="$("$DOCKER_BIN" run --rm "$DRILL_IMAGE" sh -c 'head -c 32 /dev/urandom | od -An -tx1 | tr -d " \n"')"
cleanup() {
	"$DOCKER_BIN" rm -fv "$DRILL_CONTAINER" >/dev/null 2>&1 || true
	"$DOCKER_BIN" volume rm "$DRILL_STORAGE_VOLUME" >/dev/null 2>&1 || true
}
if "$DOCKER_BIN" container inspect "$DRILL_CONTAINER" >/dev/null 2>&1; then
	echo "Drill container already exists: $DRILL_CONTAINER" >&2
	exit 1
fi
if "$DOCKER_BIN" volume inspect "$DRILL_STORAGE_VOLUME" >/dev/null 2>&1; then
	echo "Drill storage volume already exists: $DRILL_STORAGE_VOLUME" >&2
	exit 1
fi
trap cleanup EXIT
"$DOCKER_BIN" volume create "$DRILL_STORAGE_VOLUME" >/dev/null
"$DOCKER_BIN" run -d --name "$DRILL_CONTAINER" -e "POSTGRES_DB=$POSTGRES_DB" -e "POSTGRES_USER=$POSTGRES_USER" \
	-e "POSTGRES_PASSWORD=$DRILL_PASSWORD" "$DRILL_IMAGE" >/dev/null

deadline=$((SECONDS + 90))
until [[ "$("$DOCKER_BIN" logs "$DRILL_CONTAINER" 2>&1 | grep -c 'database system is ready to accept connections')" -ge 2 ]] && "$DOCKER_BIN" exec "$DRILL_CONTAINER" pg_isready -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; do
	if (( SECONDS >= deadline )); then
		echo "Throwaway PostgreSQL did not become ready." >&2
		exit 1
	fi
	sleep 1
done

"$DOCKER_BIN" exec -i "$DRILL_CONTAINER" pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges < "$BACKUP_DIR/sirawise.dump"
while IFS=$'\t' read -r schema table expected; do
	if [[ -z "$schema" || -z "$table" || ! "$expected" =~ ^[0-9]+$ ]]; then
		echo "Malformed table count row in $BACKUP_DIR/table_counts.tsv." >&2
		exit 1
	fi
	actual="$(printf '%s\n' 'SELECT count(*) FROM :"schema".:"table";' | "$DOCKER_BIN" exec -i "$DRILL_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At \
		-v "schema=$schema" -v "table=$table" -f -)"
	if [[ "$actual" != "$expected" ]]; then
		echo "Row count mismatch for ${schema}.${table}: backup=$expected restored=$actual" >&2
		exit 1
	fi
	printf '%s.%s: %s rows restored\n' "$schema" "$table" "$actual"
done < "$BACKUP_DIR/table_counts.tsv"

"$DOCKER_BIN" run --rm -v "${DRILL_STORAGE_VOLUME}:/data" -v "${BACKUP_DIR}:/backup:ro" alpine:3.22 \
	sh -c 'tar -xzf /backup/storage.tar.gz -C /data && tar -tzf /backup/storage.tar.gz >/dev/null'
echo "Restore drill passed for $BACKUP_DIR."
