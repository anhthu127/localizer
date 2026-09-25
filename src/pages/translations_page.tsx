import { useEffect, useMemo, useRef, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Search, Trash2, Upload } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { Link, Navigate, useParams, useSearchParams } from "react-router"
import { toast } from "sonner"

import { AddKeyDialog } from "@/components/translations/add_key_dialog"
import { DeleteKeysDialog } from "@/components/translations/delete_keys_dialog"
import {
  ALL_GROUPS,
  GroupFilter,
} from "@/components/translations/group_filter"
import { ExportDialog } from "@/components/translations/export_dialog"
import { AnimatedProgress } from "@/components/motion/animated_progress"
import { TargetProfileCard } from "@/components/translations/target_profile_card"
import {
  ROW_GRID,
  TranslationRow,
} from "@/components/translations/translation_row"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { findNavLeaf } from "@/config/nav_items"
import { kindLabel, profileOf } from "@/config/target_profiles"
import { useTranslationRows } from "@/hooks/use_translation_rows"
import { messageOf, saveTranslations } from "@/lib/api"
import { toneOf, toneText } from "@/lib/coverage"
import { fadeIn, slideUpBar, transitions } from "@/lib/motion"
import {
  groupOptionsOf,
  languageNames,
  languages,
  type LanguageCode,
  type TranslationRow as Row,
  type TranslationStatus,
} from "@/lib/locale_data"
import { cn } from "@/lib/utils"
import { checkTranslation } from "@/lib/validation"

type StatusFilter = TranslationStatus | "all" | "issues" | "new"

const statusFilters: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "missing", label: "Missing" },
  { id: "translated", label: "Translated" },
  { id: "issues", label: "Needs review" },
]

const DEFAULT_LANGUAGE: LanguageCode = "vi"

/**
 * Route: `/:sectionId/:leafId` — the target comes from the path, the filters a
 * link needs to carry come from the query string (`?lang=vi&group=nav&q=`), so
 * a workspace view can be shared or bookmarked.
 *
 * Every target has its own key namespace, so this screen is scoped to one app
 * throughout: the list is that app's keys, and the add-key dialog creates in
 * that app and nowhere else. A target nobody has added keys to yet shows its
 * profile and an invitation to add the first one.
 *
 * The target's profile (`config/target_profiles.ts`) decides the rest: which
 * editor each row renders and which meters sit beside it.
 */
export function TranslationsPage() {
  const { sectionId, leafId } = useParams()
  const match = findNavLeaf(sectionId, leafId)
  const profile = profileOf(sectionId, leafId)

  const [params, setParams] = useSearchParams()
  const paramLanguage = params.get("lang") as LanguageCode | null
  const language =
    paramLanguage && languages.some((item) => item.code === paramLanguage)
      ? paramLanguage
      : DEFAULT_LANGUAGE
  const group = params.get("group") ?? ALL_GROUPS
  // In the URL so a link can point at one key — the add-key dialog does.
  const query = params.get("q") ?? ""

  const setParam = (name: string, value: string | null) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value === null) {
          next.delete(name)
        } else {
          next.set(name, value)
        }
        return next
      },
      { replace: true }
    )
  }

  const setLanguage = (value: LanguageCode) => setParam("lang", value)
  const setGroup = (value: string) =>
    setParam("group", value === ALL_GROUPS ? null : value)
  const setQuery = (value: string) => setParam("q", value || null)

  const [status, setStatus] = useState<StatusFilter>("all")
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  // What the delete dialog is asking about: one row's trash button, or the
  // selection. Empty means closed.
  const [doomed, setDoomed] = useState<string[]>([])

  // Keys are unique per app, so a selection made in one app means nothing in
  // the next. Switching language keeps it: the keys are the same list.
  useEffect(() => setSelected(new Set()), [profile.path])

  const { rows, isLoading, error, reload } = useTranslationRows(
    profile.path,
    language
  )
  const isRtl = languages.find((item) => item.code === language)?.rtl ?? false
  const languageName =
    languages.find((item) => item.code === language)?.name ?? language
  const hasKeys = rows.length > 0

  const groupOptions = useMemo(() => groupOptionsOf(rows), [rows])

  /**
   * Keyed on the saved values, not the live edits — recomputing 3,339 rows on
   * every keystroke would stall typing. The row runs the same checks on its own
   * current value for what it displays; this map only drives the filter.
   */
  const needsReview = useMemo(() => {
    const flagged = new Set<string>()
    for (const row of rows) {
      const issues = checkTranslation(row.source, row.target, {
        language,
        lengthBudget: profile.lengthBudget,
        maxLength: profile.maxLength,
      })
      if (issues.length > 0) {
        flagged.add(row.key)
      }
    }
    return flagged
  }, [rows, language, profile.lengthBudget, profile.maxLength])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()

    const matchesStatus = (row: Row) => {
      switch (status) {
        case "all":
          return true
        case "issues":
          return needsReview.has(row.key)
        case "new":
          return row.origin === "manual"
        default:
          return row.status === status
      }
    }

    return rows.filter((row) => {
      if (group !== ALL_GROUPS && row.group !== group) {
        return false
      }
      if (!matchesStatus(row)) {
        return false
      }
      if (needle) {
        return (
          row.key.toLowerCase().includes(needle) ||
          row.source.toLowerCase().includes(needle) ||
          row.target.toLowerCase().includes(needle)
        )
      }
      return true
    })
  }, [rows, group, status, query, needsReview])

  const translatedCount = rows.filter(
    (row) => row.status === "translated"
  ).length
  const percent = rows.length
    ? Math.round((translatedCount / rows.length) * 100)
    : 0

  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => (profile.kind === "email" ? 220 : 96),
    overscan: 8,
  })

  const dirtyKeys = Object.keys(edits)

  const selectedInView = filtered.filter((row) => selected.has(row.key)).length
  const allFilteredSelected =
    filtered.length > 0 && selectedInView === filtered.length
  const someFilteredSelected = selectedInView > 0 && !allFilteredSelected

  const handleChange = (key: string, value: string) => {
    setEdits((current) => ({ ...current, [key]: value }))
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const { saved, file } = await saveTranslations(
        profile.path,
        language,
        edits
      )
      setEdits({})
      reload()
      toast.success(`Saved ${saved} ${saved === 1 ? "key" : "keys"}`, {
        description: `Written to ${file}`,
      })
    } catch (cause: unknown) {
      toast.error("Could not save", { description: messageOf(cause) })
    } finally {
      setIsSaving(false)
    }
  }

  const handleSelect = (key: string, isOn: boolean) => {
    setSelected((current) => {
      const next = new Set(current)
      if (isOn) {
        next.add(key)
      } else {
        next.delete(key)
      }
      return next
    })
  }

  // The header checkbox acts on what the filters left on screen, not on the
  // whole app — the filters are how a bulk delete is aimed.
  const handleSelectAll = (isOn: boolean) => {
    setSelected((current) => {
      const next = new Set(current)
      for (const row of filtered) {
        if (isOn) {
          next.add(row.key)
        } else {
          next.delete(row.key)
        }
      }
      return next
    })
  }

  /**
   * A deleted key's unsaved edit goes with it, whatever the scope: deleted
   * everywhere there is no key left to save it against, and cleared in this
   * language the value it was editing has just been thrown away on purpose.
   */
  const handleDeleted = (keys: string[]) => {
    const gone = new Set(keys)

    setEdits((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([key]) => !gone.has(key))
      )
    )
    setSelected((current) => {
      const next = new Set(current)
      for (const key of keys) {
        next.delete(key)
      }
      return next
    })
    reload()
  }

  // Refetch, then scope the list to the new key so it is the thing on screen
  // when the dialog closes.
  const handleCreated = (key: string) => {
    reload()
    setStatus("all")
    setGroup(ALL_GROUPS)
    setQuery(key)
  }

  // A path that names no known target falls back to the dashboard. Declared
  // after the hooks so the hook order stays stable.
  if (!match) {
    return <Navigate to="/" replace />
  }

  const addKeyDialog = (
    <AddKeyDialog
      target={profile.path}
      targetTitle={match.leaf.title}
      targetLink={`/${profile.path}`}
      onCreated={handleCreated}
    />
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The app, and the three actions that act on the whole of it.
          Deliberately not in the filter row below: none of them obey a filter.
          An export is a release artifact and always the whole app, an import
          replaces a language file entire, and a key is created in every
          language at once — a reader should not have to learn that from the
          dialogs after assuming the search box applied. */}
      <div className="flex flex-wrap items-center gap-2 border-b p-4">
        <div className="mr-1 flex items-center gap-2">
          <h2 className="text-base font-semibold">{match.leaf.title}</h2>
          <Badge variant="secondary">{kindLabel[profile.kind]}</Badge>
          {!profile.measured && (
            <Badge variant="outline" title="Profile inferred, not measured">
              Inferred
            </Badge>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {hasKeys && (
            <>
              {/* A link, not a dialog: the wizard takes a dozen files, each
                  with its own language and its own diff. Leaving the workspace
                  also drops the unsaved tray, which an import would have
                  invalidated anyway — the edits were made against values the
                  import replaces. */}
              <Button
                variant="outline"
                render={<Link to={`/import?target=${profile.path}`} />}
              >
                <Upload data-icon="inline-start" />
                Import
              </Button>
              <ExportDialog
                target={profile.path}
                targetTitle={match.leaf.title}
                language={language}
              />
            </>
          )}
          {addKeyDialog}
        </div>
      </div>

      {/* Which rows you are looking at: the language, and what narrows it.
          The coverage readout sits here rather than with the title because it
          is the selected language's, and changes when that select changes —
          though not when the group or the search does, which count the whole
          language. */}
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
        <Select
          items={languageNames}
          value={language}
          onValueChange={(value) => setLanguage(value as LanguageCode)}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {languages.map((item) => (
              <SelectItem key={item.code} value={item.code}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasKeys && (
          <>
            <GroupFilter
              value={group}
              options={groupOptions}
              totalKeys={rows.length}
              onChange={setGroup}
            />

            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search key or text…"
                className="w-56 pl-8"
              />
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              {statusFilters.map((filter) => (
                <Button
                  key={filter.id}
                  size="sm"
                  variant={status === filter.id ? "default" : "outline"}
                  onClick={() => setStatus(filter.id)}
                >
                  {filter.label}
                  {filter.id === "issues" && needsReview.size > 0 && (
                    <Badge className="ml-1.5 bg-amber-500/15 text-amber-700 dark:text-amber-400">
                      {needsReview.size}
                    </Badge>
                  )}
                </Button>
              ))}
              <Badge variant="outline" className="ml-2">
                {/* Keyed so the count crossfades when a filter narrows the list,
                    instead of the digits flicking over in place. */}
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={filtered.length}
                    variants={fadeIn}
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    transition={transitions.fast}
                    className="tabular-nums"
                  >
                    {filtered.length}
                  </motion.span>
                </AnimatePresence>
                &nbsp;keys
              </Badge>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-24">
                <AnimatedProgress value={percent} tone={toneOf(percent)} />
              </div>
              <span className="text-muted-foreground text-xs tabular-nums">
                <span
                  className={cn("font-semibold", toneText[toneOf(percent)])}
                >
                  {percent}%
                </span>{" "}
                · {translatedCount}/{rows.length}
              </span>
            </div>
          </>
        )}
      </div>

      {error && (
        <div className="text-destructive p-4 text-sm">
          Failed to load {match.leaf.title}: {error}
        </div>
      )}

      {isLoading && (
        <motion.div
          className="flex flex-col gap-3 p-4"
          variants={fadeIn}
          initial="hidden"
          animate="visible"
        >
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </motion.div>
      )}

      {!isLoading && !error && !hasKeys && (
        <TargetProfileCard
          title={match.leaf.title}
          profile={profile}
          action={addKeyDialog}
        />
      )}

      {!isLoading && !error && hasKeys && (
        <div className="m-4 flex min-h-0 flex-1 flex-col bg-card ring-foreground/10 overflow-hidden rounded-xl ring-1">
          {/* The list is virtualized, so the header cannot be a table header —
              it is the same grid as the row, sitting above the scroller. */}
          <div
            className={cn(
              ROW_GRID,
              "text-muted-foreground bg-muted items-center gap-3 border-b px-4 py-1.5 text-[11px] tracking-wide uppercase"
            )}
          >
            <span className="flex items-center gap-2">
              <Checkbox
                checked={allFilteredSelected}
                indeterminate={someFilteredSelected}
                aria-label={`Select all ${filtered.length} keys in view`}
                onCheckedChange={(checked) => handleSelectAll(checked === true)}
              />
              Key and English
            </span>
            <span>{languageName}</span>
            <span className="hidden xl:block">Audit</span>
          </div>

          <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
            <div
              className="relative w-full"
              style={{ height: `${virtualizer.getTotalSize()}px` }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const row = filtered[virtualRow.index]
                const value = edits[row.key] ?? row.target

                return (
                  <div
                    key={row.key}
                    ref={virtualizer.measureElement}
                    data-index={virtualRow.index}
                    className="absolute top-0 left-0 w-full"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <TranslationRow
                      row={row}
                      value={value}
                      isDirty={row.key in edits}
                      isNew={row.origin === "manual"}
                      isSelected={selected.has(row.key)}
                      language={language}
                      profile={profile}
                      rtl={isRtl}
                      onChange={handleChange}
                      onSelect={handleSelect}
                      onDelete={(key) => setDoomed([key])}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Selecting rows and editing them are two jobs a translator does in the
          same list, so the trays stack rather than replace each other: a
          selection made before an edit is still there afterwards. */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            className="bg-background flex items-center gap-3 border-t px-4 py-3"
            variants={slideUpBar}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <span className="text-sm">
              {selected.size} selected{" "}
              {selected.size !== selectedInView && (
                <span className="text-muted-foreground">
                  ({selectedInView} in view)
                </span>
              )}
            </span>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
              <Button
                variant="destructive"
                onClick={() => setDoomed([...selected])}
              >
                <Trash2 data-icon="inline-start" />
                Delete
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <DeleteKeysDialog
        target={profile.path}
        targetTitle={match.leaf.title}
        language={language}
        languageName={languageName}
        keys={doomed}
        onClose={() => setDoomed([])}
        onDeleted={handleDeleted}
      />

      {/* The tray slides up out of the bottom edge on the first edit and drops
          back out once everything is saved or discarded. */}
      <AnimatePresence>
        {dirtyKeys.length > 0 && (
          <motion.div
            className="bg-background flex items-center gap-3 border-t px-4 py-3 shadow-[0_-8px_24px_-16px_rgb(0_0_0/0.4)]"
            variants={slideUpBar}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <span className="text-sm">
              {dirtyKeys.length} unsaved{" "}
              {dirtyKeys.length === 1 ? "key" : "keys"}
            </span>
            <div className="ml-auto flex gap-2">
              <Button
                variant="outline"
                disabled={isSaving}
                onClick={() => setEdits({})}
              >
                Discard
              </Button>
              <Button disabled={isSaving} onClick={handleSave}>
                {isSaving ? "Saving…" : "Save all"}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
