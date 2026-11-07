# Vizaje Partners: Docker production preparation

This configuration is for the VPS layout described in P2.1. It does not deploy anything and does not connect to the VPS.

## Files

- `Dockerfile.web` builds the Next.js production server with Next standalone output.
- `Dockerfile.api` builds the Bun/Hono API and a separate `migration` target with Drizzle Kit.
- `compose.production.yml` defines the independent Compose project `vizaje-partners` with `web`, `api`, `postgres`, and an explicitly profiled `migrate` service.
- `.env.production.example` contains placeholders only. Copy it to `.env.production` on the server and keep the real file outside Git.

The Compose network is `vizaje-partners-internal`. PostgreSQL has no published host port. Web and API are bound only to localhost for host-installed Nginx:

```text
web: 127.0.0.1:3000
api: 127.0.0.1:3001
postgres: Docker network only, postgres:5432
```

The web container reaches the API as `http://api:3001`. The API reaches PostgreSQL as `postgres:5432` through `DATABASE_URL`.

## First setup and startup

On the server, from `/opt/vizaje/partners`:

```bash
cp .env.production.example .env.production
chmod 600 .env.production
# Edit .env.production and replace every placeholder.

docker compose --env-file .env.production --profile migrations -f compose.production.yml config
docker compose --env-file .env.production --profile migrations -f compose.production.yml build --pull api web migrate
docker compose --env-file .env.production -f compose.production.yml up -d postgres

# Confirm the migration image contains the workspace-local Drizzle Kit binary.
docker compose --env-file .env.production --profile migrations -f compose.production.yml run --rm --no-deps --entrypoint sh migrate -lc 'test -x packages/db/node_modules/.bin/drizzle-kit && packages/db/node_modules/.bin/drizzle-kit --version'

# Apply pending migrations once, explicitly. This never runs as part of normal `up`.
docker compose --env-file .env.production --profile migrations -f compose.production.yml run --rm --no-deps migrate

docker compose --env-file .env.production -f compose.production.yml up -d api web
docker compose --env-file .env.production -f compose.production.yml ps
```

The API runtime image does not contain Drizzle Kit. The profiled migration image contains migrations through `0014` and the workspace-local `drizzle-kit` binary. Do not run `db:generate`, `db:push`, reset commands, seed commands, or automatic migrations in a replica startup hook. The one-shot command applies only pending migrations tracked by Drizzle.

## Health checks

The Compose health checks use the container network and do not require Nginx:

```bash
curl --fail http://127.0.0.1:3001/health
curl --fail http://127.0.0.1:3001/v1/health/db
curl --fail http://127.0.0.1:3000/
docker compose --env-file .env.production -f compose.production.yml ps
docker compose --env-file .env.production -f compose.production.yml logs --tail=100 api web postgres
```

After Nginx and TLS are configured, also check:

```bash
curl --fail https://partners.vizaje-nica.com/
curl --fail https://partners-api.vizaje-nica.com/health
curl --fail https://partners-api.vizaje-nica.com/v1/health/db
```

## Host Nginx upstreams

The host Nginx should proxy these public names to the loopback-published ports:

```nginx
upstream vizaje_partners_web {
    server 127.0.0.1:3000;
}

upstream vizaje_partners_api {
    server 127.0.0.1:3001;
}

server {
    listen 443 ssl http2;
    server_name partners.vizaje-nica.com;

    location / {
        proxy_pass http://vizaje_partners_web;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
    }
}

server {
    listen 443 ssl http2;
    server_name partners-api.vizaje-nica.com;

    location / {
        proxy_pass http://vizaje_partners_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Add HTTP-to-HTTPS redirects and the TLS certificate configuration according to the server's existing Nginx/ACME setup. Keep PostgreSQL out of Nginx and out of host port publishing.

## Backup

Create a restricted backup directory outside the repository:

```bash
install -d -m 700 /opt/vizaje/backups
docker compose --env-file .env.production -f compose.production.yml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
  > /opt/vizaje/backups/vizaje-partners-$(date -u +%Y%m%dT%H%M%SZ).dump
chmod 600 /opt/vizaje/backups/*.dump
```

Copy backups to a separate encrypted storage location. A backup is not verified until it has been restored into a disposable PostgreSQL instance and checked.

## Restore

Restore is destructive for the target database. First stop application traffic, take one more backup, verify the dump file, and confirm the target Compose project:

```bash
docker compose --env-file .env.production -f compose.production.yml stop api web

cat /opt/vizaje/backups/FILE.dump | \
  docker compose --env-file .env.production -f compose.production.yml exec -T postgres \
  sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner'

docker compose --env-file .env.production -f compose.production.yml up -d api web
docker compose --env-file .env.production -f compose.production.yml ps
```

Do not use `--clean` against an unintended database or without a verified backup. The application does not reset, seed, or restore data automatically.

## Environment notes

`NEXT_PUBLIC_API_BASE_URL` is currently read in server-only Next Route Handlers/server helpers, while the container-to-container URL is `API_INTERNAL_URL=http://api:3001`. If this variable is ever read from a Client Component, Next.js will freeze its value into the browser bundle at `next build`; rebuild the web image for a changed public value. Never place secrets in `NEXT_PUBLIC_*` variables or Docker build arguments.

The Legacy resolver and financial/referral tracking features remain disabled by default. Do not enable them as part of the first deployment.
