import { useState } from "react"
import { Globe, Smartphone } from "lucide-react"
import { toast } from "sonner"

import { TemplateFieldEditor } from "@/components/templates/template_field_editor"
import { TemplatePreview } from "@/components/templates/template_preview"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import type { TargetProfile } from "@/config/target_profiles"
import { findNavLeaf } from "@/config/nav_items"
import { messageOf, saveTranslations } from "@/lib/api"
import {
  languages,
  SOURCE_LANGUAGE,
  type LanguageCode,
} from "@/lib/locale_data"
import {
  categoryLabel,
  fieldOf,
  ownerPath,
  templateKeyOf,
  type TemplateEntry,
  type TemplateFieldId,
} from "@/lib/template_data"
import { placeholderList, sampleValues } from "@/lib/template_preview"
import { cn } from "@/lib/utils"

type TemplateDialogProps = {
  entry: TemplateEntry
  profile: TargetProfile
  language: LanguageCode
  onClose: () => void
  /** Refetch the table — the progress column changed. */
  onSaved: () => void
}

type PreviewMode = "target" | "source"

/**
 * Translating one template: the fields on the left, the message as its reader
 * gets it on the right.
 *
 * Two panels rather than one screen because the two halves answer different
 * questions and both are needed at once — "does this sentence say the right
 * thing" is the left panel, "does this message still work" is the right one.
 * A subject line that overflows, a button label that wraps, a body whose
 * markup a translator broke and a notification cut off mid-word are all
 * invisible in a textarea and obvious in the preview.
 *
 * The dialog is mounted per template (keyed by id in the page), so its edits
 * are local state and closing it discards them — the same bulk-save shape as
 * the strings workspace, scoped to one message.
 */
export function TemplateDialog({
  entry,
  profile,
  language,
  onClose,
  onSaved,
}: TemplateDialogProps) {
  const { template, fields } = entry
  const [edits, setEdits] = useState<
    Partial<Record<TemplateFieldId, string>>
  >({})
  const [mode, setMode] = useState<PreviewMode>("target")
  const [isSaving, setIsSaving] = useState(false)

  const languageName =
    languages.find((item) => item.code === language)?.name ?? language
  const isRtl = languages.find((item) => item.code === language)?.rtl ?? false
  // Editing English is editing the source itself: the toggle would offer the
  // same text under two labels, so the preview keeps one.
  const isSource = language === SOURCE_LANGUAGE
  const previewMode: PreviewMode = isSource ? "target" : mode
  const leaf = findNavLeaf(template.owner.kind, template.owner.app)
  const OwnerIcon = template.owner.kind === "web" ? Globe : Smartphone

  const valueOf = (field: TemplateFieldId) =>
    edits[field] ?? fields.find((item) => item.field === field)?.target ?? ""

  const dirtyFields = Object.keys(edits) as TemplateFieldId[]

  const handleChange = (field: TemplateFieldId, value: string) => {
    setEdits((current) => ({ ...current, [field]: value }))
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const values: Record<string, string> = {}
      for (const field of dirtyFields) {
        values[templateKeyOf(template.id, field)] = edits[field] ?? ""
      }

      const { saved, file } = await saveTranslations(
        profile.path,
        language,
        values
      )
      setEdits({})
      onSaved()
      toast.success(
        `Saved ${saved} ${saved === 1 ? "field" : "fields"} of ${template.name}`,
        { description: `Written to ${file}` }
      )
    } catch (cause: unknown) {
      toast.error("Could not save", { description: messageOf(cause) })
    } finally {
      setIsSaving(false)
    }
  }

  // The preview renders one language at a time: the translation as it stands,
  // or the English to compare it against.
  const previewValues: Partial<Record<TemplateFieldId, string>> = {}
  for (const field of fields) {
    previewValues[field.field] =
      previewMode === "source" ? field.source : valueOf(field.field)
  }

  const placeholders = [
    ...new Set(fields.flatMap((field) => placeholderList(field.source))),
  ]

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose()
        }
      }}
    >
      <DialogContent className="grid h-[min(50rem,calc(100dvh-2rem))] w-[min(84rem,calc(100vw-2rem))] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 p-0 sm:max-w-none">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-4 py-3 pr-12">
          <DialogTitle>{template.name}</DialogTitle>
          <Badge variant="secondary">
            {categoryLabel[template.category]}
          </Badge>
          <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <OwnerIcon className="size-3.5" />
            {leaf?.leaf.title ?? template.owner.app}
            <span className="uppercase">{template.owner.kind}</span>
          </span>
          <DialogDescription className="text-xs">
            <span className="font-mono">{ownerPath(template.owner)}</span> ·
            created by {template.createdBy} · translating into {languageName}
          </DialogDescription>
        </header>

        <div className="grid min-h-0 grid-cols-1 lg:grid-cols-2">
          {/* Left: the fields. */}
          <div className="min-h-0 overflow-auto border-r">
            {fields.map((field) => (
              <TemplateFieldEditor
                key={field.field}
                channel={template.channel}
                field={fieldOf(template.channel, field.field)}
                value={field}
                current={valueOf(field.field)}
                isDirty={field.field in edits}
                language={language}
                profile={profile}
                rtl={isRtl}
                onChange={handleChange}
              />
            ))}

            {placeholders.length > 0 && (
              <section className="px-4 py-3">
                <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  Placeholders in this template
                </h4>
                <p className="text-muted-foreground mt-1 text-xs">
                  Keep every one of these, spelled exactly as it is. The preview
                  fills them with sample values.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {placeholders.map((placeholder) => (
                    <Badge
                      key={placeholder}
                      variant="outline"
                      className="font-mono"
                      title={sampleValues[placeholder] ?? "No sample value"}
                    >
                      {placeholder}
                    </Badge>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Right: the message as it will be received. */}
          <div className="bg-muted/20 min-h-0 overflow-auto">
            <div className="bg-muted/20 sticky top-0 z-10 flex items-center gap-2 border-b px-4 py-2 backdrop-blur">
              <h4 className="text-sm font-medium">Preview</h4>
              <div className="ml-auto flex gap-1">
                <ModeButton
                  isActive={previewMode === "target"}
                  onClick={() => setMode("target")}
                >
                  {languageName}
                </ModeButton>
                {!isSource && (
                  <ModeButton
                    isActive={previewMode === "source"}
                    onClick={() => setMode("source")}
                  >
                    English
                  </ModeButton>
                )}
              </div>
            </div>
            <div className="p-4">
              <TemplatePreview
                channel={template.channel}
                values={previewValues}
                appName={leaf?.leaf.title ?? template.owner.app}
                rtl={previewMode === "target" && isRtl}
              />
            </div>
          </div>
        </div>

        <footer className="bg-muted/50 flex items-center gap-3 border-t px-4 py-3">
          <span className="text-muted-foreground text-sm">
            {dirtyFields.length > 0
              ? `${dirtyFields.length} unsaved ${dirtyFields.length === 1 ? "field" : "fields"}`
              : `${entry.translated} of ${entry.total} fields translated`}
          </span>
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              disabled={isSaving}
              onClick={dirtyFields.length > 0 ? () => setEdits({}) : onClose}
            >
              {dirtyFields.length > 0 ? "Discard" : "Close"}
            </Button>
            <Button
              disabled={isSaving || dirtyFields.length === 0}
              onClick={handleSave}
            >
              {isSaving ? "Saving…" : "Save"}
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  )
}

function ModeButton({
  isActive,
  onClick,
  children,
}: {
  isActive: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      size="sm"
      variant={isActive ? "default" : "outline"}
      className={cn("h-7 px-2.5 text-xs", isActive && "pointer-events-none")}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}
