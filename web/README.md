# Marketing OS — Web App

A real Next.js implementation of the **Marketing OS** designs handed off from Claude Design
(see `../project/*.dc.html` for the pixel-perfect reference prototypes and `../chats/` for intent).

Built for the TEPPEN restaurant group's marketing team — premium Japanese-restaurant mood:
ivory/cream surfaces, charcoal navigation, champagne-gold accents, Thai Baht throughout.

## Stack

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS** — design tokens in `tailwind.config.ts` (palette, brand colors, radii)
- **lucide-react** icons · **Hanken Grotesk** (next/font)
- **Supabase backend + auth** wired behind `src/lib/db/*` and `src/lib/auth.tsx`. When the
  Supabase env vars are absent the app transparently falls back to the bundled typed mock
  data, so it still builds and runs with no database. Auth (login + role gating) is enforced
  only when `NEXT_PUBLIC_REQUIRE_AUTH=true` **and** Supabase is configured — see `AUTH.md`
  and `SUPABASE.md`. Row Level Security is the real authorization boundary (`supabase/*.sql`).

## Run

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build (all routes prerender)
```

## What's built (first pass)

Foundation + the three flagship modules, per the agreed scope:

| Area | Status |
| --- | --- |
| Design system (tokens, KPI card, badges, filters, progress) | ✅ |
| App shell — charcoal sidebar, mobile drawer, role switcher | ✅ |
| **Dashboard** — Team Result Dashboard (KPIs, team results, health, alerts, approvals, pulse) | ✅ |
| **Campaigns** — list (monthly summary, status groups, filters) + 10-tab detail | ✅ |
| **Finance** — Budget Plan · Expense Request · Spending Log · ROI/P&L · Approval (signature) | ✅ |
| Content Calendar · Graphic · KOL · Requests · Approvals · Assets · My Tasks · Team · Settings | ⏳ placeholder pages, designs ready |

## Structure

```
src/
  app/            route segments (Dashboard = /, campaigns, finance, + placeholders)
  components/
    shell/        AppShell, Sidebar, RoleSwitcher
    ui/           Card, KpiCard, StatusBadge, BrandFilter, DateFilterBar, Segmented, ...
    campaign/     CampaignDetailView (10 tabs)
    finance/      SignaturePad
  lib/
    brands.ts     brand registry (single source of truth)
    status.ts     semantic tone system
    format.ts     Thai Baht / number formatting
    nav.ts        navigation config
    data/         typed mock data (dashboard, campaigns, finance) — the future Supabase seam
```

## Next up

Port the remaining modules (KOL, Content Calendar, Graphic, My Tasks, Team, Settings,
Request Center, Approval Queue, Asset Library) from their `.dc.html` designs, then introduce
the Supabase data layer behind `src/lib/data/`.
