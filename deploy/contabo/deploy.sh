#!/usr/bin/env bash
set -euo pipefail

HOST="root@158.220.80.120"
REMOTE_DIR="/opt/sirawise"
COMPOSE_FILE="${REMOTE_DIR}/compose.yml"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"

if [[ $# -ne 0 ]]; then
	echo "Usage: $0" >&2
	exit 2
fi

cd "$REPO_ROOT"
if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
	if [[ "${GITHUB_REF:-}" != "refs/heads/main" ]]; then
		echo "Refusing to deploy a ref other than main." >&2
		exit 1
	fi
elif [[ "$(git branch --show-current)" != "main" ]]; then
	echo "Refusing to deploy outside the main branch." >&2
	exit 1
fi
if ! git diff --quiet || ! git diff --cached --quiet || [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
	echo "Refusing to deploy a dirty working tree." >&2
	exit 1
fi

git fetch --quiet origin main
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
	echo "Local main must match origin/main; pull or push first." >&2
	exit 1
fi

# The VPS builds the merged commit from GitHub; only small files travel from this machine.
FULL_SHA="$(git rev-parse HEAD)"
SHORT_SHA="$(git rev-parse --short HEAD)"
REPO_URL="$(git remote get-url origin)"
ssh "$HOST" "mkdir -p '$REMOTE_DIR'"
ssh "$HOST" "FULL_SHA='$FULL_SHA' SHORT_SHA='$SHORT_SHA' REPO_URL='$REPO_URL' bash -s" <<'REMOTE'
set -euo pipefail
src=/opt/sirawise/src
if [[ ! -d "$src/.git" ]]; then git clone --quiet "$REPO_URL" "$src"; fi
git -C "$src" fetch --quiet origin main
git -C "$src" checkout --quiet --detach "$FULL_SHA"
docker build --build-arg "APP_REVISION=$FULL_SHA" -t "sirawise-app:$SHORT_SHA" -f "$src/Dockerfile" "$src"
docker builder prune -f --filter until=168h >/dev/null
REMOTE
scp "$SCRIPT_DIR/compose.yml" "$HOST:$REMOTE_DIR/compose.yml.tmp"
scp "$SCRIPT_DIR/backup.sh" "$SCRIPT_DIR/restore-drill.sh" "$HOST:$REMOTE_DIR/"
scp "$REPO_ROOT/packages/db/src/deploy-migrations.mjs" "$HOST:$REMOTE_DIR/migrate.mjs"
scp "$REPO_ROOT/packages/db/src/runtime-role.mjs" "$HOST:$REMOTE_DIR/runtime-role.mjs"
scp "$REPO_ROOT/packages/db/src/deploy-runtime-role.mjs" "$HOST:$REMOTE_DIR/sync-runtime-role.mjs"
ssh "$HOST" "chmod 700 '$REMOTE_DIR/backup.sh' '$REMOTE_DIR/restore-drill.sh'; chmod 644 '$REMOTE_DIR/migrate.mjs' '$REMOTE_DIR/sync-runtime-role.mjs' '$REMOTE_DIR/runtime-role.mjs'"

ssh "$HOST" "bash -s" <<'REMOTE'
set -euo pipefail
remote_dir='/opt/sirawise'
compose_file="$remote_dir/compose.yml"
if [[ ! -s "$remote_dir/.env" ]]; then echo "Missing $remote_dir/.env." >&2; exit 1; fi
for key in SMTP_HOST SMTP_USER SMTP_PASS SMTP_FROM; do
  if ! grep -Eq "^${key}=.+" "$remote_dir/.env"; then
    echo "$key is empty in $remote_dir/.env; sign-up emails would fail. Deploy stopped." >&2
    exit 1
  fi
done
container_id="$(docker compose -p sirawise -f "$compose_file" ps -q app 2>/dev/null || true)"
if [[ -n "$container_id" ]]; then
  image="$(docker inspect --format '{{.Config.Image}}' "$container_id")"
  previous_tag="${image#sirawise-app:}"
  if [[ "$previous_tag" != "$image" ]]; then printf '%s\n' "$previous_tag" > "$remote_dir/.previous-tag"; fi
fi
if [[ -f "$compose_file" ]]; then cp -p "$compose_file" "$compose_file.previous"; fi
mv "$compose_file.tmp" "$compose_file"
REMOTE

if ! ssh "$HOST" "SIRAWISE_TAG='$SHORT_SHA' docker compose -p sirawise -f '$COMPOSE_FILE' up -d --wait postgres"; then exit 1; fi

ssh "$HOST" "SIRAWISE_TAG='$SHORT_SHA' bash -s" <<'REMOTE'
set -euo pipefail
remote_dir='/opt/sirawise'
compose_file="$remote_dir/compose.yml"
postgres_container="$(docker compose -p sirawise -f "$compose_file" ps -q postgres)"
has_tables="$(docker exec "$postgres_container" psql -U sirawise -d sirawise -Atc "SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_tables WHERE schemaname='public')")"
if [[ "$has_tables" == "t" ]]; then
  backup_output="$("$remote_dir/backup.sh" </dev/null)"
  printf '%s\n' "$backup_output"
  backup_folder="${backup_output##*/}"
  backup_folder="${backup_folder%.}"
  printf '%s\n' "$backup_folder" > "$remote_dir/.last-predeploy-backup"
  echo "Pre-deploy backup folder: $backup_folder"
fi
SIRAWISE_TAG="$SIRAWISE_TAG" docker compose -p sirawise -f "$compose_file" run --rm -T --no-deps \
  -v "$remote_dir/migrate.mjs:/app/apps/server/deploy-migrate.mjs:ro" app node /app/apps/server/deploy-migrate.mjs </dev/null
docker run --rm --network "container:$postgres_container" --env-file "$remote_dir/.env" \
  -v "$remote_dir/sync-runtime-role.mjs:/app/apps/server/sync-runtime-role.mjs:ro" \
  -v "$remote_dir/runtime-role.mjs:/app/apps/server/runtime-role.mjs:ro" \
  --entrypoint node "sirawise-app:${SIRAWISE_TAG}" /app/apps/server/sync-runtime-role.mjs </dev/null
REMOTE

if ! ssh "$HOST" "SIRAWISE_TAG='$SHORT_SHA' docker compose -p sirawise -f '$COMPOSE_FILE' up -d app"; then
	"$SCRIPT_DIR/rollback.sh" || true
	exit 1
fi

if ssh -o ConnectTimeout=5 -o ServerAliveInterval=5 -o ServerAliveCountMax=2 "$HOST" 'bash -s' <<'REMOTE'
set -euo pipefail
deadline=$((SECONDS + 120))
until curl --max-time 5 -fsS http://127.0.0.1:3100/api/health >/dev/null; do
  if (( SECONDS >= deadline )); then exit 1; fi
  sleep 2
done
REMOTE
then
	echo "Sirawise is healthy at image $SHORT_SHA."
	exit 0
fi

echo "Sirawise did not become healthy within 120 seconds. Rolling back." >&2
"$SCRIPT_DIR/rollback.sh" || true
exit 1
