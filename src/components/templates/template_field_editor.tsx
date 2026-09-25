import { useState } from "react"
import {
  AlertTriangle,
  ClipboardPaste,
  Code2,
  Copy,
  Info,
} from "lucide-react"
import { toast } from "sonner"

import { RichTextEditor } from "@/components/templates/rich_text_editor"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { TargetProfile } from "@/config/target_profiles"
import { copyText } from "@/lib/clipboard"
import type { LanguageCode } from "@/lib/locale_data"
import type {
  TemplateChannel,
  TemplateField,
  TemplateFieldValue,
} from "@/lib/template_data"
import { safeHtml } from "@/lib/template_preview"
import { cn } from "@/lib/utils"
import { checkTranslation, smsInfo } from "@/lib/validation"

type TemplateFieldEditorProps = {
  channel: TemplateChannel
  field: TemplateField
  value: TemplateFieldValue
  /** The live value, which is the saved one until someone types. */
  current: string
  isDirty: boolean
  language: LanguageCode
  profile: TargetProfile
  rtl?: boolean
  onChange: (field: TemplateField["id"], value: string) => void
}

/**
 * One field of a template: the English above, the translation below, the
 * checks and the budget under that.
 *
 * This is the same contract as `TranslationRow` — the profile and the field
 * schema pick the control and the meter, nothing here is per-template — so the
 * "one row editor" rule from `docs/redesign_brief.md` §5 survives the addition
 * of a second screen. What differs is stacking: a template's six fields are one
 * message, so the English sits above the translation rather than beside it, and
 * the space that a second column would have taken goes to the preview.
 */
export function TemplateFieldEditor({
  channel,
  field,
  value,
  current,
  isDirty,
  language,
  profile,
  rtl,
  onChange,
}: TemplateFieldEditorProps) {
  // Rich fields open as an editor; the raw markup stays one click away, for
  // the tag a toolbar cannot express and the placeholder that ended up inside
  // one.
  const [showSource, setShowSource] = useState(false)

  const issues = checkTranslation(value.source, current, {
    language,
    lengthBudget: profile.lengthBudget,
    maxLength: field.maxLength,
    format: field.format,
  })
  const hasError = issues.some((issue) => issue.level === "error")

  const handleCopy = async () => {
    if (await copyText(value.source)) {
      toast.success(`${field.label} copied to the clipboard`)
    } else {
      toast.error("Could not copy", {
        description: "The browser blocked clipboard access for this page.",
      })
    }
  }

  const shared = {
    value: current,
    dir: rtl ? ("rtl" as const) : undefined,
    placeholder: "Add translation…",
    "aria-label": `${field.label} translation`,
    onChange: (event: { target: { value: string } }) =>
      onChange(field.id, event.target.value),
  }

  return (
    <section
      className={cn(
        "border-b px-4 py-3",
        isDirty && "bg-accent/30 border-l-primary border-l-2",
        hasError && "border-l-destructive border-l-2"
      )}
    >
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-medium">{field.label}</h4>
        {!current && (
          <Badge
            variant="outline"
            className="shrink-0 border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
          >
            Missing
          </Badge>
        )}
        {isDirty && (
          <Badge className="bg-primary/10 text-primary shrink-0">
            Unsaved
          </Badge>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {field.control === "rich" && (
            <Button
              variant={showSource ? "secondary" : "ghost"}
              size="sm"
              className="h-6 gap-1 px-2 text-xs"
              aria-pressed={showSource}
              onClick={() => setShowSource((current) => !current)}
            >
              <Code2 className="size-3.5" />
              HTML
            </Button>
          )}
          {/* Copy takes the English away, paste drops it in as a starting
              point — one button doing the second under the first one's icon is
              what made the copy button look broken. */}
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label={`Copy the English ${field.label.toLowerCase()} to the clipboard`}
            title="Copy to clipboard"
            onClick={handleCopy}
          >
            <Copy className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label={`Paste the English ${field.label.toLowerCase()} into the translation`}
            title="Paste into the translation"
            onClick={() => onChange(field.id, value.source)}
          >
            <ClipboardPaste className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* The English, in the same shape the editor below is in: rendered while
          the editor is rich, as markup while it shows HTML. Reading a body as
          tag soup when you are not editing tags is just noise. */}
      {field.format === "html" && !showSource ? (
        <div
          className="bg-muted/50 text-muted-foreground mt-2 rounded-md px-2.5 py-2 text-xs leading-relaxed [&_a]:underline [&_li]:mb-0.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-4"
          // Whitelisted and rebuilt by `safeHtml` — see `lib/template_preview.ts`.
          dangerouslySetInnerHTML={{ __html: safeHtml(value.source) }}
        />
      ) : (
        <p
          className={cn(
            "bg-muted/50 text-muted-foreground mt-2 rounded-md px-2.5 py-2 text-xs whitespace-pre-wrap",
            field.format === "html" && "font-mono"
          )}
        >
          {value.source}
        </p>
      )}

      <div className="mt-2">
        {field.control === "line" && <Input {...shared} />}

        {field.control === "paragraph" && (
          <Textarea {...shared} className="min-h-20 resize-y" />
        )}

        {field.control === "rich" &&
          (showSource ? (
            <Textarea {...shared} className="min-h-52 resize-y font-mono text-xs" />
          ) : (
            <RichTextEditor
              value={current}
              rtl={rtl}
              ariaLabel={`${field.label} translation`}
              onChange={(next) => onChange(field.id, next)}
            />
          ))}
      </div>

      <div className="mt-1.5 flex flex-col gap-1">
        <Meter channel={channel} field={field} value={value} current={current} />
        {issues.map((issue) => (
          <p
            key={issue.id}
            className={cn(
              "flex items-center gap-1.5 text-xs",
              issue.level === "error"
                ? "text-destructive"
                : "text-muted-foreground"
            )}
          >
            {issue.level === "error" ? (
              <AlertTriangle className="size-3.5 shrink-0" />
            ) : (
              <Info className="size-3.5 shrink-0" />
            )}
            {issue.message}
          </p>
        ))}
      </div>
    </section>
  )
}

type MeterProps = {
  channel: TemplateChannel
  field: TemplateField
  value: TemplateFieldValue
  current: string
}

/**
 * Three meters, one per thing that silently truncates or bills:
 *
 * - **SMS** — `encoding · characters · segments`, against the English count.
 *   Nine of the twelve languages have no GSM-7 form, so their segment is 70
 *   characters rather than 160 and a one-segment English message becomes three.
 * - **A field with a soft budget** — a subject line or a push title is not
 *   rejected over the limit, it is quietly cut off in the inbox or on the lock
 *   screen. Amber, not an error.
 * - **A field with a hard limit** — the body the backend caps at 4,000
 *   characters. The over-limit case is an error from `checkTranslation`; this
 *   is the count that lets a translator see it coming.
 */
function Meter({ channel, field, value, current }: MeterProps) {
  if (channel === "sms") {
    const target = smsInfo(current)
    const source = smsInfo(value.source)
    const tight = target.remaining <= 10

    return (
      <p
        className={cn(
          "flex items-center gap-2 font-mono text-xs tabular-nums",
          tight ? "text-amber-600 dark:text-amber-500" : "text-muted-foreground"
        )}
      >
        <span>{target.encoding}</span>
        <span>·</span>
        <span>{target.units} chars</span>
        <span>·</span>
        <span>
          {target.segments} {target.segments === 1 ? "segment" : "segments"}
        </span>
        <span className="text-muted-foreground/70">
          (English: {source.segments})
        </span>
      </p>
    )
  }

  const limit = field.budget ?? field.maxLength
  if (!limit) {
    return null
  }

  const over = current.length > limit

  return (
    <p
      className={cn(
        "font-mono text-xs tabular-nums",
        over ? "text-amber-600 dark:text-amber-500" : "text-muted-foreground"
      )}
    >
      {current.length.toLocaleString()} / {limit.toLocaleString()}
      <span className="text-muted-foreground/70">
        {" "}
        (English: {value.source.length.toLocaleString()})
      </span>
      {over && field.budget ? " — likely to be cut off" : ""}
    </p>
  )
}
