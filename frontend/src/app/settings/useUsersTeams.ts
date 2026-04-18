import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

export type UserOut = components["schemas"]["UserOut"];
export type UserUpdate = components["schemas"]["UserUpdate"];
export type TeamOut = components["schemas"]["TeamOut"];
export type TeamCreate = components["schemas"]["TeamCreate"];
export type TeamUpdate = components["schemas"]["TeamUpdate"];

type PageUsers = components["schemas"]["Page_UserOut_"];
type PageTeams = components["schemas"]["Page_TeamOut_"];

export const USERS_KEY = ["org", "users"] as const;
export const TEAMS_KEY = ["org", "teams"] as const;

export function useOrgUsers() {
  const { accessToken } = useAuth();
  return useQuery<PageUsers>({
    queryKey: USERS_KEY,
    enabled: !!accessToken,
    staleTime: 15_000,
    queryFn: () =>
      apiFetch<PageUsers>("/api/v1/users?limit=100", { token: accessToken }),
  });
}

export function useOrgTeams() {
  const { accessToken } = useAuth();
  return useQuery<PageTeams>({
    queryKey: TEAMS_KEY,
    enabled: !!accessToken,
    staleTime: 15_000,
    queryFn: () =>
      apiFetch<PageTeams>("/api/v1/teams?limit=100", { token: accessToken }),
  });
}

export function useUpdateUser() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<UserOut, Error, { id: string; patch: UserUpdate }>({
    mutationFn: ({ id, patch }) =>
      apiFetch<UserOut>(`/api/v1/users/${id}`, {
        method: "PATCH",
        token: accessToken,
        body: patch as unknown as Record<string, unknown>,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: USERS_KEY });
    },
  });
}

export function useCreateTeam() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<TeamOut, Error, TeamCreate>({
    mutationFn: (body) =>
      apiFetch<TeamOut>("/api/v1/teams", {
        method: "POST",
        token: accessToken,
        body: body as unknown as Record<string, unknown>,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: TEAMS_KEY });
    },
  });
}

export function useUpdateTeam() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<TeamOut, Error, { id: string; patch: TeamUpdate }>({
    mutationFn: ({ id, patch }) =>
      apiFetch<TeamOut>(`/api/v1/teams/${id}`, {
        method: "PUT",
        token: accessToken,
        body: patch as unknown as Record<string, unknown>,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: TEAMS_KEY });
    },
  });
}

export function useDeleteTeam() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) =>
      apiFetch<void>(`/api/v1/teams/${id}`, { method: "DELETE", token: accessToken }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: TEAMS_KEY });
      void qc.invalidateQueries({ queryKey: USERS_KEY });
    },
  });
}
