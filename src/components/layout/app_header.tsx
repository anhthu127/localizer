import { ChevronRight, Search } from "lucide-react"
import { Link, useLocation } from "react-router"

import { ThemeToggle } from "@/components/theme_toggle"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { findNavLeaf } from "@/config/nav_items"

export function AppHeader() {
  const { pathname } = useLocation()
  const [, sectionId, leafId] = pathname.split("/")
  const match = findNavLeaf(sectionId, leafId)

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="mr-1 h-4" />
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm">
        <Link
          to="/"
          className={
            match
              ? "text-muted-foreground hover:text-foreground"
              : "font-medium"
          }
        >
          Home
        </Link>
        {match && (
          <>
            <ChevronRight className="text-muted-foreground size-3.5" />
            <span className="text-muted-foreground">
              {match.section.title}
            </span>
            <ChevronRight className="text-muted-foreground size-3.5" />
            <span className="font-medium">{match.leaf.title}</span>
          </>
        )}
      </nav>
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
