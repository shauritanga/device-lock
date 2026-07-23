# Linda production deploy

Server: `139.59.139.30` (Ubuntu 24.04), repo at `/var/www/device-lock`.

| Host | Serves | Root / upstream |
| --- | --- | --- |
| `linda.co.tz`, `www` | Marketing site | `website/` |
| `api.linda.co.tz` | NestJS API | `127.0.0.1:3200` (pm2 `device-lock-api`) |
| `client.linda.co.tz` | Seller console | `dashboard/dist/client` |
| `admin.linda.co.tz` | Admin console | `dashboard/dist/admin` |

**There is no IP or cleartext entry point.** The old `http://139.59.139.30:8081`
site is removed; everything is HTTPS on the four hosts above. The Android apps
build against `https://api.linda.co.tz/v1` with cleartext disabled, so a working
certificate on `api.linda.co.tz` is a hard requirement before any APK is
installed.

## Prerequisites

- DNS A records → `139.59.139.30` for all four hosts.
- Ports 80/443 already served by nginx (shared with the `iet` / `dit-ac-control`
  sites) — the Linda hosts are extra `server` blocks, not new listeners.

## 1. Server environment

`/var/www/device-lock/backend/.env`:

```env
NODE_ENV=production
PORT=3200
DATABASE_URL=postgresql://device_lock:<password>@127.0.0.1:5432/device_lock_db?schema=public
JWT_ACCESS_SECRET=<secret>
JWT_REFRESH_SECRET=<secret>
CORS_ORIGINS=https://client.linda.co.tz,https://admin.linda.co.tz
PUBLIC_BASE_URL=https://api.linda.co.tz
```

`CORS_ORIGINS` is the one that fails quietly: the consoles load fine and every
API call is then blocked by the browser. Both origins must be listed, with no
trailing slash.

`dashboard/.env.production` is committed and needs no per-server edit.

## 2. Deploy

```bash
cd /var/www/device-lock
git pull

cd backend
npm ci
npx prisma migrate deploy
npm run build

cd ../dashboard
npm ci
npm run build           # typecheck + dist/client + dist/admin

pm2 restart device-lock-api
```

## 3. nginx + TLS (first time only)

```bash
cp /var/www/device-lock/deploy/nginx-linda.conf /etc/nginx/sites-available/linda
ln -sf /etc/nginx/sites-available/linda /etc/nginx/sites-enabled/linda

# Retire the old IP:8081 site.
rm -f /etc/nginx/sites-enabled/device-lock

nginx -t && systemctl reload nginx

certbot --nginx \
  -d linda.co.tz -d www.linda.co.tz \
  -d api.linda.co.tz -d client.linda.co.tz -d admin.linda.co.tz

nginx -t && systemctl reload nginx
```

certbot adds the `:443` listeners, certificate paths and `:80 → :443`
redirects in place. Renewal is handled by the existing `certbot.timer`.

## 4. Verify

```bash
curl -sI https://linda.co.tz | head -1
curl -s  https://api.linda.co.tz/v1/collections/packages | head -c 80   # 401 = up
curl -sI https://client.linda.co.tz | head -1
curl -sI https://admin.linda.co.tz | head -1

# The IP endpoint must be gone.
curl -sI --max-time 5 http://139.59.139.30:8081/ || echo "8081 closed — correct"
```

Then sign in at `client.linda.co.tz` with a seller account and confirm the
network tab shows successful calls to `api.linda.co.tz` (no CORS errors).

## Rollback

```bash
cd /var/www/device-lock && git reset --hard <previous-sha>
cd backend && npm ci && npm run build && pm2 restart device-lock-api
cd ../dashboard && npm ci && npm run build
```

Prisma migrations are forward-only. `20260723074400_collections_seller_handoff`
only adds nullable columns, so an older build runs fine against the newer schema
— no down-migration needed to roll back application code.

## Notes

- Ports 3000/3001/8080 are reserved by the other sites on this box; the API
  stays on 3200.
- pm2 config: `/var/www/device-lock/ecosystem.config.cjs`; logs under
  `/var/log/pm2/device-lock-api-*.log`.
