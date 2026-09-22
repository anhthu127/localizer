import { useCallback, useMemo, useRef, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  CHANGED_KINDS,
  changeCount,
  type BundleDiff,
  type DiffEntry,
  type DiffKind,
} from "@/lib/bundle_diff"
import { cn } from "@/lib/utils"

/** `changes` is every kind that would be written — the view worth reading. */
type DiffFilter = DiffKind | "changes"

const filters: { id: DiffFilter; label: string }[] = [
  { id: "changes", label: "Changes" },
  { id: "new", label: "New" },
  { id: "added", label: "Added" },
  { id: "changed", label: "Changed" },
  { id: "removed", label: "Removed" },
  { id: "unchanged", label: "Unchanged" },
]

const kindLabel: Record<DiffKind, string> = {
  new: "New key",
  added: "Added",
  changed: "Changed",
  removed: "Removed",
  unchanged: "Unchanged",
}

const kindTone: Record<DiffKind, string> = {
  new: "border-primary/30 bg-primary/10 text-primary",
  added:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  changed:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  removed:
    "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400",
  unchanged: "",
}

/** Where a key sits in its group, counted the way `git` counts lines. */
type LineNumbers = {
  /** Its slot among the keys this language holds today; null if it holds none. */
  before: number | null
  /** Its slot among the keys it would hold after; null if the import empties it. */
  after: number | null
}

/** One group, read as the file it stands in for. */
type GroupDiff = {
  name: string
  entries: DiffEntry[]
  additions: number
  deletions: number
  errors: number
}

/** A row of the virtualized list: a group's header, or one key inside it. */
type Row =
  | { type: "header"; group: GroupDiff }
  | { type: "hunk"; entry: DiffEntry }

type BundleDiffViewProps = {
  diff: BundleDiff
  /** The language the file is being imported into, for the empty states. */
  languageName: string
  /** Right-to-left script, so the two sides read the way the language does. */
  isRtl?: boolean
}

/**
 * What the import would do, laid out the way a pull request lays out its files.
 *
 * A key group — `nav`, `student`, `cims` — is the file: it is the unit a
 * reviewer accepts or rejects as a whole, it is what the keys are named after,
 * and there are a hundred and fifty of them against three thousand keys, so it
 * is also the only grouping that makes the list scannable. Each group collapses
 * to its name and its `+n −n`, and the header of the group being read stays
 * pinned to the top edge while it scrolls.
 *
 * Inside a group each key is a hunk, `@@ key @@` with the English beside it as
 * the context line. A unified diff and not a two-column one: the values are
 * sentences, the pane is half a dialog wide, and a reviewer scanning for the
 * line about to be thrown away wants it under the line replacing it. `-` is
 * what this language holds today, `+` is what the file would leave behind — the
 * same reading as `git diff`, so nobody has to be told which is which.
 *
 * Unchanged keys are counted but filtered out by default: a full file agrees
 * with three thousand of them and there is nothing to decide about any one.
 */
export function BundleDiffView({
  diff,
  languageName,
  isRtl = false,
}: BundleDiffViewProps) {
  const [filter, setFilter] = useState<DiffFilter>("changes")
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set<string>()
  )

  const totals = useMemo(
    () => ({ ...diff.counts, changes: changeCount(diff.counts) }),
    [diff.counts]
  )

  // Numbered over the whole diff rather than the filtered view, so a key keeps
  // the same line number whichever filter is on — the numbers describe the
  // file, not the current reading of it.
  const numbers = useMemo(() => numberEntries(diff.entries), [diff.entries])

  const groups = useMemo(
    () => groupsOf(diff.entries, filter),
    [diff.entries, filter]
  )

  const stat = useMemo(
    () =>
      groups.reduce(
        (sum, group) => ({
          additions: sum.additions + group.additions,
          deletions: sum.deletions + group.deletions,
          keys: sum.keys + group.entries.length,
        }),
        { additions: 0, deletions: 0, keys: 0 }
      ),
    [groups]
  )

  const rows = useMemo(
    () => flattenGroups(groups, collapsed),
    [groups, collapsed]
  )

  const toggle = (name: string) =>
    setCollapsed((current) => {
      const next = new Set(current)
      if (!next.delete(name)) {
        next.add(name)
      }
      return next
    })

  const allCollapsed = groups.length > 0 && collapsed.size >= groups.length
  const toggleAll = () =>
    setCollapsed(
      allCollapsed
        ? new Set<string>()
        : new Set(groups.map((group) => group.name))
    )

  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    // Keyed by row rather than by index so a measured hunk keeps its height
    // when a group above it collapses and every index shifts.
    getItemKey: useCallback(
      (index: number) => {
        const row = rows[index]
        return row.type === "header" ? `@${row.group.name}` : row.entry.key
      },
      [rows]
    ),
    estimateSize: useCallback(
      (index: number) => (rows[index]?.type === "header" ? 41 : 104),
      [rows]
    ),
    overscan: 6,
  })

  const items = virtualizer.getVirtualItems()
  const pinned = pinnedHeader(rows, items, virtualizer.scrollOffset ?? 0)

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {filters.map((item) => (
          <Button
            key={item.id}
            type="button"
            size="sm"
            variant={filter === item.id ? "default" : "outline"}
            disabled={totals[item.id] === 0}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
            <Badge variant="secondary" className="ml-1.5 tabular-nums">
              {totals[item.id]}
            </Badge>
          </Button>
        ))}

        {diff.errors > 0 && (
          <span className="text-destructive ml-auto flex items-center gap-1.5 text-xs">
            <AlertTriangle className="size-3.5 shrink-0" />
            {diff.errors} would fail a check
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-md border">
        {/* The "N files changed" bar, and the one control that acts on all of them. */}
        <div className="bg-muted/40 flex items-center gap-2 border-b px-3 py-2">
          <span className="text-xs font-medium tabular-nums">
            {count(groups.length, "group")}
            <span className="text-muted-foreground">
              {" "}
              · {count(stat.keys, "key")}
            </span>
          </span>
          <DiffStat additions={stat.additions} deletions={stat.deletions} />
          {groups.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="ml-auto h-6 px-2 text-xs"
              onClick={toggleAll}
            >
              {allCollapsed ? "Expand all" : "Collapse all"}
            </Button>
          )}
        </div>

        <div className="relative">
          {/* Pinned rather than `position: sticky`: the rows it would stick to
              are absolutely positioned by the virtualizer, which sticky cannot
              see past. */}
          {pinned && (
            <div className="absolute inset-x-0 top-0 z-10 shadow-sm">
              <GroupHeader
                group={pinned}
                isCollapsed={collapsed.has(pinned.name)}
                onToggle={() => toggle(pinned.name)}
              />
            </div>
          )}

          <div
            ref={scrollRef}
            className="h-[min(46vh,24rem)] overflow-auto overscroll-contain"
          >
            {rows.length === 0 ? (
              <p className="text-muted-foreground p-6 text-center text-sm">
                {filter === "changes"
                  ? `This file changes nothing in ${languageName}.`
                  : filter === "new"
                    ? "Every key in this file is already in the registry."
                    : `No ${kindLabel[filter].toLowerCase()} keys.`}
              </p>
            ) : (
              <div
                className="relative w-full"
                style={{ height: `${virtualizer.getTotalSize()}px` }}
              >
                {items.map((virtualRow) => {
                  const row = rows[virtualRow.index]

                  return (
                    <div
                      key={virtualRow.key}
                      ref={virtualizer.measureElement}
                      data-index={virtualRow.index}
                      className="absolute top-0 left-0 w-full"
                      style={{ transform: `translateY(${virtualRow.start}px)` }}
                    >
                      {row.type === "header" ? (
                        <GroupHeader
                          group={row.group}
                          isCollapsed={collapsed.has(row.group.name)}
                          onToggle={() => toggle(row.group.name)}
                        />
                      ) : (
                        <Hunk
                          entry={row.entry}
                          numbers={numbers.get(row.entry.key)}
                          isRtl={isRtl}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** The group's row in the file list: name, weight, and what it would cost. */
function GroupHeader({
  group,
  isCollapsed,
  onToggle,
}: {
  group: GroupDiff
  isCollapsed: boolean
  onToggle: () => void
}) {
  const Chevron = isCollapsed ? ChevronRight : ChevronDown

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!isCollapsed}
      className="bg-muted/60 hover:bg-muted flex w-full items-center gap-2 border-b px-3 py-2 text-left backdrop-blur-sm"
    >
      <Chevron className="text-muted-foreground size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium">
        {group.name}
      </span>
      {group.errors > 0 && (
        <AlertTriangle className="text-destructive size-3.5 shrink-0" />
      )}
      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
        {count(group.entries.length, "key")}
      </span>
      <DiffStat additions={group.additions} deletions={group.deletions} />
    </button>
  )
}

/**
 * One key, as one hunk.
 *
 * The English sits in the hunk band rather than on a line of its own, where a
 * pull request puts the enclosing function: it is context for the two lines
 * below, not a third thing being compared.
 */
function Hunk({
  entry,
  numbers,
  isRtl,
}: {
  entry: DiffEntry
  numbers: LineNumbers | undefined
  isRtl: boolean
}) {
  const before = numbers?.before ?? null
  const after = numbers?.after ?? null

  return (
    <div className="border-b last:border-b-0">
      <div className="bg-accent/50 text-muted-foreground flex items-center gap-2 px-3 py-1">
        <span className="shrink-0 font-mono text-[11px]">@@ {entry.key} @@</span>
        <span className="min-w-0 flex-1 truncate text-xs italic">
          {entry.source}
        </span>
        <Badge
          variant="outline"
          className={cn("shrink-0", kindTone[entry.kind])}
        >
          {kindLabel[entry.kind]}
        </Badge>
      </div>

      {entry.kind === "unchanged" ? (
        <Line
          sign=" "
          before={before}
          after={after}
          text={entry.after}
          isRtl={isRtl}
        />
      ) : (
        <>
          {entry.before !== "" && (
            <Line
              sign="-"
              before={before}
              after={null}
              text={entry.before}
              isRtl={isRtl}
            />
          )}
          {entry.after !== "" && (
            <Line
              sign="+"
              before={null}
              after={after}
              text={entry.after}
              isRtl={isRtl}
            />
          )}
        </>
      )}

      {entry.issues.map((issue) => (
        <p
          key={issue.id}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1 text-xs",
            issue.level === "error"
              ? "text-destructive"
              : "text-muted-foreground"
          )}
        >
          <AlertTriangle className="size-3.5 shrink-0" />
          {issue.message}
        </p>
      ))}
    </div>
  )
}

/**
 * One side of the change, gutter included. An empty side is not rendered at
 * all: a removal is one red line and an addition one green line, which is what
 * makes the two legible at a glance in a list of a thousand.
 */
function Line({
  sign,
  before,
  after,
  text,
  isRtl,
}: {
  sign: "-" | "+" | " "
  before: number | null
  after: number | null
  text: string
  isRtl: boolean
}) {
  const removed = sign === "-"
  const added = sign === "+"
  const tone = removed ? "removed" : added ? "added" : "none"

  return (
    <div
      className={cn(
        "flex text-sm",
        removed && "bg-destructive/10 text-destructive",
        added && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        sign === " " && "text-muted-foreground"
      )}
    >
      <Gutter value={before} tone={tone} />
      <Gutter value={after} tone={tone} />
      <span aria-hidden className="w-4 shrink-0 py-1 pl-2 font-mono select-none">
        {sign.trim()}
      </span>
      <span
        dir={isRtl ? "rtl" : undefined}
        className="min-w-0 flex-1 py-1 pr-3 wrap-break-word whitespace-pre-wrap"
      >
        {text}
      </span>
    </div>
  )
}

function Gutter({
  value,
  tone,
}: {
  value: number | null
  tone: "added" | "removed" | "none"
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "text-muted-foreground w-9 shrink-0 border-r px-2 py-1 text-right font-mono text-[11px] tabular-nums select-none",
        tone === "removed" && "bg-destructive/10",
        tone === "added" && "bg-emerald-500/10"
      )}
    >
      {value ?? ""}
    </span>
  )
}

const BLOCKS = 5

/** `+n −n`, and the five squares a pull request draws beside them. */
function DiffStat({
  additions,
  deletions,
}: {
  additions: number
  deletions: number
}) {
  const total = additions + deletions
  const green = total === 0 ? 0 : blocksOf(additions, total)
  const red =
    total === 0 ? 0 : Math.min(BLOCKS - green, blocksOf(deletions, total))

  return (
    <span className="flex shrink-0 items-center gap-1.5 text-xs tabular-nums">
      <span className="text-emerald-700 dark:text-emerald-400">
        +{additions}
      </span>
      <span className="text-destructive">−{deletions}</span>
      <span className="flex gap-px">
        {Array.from({ length: BLOCKS }, (_, index) => (
          <span
            key={index}
            className={cn(
              "size-2 rounded-[1px]",
              index < green
                ? "bg-emerald-500"
                : index < green + red
                  ? "bg-destructive"
                  : "bg-muted-foreground/25"
            )}
          />
        ))}
      </span>
    </span>
  )
}

/** A side that changed anything is owed a square, however small its share. */
function blocksOf(part: number, total: number) {
  if (part === 0) {
    return 0
  }
  return Math.max(1, Math.round((part / total) * BLOCKS))
}

function count(value: number, noun: string) {
  return `${value} ${noun}${value === 1 ? "" : "s"}`
}

/**
 * Line numbers, per group, counted as `git` counts them: a key with no text on
 * one side has no number on that side, so an addition has an empty left gutter
 * and a removal an empty right one.
 */
function numberEntries(entries: DiffEntry[]): Map<string, LineNumbers> {
  const counters = new Map<string, { before: number; after: number }>()
  const numbers = new Map<string, LineNumbers>()

  for (const entry of entries) {
    let counter = counters.get(entry.group)
    if (!counter) {
      counter = { before: 0, after: 0 }
      counters.set(entry.group, counter)
    }

    if (entry.before !== "") {
      counter.before += 1
    }
    if (entry.after !== "") {
      counter.after += 1
    }

    numbers.set(entry.key, {
      before: entry.before === "" ? null : counter.before,
      after: entry.after === "" ? null : counter.after,
    })
  }

  return numbers
}

/**
 * The filtered entries, gathered under their group.
 *
 * `additions` and `deletions` are what would be written, not what is listed: a
 * changed key costs one of each, an unchanged key neither — the arithmetic a
 * reviewer already knows from `git`.
 */
function groupsOf(entries: DiffEntry[], filter: DiffFilter): GroupDiff[] {
  const byGroup = new Map<string, GroupDiff>()

  for (const entry of entries) {
    const keep =
      filter === "changes"
        ? CHANGED_KINDS.includes(entry.kind)
        : entry.kind === filter
    if (!keep) {
      continue
    }

    let group = byGroup.get(entry.group)
    if (!group) {
      group = {
        name: entry.group,
        entries: [],
        additions: 0,
        deletions: 0,
        errors: 0,
      }
      byGroup.set(entry.group, group)
    }

    group.entries.push(entry)

    if (entry.kind !== "unchanged") {
      if (entry.before !== "") {
        group.deletions += 1
      }
      if (entry.after !== "") {
        group.additions += 1
      }
    }

    if (entry.issues.some((issue) => issue.level === "error")) {
      group.errors += 1
    }
  }

  return [...byGroup.values()]
}

function flattenGroups(
  groups: GroupDiff[],
  collapsed: ReadonlySet<string>
): Row[] {
  const rows: Row[] = []

  for (const group of groups) {
    rows.push({ type: "header", group })
    if (collapsed.has(group.name)) {
      continue
    }
    for (const entry of group.entries) {
      rows.push({ type: "hunk", entry })
    }
  }

  return rows
}

/**
 * The group being read: the nearest header at or above the top edge, once it
 * has actually scrolled under it. Walking back from the first rendered row
 * rather than searching the rendered window, because a group tall enough to
 * fill the pane has its header far outside that window.
 */
function pinnedHeader(
  rows: Row[],
  items: { index: number; start: number }[],
  offset: number
): GroupDiff | null {
  const first = items[0]
  if (!first || offset <= 0) {
    return null
  }

  let index = Math.min(first.index, rows.length - 1)
  while (index >= 0 && rows[index]?.type !== "header") {
    index -= 1
  }

  const row = index >= 0 ? rows[index] : undefined
  if (!row || row.type !== "header") {
    return null
  }

  // Its own header is still on screen under its own power — don't draw it twice.
  if (index === first.index && first.start >= offset) {
    return null
  }

  return row.group
}
