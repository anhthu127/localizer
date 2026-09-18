import { motion } from "motion/react"
import { Outlet, useLocation } from "react-router"

import { AppHeader } from "@/components/layout/app_header"
import { AppSidebar } from "@/components/layout/app_sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { pageEnter } from "@/lib/motion"

/** Shell shared by every route: sidebar, header, scrollable content slot. */
export function AppLayout() {
  const { pathname } = useLocation()

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="h-svh overflow-hidden">
        <AppHeader />
        {/* Keyed on the path, so a target swap remounts the screen and plays
            its entrance — and drops the previous target's unsaved edits with
            it. There is no exit animation on purpose: the outgoing screen
            still reads the router's context, so holding it on screen would
            show it the new target's data for the length of the fade. */}
        <motion.div
          key={pathname}
          className="flex min-h-0 flex-1 flex-col"
          variants={pageEnter}
          initial="hidden"
          animate="visible"
        >
          <Outlet />
        </motion.div>
      </SidebarInset>
    </SidebarProvider>
  )
}
