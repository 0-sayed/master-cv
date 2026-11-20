# Sirawise on Contabo

Sirawise uses a private Docker Compose project on the Contabo VPS. Caddy owns ports 80 and 443 and routes requests to Sirawise and Tebyaan.

## First install

1. Create `/opt/caddy` and `/opt/sirawise` on the VPS. The image build needs Docker buildx. The VPS runs Ubuntu's `docker.io` package, which does not include it, so install it with `apt-get install docker-buildx`. Hosts that run Docker CE already have `docker-buildx-plugin`; do not install `docker-buildx` there.
2. Copy `caddy/Caddyfile` and `caddy/compose.yml` to `/opt/caddy`. Start Caddy with Docker Compose.
3. Set Tebyaan Nginx to `127.0.0.1:8088:80` and `127.0.0.1:8443:443`. Tebyaan PR [#50](https://github.com/BandAI-sa/tebyaan/pull/50) records that port change.
4. Copy `compose.yml` and `env.example` to `/opt/sirawise`. Copy `env.example` to `/opt/sirawise/.env` and set its mode to `600`.
5. Keep the existing `POSTGRES_PASSWORD` value. Generate a hex `RUNTIME_DB_PASSWORD` with `openssl rand -hex 32`.
6. Add or replace these database lines in `/opt/sirawise/.env`:

```dotenv
DATABASE_MIGRATION_URL=postgresql://sirawise:<POSTGRES_PASSWORD>@postgres:5432/sirawise
DATABASE_URL=postgresql://sirawise_runtime:<RUNTIME_DB_PASSWORD>@postgres:5432/sirawise
RUNTIME_DB_PASSWORD=<generated-hex-password>
```

`POSTGRES_USER=sirawise` owns the schema and runs migrations. `sirawise_runtime` is a restricted login for the app. Both database URLs use host `postgres` inside the Compose network. Replace each placeholder with the matching value from this `.env` file. Do not keep the old superuser `DATABASE_URL`.

7. Set unique authentication and encryption secrets. Keep `APP_URL=https://sirawise.io` and `FLAG_DISABLE_SIGNUPS=false`.
8. Set `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=587`, `SMTP_USER=resend`, `SMTP_PASS` to the Resend API key, and `SMTP_FROM=Sirawise <noreply@sirawise.io>`.
9. Set both Google OAuth values after the owner publishes the Google sign-in app. Empty Google values keep Google sign-in unavailable.
10. Run `deploy/contabo/deploy.sh` from the approved deployment checkout. The first run starts PostgreSQL, applies migrations, creates the runtime login, then starts the app.

## Deploy

Run the script from a clean `main` that matches `origin/main`. The VPS clones the repository into `/opt/sirawise/src`, checks out that exact commit and builds the image there; no image leaves the operator's machine.

Compose gives its default network subnet `172.31.240.0/24`; the app trusts gateway `172.31.240.1`. `getTrustedClient` reads `X-Forwarded-For`, which Caddy sends to the app. The deploy script starts PostgreSQL and waits for its health check. If the database has tables, the script takes a backup before migration. It then runs migrations from the new app image and syncs runtime grants. The app starts after these steps and must pass the 120-second health gate.

The script copies the backup, restore-drill, migration, runtime-role, and AI-budget files to `/opt/sirawise`. Keep `.env` out of source control and logs. The deploy stops if a required SMTP value is empty.

The deploy seeds eight daily AI budget rows through the migration database role. Install this cron entry on the VPS to keep eight UTC days available:

```cron
10 0 * * * /opt/sirawise/ai-budget.sh
```

## Roll back

Run `deploy/contabo/rollback.sh` from the repository root. It uses `/opt/sirawise/compose.yml.previous` and the tag in `/opt/sirawise/.previous-tag`. Rollback waits for app health and restores the previous Compose file. If the deploy ran migrations, restore the pre-deploy backup named in `/opt/sirawise/.last-predeploy-backup` before using the previous image.

## Back up

The backup script stores database dumps and the `sirawise_storage` volume, mounted at `/app/data`, under `/opt/sirawise/backups/<YYYYMMDDTHHMMSSZ>/`. The script retains matching folders for 14 days. Counts and the dump use one PostgreSQL snapshot. The storage archive is taken after the dump, so files written during the backup can be missing. Add this cron entry on the VPS:

```cron
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
15 3 * * * /opt/sirawise/backup.sh
```

## Restore drill

Run the restore drill on the VPS after a backup completes. Pass the backup folder name:

```bash
/opt/sirawise/restore-drill.sh 20261120T031500Z
```

The script restores the dump to a throwaway `postgres:17-alpine` container, compares saved table counts, restores the storage archive to a throwaway volume, then removes both resources.

Restoring a backup also restores accounts deleted after that backup. T012 owns deletion replay (A12).
