import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "@/app/AppShell";
import { MorePage } from "@/app/MorePage";
import { CompaniesListPage } from "@/app/companies/CompaniesListPage";
import { CompanyDetailPage } from "@/app/companies/CompanyDetailPage";
import { ContactsPage } from "@/app/contacts/ContactsPage";
import { DashboardPage } from "@/app/dashboard/DashboardPage";
import { DealDetailPage } from "@/app/deals/DealDetailPage";
import { DealsListPage } from "@/app/deals/DealsListPage";
import { PipelinePage } from "@/app/pipeline/PipelinePage";
import { ReportsPage } from "@/app/reports/ReportsPage";
import { SettingsPage } from "@/app/settings/SettingsPage";
import { AuthProvider } from "@/auth/AuthContext";
import { LoginPage } from "@/auth/LoginPage";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { queryClient } from "@/lib/queryClient";
import { LandingPage } from "@/marketing/LandingPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="companies" element={<CompaniesListPage />} />
        <Route path="companies/:companyId" element={<CompanyDetailPage />} />
        <Route path="pipeline" element={<PipelinePage />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="contacts/:contactId" element={<ContactsPage />} />
        <Route path="deals" element={<DealsListPage />} />
        <Route path="deals/:dealId" element={<DealDetailPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="more" element={<MorePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
