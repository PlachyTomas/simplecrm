import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AppHome, AppShell } from "@/app/AppShell";
import { ComingSoonPage } from "@/app/ComingSoonPage";
import { MorePage } from "@/app/MorePage";
import { CompaniesListPage } from "@/app/companies/CompaniesListPage";
import { CompanyDetailPage } from "@/app/companies/CompanyDetailPage";
import { ContactsPage } from "@/app/contacts/ContactsPage";
import { DealDetailPage } from "@/app/deals/DealDetailPage";
import { DealsListPage } from "@/app/deals/DealsListPage";
import { PipelinePage } from "@/app/pipeline/PipelinePage";
import { AuthProvider } from "@/auth/AuthContext";
import { LoginPage } from "@/auth/LoginPage";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { queryClient } from "@/lib/queryClient";
import { LandingStub } from "@/marketing/LandingStub";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingStub />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<AppHome />} />
        <Route path="companies" element={<CompaniesListPage />} />
        <Route path="companies/:companyId" element={<CompanyDetailPage />} />
        <Route path="pipeline" element={<PipelinePage />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="contacts/:contactId" element={<ContactsPage />} />
        <Route path="deals" element={<DealsListPage />} />
        <Route path="deals/:dealId" element={<DealDetailPage />} />
        <Route
          path="reports"
          element={
            <ComingSoonPage title="Reporty" description="Výkazy a leaderboard přibudou v Fázi 8." />
          }
        />
        <Route
          path="settings"
          element={
            <ComingSoonPage
              title="Nastavení"
              description="Nastavení profilu, týmu a pipeline dorazí v Fázi 10."
            />
          }
        />
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
