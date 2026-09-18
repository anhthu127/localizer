import { Outlet } from "react-router"

import { AppHeader } from "@/components/layout/app_header"
import { AppSidebar } from "@/components/layout/app_sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

/** Shell shared by every route: sidebar, header, scrollable content slot. */
export function AppLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="h-svh overflow-hidden">
        <AppHeader />
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  )
}
