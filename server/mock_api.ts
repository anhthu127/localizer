/**
 * Mounts the mock localization backend on the Vite dev server at `/api`.
 *
 * The routes themselves are in `src/mock/router.ts`, written against `Request`
 * and `Response`; this file is only the adapter between those and Node's
 * `IncomingMessage`/`ServerResponse`, plus the file-backed store that makes
 * the data something you can open in the editor.
 *
 * The same router runs in the browser when the built app is deployed to a
 * static host — see `src/mock/browser_backend.ts`. Which is why a route added
 * here works in the deployed demo without being written twice.
 *
 * When the real service is ready, drop this plugin from `vite.config.ts`,
 * delete `src/mock/`, and set `VITE_API_URL`.
 */

import type { IncomingMessage, ServerResponse } from "node:http"
import type { Plugin } from "vite"

import { handleRequest } from "../src/mock/router.ts"
import { createStore, type Store } from "../src/mock/store.ts"
import { nodeFileStore, nodeSeeds } from "./node_file_store.ts"

const BASE_PATH = "/api"
/** `Request` insists on an absolute URL; nothing downstream reads the origin. */
const ORIGIN = "http://localhost"

export function mockApi(): Plugin {
  let store: Store | null = null

  return {
    name: "localizer-mock-api",

    configResolved(config) {
      store = createStore(nodeFileStore(config.root), nodeSeeds(config.root))
    },

    configureServer(server) {
      server.middlewares.use(BASE_PATH, (req, res, next) => {
        if (!store) {
          next()
          return
        }

        serve(store, req, res).catch((cause: unknown) => {
          const message = cause instanceof Error ? cause.message : String(cause)
          server.config.logger.error(
            `[mock-api] ${req.method} ${req.url} — ${message}`
          )
          res.statusCode = 500
          res.setHeader("content-type", "application/json; charset=utf-8")
          res.end(JSON.stringify({ error: message }))
        })
      })
    },
  }
}

async function serve(
  store: Store,
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  // Mounted at /api, so the prefix is already stripped from req.url.
  const url = new URL(req.url ?? "/", ORIGIN)
  const response = await handleRequest(
    store,
    await toRequest(req, url),
    url.pathname
  )

  res.statusCode = response.status
  response.headers.forEach((value, name) => {
    res.setHeader(name, value)
  })

  const body = Buffer.from(await response.arrayBuffer())
  if (body.length === 0) {
    res.end()
    return
  }
  res.setHeader("content-length", body.length)
  res.end(body)
}

/**
 * Headers Node reports about the connection rather than about the message.
 * `Request` recomputes them from the body it is given, and rejects some of
 * them outright, so they must not be copied across.
 */
const CONNECTION_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
])

async function toRequest(req: IncomingMessage, url: URL): Promise<Request> {
  const method = (req.method ?? "GET").toUpperCase()
  const headers = new Headers()

  for (const [name, value] of Object.entries(req.headers)) {
    if (CONNECTION_HEADERS.has(name.toLowerCase())) {
      continue
    }
    for (const item of Array.isArray(value) ? value : [value ?? ""]) {
      headers.append(name, item)
    }
  }

  const body =
    method === "GET" || method === "HEAD" ? "" : await read(req)

  return new Request(url, { method, headers, body: body || undefined })
}

async function read(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString("utf8")
}
