import { Search } from "lucide-react"

import { ThemeToggle } from "@/components/theme_toggle"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

type AppHeaderProps = {
  title: string
}

export function AppHeader({ title }: AppHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="mr-1 h-4" />
      <h1 className="text-sm font-medium">{title}</h1>
      <div className="ml-auto flex items-center gap-2">
        <div className="relative hidden sm:block">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input placeholder="Search keys…" className="w-56 pl-8" />
        </div>
        <ThemeToggle />
      </div>
    </header>
  )
}
