/**
 * Per-row checks on a translation.
 *
 * These carry more weight than they used to. Status no longer compares the
 * target value to the English one, so a bundle that is a verbatim copy of
 * English — or, as with `ms.json`, a copy of a different language altogether —
 * reads as fully translated. These checks are the only automatic signal left
 * that a value is wrong.
 *
 * `scripts/generate_coverage.mjs` repeats the script, whitespace and
 * placeholder rules so the dashboard can count them without loading every
 * bundle; this file is the canonical definition. Keep the two in step.
 */

import type { LanguageCode } from "@/lib/locale_data"

export type IssueLevel = "error" | "warning"

export type RowIssue = {
  id: "placeholder" | "whitespace" | "script" | "length" | "max-length"
  level: IssueLevel
  message: string
}

/** The only placeholder syntax in the data: `{name}`, `{0}`, `{startDate}`. */
export function placeholdersOf(value: string): string[] {
  return (value.match(/\{[^{}]*\}/g) ?? []).sort()
}

const sameMembers = (a: string[], b: string[]) =>
  a.length === b.length && a.every((item, index) => item === b[index])

/**
 * Expected dominant script per language, for the mislabelled-bundle check.
 *
 * `allows` lists other scripts that are legitimate in the language — Japanese
 * is written in kana *and* kanji, and kanji sit in the same Unicode block as
 * Chinese, so without it every Japanese string reads as Chinese.
 */
const scriptOf: Record<
  LanguageCode,
  { label: string; pattern: RegExp; allows?: string[] }
> = {
  en: { label: "Latin", pattern: /[A-Za-zÀ-ɏ]/ },
  es: { label: "Latin", pattern: /[A-Za-zÀ-ɏ]/ },
  ms: { label: "Latin", pattern: /[A-Za-zÀ-ɏ]/ },
  vi: { label: "Latin", pattern: /[A-Za-zÀ-ɏẠ-ỹ]/ },
  "zh-Hans": { label: "Chinese", pattern: /[一-鿿]/ },
  ja: {
    label: "Japanese",
    pattern: /[぀-ヿ一-鿿]/,
    allows: ["Chinese", "Japanese kana"],
  },
  ko: { label: "Hangul", pattern: /[가-힯]/ },
  ru: { label: "Cyrillic", pattern: /[Ѐ-ӿ]/ },
  mn: { label: "Cyrillic", pattern: /[Ѐ-ӿ]/ },
  "ar-SA": { label: "Arabic", pattern: /[؀-ۿ]/ },
  th: { label: "Thai", pattern: /[฀-๿]/ },
  my: { label: "Burmese", pattern: /[က-႟]/ },
  km: { label: "Khmer", pattern: /[ក-៿]/ },
}

/** Scripts a value can carry that are not the expected one — each a red flag. */
const foreignScripts: { label: string; pattern: RegExp }[] = [
  { label: "Chinese", pattern: /[一-鿿]/ },
  { label: "Japanese kana", pattern: /[぀-ヿ]/ },
  { label: "Hangul", pattern: /[가-힯]/ },
  { label: "Cyrillic", pattern: /[Ѐ-ӿ]/ },
  { label: "Arabic", pattern: /[؀-ۿ]/ },
  { label: "Thai", pattern: /[฀-๿]/ },
  { label: "Khmer", pattern: /[ក-៿]/ },
  { label: "Burmese", pattern: /[က-႟]/ },
]

/**
 * Two rules, both needed to catch the swap in the sample data:
 * `ms.json` holds Chinese (a script the language never uses), and
 * `zh-Hans.json` holds English (no Chinese at all).
 */
function scriptIssue(value: string, language: LanguageCode): RowIssue | null {
  const expected = scriptOf[language]
  if (!expected) {
    return null
  }

  for (const script of foreignScripts) {
    if (
      script.label === expected.label ||
      expected.allows?.includes(script.label)
    ) {
      continue
    }
    if (script.pattern.test(value)) {
      return {
        id: "script",
        level: "warning",
        message: `Contains ${script.label} characters — expected ${expected.label}`,
      }
    }
  }

  // Latin is allowed everywhere (product names, codes), so "no expected script"
  // only reads as a problem for languages that do not write in Latin.
  const letters = value.replace(/[^\p{L}]/gu, "")
  if (
    expected.label !== "Latin" &&
    letters.length >= 4 &&
    !expected.pattern.test(value)
  ) {
    return {
      id: "script",
      level: "warning",
      message: `No ${expected.label} characters — this may still be English`,
    }
  }

  return null
}

type CheckOptions = {
  language: LanguageCode
  /** Ratio over the source length past which the row warns. */
  lengthBudget: number
  /** Hard ceiling the backend enforces, where one is known. */
  maxLength?: number
}

/** Ordered most severe first, so a row can show the worst one inline. */
export function checkTranslation(
  source: string,
  target: string,
  { language, lengthBudget, maxLength }: CheckOptions
): RowIssue[] {
  if (!target) {
    return []
  }

  const issues: RowIssue[] = []

  const wanted = placeholdersOf(source)
  const found = placeholdersOf(target)
  if (!sameMembers(wanted, found)) {
    const missing = wanted.filter((item) => !found.includes(item))
    const extra = found.filter((item) => !wanted.includes(item))
    const parts = [
      missing.length ? `missing ${missing.join(" ")}` : "",
      extra.length ? `unexpected ${extra.join(" ")}` : "",
    ].filter(Boolean)

    issues.push({
      id: "placeholder",
      level: "error",
      message: `Placeholders ${parts.join(", ")}`,
    })
  }

  if (maxLength && target.length > maxLength) {
    issues.push({
      id: "max-length",
      level: "error",
      message: `${target.length.toLocaleString()} characters, over the ${maxLength.toLocaleString()} limit`,
    })
  }

  const script = scriptIssue(target, language)
  if (script) {
    issues.push(script)
  }

  if (target !== target.trim() && source === source.trim()) {
    issues.push({
      id: "whitespace",
      level: "warning",
      message: "Leading or trailing space the English source does not have",
    })
  }

  if (source.length >= 4 && target.length > source.length * lengthBudget) {
    const ratio = (target.length / source.length).toFixed(1)
    issues.push({
      id: "length",
      level: "warning",
      message: `${ratio}× the English length — may not fit the layout`,
    })
  }

  return issues
}

/* --------------------------------------------------------------------------
 * SMS
 * ------------------------------------------------------------------------ */

const GSM7 =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
/** Sent as an escape pair, so each costs two GSM-7 characters. */
const GSM7_EXTENDED = "^{}\\[~]|€"

const gsm7 = new Set(GSM7)
const gsm7Extended = new Set(GSM7_EXTENDED)

export type SmsInfo = {
  encoding: "GSM-7" | "UCS-2"
  /** Billed units, which is not the same as `value.length` for GSM-7 escapes. */
  units: number
  segments: number
  /** Units left in the current segment. */
  remaining: number
}

/**
 * A segment holds 160 GSM-7 characters or 70 UCS-2 ones, dropping to 153 / 67
 * once a message splits, because each part carries a concatenation header.
 *
 * Nine of the twelve target languages have no GSM-7 representation at all, so
 * for them every message is UCS-2 and the budget is 70 — which is why this
 * meter sits on the row rather than in a validation report nobody opens.
 */
export function smsInfo(value: string): SmsInfo {
  let units = 0
  let unicode = false

  for (const char of value) {
    if (gsm7.has(char)) {
      units += 1
    } else if (gsm7Extended.has(char)) {
      units += 2
    } else {
      unicode = true
      // Astral characters (emoji) take two UTF-16 code units.
      units += char.length
    }
  }

  if (unicode) {
    // GSM-7 escape counting does not apply once the message is UCS-2.
    units = [...value].reduce((sum, char) => sum + char.length, 0)
  }

  const single = unicode ? 70 : 160
  const multi = unicode ? 67 : 153

  if (units === 0) {
    return { encoding: "GSM-7", units: 0, segments: 0, remaining: single }
  }

  const segments = units <= single ? 1 : Math.ceil(units / multi)
  const capacity = segments === 1 ? single : multi * segments

  return {
    encoding: unicode ? "UCS-2" : "GSM-7",
    units,
    segments,
    remaining: capacity - units,
  }
}
