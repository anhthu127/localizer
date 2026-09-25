import { ArrowUpRight } from "lucide-react"
import { Link } from "react-router"

import { Lift } from "@/components/motion/lift"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { navPath, type NavMatch } from "@/config/nav_items"
import { cn } from "@/lib/utils"

/** One nav leaf as a jump-in tile. The whole card is the link. */
export function ShortcutCard({ section, leaf }: NavMatch) {
  return (
    <Link
      to={navPath(section, leaf)}
      className="focus-visible:ring-ring group block h-full rounded-xl focus-visible:ring-2 focus-visible:outline-none"
    >
      <Lift className="h-full">
        <Card
          size="sm"
          className={cn(
            "hover:bg-muted/50 h-full transition-colors",
            leaf.count
              ? "border-amber-500/30 hover:border-amber-500/50"
              : "hover:border-foreground/20"
          )}
        >
          <CardContent className="flex items-center gap-3">
            <div className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-110">
              <leaf.icon className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{leaf.title}</div>
              <div className="text-muted-foreground truncate text-xs">
                {section.title}
              </div>
            </div>
            {leaf.count ? (
              <Badge
                title="Outstanding strings"
                className="bg-amber-500/15 text-amber-700 dark:text-amber-400"
              >
                {leaf.count}
              </Badge>
            ) : (
              <ArrowUpRight className="text-muted-foreground size-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            )}
          </CardContent>
        </Card>
      </Lift>
    </Link>
  )
}
