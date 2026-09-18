import { defaultNavPath } from "@/config/nav_items"

/**
 * Builds a workspace URL with its filters in the query string, so a link from
 * the dashboard opens the list already scoped — `/web/school?lang=vi&group=nav`.
 *
 * `q` is the row search, which is how the add-key screen links straight at one
 * key in a given language.
 */
export function workspaceLink(
  filters: { lang?: string; group?: string; q?: string },
  path: string = defaultNavPath
) {
  const query = new URLSearchParams()
  for (const name of ["lang", "group", "q"] as const) {
    const value = filters[name]
    if (value) {
      query.set(name, value)
    }
  }
  const search = query.toString()
  return search ? `${path}?${search}` : path
}
