import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import type { CompanyOut } from "@/app/companies/useCompanies";

export function useCompany(companyId: string | undefined) {
  const { accessToken } = useAuth();
  return useQuery<CompanyOut>({
    queryKey: ["company", companyId],
    enabled: !!accessToken && !!companyId,
    queryFn: () => apiFetch<CompanyOut>(`/api/v1/companies/${companyId}`, { token: accessToken }),
  });
}
