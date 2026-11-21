# DeployForge Frontend

Web interface for DeployForge. React 19 + TypeScript + Vite, Tailwind CSS v4, shadcn/ui, Lucide, Recharts, React Router 7 and TanStack Query.

The frontend only talks to the DeployForge API over HTTP. It never runs PowerShell, WinGet or any other process, and it has no deployment operations yet.

## Requirements

- Node.js `^20.19.0` or `>=22.12.0`, npm 10+.
- The DeployForge API running locally for live data (see the repository README).

## Commands

Run from `frontend/`:

| Command | What it does |
|---|---|
| `npm install` | Installs the pinned dependencies |
| `npm run dev` | Dev server on `http://127.0.0.1:5173`, proxying `/api/*` and `/health` to the API |
| `npm run typecheck` | TypeScript project build (`tsc -b`), no output files |
| `npm run lint` | oxlint |
| `npm run build` | Type check + production build into `dist/` |
| `npm run preview` | Serves `dist/` on `http://127.0.0.1:4173` (no API proxy) |

Start the API first, from the repository root:

```powershell
python -m uvicorn app.main:app --app-dir backend
```

## Environment variables

Read by Vite at build time. Backend URLs live only in these files, never in `src/`.

| Variable | Used by | Meaning |
|---|---|---|
| `VITE_API_BASE_URL` | app | Absolute `http(s)` base URL of the API, or empty for same origin |
| `VITE_API_TIMEOUT_MS` | app | Request timeout in milliseconds (positive integer) |
| `VITE_DEV_API_PROXY_TARGET` | `vite.config.ts` | Development only: where `/api/*` and `/health` are proxied |

Files: `.env.development` and `.env.production` are committed defaults; `.env.example` documents every variable; put machine-specific values in `.env.local` / `.env.<mode>.local` (git-ignored).

In development `VITE_API_BASE_URL` is empty, so the browser calls same-origin paths and the Vite proxy forwards them. The API therefore needs no CORS settings for development. A build that calls the API directly (e.g. the future desktop build) sets `VITE_API_BASE_URL=http://127.0.0.1:8000`; that build needs CORS on the API, which is a later step.

Invalid values stop the app at startup with a "DeployForge cannot start" screen listing the problems. `/diagnostics` shows the resolved configuration.

## Structure

```text
frontend/
├── index.html                 Vite entry HTML
├── vite.config.ts             React + Tailwind plugins, @ alias, dev proxy from env
├── components.json            shadcn/ui configuration
├── .oxlintrc.json             Lint rules
├── .env.example / .env.development / .env.production
└── src/
    ├── main.tsx               Applies saved theme, validates config, renders <App />
    ├── app/                   App shell wiring
    │   ├── App.tsx            Providers + RouterProvider
    │   ├── providers.tsx      Root error boundary, theme, TanStack Query, toaster
    │   ├── router.tsx         Route table, lazy-loaded pages
    │   └── ConfigErrorScreen.tsx
    ├── layouts/AppLayout.tsx  Sidebar, header, page error boundary, Suspense loader
    ├── routes/                paths.ts (route constants), navigation.ts (menu), NotFoundPage.tsx
    ├── features/              One folder per screen; feature-specific code stays inside
    │   ├── dashboard/         API health, catalog total, applications-by-source chart (live data)
    │   ├── diagnostics/       Resolved config and /health details (live data)
    │   ├── settings/          Theme selection
    │   └── catalog/ deployments/ api-explorer/ activity/   Planned (placeholders, no fake data)
    ├── components/
    │   ├── ui/                shadcn/ui components (button, card, badge, skeleton, separator, sonner)
    │   ├── feedback/          PageLoader, ErrorState, error boundaries, PlannedFeature
    │   ├── theme/             ThemeProvider + context (light / dark / system)
    │   └── PageHeader, ApiStatusIndicator, ThemeToggle
    ├── hooks/                 TanStack Query hooks (use-health, use-applications), use-theme
    ├── services/              API access, no React
    │   ├── api/http-client.ts The only fetch() in the app: base URL, timeout, error mapping
    │   ├── api/api-error.ts   ApiError (http | network | timeout | invalid_response)
    │   ├── api/query-keys.ts  Central query keys
    │   └── health.service.ts, applications.service.ts
    ├── lib/                   env.ts (config), notify.ts (toasts), query-client.ts, theme.ts, errors.ts, utils.ts
    ├── styles/globals.css     Tailwind + shadcn/ui design tokens (light and dark)
    └── types/                 api.ts (API contracts), env.d.ts (VITE_* typing)
```

## Architecture rules

1. **Data flow:** component → hook (`hooks/`) → service (`services/`) → `http-client.ts`. Components never call `fetch`.
2. **Typed contracts:** `types/api.ts` mirrors the backend Pydantic models exactly. A later step generates them from `/openapi.json`.
3. **Errors:** every API failure is an `ApiError` with a `kind`. Queries show errors inline with a retry; mutations also raise a toast. 4xx responses are not retried.
4. **Notifications:** use `notify.*` / `notifyError` from `lib/notify.ts`, never `sonner` directly.
5. **Error boundaries:** root boundary (`providers.tsx`), router `errorElement`, and a per-page boundary in `AppLayout` that resets on navigation.
6. **Loading:** pages are lazy-loaded; `PageLoader` is the shared skeleton. Data loads use `Skeleton` in place.
7. **Routes:** paths come from `routes/paths.ts`; menu entries from `routes/navigation.ts`.
8. **shadcn/ui:** generated code in `components/ui/` may be edited (e.g. `sonner.tsx` uses the app's theme hook instead of `next-themes`). Add components with `npx shadcn@latest add <name>`.

## Tauri readiness (no Tauri dependencies yet)

- Static build in `dist/`, no Node APIs at runtime, no server-side rendering.
- API base URL is configuration (`VITE_API_BASE_URL`), never hard-coded.
- Theme uses `localStorage` behind try/catch, so a webview without storage still works.
- No inline scripts in `index.html`, keeping a strict Content Security Policy possible.
- Pending for the Tauri step: CORS on the API for the Tauri origin, and a CSP whose `connect-src` allows only the API origin.
