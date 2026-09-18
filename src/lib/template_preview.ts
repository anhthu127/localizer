/**
 * Turning a template field into something that can be rendered as the reader
 * will see it.
 *
 * Two jobs, both needed before a preview pane is honest:
 *
 * 1. **Placeholders.** `Hi {name}, your code is {code}` previewed literally
 *    tells a translator nothing about length or word order. Sample values are
 *    substituted so the preview reads as a real message, and the sample for
 *    each placeholder is longer than the English word it replaces, because a
 *    name is where a layout actually breaks.
 * 2. **HTML.** An email body is markup, and the point of the pane is to render
 *    it. Rendering translator-supplied markup as-is would put whatever a
 *    bundle contains into this document, so the body is escaped first and only
 *    an explicit whitelist of tags is reintroduced — see `safeHtml`.
 */

const SAMPLES: Record<string, string> = {
  "{name}": "Nguyễn Thị Phương Mai",
  "{firstName}": "Phương Mai",
  "{coachName}": "Đặng Quốc Hùng",
  "{teacherName}": "Trần Bảo Ngọc",
  "{studentName}": "Lê Minh Khang",
  "{parentName}": "Phạm Thu Hà",
  "{schoolName}": "Riverside International School",
  "{campusName}": "Riverside — Thảo Điền Campus",
  "{className}": "Unit 14 — Morning B",
  "{unitName}": "Unit 14 · The Lost Kite",
  "{code}": "8F2K-40QD",
  "{link}": "https://app.grapeseed.example/invite/8F2K40QD",
  "{date}": "Thursday, 24 September",
  "{time}": "09:30",
  "{dueDate}": "Friday, 25 September",
  "{count}": "12",
  "{days}": "7",
  "{email}": "phuongmai@riverside.example",
  "{appName}": "GrapeSeed",
  "{senderName}": "GrapeSeed Support",
}

/** Every placeholder the samples cover — the dialog lists them. */
export const sampleValues = SAMPLES

/**
 * Substitutes the samples above. A placeholder with no sample is left standing
 * so the preview shows it unresolved rather than silently blank — an unknown
 * `{foo}` is a question for whoever wrote the English, not something to hide.
 */
export function fillSamples(value: string): string {
  return value.replace(/\{[^{}]*\}/g, (match) => SAMPLES[match] ?? match)
}

/** Tags an email body may use. Anything else is shown as text. */
const ALLOWED = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "a",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "blockquote",
  "span",
  "small",
])

/** Tags that never close — a body-balance check must not expect `</br>`. */
export const VOID_TAGS = new Set(["br", "hr", "img"])

/**
 * A lone `&` is escaped; one that already begins an entity — `&amp;`,
 * `&nbsp;`, `&#8212;` — is left alone, so a body written the way email bodies
 * are written previews as the characters the mail shows rather than as its own
 * source. Leaving entities intact costs nothing: a browser renders
 * `&lt;script&gt;` as text either way.
 */
const escapeText = (value: string) =>
  value
    .replace(/&(?!(#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);)/g, "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")

/**
 * `href` is the only attribute kept, and only when it goes somewhere sane.
 *
 * A `javascript:` or `data:` URL is dropped and the link previews as unlinked
 * text, which is the honest rendering — it is what a mail client does with it
 * too.
 */
function safeHref(attrs: string): string {
  const match = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs)
  const url = (match?.[2] ?? match?.[3] ?? match?.[4] ?? "").trim()

  // A placeholder is the usual case — most links in these mails are `{link}` —
  // so it has to survive the editor's round trip as well as the preview's.
  if (!url || !/^(https?:|mailto:|tel:|\{[^{}]+\})/i.test(url)) {
    return ""
  }
  return ` href="${escapeText(url)}"`
}

/**
 * Only the preview adds these, and only to a link that survived `safeHref`.
 * The *stored* body must not gain attributes nobody wrote: it is exported into
 * the product's own mail, where `target` and `rel` are that mail's business.
 */
const EXTERNAL = ' target="_blank" rel="noreferrer"'

const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g

/**
 * The body, rendered — safe to hand to `dangerouslySetInnerHTML`.
 *
 * One pass over the value. Everything between tags is escaped, so no text a
 * bundle contains can become markup. Every tag is looked up in the whitelist
 * and then *rebuilt* — the original is never passed through — so the only
 * attribute that survives is an `href` this file checked. A tag that is not on
 * the list, `<script>` included, is escaped and previews as its own text,
 * which is also the most useful thing to show a translator.
 *
 * Tags are read from the raw value rather than from escaped text, so an entity
 * the body already contained stays an entity: `&lt;b&gt;` previews as the
 * characters `<b>`, not as bold.
 */
export function safeHtml(value: string): string {
  let out = ""
  let last = 0

  for (const match of value.matchAll(TAG)) {
    const index = match.index ?? 0
    out += escapeText(value.slice(last, index))
    last = index + match[0].length

    const tag = match[2].toLowerCase()
    if (!ALLOWED.has(tag)) {
      out += escapeText(match[0])
    } else if (match[1]) {
      out += `</${tag}>`
    } else if (VOID_TAGS.has(tag)) {
      out += `<${tag}>`
    } else if (tag === "a") {
      const href = safeHref(match[3])
      out += `<a${href}${href ? EXTERNAL : ""}>`
    } else {
      out += `<${tag}>`
    }
  }

  return out + escapeText(value.slice(last))
}

/**
 * Tags a browser's `contenteditable` emits for the same meaning as ours, and
 * tags it emits that carry no meaning at all once their styling is stripped.
 */
const ALIASES: Record<string, string> = {
  b: "strong",
  i: "em",
  div: "p",
  strike: "s",
  del: "s",
}
const UNWRAP = new Set(["span", "font"])

/**
 * The rich text editor's normaliser: what comes out of `contenteditable`, in
 * the markup this system stores.
 *
 * Different from `safeHtml` in one way that matters. There, an unknown tag is
 * *escaped*, because the value is a bundle string and showing a translator the
 * literal `<script>` they are about to ship is the useful thing. Here it is
 * *unwrapped* — tag dropped, text kept — because the markup was produced by
 * the browser, not typed by a person: a `<span style>` or a `<font>` is
 * styling the editor added, and text a translator typed arrives already
 * escaped by the DOM.
 *
 * Text is passed through untouched for that same reason: `innerHTML` has
 * already escaped it exactly once, and escaping it again would store `&amp;lt;`
 * where the mail wants `&lt;`.
 */
export function cleanHtml(value: string): string {
  let out = ""
  let last = 0

  for (const match of value.matchAll(TAG)) {
    const index = match.index ?? 0
    out += value.slice(last, index)
    last = index + match[0].length

    const raw = match[2].toLowerCase()
    const tag = ALIASES[raw] ?? raw

    if (UNWRAP.has(tag) || !ALLOWED.has(tag)) {
      continue
    }
    if (match[1]) {
      out += `</${tag}>`
    } else if (VOID_TAGS.has(tag)) {
      out += `<${tag}>`
    } else {
      out += `<${tag}${tag === "a" ? safeHref(match[3]) : ""}>`
    }
  }

  return out + value.slice(last)
}

/** Body text with the samples filled in and the markup rendered. */
export function previewHtml(value: string): string {
  return safeHtml(fillSamples(value))
}

/** Plain-text preview: the samples filled in, markup left as characters. */
export function previewText(value: string): string {
  return fillSamples(value)
}

/**
 * Placeholders in a value, in the order they appear, deduplicated.
 *
 * `placeholdersOf` in `lib/validation.ts` sorts and keeps duplicates because it
 * compares two values; the dialog's placeholder list wants reading order.
 */
export function placeholderList(value: string): string[] {
  return [...new Set(value.match(/\{[^{}]*\}/g) ?? [])]
}
