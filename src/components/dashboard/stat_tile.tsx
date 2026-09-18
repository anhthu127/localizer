import type { LucideIcon } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"

type StatTileProps = {
  label: string
  value: string
  hint: string
  icon: LucideIcon
}

export function StatTile({ label, value, hint, icon: Icon }: StatTileProps) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3">
        <div className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="text-muted-foreground text-xs">{label}</div>
          <div className="text-2xl leading-tight font-semibold tabular-nums">
            {value}
          </div>
          <div className="text-muted-foreground mt-0.5 truncate text-xs">
            {hint}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
