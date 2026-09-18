import { useState } from "react"
import { ChevronRight, Languages, LayoutDashboard } from "lucide-react"
import { Link, useLocation } from "react-router"

import { navPath, navSections } from "@/config/nav_items"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar"

export function AppSidebar() {
  const { pathname } = useLocation()
  const activeSectionId = pathname.split("/")[1] ?? ""

  // Open groups are derived from the route, but a manual toggle wins until the
  // route moves to another section — hence the reset during render rather than
  // an effect.
  const [opened, setOpened] = useState<{
    section: string
    overrides: Record<string, boolean>
  }>({ section: activeSectionId, overrides: {} })

  if (opened.section !== activeSectionId) {
    setOpened({ section: activeSectionId, overrides: {} })
  }

  return (
    <Sidebar>
      <SidebarHeader>
        <Link to="/" className="flex items-center gap-2 px-2 py-1.5">
          <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md">
            <Languages className="size-4" />
          </div>
          <div className="grid text-sm leading-tight">
            <span className="font-semibold">Localizer</span>
            <span className="text-muted-foreground text-xs">Redesign</span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Home"
                  isActive={pathname === "/"}
                  render={<Link to="/" />}
                >
                  <LayoutDashboard />
                  <span>Home</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Targets</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navSections.map((section) => {
                const isOpen =
                  opened.overrides[section.id] ?? section.id === activeSectionId

                return (
                  <Collapsible
                    key={section.id}
                    open={isOpen}
                    onOpenChange={(value) =>
                      setOpened((current) => ({
                        ...current,
                        overrides: {
                          ...current.overrides,
                          [section.id]: value,
                        },
                      }))
                    }
                    render={<SidebarMenuItem />}
                    className="group/collapsible"
                  >
                    <CollapsibleTrigger
                      render={
                        <SidebarMenuButton tooltip={section.title}>
                          <section.icon />
                          <span>{section.title}</span>
                          <ChevronRight className="ml-auto transition-transform duration-200 group-data-open/collapsible:rotate-90" />
                        </SidebarMenuButton>
                      }
                    />
                    <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 ease-out data-ending-style:h-0 data-starting-style:h-0">
                      <SidebarMenuSub>
                        {section.items.map((item) => {
                          const path = navPath(section, item)

                          return (
                            <SidebarMenuSubItem key={item.id}>
                              <SidebarMenuSubButton
                                isActive={pathname === path}
                                render={<Link to={path} />}
                              >
                                <item.icon />
                                <span>{item.title}</span>
                              </SidebarMenuSubButton>
                              {item.count ? (
                                <SidebarMenuBadge>
                                  {item.count}
                                </SidebarMenuBadge>
                              ) : null}
                            </SidebarMenuSubItem>
                          )
                        })}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </Collapsible>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  )
}
