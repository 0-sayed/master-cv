#!/usr/bin/env bash
set -euo pipefail

HOST="root@158.220.80.120"
REMOTE_DIR="/opt/sirawise"
COMPOSE_FILE="${REMOTE_DIR}/compose.yml.previous"

ssh "$HOST" 'bash -s' <<'REMOTE'
set -euo pipefail
remote_dir='/opt/sirawise'
tag_file="$remote_dir/.previous-tag"
compose_file="$remote_dir/compose.yml.previous"
if [[ ! -s "$tag_file" ]]; then
  echo "No previous image tag is recorded; automatic rollback is unavailable." >&2
  exit 1
fi
tag="$(<"$tag_file")"
if [[ ! "$tag" =~ ^[a-zA-Z0-9_.-]+$ ]]; then
  echo "The previous image tag is invalid." >&2
  exit 1
fi
SIRAWISE_TAG="$tag" docker compose -p sirawise -f "$compose_file" up -d --wait app
cp -p "$compose_file" "$remote_dir/compose.yml"
echo "Sirawise restarted with image tag $tag."
if [[ -s "$remote_dir/.last-predeploy-backup" ]]; then
  backup="$(<"$remote_dir/.last-predeploy-backup")"
  echo "WARNING: If this deploy ran migrations, restore pre-deploy backup folder $backup before using the previous image." >&2
fi
REMOTE
