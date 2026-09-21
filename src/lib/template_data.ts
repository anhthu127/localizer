/**
 * Message templates — the domain model behind the Others targets.
 *
 * `docs/target_apps_ui.md` §9 asks whether email, SMS and notification text is
 * stored as ordinary key/value strings or as template records. This file is the
 * answer: both. A template is a record with its own metadata — name, who
 * receives it, which product sends it, who created it — and its text is
 * ordinary keys in that channel's bundle, one per field:
 *
 *     invite_coach.subject   invite_coach.body   invite_coach.cta   …
 *
 * So `statusOf`, `checkTranslation`, the save route, the export and the
 * dashboard's coverage all keep working unchanged; only the screen differs. The
 * registry adds what a key cannot carry: a human name for the whole message,
 * and the category and owner a translator filters by.
 *
 * No I/O here — `src/mock/store.ts` imports this module directly, so the browser
 * and the backend cannot disagree about a template's field schema.
 */

import {
  statusOf,
  type LanguageCode,
  type LocaleBundle,
  type TranslationStatus,
} from "./locale_data.ts"

/**
 * The three formats. A channel decides the field schema, the editor controls
 * and the preview chrome; it is the same axis as `ContentKind` in
 * `config/target_profiles.ts`, which builds on this type.
 */
export type TemplateChannel = "email" | "sms" | "notification"

/**
 * Who receives the message, which is how a translator narrows a list of fifty
 * templates down to the ones they were asked about: the register for a coach is
 * not the register for a student.
 */
export type TemplateCategory =
  | "coach"
  | "teacher"
  | "parent"
  | "student"
  | "admin"
  | "staff"

/** The product that sends it — `{ kind: "web", app: "school" }`. */
export type TemplateOwner = {
  kind: "web" | "app"
  /** A nav leaf id, so the table can link to that target. */
  app: string
}

export type TemplateFieldId =
  | "subject"
  | "body"
  | "cta"
  | "footer"
  | "message"
  | "title"

export type TemplateField = {
  id: TemplateFieldId
  label: string
  /** `line` — one-line input. `paragraph` — growing textarea. `rich` — HTML body. */
  control: "line" | "paragraph" | "rich"
  /** `html` fields get the tag-balance and link checks; `text` fields do not. */
  format: "text" | "html"
  /** One line telling the translator what this field is for. */
  hint: string
  /** Hard ceiling the backend enforces — over it is an error. */
  maxLength?: number
  /**
   * Soft ceiling the channel imposes: a push title over 65 characters is not
   * rejected, it is silently truncated on the lock screen. Shown as a counter
   * that turns amber, not as a blocking error.
   */
  budget?: number
}

/**
 * The field schema per channel.
 *
 * Email is subject, body, CTA and footer: the greeting and the mail's own
 * heading live inside the rich-text body, where a translator can reorder or
 * drop them the way the target language wants. The body is capped at
 * the 4,000 characters the legacy string
 * `notificationcreate.description.maxlength` says the backend enforces.
 */
export const channelFields: Record<TemplateChannel, TemplateField[]> = {
  email: [
    {
      id: "subject",
      label: "Subject",
      control: "line",
      format: "text",
      hint: "The mail's title, and the only line most people read. Front-load the point — most clients cut it around 60 characters.",
      budget: 60,
    },
    {
      id: "body",
      label: "Body",
      control: "rich",
      format: "html",
      hint: "Starts with the mail's heading — the toolbar's Heading button makes one. Keep every link and every {placeholder} the English has.",
      maxLength: 4000,
    },
    {
      id: "cta",
      label: "Button label",
      control: "line",
      format: "text",
      hint: "Two to four words. It has to fit a button at phone width.",
      budget: 28,
    },
    {
      id: "footer",
      label: "Footer",
      control: "paragraph",
      format: "text",
      hint: "The line under the button — why they got this mail, and how to stop.",
    },
  ],
  sms: [
    {
      id: "message",
      label: "Message",
      control: "paragraph",
      format: "text",
      hint: "One segment if you can. Nine of the twelve languages bill at 70 characters, not 160.",
    },
  ],
  notification: [
    {
      id: "title",
      label: "Title",
      control: "line",
      format: "text",
      hint: "The bold first line. Truncated past roughly 65 characters on a lock screen.",
      budget: 65,
    },
    {
      id: "body",
      label: "Body",
      control: "paragraph",
      format: "text",
      hint: "One sentence. Two lines is all a collapsed notification shows.",
      budget: 240,
    },
  ],
}

export function fieldsOf(channel: TemplateChannel): TemplateField[] {
  return channelFields[channel]
}

export function fieldOf(
  channel: TemplateChannel,
  id: TemplateFieldId
): TemplateField {
  const field = fieldsOf(channel).find((item) => item.id === id)
  if (!field) {
    throw new Error(`No field "${id}" in a ${channel} template`)
  }
  return field
}

/** One template's registry row — `server-data/templates.json`, one of them. */
export type TemplateRecord = {
  /** Also the key prefix: `invite_coach` owns `invite_coach.subject`. */
  id: string
  name: string
  channel: TemplateChannel
  category: TemplateCategory
  /** The menu target that owns the keys — `others/email`. */
  target: string
  owner: TemplateOwner
  createdBy: string
  createdAt: string
}

/** One field of one template, in one language. */
export type TemplateFieldValue = {
  field: TemplateFieldId
  source: string
  target: string
  status: TranslationStatus
}

/**
 * A template with its text, as the list screen and the translate dialog both
 * receive it.
 *
 * The values travel with the summary rather than behind a second request: a
 * channel holds tens of templates of six short fields, so the whole thing is a
 * few kilobytes and the dialog can open on data the table already has.
 */
export type TemplateEntry = {
  template: TemplateRecord
  fields: TemplateFieldValue[]
  translated: number
  total: number
  /** Translated fields a check flagged — see `lib/validation.ts`. */
  needsReview: number
}

/** `invite_coach` + `subject` → `invite_coach.subject`. */
export function templateKeyOf(id: string, field: TemplateFieldId): string {
  return `${id}.${field}`
}

/** `{ kind: "web", app: "school" }` → `web/school`, a route. */
export function ownerPath(owner: TemplateOwner): string {
  return `${owner.kind}/${owner.app}`
}

export const channelLabel: Record<TemplateChannel, string> = {
  email: "Email template",
  sms: "SMS template",
  notification: "Notification template",
}

export const categoryLabel: Record<TemplateCategory, string> = {
  coach: "Coach",
  teacher: "Teacher",
  parent: "Parent",
  student: "Student",
  admin: "Admin",
  staff: "Staff",
}

/** Every category, in the order the filter lists them. */
export const templateCategories = Object.keys(
  categoryLabel
) as TemplateCategory[]

/**
 * Builds a template's field list from one channel's bundles.
 *
 * Fields with no English source are left out entirely rather than shown empty:
 * not every mail carries a footer, and a field nobody wrote in English would
 * otherwise sit in the progress count forever, untranslatable.
 */
export function entryOf(
  template: TemplateRecord,
  source: LocaleBundle,
  values: LocaleBundle,
  language: LanguageCode,
  /** Returns true when a translated field is flagged by a check. */
  flagged: (value: TemplateFieldValue) => boolean
): TemplateEntry {
  const fields: TemplateFieldValue[] = []
  let translated = 0
  let needsReview = 0

  for (const field of fieldsOf(template.channel)) {
    const key = templateKeyOf(template.id, field.id)
    const sourceText = source[key] ?? ""
    if (!sourceText) {
      continue
    }

    const value: TemplateFieldValue = {
      field: field.id,
      source: sourceText,
      target: values[key] ?? "",
      status: statusOf(sourceText, values[key], language),
    }
    fields.push(value)

    if (value.status === "translated") {
      translated += 1
      if (flagged(value)) {
        needsReview += 1
      }
    }
  }

  return { template, fields, translated, total: fields.length, needsReview }
}
