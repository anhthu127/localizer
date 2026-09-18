import { AlertTriangle, ArrowRight, Boxes, Globe, ListChecks } from "lucide-react"
import { Link } from "react-router"

import { GapsCard } from "@/components/dashboard/gaps_card"
import { LanguageCoverageCard } from "@/components/dashboard/language_coverage_card"
import { ShortcutCard } from "@/components/dashboard/shortcut_card"
import { StatTile } from "@/components/dashboard/stat_tile"
import { FadeIn } from "@/components/motion/fade_in"
import { Stagger, StaggerItem } from "@/components/motion/stagger"
import { Button } from "@/components/ui/button"
import { defaultNavPath, navSections } from "@/config/nav_items"
import { targetCount, targetsWithBundle } from "@/config/target_profiles"
import { useCoverage } from "@/hooks/use_coverage"
import { totalNeedsReview } from "@/lib/coverage"

export function DashboardPage() {
  const { coverage, error } = useCoverage()

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
        <FadeIn className="flex flex-wrap items-end gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Localization overview</h1>
            <p className="text-muted-foreground text-sm">
              Pick a target to start translating, or jump straight to the
              language that needs the most work.
            </p>
          </div>
          <Button className="ml-auto" render={<Link to={defaultNavPath} />}>
            Open workspace
            <ArrowRight data-icon="inline-end" />
          </Button>
        </FadeIn>

        {error && (
          <p className="text-destructive text-sm">
            Could not load coverage: {error}
          </p>
        )}

        <Stagger
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          delay={0.05}
          stagger={0.06}
        >
          <StaggerItem>
            <StatTile
              label="Source keys"
              value={coverage?.sourceKeyCount ?? null}
              hint={
                coverage ? `across ${coverage.groupCount} groups` : "loading…"
              }
              icon={ListChecks}
            />
          </StaggerItem>
          <StaggerItem>
            <StatTile
              label="Target languages"
              value={coverage?.languages.length ?? null}
              hint="plus English as the source"
              icon={Globe}
            />
          </StaggerItem>
          <StaggerItem>
            <StatTile
              label="Targets"
              value={targetCount}
              hint={`${targetsWithBundle} with a source bundle imported`}
              icon={Boxes}
            />
          </StaggerItem>
          <StaggerItem>
            <StatTile
              label="Needs review"
              value={coverage ? totalNeedsReview(coverage) : null}
              hint="missing, or flagged by a check"
              icon={AlertTriangle}
            />
          </StaggerItem>
        </Stagger>

        <section className="flex flex-col gap-3">
          <FadeIn delay={0.1}>
            <h2 className="text-base font-semibold">Shortcuts</h2>
            <p className="text-muted-foreground text-sm">
              Every target from the menu, one click away.
            </p>
          </FadeIn>

          {navSections.map((section) => (
            <div key={section.id} className="flex flex-col gap-2">
              <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
                <section.icon className="size-3.5" />
                {section.title}
              </div>
              <Stagger
                className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
                delay={0.12}
              >
                {section.items.map((leaf) => (
                  <StaggerItem key={leaf.id}>
                    <ShortcutCard section={section} leaf={leaf} />
                  </StaggerItem>
                ))}
              </Stagger>
            </div>
          ))}
        </section>

        <Stagger
          className="grid items-start gap-4 lg:grid-cols-2"
          delay={0.18}
          stagger={0.08}
        >
          <StaggerItem>
            <LanguageCoverageCard coverage={coverage} />
          </StaggerItem>
          <StaggerItem>
            <GapsCard coverage={coverage} />
          </StaggerItem>
        </Stagger>
      </div>
    </div>
  )
}
