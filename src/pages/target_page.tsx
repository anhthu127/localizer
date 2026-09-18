import { useParams } from "react-router"

import { isTemplateKind, profileOf } from "@/config/target_profiles"
import { TemplatesPage } from "@/pages/templates_page"
import { TranslationsPage } from "@/pages/translations_page"

/**
 * Route: `/:sectionId/:leafId` — one component per target, chosen by the
 * target's content kind rather than by its section.
 *
 * Web and App targets hold thousands of loose UI strings and get the
 * virtualized grid. The Messages channels hold email, SMS and notification
 * *templates* — a handful of fields that are one message, with metadata a key
 * cannot carry — and get a table and a translate dialog.
 *
 * The branch lives here rather than inside either screen so neither has to
 * render hooks it does not use, and so the route stays one line in `App.tsx`.
 */
export function TargetPage() {
  const { sectionId, leafId } = useParams()
  const profile = profileOf(sectionId, leafId)

  return isTemplateKind(profile.kind) ? <TemplatesPage /> : <TranslationsPage />
}
