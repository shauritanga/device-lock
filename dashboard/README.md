# Linda consoles

Two React consoles built from one codebase, deployed to two origins.

| Console | Origin | Who signs in | What it does |
| --- | --- | --- | --- |
| Seller | `client.linda.co.tz` | `OWNER`, `MANAGER`, `AGENT` | Devices, sales, customers, loans, payments, staff, billing, and a read-only view of the managed collections service |
| Admin | `admin.linda.co.tz` | `SUPER_ADMIN`, `COLLECTIONS_ADMIN`, `COLLECTOR` | Collector work queue, call centre, reports, company subscriptions, collector roster |

Phone follow-up is an admin-side service. Sellers subscribe to it; platform
collectors do the calling through the `android-collector` app. There is no
follow-up queue in the seller console by design.

## Layout

```
src/
  shared/    api client, auth + guards, design system, AppShell, Login, CaseList
  client/    index.html, main.tsx, App.tsx, nav.ts, pages/
  admin/     index.html, main.tsx, App.tsx, nav.ts, pages/
```

Import shared code with the `@` alias (`@/shared/api/client`). Anything under
`client/` or `admin/` must never be imported across the boundary — that is what
keeps each bundle free of the other console's code.

## Commands

```bash
npm run dev:client      # http://localhost:5173
npm run dev:admin       # http://localhost:5174
npm run typecheck
npm run build           # typecheck, then both apps
npm run build:client    # -> dist/client
npm run build:admin     # -> dist/admin
```

`APP=client|admin` selects the entry; `vite.config.ts` sets `root` to that app's
folder so each build emits its own `dist/<app>/index.html` at `/`. Deploy each
`dist` directory to its own origin with SPA fallback (rewrite unknown paths to
`index.html`).

## Environment

`.env.local` at this package root, shared by both apps:

```env
VITE_API_URL=https://api.linda.co.tz/v1
VITE_CLIENT_URL=https://client.linda.co.tz
VITE_ADMIN_URL=https://admin.linda.co.tz
```

`VITE_CLIENT_URL` / `VITE_ADMIN_URL` are used to redirect a user who signs in at
the wrong console; they default to the production hosts above.

## Access control

- `AppGuard` (in `shared/auth/guards.tsx`) rejects roles that belong to the other
  console and offers a link across instead of a broken shell.
- `RequireRole` gates individual routes inside a console.
- Nav items and groups carry an optional `roles` list, so nobody is shown a link
  they cannot open.

All three are **defence in depth, not the security boundary**. The API enforces
roles and `tenantId` scoping server-side regardless of which build made the call;
never rely on a page being absent from a bundle to keep data private.
