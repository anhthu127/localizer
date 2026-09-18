import { useMemo } from "react"
import { AlertTriangle, Search } from "lucide-react"
import { Navigate, useParams, useSearchParams } from "react-router"

import { TemplateDialog } from "@/components/templates/template_dialog"
import { TemplateTable } from "@/components/templates/template_table"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { useTemplates } from "@/hooks/use_templates"
import { languages, type LanguageCode } from "@/lib/locale_data"
import {
  categoryLabel,
  channelLabel,
  ownerPath,
  templateCategories,
  type TemplateChannel,
  type TemplateEntry,
} from "@/lib/template_data"

const ALL = "__all__"
const DEFAULT_LANGUAGE: LanguageCode = "vi"

/**
 * Route: `/others/:channel` — the template list for one channel.
 *
 * The sibling of `translations_page.tsx`, and the reason there are two: the
 * Others targets hold *messages*, not loose keys. A message is a handful of
 * fields that are only meaningful together, it has metadata a key cannot carry
 * — who receives it, which product sends it, who wrote it — and it has to be
 * seen rendered to be judged. So the screen is a table of templates and a
 * two-panel dialog rather than a virtualized grid of rows.
 *
 * Everything else is deliberately the same: the target comes from the path,
 * the filters from the query string (`?lang=vi&category=parent&template=…`), so
 * a link can point a colleague at one template in one language.
 */
export function TemplatesPage() {
  const { sectionId, leafId } = useParams()
  const match = findNavLeaf(sectionId, leafId)
  const profile = profileOf(sectionId, leafId)
  const channel = profile.kind as TemplateChannel

  const [params, setParams] = useSearchParams()
  const paramLanguage = params.get("lang") as LanguageCode | null
  const language =
    paramLanguage && languages.some((item) => item.code === paramLanguage)
      ? paramLanguage
      : DEFAULT_LANGUAGE
  const category = params.get("category") ?? ALL
  const owner = params.get("owner") ?? ALL
  const query = params.get("q") ?? ""
  const openId = params.get("template")

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

  const { templates, isLoading, error, reload } = useTemplates(
    profile.path,
    language
  )

  // Only the owners that actually send something in this channel — a filter
  // listing all ten targets would be mostly dead options.
  const owners = useMemo(() => {
    const seen = new Map<string, string>()
    for (const entry of templates) {
      const path = ownerPath(entry.template.owner)
      const leaf = findNavLeaf(entry.template.owner.kind, entry.template.owner.app)
      seen.set(path, leaf?.leaf.title ?? entry.template.owner.app)
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [templates])

  const categoriesPresent = useMemo(() => {
    const seen = new Set(templates.map((entry) => entry.template.category))
    return templateCategories.filter((item) => seen.has(item))
  }, [templates])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()

    return templates.filter((entry) => {
      if (category !== ALL && entry.template.category !== category) {
        return false
      }
      if (owner !== ALL && ownerPath(entry.template.owner) !== owner) {
        return false
      }
      if (!needle) {
        return true
      }
      return (
        entry.template.name.toLowerCase().includes(needle) ||
        entry.template.id.toLowerCase().includes(needle) ||
        entry.template.createdBy.toLowerCase().includes(needle) ||
        entry.fields.some(
          (field) =>
            field.source.toLowerCase().includes(needle) ||
            field.target.toLowerCase().includes(needle)
        )
      )
    })
  }, [templates, category, owner, query])

  const totals = useMemo(() => summarise(filtered), [filtered])
  const open = templates.find((entry) => entry.template.id === openId)

  if (!match) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b p-4">
        <div className="mr-1 flex items-center gap-2">
          <h2 className="text-base font-semibold">{match.leaf.title}</h2>
          <Badge variant="secondary">{kindLabel[channel]}</Badge>
        </div>

        <Select
          value={language}
          onValueChange={(value) => setParam("lang", value)}
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

        {templates.length > 0 && (
          <>
            <Select
              value={category}
              onValueChange={(value) =>
                setParam("category", value === ALL ? null : value)
              }
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Every category</SelectItem>
                {categoriesPresent.map((item) => (
                  <SelectItem key={item} value={item}>
                    {categoryLabel[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={owner}
              onValueChange={(value) =>
                setParam("owner", value === ALL ? null : value)
              }
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Every product</SelectItem>
                {owners.map(([path, title]) => (
                  <SelectItem key={path} value={path}>
                    {title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(event) => setParam("q", event.target.value || null)}
                placeholder="Search name, author or text…"
                className="w-56 pl-8"
              />
            </div>
          </>
        )}

        <div className="ml-auto flex items-center gap-3">
          {templates.length > 0 && (
            <>
              <div className="w-40">
                <Progress value={totals.percent} />
              </div>
              <span className="text-muted-foreground text-sm tabular-nums">
                {totals.percent}% · {totals.translated}/{totals.fields} fields
              </span>
              {totals.needsReview > 0 && (
                <Badge variant="outline" className="gap-1">
                  <AlertTriangle className="size-3" />
                  {totals.needsReview} to review
                </Badge>
              )}
              <Badge variant="outline">
                {filtered.length}{" "}
                {filtered.length === 1 ? "template" : "templates"}
              </Badge>
            </>
          )}
        </div>
      </div>

      <p className="text-muted-foreground border-b px-4 py-2 text-xs">
        <span className="text-foreground font-medium">{profile.audience}.</span>{" "}
        {profile.tone}
      </p>

      {error && (
        <div className="text-destructive p-4 text-sm">
          Failed to load {match.leaf.title}: {error}
        </div>
      )}

      {isLoading && (
        <div className="flex flex-col gap-3 p-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      )}

      {!isLoading && !error && templates.length === 0 && (
        <div className="min-h-0 flex-1 overflow-auto p-6">
          <Card className="mx-auto max-w-2xl">
            <CardHeader>
              <CardTitle>No {channelLabel[channel].toLowerCase()} yet</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              {profile.note} Templates are seeded from
              <span className="font-mono"> sample-data/templates.json</span>;
              creating one in the UI is not built yet.
            </CardContent>
          </Card>
        </div>
      )}

      {!isLoading && !error && templates.length > 0 && (
        <div className="min-h-0 flex-1 overflow-auto">
          <TemplateTable
            channel={channel}
            entries={filtered}
            openId={openId ?? undefined}
            onOpen={(id) => setParam("template", id)}
          />
          {filtered.length === 0 && (
            <p className="text-muted-foreground p-6 text-center text-sm">
              No template matches these filters.
            </p>
          )}
        </div>
      )}

      {open && (
        // Keyed so switching template resets the dialog's unsaved edits with
        // it, rather than carrying one message's text into another.
        <TemplateDialog
          key={open.template.id}
          entry={open}
          profile={profile}
          language={language}
          onClose={() => setParam("template", null)}
          onSaved={reload}
        />
      )}
    </div>
  )
}

function summarise(entries: TemplateEntry[]) {
  let translated = 0
  let fields = 0
  let needsReview = 0

  for (const entry of entries) {
    translated += entry.translated
    fields += entry.total
    needsReview += entry.needsReview
  }

  return {
    translated,
    fields,
    needsReview,
    percent: fields ? Math.round((translated / fields) * 100) : 0,
  }
}
