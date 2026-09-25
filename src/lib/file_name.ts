/**
 * Shared by the export dialog and the server route, so the names the fields
 * resolve to are the names the archive gets.
 *
 * The browser needs this, not only the server: Vite's dev server refuses a URL
 * containing `../../` outright, so an unsanitised name would never reach the
 * route to be cleaned up there.
 */

/** No separators, no traversal, no control characters, nothing unbounded. */
function sanitize(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\p{C}/gu, "")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 100)
}

/** The archive's own name, without its extension. */
export function safeFileName(name: string, fallback: string): string {
  return sanitize(name.replace(/\.zip$/i, "")) || fallback
}

/**
 * The name of one file inside the archive.
 *
 * The extension is left alone rather than forced to `.json` - an app that
 * wants `en.arb` or `messages_en.js` is not doing anything wrong.
 */
export function safeEntryName(name: string, fallback: string): string {
  return sanitize(name) || fallback
}

/** `{lang}` is the language code - `{lang}.json` → `vi.json`. */
export const FILE_NAME_TOKEN = "{lang}"

export function applyNamePattern(pattern: string, code: string): string {
  return pattern.replaceAll(FILE_NAME_TOKEN, code)
}
