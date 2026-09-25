/**
 * One profile per menu target, keyed by its URL path (`web/school`).
 *
 * Each target is a separate application in the legacy model - its own key
 * namespace, its own import, its own publish - so the workspace is not one
 * screen showing ten filters of the same data. The profile is what makes the
 * screen differ: which editor the row renders, which meters sit beside it, and
 * what the translator is told before they start.
 *
 * See `docs/target_apps_ui.md` for how each profile was arrived at. Profiles
 * marked `measured: false` are inferred from the target name and the legacy
 * brief; the doc lists the question that settles each one.
 */

import type { TemplateChannel } from "@/lib/template_data"

/**
 * The axis that actually drives layout - more than Web / App / Messages does.
 *
 * `ui`           thousands of short labels; dense virtualized grid.
 * `email`        multi-field HTML messages; a table of templates, and an
 *                editor beside a rendered preview.
 * `sms`          one tiny field under a hard segment budget, per template.
 * `notification` a title and a body, both truncated by the OS.
 *
 * The last three are channels of the same thing - see `lib/template_data.ts` -
 * so they share a screen: a template table, and a two-panel translate dialog.
 */
export type ContentKind = "ui" | TemplateChannel

/** Targets whose content is message templates rather than loose keys. */
export function isTemplateKind(kind: ContentKind): kind is TemplateChannel {
  return kind !== "ui"
}

export type TargetProfile = {
  /** `${sectionId}/${leafId}`, the same shape as the route. */
  path: string
  kind: ContentKind
  /** Who reads the strings in the shipped product. */
  audience: string
  /** Register the copy has to keep; shown in the workspace header. */
  tone: string
  /**
   * The sample data this target owns: `school` is the one real application
   * export in `sample-data/locale`, `templates` is the message seed in
   * `sample-data/templates.json`. Targets without either show their profile
   * and an explicit "not imported" state rather than borrowing School's keys.
   */
  bundle?: "school" | "templates"
  /**
   * Ratio over the source length past which a translation is flagged as at
   * risk of breaking the layout. Mobile targets sit tighter than web ones
   * because a phone label has nowhere to overflow to.
   */
  lengthBudget: number
  /** Hard ceiling the backend enforces on a value, where one is known. */
  maxLength?: number
  /** False when the profile is still inferred rather than measured. */
  measured: boolean
  /** One line of context for the workspace header. */
  note: string
}

const profiles: TargetProfile[] = [
  {
    path: "web/school",
    kind: "ui",
    audience: "School and campus administrators, regional coaches, staff",
    tone: "Administrative. Domain terms stay consistent - unit plan, visitation, campus, license.",
    bundle: "school",
    lengthBudget: 1.5,
    measured: true,
    note: "3,339 keys across 156 groups. Half of them repeat an English string used elsewhere.",
  },
  {
    path: "web/curriculum",
    kind: "ui",
    audience: "Teachers and curriculum staff",
    tone: "Instructional. Shares unit, lesson and playlist vocabulary with School.",
    lengthBudget: 1.5,
    measured: false,
    note: "No source bundle imported. Terminology must agree with School.",
  },
  {
    path: "web/training",
    kind: "ui",
    audience: "Teacher trainers and trainees",
    tone: "Instructional, longer form. Shares coaching vocabulary with School.",
    lengthBudget: 1.5,
    measured: false,
    note: "No source bundle imported. Expect fewer keys than School, longer strings.",
  },
  {
    path: "web/content",
    kind: "ui",
    audience: "Internal content editors",
    tone: "Internal tooling language.",
    lengthBudget: 1.5,
    measured: false,
    note: "No source bundle imported. May also hold file assets - see open question 3.",
  },
  {
    path: "app/baby",
    kind: "ui",
    audience: "Young learners and the adults reading with them",
    tone: "Plain, warm, read-aloud. No admin jargon, no abbreviations.",
    lengthBudget: 1.2,
    measured: false,
    note: "No source bundle imported. Phone-width labels - keep translations close to the source length.",
  },
  {
    path: "app/parent",
    kind: "ui",
    audience: "Parents",
    tone: "Plain and reassuring. Avoid internal terms like campus or license.",
    lengthBudget: 1.2,
    measured: false,
    note: "No source bundle imported. Phone-width labels - keep translations close to the source length.",
  },
  {
    path: "app/student",
    kind: "ui",
    audience: "Students",
    tone: "Plain and direct, school-age reading level.",
    lengthBudget: 1.2,
    measured: false,
    note: "No source bundle imported. Phone-width labels - keep translations close to the source length.",
  },
  {
    path: "others/email",
    kind: "email",
    audience:
      "Coaches, teachers, parents, students and administrators - one template per audience",
    tone: "Set by the template's category. An invite to a coach and an invite to a parent are different copy.",
    bundle: "templates",
    lengthBudget: 2,
    maxLength: 4000,
    measured: false,
    note: "Ten templates, six fields each. Keep every tag, every link and every {placeholder} the English has.",
  },
  {
    path: "others/sms",
    kind: "sms",
    audience: "The same people, on a phone",
    tone: "Terse. Every character costs - say it in one segment if you can.",
    bundle: "templates",
    lengthBudget: 1.1,
    measured: false,
    note: "Five templates of one field. Nine of the twelve languages bill at 70 characters, not 160.",
  },
  {
    path: "others/notification",
    kind: "notification",
    audience: "Existing users, on a lock screen",
    tone: "Factual and short. The reader is scanning, not reading.",
    bundle: "templates",
    lengthBudget: 1.4,
    measured: false,
    note: "Six templates of a title and a body. The OS truncates the title around 65 characters.",
  },
]

const byPath = new Map(profiles.map((profile) => [profile.path, profile]))

/**
 * Takes the route segments rather than nav objects, so the workspace can read a
 * profile before it knows whether the path names a real target.
 *
 * Falls back to a plain UI-strings profile - adding a nav leaf should not be
 * able to crash the workspace.
 */
export function profileOf(sectionId?: string, leafId?: string): TargetProfile {
  const path = `${sectionId}/${leafId}`

  return (
    byPath.get(path) ?? {
      path,
      kind: "ui",
      audience: "Unknown",
      tone: "No profile recorded for this target yet.",
      lengthBudget: 1.5,
      measured: false,
      note: "No profile recorded. Add one in src/config/target_profiles.ts.",
    }
  )
}

export const targetCount = profiles.length

/** Targets with data in `sample-data` - School and the three message channels. */
export const targetsWithBundle = profiles.filter(
  (profile) => profile.bundle
).length

export const kindLabel: Record<ContentKind, string> = {
  ui: "UI strings",
  email: "Email templates",
  sms: "SMS templates",
  notification: "Notification templates",
}
