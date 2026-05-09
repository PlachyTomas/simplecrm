import { useMutation } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { API_BASE_URL } from "@/lib/api";

type ExportKind = "csv" | "pdfs" | "full";

const FILENAME_BY_KIND: Record<ExportKind, (year: number) => string> = {
  csv: (year) => `faktury-${year}.csv`,
  pdfs: (year) => `faktury-${year}-pdfs.zip`,
  full: (year) => `faktury-${year}-uplny-export.zip`,
};

function useExport(kind: ExportKind) {
  const { accessToken } = useAuth();
  return useMutation({
    mutationFn: async (year: number) => {
      const res = await fetch(`${API_BASE_URL}/api/v1/admin/invoices/export/${kind}?year=${year}`, {
        method: "GET",
        credentials: "include",
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      });
      if (!res.ok) {
        throw new Error(`Export failed (${res.status})`);
      }
      const blob = await res.blob();
      triggerDownload(blob, FILENAME_BY_KIND[kind](year));
    },
  });
}

export function useExportInvoicesCsv() {
  return useExport("csv");
}

export function useExportInvoicesPdfZip() {
  return useExport("pdfs");
}

export function useExportInvoicesFull() {
  return useExport("full");
}

function triggerDownload(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}
