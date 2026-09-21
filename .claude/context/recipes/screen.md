# Recipe — add a target, a screen, or a route

Read `architecture.md` § *Screen selection* first. Most of what sounds like "a
new screen" is neither a new route nor a new page.

## Adding a target (an app whose strings someone translates)

This is the common case, and it is **two config edits and nothing else**.

1. `src/config/nav_items.ts` — add the leaf under its section. The `id` is the
   URL segment, so the route becomes `/{section.id}/{leaf.id}` for free.
2. `src/config/target_profiles.ts` — add the profile at the same `path`:

```ts
{
  path: "app/coach",
  kind: "ui",
  audience: "Coaches running visitations",
  tone: "Instructional, second person.",
  lengthBudget: 1.3,
  measured: false,
  note: "Not imported yet.",
}
```

`kind` decides the screen: `ui` renders `translations_page.tsx`, and `email` /
`sms` / `notification` render `templates_page.tsx`. `measured: false` marks a
profile inferred rather than measured — say so rather than inventing numbers.

No `bundle` means no seed, which is correct: the target opens on its profile
card and an invitation to add the first key. Do not point two targets at the
same bundle — each target is its own key namespace.

## Adding a genuinely new route

Only when the screen is not a target: the import wizard is the existing
example, because a language file does not say which app it belongs to.

1. `src/App.tsx` — a `<Route>` inside the `AppLayout` route. Static paths go
   above `:sectionId/:leafId`, which otherwise swallows them.
2. `src/pages/<name>_page.tsx` — the page owns the screen's state, calls the
   hooks, and passes data down.
3. Reach it from somewhere: a nav entry, or a link from the dashboard.

Filters that a link has to carry live in the query string, not in state —
`workspace_link.ts` builds those URLs, and `translations_page.tsx` reads them
back. A view worth linking to should survive being pasted into chat.

## Adding a content kind (a genuinely different screen shape)

Rare. It is a new member of `ContentKind` in `target_profiles.ts`, a branch in
`pages/target_page.tsx`, and a page. If the difference is *layout* rather than
*content* — denser rows, an extra meter — it is a profile field, not a kind.

## What a page owes

- `useState` for the screen's state; components below take props.
- One hook per request; `reload()` after a write.
- Errors shown inline where the data would have been, writes reported with a
  `sonner` toast, both through `messageOf(cause)`.
- An empty target is an empty list, not an error — nine of the ten targets have
  no keys yet.

Finish with `npm run build`, `npm run lint`, and `npm run context:map` for the
new file.
