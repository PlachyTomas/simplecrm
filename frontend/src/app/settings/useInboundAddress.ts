import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

export type InboundAddress = components["schemas"]["InboundAddressOut"];

const BASE = "/api/v1/me/inbound-address";
const KEY = ["inbound-address"];

/** The user's personal Smart-BCC address. The backend mints the token lazily
 * on first GET, so simply reading this is what creates the address. */
export function useInboundAddress() {
  const { accessToken } = useAuth();
  return useQuery<InboundAddress>({
    queryKey: KEY,
    enabled: !!accessToken,
    queryFn: () => apiFetch<InboundAddress>(BASE, { token: accessToken }),
  });
}

/** Issue a fresh address; anything BCC'd to the previous one stops being filed. */
export function useRotateInboundAddress() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<InboundAddress, Error, void>({
    mutationFn: () =>
      apiFetch<InboundAddress>(`${BASE}/rotate`, { method: "POST", token: accessToken }),
    // The response *is* the new address, so seeding the cache is enough — an
    // invalidate would only buy a redundant GET of what we already hold.
    onSuccess: (data) => qc.setQueryData(KEY, data),
  });
}
