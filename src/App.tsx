import { ThemeProvider } from "next-themes"

import { AppHeader } from "@/components/layout/app_header"
import { AppSidebar } from "@/components/layout/app_sidebar"
import { Toaster } from "@/components/ui/sonner"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TranslationsPage } from "@/pages/translations_page"

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <AppHeader title="Translations" />
          <TranslationsPage />
        </SidebarInset>
      </SidebarProvider>
      <Toaster />
    </ThemeProvider>
  )
}

export default App
