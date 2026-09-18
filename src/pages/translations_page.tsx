import { useMemo, useRef, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Search } from "lucide-react"
import { Navigate, useParams, useSearchParams } from "react-router"
import { toast } from "sonner"

import { AddKeyDialog } from "@/components/translations/add_key_dialog"
import {
  ALL_GROUPS,
  GroupFilter,
} from "@/components/translations/group_filter"
import { ExportDialog } from "@/components/translations/export_dialog"
import { TargetProfileCard } from "@/components/translations/target_profile_card"
import { TranslationRow } from "@/components/translations/translation_row"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
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
import { deleteKey, messageOf, saveTranslations } from "@/lib/api"
import {
  groupOptionsOf,
  languages,
  type LanguageCode,
  type TranslationRow as Row,
  type TranslationStatus,
} from "@/lib/locale_data"
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

  const { rows, isLoading, error, reload } = useTranslationRows(
    profile.path,
    language
  )
  const isRtl = languages.find((item) => item.code === language)?.rtl ?? false
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

  const newCount = rows.filter((row) => row.origin === "manual").length

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

  const handleDelete = async (key: string) => {
    if (!confirm(`Delete ${key} from every language in this app?`)) {
      return
    }

    try {
      await deleteKey(profile.path, key)
      setEdits((current) => {
        const next = { ...current }
        delete next[key]
        return next
      })
      reload()
      toast.success(`Deleted ${key}`)
    } catch (cause: unknown) {
      toast.error("Could not delete", { description: messageOf(cause) })
    }
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

        <Select
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
          </>
        )}

        <div className="ml-auto flex items-center gap-3">
          {hasKeys && (
            <>
              <div className="w-40">
                <Progress value={percent} />
              </div>
              <span className="text-muted-foreground text-sm tabular-nums">
                {percent}% · {translatedCount}/{rows.length}
              </span>
            </>
          )}
          {hasKeys && (
            <ExportDialog
              target={profile.path}
              targetTitle={match.leaf.title}
              language={language}
            />
          )}
          {addKeyDialog}
        </div>
      </div>

      <p className="text-muted-foreground border-b px-4 py-2 text-xs">
        <span className="text-foreground font-medium">{profile.audience}.</span>{" "}
        {profile.tone}
      </p>

      {hasKeys && (
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
          {statusFilters.map((filter) => (
            <Button
              key={filter.id}
              size="sm"
              variant={status === filter.id ? "default" : "outline"}
              onClick={() => setStatus(filter.id)}
            >
              {filter.label}
              {filter.id === "issues" && needsReview.size > 0 && (
                <Badge variant="secondary" className="ml-1.5">
                  {needsReview.size}
                </Badge>
              )}
            </Button>
          ))}
          {newCount > 0 && (
            <Button
              size="sm"
              variant={status === "new" ? "default" : "outline"}
              onClick={() => setStatus("new")}
            >
              Added here
              <Badge variant="secondary" className="ml-1.5">
                {newCount}
              </Badge>
            </Button>
          )}
          <Badge variant="outline" className="ml-2">
            {filtered.length} keys
          </Badge>
        </div>
      )}

      {error && (
        <div className="text-destructive p-4 text-sm">
          Failed to load {match.leaf.title}: {error}
        </div>
      )}

      {isLoading && (
        <div className="flex flex-col gap-3 p-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
      )}

      {!isLoading && !error && !hasKeys && (
        <TargetProfileCard
          title={match.leaf.title}
          profile={profile}
          action={addKeyDialog}
        />
      )}

      {!isLoading && !error && hasKeys && (
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
                    language={language}
                    onDelete={handleDelete}
                    profile={profile}
                    rtl={isRtl}
                    onChange={handleChange}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {dirtyKeys.length > 0 && (
        <div className="bg-background flex items-center gap-3 border-t px-4 py-3">
          <span className="text-sm">
            {dirtyKeys.length} unsaved {dirtyKeys.length === 1 ? "key" : "keys"}
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
        </div>
      )}
    </div>
  )
}
