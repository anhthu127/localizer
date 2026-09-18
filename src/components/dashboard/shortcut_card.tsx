import { ArrowUpRight } from "lucide-react"
import { Link } from "react-router"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { navPath, type NavMatch } from "@/config/nav_items"

/** One nav leaf as a jump-in tile. The whole card is the link. */
export function ShortcutCard({ section, leaf }: NavMatch) {
  return (
    <Link
      to={navPath(section, leaf)}
      className="focus-visible:ring-ring rounded-xl focus-visible:ring-2 focus-visible:outline-none"
    >
      <Card size="sm" className="hover:bg-muted/50 h-full transition-colors">
        <CardContent className="flex items-center gap-3">
          <div className="bg-muted text-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
            <leaf.icon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{leaf.title}</div>
            <div className="text-muted-foreground truncate text-xs">
              {section.title}
            </div>
          </div>
          {leaf.count ? (
            <Badge variant="secondary" title="Outstanding strings">
              {leaf.count}
            </Badge>
          ) : (
            <ArrowUpRight className="text-muted-foreground size-4" />
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
