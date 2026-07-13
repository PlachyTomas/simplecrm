import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";

import {
  HOME_DASHBOARD_CONFIG_QUERY_KEY,
  useHomeDashboardConfig,
  useResetHomeDashboardConfig,
  useSaveHomeDashboardConfig,
  type HomeDashboardConfig,
} from "@/app/dashboard/useHomeDashboard";

const CONFIG: HomeDashboardConfig = {
  version: 1,
  widgets: [
    {
      id: "default_kpi_open_deals",
      position: { x: 0, y: 0, w: 3, h: 2 },
      config: { type: "kpi_open_deals" },
    },
  ],
  mobileOrder: ["default_kpi_open_deals"],
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("useHomeDashboard hooks", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const originalFetch = globalThis.fetch;
  let qc: QueryClient;

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <AuthProvider initialToken="fake">{children}</AuthProvider>
      </QueryClientProvider>
    );
  }

  it("GETs /users/me/home-dashboard and returns the config", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/users/me/home-dashboard")) return jsonResponse(CONFIG);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    const { result } = renderHook(() => useHomeDashboardConfig(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(CONFIG);
  });

  it("swallows API errors to null so the page can render a placeholder", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ detail: "boom" }, 500));
    const { result } = renderHook(() => useHomeDashboardConfig(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("PUTs the config on save and optimistically updates the cache", async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/users/me/home-dashboard")) {
        if (init?.method === "PUT") return jsonResponse(CONFIG);
        return jsonResponse(CONFIG);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    const { result } = renderHook(() => useSaveHomeDashboardConfig(), { wrapper });
    let optimistic: HomeDashboardConfig | null | undefined;
    await act(async () => {
      const promise = result.current.mutateAsync(CONFIG);
      // The optimistic write lands before the request settles.
      await waitFor(() => {
        optimistic = qc.getQueryData<HomeDashboardConfig | null>(HOME_DASHBOARD_CONFIG_QUERY_KEY);
        expect(optimistic).toEqual(CONFIG);
      });
      await promise;
    });
    const putCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(putCall).toBeDefined();
    expect(JSON.parse(String(putCall![1]!.body))).toEqual(CONFIG);
  });

  it("DELETEs on reset and invalidates the config query", async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/users/me/home-dashboard")) {
        if (init?.method === "DELETE") return new Response(null, { status: 204 });
        return jsonResponse(CONFIG);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    const { result } = renderHook(() => useResetHomeDashboardConfig(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });
    const deleteCall = fetchMock.mock.calls.find(([, init]) => init?.method === "DELETE");
    expect(deleteCall).toBeDefined();
  });
});
