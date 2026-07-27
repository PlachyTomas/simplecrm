import { useMutation } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { API_BASE_URL } from "@/lib/api";

/**
 * Hand a blob to the browser as a download. Extracted from the reports
 * export so the list exports (Obchody, Kontakty) trigger downloads the
 * exact same way.
 */
export function triggerCsvDownload(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

/**
 * Pull `filename="…"` out of a Content-Disposition header.
 *
 * The server owns the name — it is what encodes the export date and the
 * "-first-5000" marker when the row cap clipped the result — so the client
 * only supplies a fallback for the case where the header is missing or
 * unreadable (a cross-origin response without the expose-headers allowlist).
 */
export function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
  return match?.[1] ? decodeURIComponent(match[1]) : fallback;
}

/**
 * GET a CSV endpoint and save the response.
 *
 * Uses raw `fetch` rather than `apiFetch` for the same reason the reports
 * export does: the body is a CSV blob, not JSON, and we need the response
 * headers to recover the server-chosen filename.
 */
export function useCsvExport({ path, fallbackName }: { path: string; fallbackName: string }) {
  const { accessToken } = useAuth();

  return useMutation<void, Error, URLSearchParams | undefined>({
    mutationFn: async (params) => {
      const query = params?.toString();
      const res = await fetch(`${API_BASE_URL}${path}${query ? `?${query}` : ""}`, {
        credentials: "include",
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      triggerCsvDownload(
        blob,
        filenameFromDisposition(res.headers.get("Content-Disposition"), fallbackName),
      );
    },
  });
}
