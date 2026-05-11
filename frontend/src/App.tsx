import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { AppShell } from "@/app/AppShell";
import { MorePage } from "@/app/MorePage";
import { BillingReturnPage } from "@/app/billing/BillingReturnPage";
import { CompaniesListPage } from "@/app/companies/CompaniesListPage";
import { CompanyDetailPage } from "@/app/companies/CompanyDetailPage";
import { ContactsPage } from "@/app/contacts/ContactsPage";
import { DashboardPage } from "@/app/dashboard/DashboardPage";
import { DealDetailPage } from "@/app/deals/DealDetailPage";
import { DealsListPage } from "@/app/deals/DealsListPage";
import { FeedbackPage } from "@/app/feedback/FeedbackPage";
import { PipelinePage } from "@/app/pipeline/PipelinePage";
import { ReportsPage } from "@/app/reports/ReportsPage";
import { SettingsPage } from "@/app/settings/SettingsPage";
import { AuthProvider } from "@/auth/AuthContext";
import { ForgotPasswordPage } from "@/auth/ForgotPasswordPage";
import { LoginPage } from "@/auth/LoginPage";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { ResetPasswordPage } from "@/auth/ResetPasswordPage";
import { SignupPage } from "@/auth/SignupPage";
import { VerifyEmailPage } from "@/auth/VerifyEmailPage";
import { queryClient } from "@/lib/queryClient";
import { ThemeProvider } from "@/lib/theme";
import { ToastProvider } from "@/lib/toast";
import { CenikPage } from "@/marketing/CenikPage";
import { CookieConsent } from "@/marketing/cookie-consent";
import { LandingPage } from "@/marketing/LandingPage";
import { CookiesPage } from "@/marketing/legal/CookiesPage";
import { KontaktPage } from "@/marketing/legal/KontaktPage";
import { ObchodniPodminkyPage } from "@/marketing/legal/ObchodniPodminkyPage";
import { OchranaOsobnichUdajuPage } from "@/marketing/legal/OchranaOsobnichUdajuPage";
import { PredplatnePage } from "@/marketing/legal/PredplatnePage";
import { ZpracovatelskaSmlouvaPage } from "@/marketing/legal/ZpracovatelskaSmlouvaPage";
import { NotFoundPage } from "@/marketing/NotFoundPage";
import { AcceptInvitePage } from "@/onboarding/AcceptInvitePage";
import { CreateOrgPage } from "@/onboarding/CreateOrgPage";
import { AdminPage } from "@/admin/AdminPage";
import { RequireSuperAdmin } from "@/auth/RequireSuperAdmin";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/cenik" element={<CenikPage />} />
      <Route path="/kontakt" element={<KontaktPage />} />
      <Route path="/obchodni-podminky" element={<ObchodniPodminkyPage />} />
      <Route path="/ochrana-osobnich-udaju" element={<OchranaOsobnichUdajuPage />} />
      <Route path="/zpracovatelska-smlouva" element={<ZpracovatelskaSmlouvaPage />} />
      <Route path="/cookies" element={<CookiesPage />} />
      <Route path="/predplatne" element={<PredplatnePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/invite/:token" element={<AcceptInvitePage />} />
      <Route
        path="/onboarding/create-org"
        element={
          <ProtectedRoute requireOrg={false}>
            <CreateOrgPage />
          </ProtectedRoute>
        }
      />
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
        <Route path="nastaveni/predplatne" element={<SettingsPage initialTab="billing" />} />
        <Route path="feedback" element={<FeedbackPage />} />
        <Route path="billing/return" element={<BillingReturnPage />} />
        <Route path="more" element={<MorePage />} />
      </Route>
      <Route
        path="/admin"
        element={
          <RequireSuperAdmin>
            <AdminPage />
          </RequireSuperAdmin>
        }
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <BrowserRouter>
              <AppRoutes />
              <CookieConsent />
            </BrowserRouter>
          </AuthProvider>
        </QueryClientProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
