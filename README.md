# localization-system-redesign

Base for the Localizer redesign — the replacement for the legacy CRA app in `../localization-web/translator`.

## Stack

| Layer      | Choice                                            |
| ---------- | ------------------------------------------------- |
| Build      | Vite 8 + `@vitejs/plugin-react`                   |
| Language   | TypeScript 6, React 19                            |
| Styling    | Tailwind CSS v4 (`@tailwindcss/vite`, CSS-first)  |
| Components | shadcn/ui (`base-nova` style, Base UI primitives) |
| Icons      | lucide-react                                      |
| Toasts     | sonner                                            |
| Theming    | next-themes (`class` strategy, light/dark)        |
| Lint       | oxlint                                            |

## Requirements

Node 20+ (the repo pins **24** via `.nvmrc`). The machine default of Node 16 will not run Vite 8 or Tailwind v4.

```sh
nvm use 24
npm install
```

## Scripts

```sh
npm run dev      # dev server on http://localhost:5173
npm run build    # tsc -b && vite build
npm run preview  # serve the production build
npm run lint     # oxlint
```

## Layout

```
src/
  components/
    layout/        app shell (sidebar, header)
    ui/            shadcn/ui components (generated — edit with care)
    theme_toggle.tsx
  hooks/           shadcn hooks (use-mobile)
  lib/utils.ts     cn() re-export
  pages/           screens
  index.css        Tailwind entry + shadcn design tokens
```

`@/*` is aliased to `src/*` in both `vite.config.ts` and `tsconfig*.json`.

## Adding components

```sh
npx shadcn@latest add <component>
```

Generated files occasionally ship an unused `import * as React` which trips `noUnusedLocals` during `npm run build`; delete the line when it happens.

## Current state

Scaffold only: an app shell (sidebar + header + theme toggle) and a static `TranslationsPage` demonstrating table, select, input, badge and toast. No routing, data layer or auth yet.
