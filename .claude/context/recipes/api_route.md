# Recipe — add or change an API route

Three files move together. Skipping one is how the contract drifts.

## 1. `src/lib/api_types.ts` — the contract, first

Add the request and response types, with the route in the docblock above them:

```ts
/** `GET /api/history?target=&key=` — every write to one key, newest first. */
export type HistoryResponse = {
  target: string
  key: string
  entries: HistoryEntry[]
}
```

This file is the document handed to the backend author. It imports types from
`locale_data.ts` and `template_data.ts` and defines nothing domain-shaped of
its own — a new domain concept belongs in `lib/`, not here.

## 2. `src/mock/router.ts` — answer it

Routes are `if` blocks in `route()`, matched on method and path, in no
significant order. A static path is a string compare; a parameterised one is a
regex on `path`:

```ts
if (method === "GET" && path === "/history") {
  return json(
    200,
    store.history(
      required(query.get("target"), "target"),
      required(query.get("key"), "key")
    )
  )
}
```

- `required(value, name)` throws `HttpError(400)` with a usable message.
- `body<T>(request)` parses JSON.
- `json(status, value)`, `empty()` build the response.
- Throw `HttpError(status, message)` for anything expected;
  `handleRequest` turns it into `{ error }`, which `lib/api.ts` unwraps into an
  `ApiError` and the screen shows as a sentence.

The work itself goes in `src/mock/store.ts`, not in the router. The router
parses and delegates.

**Take `?target=` unless the route genuinely spans every app.** Only
`/coverage` and `/reset` do.

## 3. `src/lib/api.ts` — call it

One exported function per route, returning the response type:

```ts
export function fetchHistory(target: string, key: string) {
  return request<HistoryResponse>(`/history?${query({ target, key })}`)
}
```

`request<T>` sends, unwraps `{ error }` into an `ApiError` and returns the
parsed body. `query({ … })` builds and encodes the search string, skipping
undefined values — build one by hand and a target’s `/` goes through raw.
Nothing above this file sees a URL or a status code.

## 4. A hook, if a screen reads it on mount

`src/hooks/use_<thing>.ts`, the same shape as its neighbours:
`{ data, isLoading, error, reload }`, a `token` of the arguments so a stale
response cannot overwrite a fresh one, and a `nonce` that `reload()` bumps.
Copy `use_translation_rows.ts` — it is the reference implementation.

A one-off write (a dialog's save) needs no hook. Call `lib/api.ts` from the
component and call the page's `reload` afterwards.

## 5. Document it

Add the row to the route table in `README.md`. Then:

```sh
npm run build
npm run lint
```

## Storage, if the route needs new data

`src/mock/store.ts` reads and writes through `FileStore` — paths like
`keys.json`, `translations/<target>/<code>.json`, `audit/<target>/<code>.json`.
A new document means a new path there and, if it has to exist before anyone
writes one, a seed in `src/mock/file_store.ts`'s seed interface plus both
implementations (`server/node_file_store.ts` and `src/mock/browser_backend.ts`).
Run `npm run mock:reset` to re-seed the dev server's copy; the browser's copy
clears with site data.
