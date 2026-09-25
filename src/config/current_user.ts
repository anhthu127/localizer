/**
 * Who the app is acting as.
 *
 * There is no sign-in yet, so this is a placeholder the writes travel with:
 * `POST /api/keys` and `PUT /api/translations/:lang` carry the name, and the
 * backend stamps it onto the audit trail the workspace shows.
 *
 * A real service takes the author from the session and ignores what the
 * browser claims - an audit trail the client can forge is not one. When that
 * lands, this file goes away and `lib/api.ts` stops sending the field; nothing
 * else has to change.
 */
export type CurrentUser = {
  /** Shown verbatim in the Added / Updated columns. */
  name: string
}

export const currentUser: CurrentUser = {
  name: "Irene Do",
}
