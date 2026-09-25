/**
 * Dates, formatted the same way everywhere they are shown.
 *
 * A fixed locale rather than the browser's: an audit column that reads
 * `03/02/2026` to one reviewer and `02/03/2026` to the next is worse than no
 * column, and the team shares screenshots.
 */

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
})

const dayTimeFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

/** `11 Feb 2026`. Returns the raw value unchanged if it is not a date. */
export function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : dayFormat.format(date)
}

/** `11 Feb 2026, 10:20` - for a stamp where the time of day matters. */
export function formatDateTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : dayTimeFormat.format(date)
}
