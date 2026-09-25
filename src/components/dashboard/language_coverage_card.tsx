import { Link } from "react-router"

import { AnimatedProgress } from "@/components/motion/animated_progress"
import { Stagger, StaggerItem } from "@/components/motion/stagger"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { CoverageResponse } from "@/lib/api_types"
import { issueCountOf, percentOf, toneOf, toneText } from "@/lib/coverage"
import { languages } from "@/lib/locale_data"
import { cn } from "@/lib/utils"
import { workspaceLink } from "@/lib/workspace_link"

const nameOf = (code: string) =>
  languages.find((language) => language.code === code)?.name ?? code

type LanguageCoverageCardProps = {
  /** Null until the coverage request answers. */
  coverage: CoverageResponse | null
}

/**
 * A key only counts as translated once it has a value of its own, so a bundle
 * exported with English as its fallback reads near zero here — which is the
 * honest number. The flagged count beside the bar says how many of the values
 * that *did* translate a check is unhappy with.
 */
export function LanguageCoverageCard({ coverage }: LanguageCoverageCardProps) {
  const sourceKeyCount = coverage?.sourceKeyCount ?? 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Language coverage</CardTitle>
        <CardDescription>
          Translated against {sourceKeyCount.toLocaleString()} English keys, and
          how many of those values a check flagged.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!coverage &&
          Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}

        {coverage && (
          <Stagger className="flex flex-col gap-3" stagger={0.05}>
            {coverage.languages.map((entry) => {
              const percent = percentOf(entry, sourceKeyCount)
              const flagged = issueCountOf(entry)
              const tone = toneOf(percent)

              return (
                <StaggerItem key={entry.code}>
                  <Link
                    to={workspaceLink({ lang: entry.code })}
                    className="hover:bg-muted/50 focus-visible:ring-ring -mx-2 block rounded-lg px-2 py-1.5 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <div className="flex items-baseline gap-2 text-sm">
                      <span className="font-medium">{nameOf(entry.code)}</span>
                      <span className="text-muted-foreground text-xs">
                        {entry.code}
                      </span>
                      <span
                        className={cn(
                          "ml-auto font-semibold tabular-nums",
                          toneText[tone]
                        )}
                      >
                        {percent}%
                      </span>
                    </div>
                    <AnimatedProgress
                      value={percent}
                      tone={tone}
                      className="mt-1.5"
                    />
                    <div className="text-muted-foreground mt-1 text-xs tabular-nums">
                      <span
                        className={cn(
                          entry.missing > 0 && "text-destructive font-medium"
                        )}
                      >
                        {entry.missing.toLocaleString()} missing
                      </span>
                      {" · "}
                      <span
                        className={cn(
                          flagged > 0 &&
                            "font-medium text-amber-600 dark:text-amber-500"
                        )}
                      >
                        {flagged.toLocaleString()} flagged
                      </span>
                      {entry.issues.script > 0 &&
                        ` (${entry.issues.script.toLocaleString()} wrong script)`}
                    </div>
                  </Link>
                </StaggerItem>
              )
            })}
          </Stagger>
        )}
      </CardContent>
    </Card>
  )
}
