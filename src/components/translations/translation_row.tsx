import {
  AlertTriangle,
  ClipboardPaste,
  Copy,
  Info,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { ContentKind, TargetProfile } from "@/config/target_profiles"
import { copyText } from "@/lib/clipboard"
import { formatDateTime } from "@/lib/format_date"
import type { LanguageCode } from "@/lib/locale_data"
import type {
  TranslationRow as Row,
  TranslationStatus,
} from "@/lib/locale_data"
import { cn } from "@/lib/utils"
import { checkTranslation, smsInfo } from "@/lib/validation"

const statusLabel: Record<TranslationStatus, string> = {
  translated: "Translated",
  missing: "Missing",
}

const statusTone: Record<TranslationStatus, string> = {
  translated:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  missing:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
}

/** Above this, a source string is a sentence and wants a growing textarea. */
const SHORT_SOURCE = 60

type TranslationRowProps = {
  row: Row
  value: string
  isDirty: boolean
  /** Added in this app by hand rather than by the import. */
  isNew?: boolean
  language: LanguageCode
  profile: TargetProfile
  rtl?: boolean
  /** In the page's delete selection — the checkbox beside the key. */
  isSelected: boolean
  onChange: (key: string, value: string) => void
  onSelect: (key: string, selected: boolean) => void
  /** Opens the delete dialog for this row alone. */
  onDelete: (key: string) => void
}

/**
 * The single row editor. The legacy app had four copies of this — workspace,
 * PDF list and two search-result lists — so any fix reached only one of them.
 *
 * The three content kinds are variants of this one component, not three
 * components: the target's profile picks the control and the meter, everything
 * else is shared.
 */
export function TranslationRow({
  row,
  value,
  isDirty,
  isNew,
  language,
  profile,
  rtl,
  isSelected,
  onChange,
  onSelect,
  onDelete,
}: TranslationRowProps) {
  const issues = checkTranslation(row.source, value, {
    language,
    lengthBudget: profile.lengthBudget,
    maxLength: profile.maxLength,
  })
  const hasError = issues.some((issue) => issue.level === "error")

  const handleCopy = async () => {
    if (await copyText(row.source)) {
      toast.success("English copied to the clipboard")
    } else {
      toast.error("Could not copy", {
        description: "The browser blocked clipboard access for this page.",
      })
    }
  }

  return (
    <div
      className={cn(
        ROW_GRID,
        "group items-start gap-3 border-b px-4 py-3",
        isDirty && "bg-accent/40",
        isSelected && "bg-destructive/5",
        hasError && "border-l-destructive border-l-2"
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Checkbox
            className="shrink-0"
            checked={isSelected}
            aria-label={`Select ${row.key}`}
            onCheckedChange={(checked) => onSelect(row.key, checked === true)}
          />
          <span className="text-muted-foreground truncate font-mono text-xs">
            {row.key}
          </span>
          <Badge
            variant="outline"
            className={cn("shrink-0", statusTone[row.status])}
          >
            {statusLabel[row.status]}
          </Badge>
          {isNew && (
            <Badge variant="secondary" className="shrink-0">
              New
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-6 shrink-0"
            aria-label={`Delete ${row.key}`}
            title="Delete this key"
            onClick={() => onDelete(row.key)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
        <div className="mt-1 flex items-start gap-2">
          <p className="text-sm">{row.source}</p>
          {/* Two different things a translator wants from the English, and one
              button used to do the second while its icon promised the first:
              take it away to a CAT tool, or drop it in as the starting point. */}
          <Button
            variant="ghost"
            size="icon"
            className="size-6 shrink-0 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
            aria-label={`Copy the English for ${row.key} to the clipboard`}
            title="Copy to clipboard"
            onClick={handleCopy}
          >
            <Copy className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 shrink-0 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
            aria-label={`Paste the English for ${row.key} into the translation`}
            title="Paste into the translation"
            onClick={() => onChange(row.key, row.source)}
          >
            <ClipboardPaste className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <Editor
          kind={profile.kind}
          row={row}
          value={value}
          rtl={rtl}
          onChange={onChange}
        />
        <Meter kind={profile.kind} source={row.source} value={value} />
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

      <Audit row={row} />
    </div>
  )
}

/**
 * The row's grid, shared with the header above the list so the two line up.
 * The audit column is the first thing to go when the window narrows: on a
 * laptop the editor is worth more than the provenance.
 */
export const ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_9rem]"

/**
 * When this language's value was last written; who wrote it is one hover away.
 * Empty only while the value is — imported text is stamped with the import.
 */
function Audit({ row }: { row: Row }) {
  const updated = row.updated

  return (
    <div className="text-muted-foreground hidden min-w-0 items-center gap-1.5 text-xs xl:flex">
      {updated ? (
        <>
          <span
            className="text-foreground truncate tabular-nums"
            title={updated.at}
          >
            {formatDateTime(updated.at)}
          </span>
          <Tooltip>
            <TooltipTrigger
              aria-label="Updated by"
              className="hover:text-foreground shrink-0"
            >
              <Info className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>Updated by {updated.by}</TooltipContent>
          </Tooltip>
        </>
      ) : (
        <span>—</span>
      )}
    </div>
  )
}

type EditorProps = {
  kind: ContentKind
  row: Row
  value: string
  rtl?: boolean
  onChange: (key: string, value: string) => void
}

/**
 * Half the School bundle is under 15 characters, so a four-line textarea for
 * every row is mostly empty chrome. The control follows the source instead.
 */
function Editor({ kind, row, value, rtl, onChange }: EditorProps) {
  const shared = {
    value,
    dir: rtl ? ("rtl" as const) : undefined,
    placeholder: "Add translation…",
    "aria-label": `Translation for ${row.key}`,
    onChange: (event: { target: { value: string } }) =>
      onChange(row.key, event.target.value),
  }

  if (kind === "sms") {
    return <Input {...shared} className="font-normal" />
  }

  if (kind === "email") {
    return <Textarea {...shared} className="min-h-40 resize-y font-mono text-xs" />
  }

  return row.source.length <= SHORT_SOURCE ? (
    <Input {...shared} />
  ) : (
    <Textarea {...shared} className="min-h-16 resize-y" />
  )
}

type MeterProps = {
  kind: ContentKind
  source: string
  value: string
}

/**
 * The SMS meter is the reason the kinds exist. Nine of the twelve target
 * languages have no GSM-7 form, so their segment drops from 160 characters to
 * 70 and a one-segment English message becomes three — a cost nobody sees
 * until the invoice unless it is on the row.
 */
function Meter({ kind, source, value }: MeterProps) {
  if (kind !== "sms") {
    return null
  }

  const target = smsInfo(value)
  const english = smsInfo(source)
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
        (English: {english.segments})
      </span>
    </p>
  )
}
