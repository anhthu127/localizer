import type { LucideIcon } from "lucide-react"

import { AnimatedNumber } from "@/components/motion/animated_number"
import { Card, CardContent } from "@/components/ui/card"

type StatTileProps = {
  label: string
  /** Null until the number it counts has loaded. */
  value: number | null
  hint: string
  icon: LucideIcon
}

export function StatTile({ label, value, hint, icon: Icon }: StatTileProps) {
  return (
    <Card className="hover:border-foreground/20 transition-colors">
      <CardContent className="flex items-start gap-3">
        <div className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="text-muted-foreground text-xs">{label}</div>
          <div className="text-2xl leading-tight font-semibold tabular-nums">
            <AnimatedNumber value={value} />
          </div>
          <div className="text-muted-foreground mt-0.5 truncate text-xs">
            {hint}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
