import { useState } from "react"
import { ArrowUpRight } from "lucide-react"
import { Link } from "react-router"

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { CoverageResponse } from "@/lib/api_types"
import { coverageOf } from "@/lib/coverage"
import { languages, type LanguageCode } from "@/lib/locale_data"
import { workspaceLink } from "@/lib/workspace_link"

type GapsCardProps = {
  /** Null until the coverage request answers. */
  coverage: CoverageResponse | null
}

/** The groups holding the most keys that are missing or flagged, per language. */
export function GapsCard({ coverage }: GapsCardProps) {
  const [language, setLanguage] = useState<LanguageCode>("vi")

  const options = languages.filter((item) =>
    coverage?.languages.some((entry) => entry.code === item.code)
  )
  const entry = coverageOf(coverage, language)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Where the gaps are</CardTitle>
        <CardDescription>
          Groups with the most keys missing or flagged for review.
        </CardDescription>
        <CardAction>
          <Select
            value={language}
            onValueChange={(value) => setLanguage(value as LanguageCode)}
          >
            <SelectTrigger className="w-40" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((item) => (
                <SelectItem key={item.code} value={item.code}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {entry?.topGroups.map((group) => {
          const done = group.total - group.needsReview
          const percent = Math.round((done / group.total) * 100)

          return (
            <Link
              key={group.group}
              to={workspaceLink({ lang: language, group: group.group })}
              className="hover:bg-muted/50 focus-visible:ring-ring group -mx-2 rounded-lg px-2 py-1.5 focus-visible:ring-2 focus-visible:outline-none"
            >
              <div className="flex items-baseline gap-2 text-sm">
                <span className="truncate font-medium">{group.group}</span>
                <ArrowUpRight className="text-muted-foreground size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                  {group.needsReview.toLocaleString()} of {group.total} to review
                </span>
              </div>
              <Progress value={percent} className="mt-1.5" />
            </Link>
          )
        })}
      </CardContent>
    </Card>
  )
}
