import type { LucideIcon } from "lucide-react"

import { AnimatedNumber } from "@/components/motion/animated_number"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type StatTileProps = {
  label: string
  /** Null until the number it counts has loaded. */
  value: number | null
  hint: string
  icon: LucideIcon
  tone?: "warning"
}

export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: StatTileProps) {
  const warning = tone === "warning"

  return (
    <Card
      className={cn(
        "transition-colors",
        warning
          ? "border-amber-500/40 bg-amber-500/5 hover:border-amber-500/60"
          : "hover:border-foreground/20"
      )}
    >
      <CardContent className="flex items-start gap-3">
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            warning
              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
              : "bg-muted text-muted-foreground"
          )}
        >
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="text-muted-foreground text-xs">{label}</div>
          <div
            className={cn(
              "text-2xl leading-tight font-semibold tabular-nums",
              warning && "text-amber-700 dark:text-amber-400"
            )}
          >
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
