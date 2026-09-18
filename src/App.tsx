import { ThemeProvider } from "next-themes"
import { BrowserRouter, Navigate, Route, Routes } from "react-router"

import { AppLayout } from "@/components/layout/app_layout"
import { Toaster } from "@/components/ui/sonner"
import { DashboardPage } from "@/pages/dashboard_page"
import { TargetPage } from "@/pages/target_page"

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            {/* `/web/school`, `/others/email`, … — one route per nav leaf.
                `TargetPage` picks the screen from the target's content kind. */}
            <Route path=":sectionId/:leafId" element={<TargetPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster />
    </ThemeProvider>
  )
}

export default App
