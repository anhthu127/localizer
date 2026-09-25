import { AlertTriangle, ChevronRight, Globe, Smartphone } from "lucide-react"
import { Link } from "react-router"

import { AnimatedProgress } from "@/components/motion/animated_progress"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { findNavLeaf } from "@/config/nav_items"
import { toneOf, toneText } from "@/lib/coverage"
import { cn } from "@/lib/utils"
import {
  categoryLabel,
  ownerPath,
  type TemplateChannel,
  type TemplateEntry,
  type TemplateOwner,
} from "@/lib/template_data"
import { formatDate } from "@/lib/format_date"
import { smsInfo } from "@/lib/validation"

type TemplateTableProps = {
  channel: TemplateChannel
  entries: TemplateEntry[]
  /** The template whose dialog is open, so the row can stay highlighted. */
  openId?: string
  showProgress: boolean
  onOpen: (id: string) => void
}

/**
 * The template list — one row per message, opened for translation by clicking
 * it.
 *
 * The columns are what a translator needs to choose a row without opening it:
 * **who receives it** (an invite to a coach and an invite to a parent are
 * different copy), **which product sends it** (the terminology has to agree
 * with that app's UI strings), **who created it** (the person to ask when the
 * English is ambiguous) and **how far along it is** in the selected language.
 *
 * SMS gets a segment column too, because a message that costs three segments
 * instead of one is a row you want to see before you open it.
 */
export function TemplateTable({
  channel,
  entries,
  openId,
  showProgress,
  onOpen,
}: TemplateTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted hover:bg-muted">
          <TableHead>Template</TableHead>
          <TableHead className="w-32">Category</TableHead>
          <TableHead className="w-56">Sent from</TableHead>
          <TableHead className="w-48">Created by</TableHead>
          {channel === "sms" && (
            <TableHead className="w-32 text-right">Segments</TableHead>
          )}
          {showProgress && (
            <TableHead className="w-56">Translation</TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => {
          const { template } = entry
          const isOpen = template.id === openId
          const needsWork =
            showProgress &&
            (entry.translated < entry.total || entry.needsReview > 0)

          return (
            <TableRow
              key={template.id}
              onClick={() => onOpen(template.id)}
              className={cn(
                "cursor-pointer",
                needsWork && "shadow-[inset_2px_0_0_var(--color-amber-500)]",
                isOpen &&
                  "bg-accent/50 shadow-[inset_2px_0_0_var(--color-primary)]"
              )}
            >
              <TableCell>
                <button
                  type="button"
                  className="flex items-start gap-2 text-left"
                  onClick={(event) => {
                    event.stopPropagation()
                    onOpen(template.id)
                  }}
                >
                  <ChevronRight className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                  <span className="grid gap-0.5">
                    <span className="font-medium">{template.name}</span>
                    <span className="text-muted-foreground font-mono text-xs">
                      {template.id}
                    </span>
                  </span>
                </button>
              </TableCell>

              <TableCell>
                <Badge variant="secondary">
                  {categoryLabel[template.category]}
                </Badge>
              </TableCell>

              <TableCell>
                <Owner owner={template.owner} />
              </TableCell>

              <TableCell>
                <div className="grid gap-0.5">
                  <span>{template.createdBy}</span>
                  <span className="text-muted-foreground text-xs">
                    {formatDate(template.createdAt)}
                  </span>
                </div>
              </TableCell>

              {channel === "sms" && (
                <TableCell className="text-right">
                  <Segments entry={entry} />
                </TableCell>
              )}

              {showProgress && (
                <TableCell>
                  <TranslationCell entry={entry} />
                </TableCell>
              )}
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

/**
 * `{ kind: "app", app: "parent" }` → "App · Parent", linking to that target's
 * own workspace: the mail's vocabulary has to match the UI strings it is
 * talking about, and that is one click away rather than a hunt through the
 * menu.
 */
function Owner({ owner }: { owner: TemplateOwner }) {
  const path = ownerPath(owner)
  const leaf = findNavLeaf(owner.kind, owner.app)
  const Icon = owner.kind === "web" ? Globe : Smartphone

  return (
    <Link
      to={`/${path}`}
      onClick={(event) => event.stopPropagation()}
      className="hover:text-foreground text-muted-foreground flex items-center gap-1.5 hover:underline"
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="text-foreground">
        {leaf?.leaf.title ?? owner.app}
      </span>
      <span className="text-xs uppercase">{owner.kind}</span>
    </Link>
  )
}

function Segments({ entry }: { entry: TemplateEntry }) {
  const message = entry.fields.find((field) => field.field === "message")
  if (!message?.target) {
    return <span className="text-muted-foreground text-xs">—</span>
  }

  const target = smsInfo(message.target)
  const source = smsInfo(message.source)

  return (
    <span
      className={cn(
        "font-mono text-xs tabular-nums",
        target.segments > source.segments
          ? "text-amber-600 dark:text-amber-500"
          : "text-muted-foreground"
      )}
    >
      {target.segments} / {source.segments} EN
    </span>
  )
}

function TranslationCell({ entry }: { entry: TemplateEntry }) {
  const percent = entry.total
    ? Math.round((entry.translated / entry.total) * 100)
    : 0

  return (
    <div className="flex items-center gap-2">
      <AnimatedProgress
        value={percent}
        tone={toneOf(percent)}
        className="w-20"
      />
      <span
        className={cn(
          "text-xs font-medium tabular-nums",
          toneText[toneOf(percent)]
        )}
      >
        {entry.translated}/{entry.total}
      </span>
      {entry.needsReview > 0 && (
        <Badge className="gap-1 bg-amber-500/15 text-amber-700 dark:text-amber-400">
          <AlertTriangle className="size-3" />
          {entry.needsReview}
        </Badge>
      )}
    </div>
  )
}
