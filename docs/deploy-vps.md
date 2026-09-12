# Production deploy on a VPS

The production stack is intentionally separate from local development. It uses Caddy for public HTTP/HTTPS, static frontend assets, Go backend, and an internal-only Postgres service. Only ports 80 and 443 are published; neither Postgres nor the backend have host ports.

## Prerequisites

1. Point a DNS A record for `APP_DOMAIN` to the VPS IPv4 address.
2. Open TCP ports 80 and 443 in the VPS firewall/provider firewall.
3. Install Docker Engine with the Compose plugin on the VPS.

Caddy obtains and renews a trusted TLS certificate automatically after DNS is live. Do not use an IP address in `APP_DOMAIN`: public certificate authorities do not issue normal browser-trusted certificates for this deployment path.

## First deploy

```sh
git clone https://github.com/itpark32/pbook-service.git
cd pbook-service
cp .env.production.example .env.production
# Edit .env.production locally on the VPS; never commit it.
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
docker compose --env-file .env.production -f docker-compose.production.yml ps
curl --fail https://YOUR_DOMAIN/api/v1/health
```

`APP_ORIGIN` is derived from `APP_DOMAIN`, cookies are always `Secure`, and the backend rejects browser mutations from other origins.

## Update and rollback

```sh
git pull --ff-only origin main
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
```

Before upgrades, create a PostgreSQL backup from the VPS:

```sh
docker compose --env-file .env.production -f docker-compose.production.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > pbook-backup.sql
```

Keep `.env.production` and `pbook-backup.sql` outside Git. To inspect service logs, use `docker compose ... logs --tail=100 backend caddy`; do not paste credentials or token-bearing URLs into tickets or chat.
