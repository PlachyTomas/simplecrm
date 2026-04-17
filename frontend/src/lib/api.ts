/**
 * Thin typed fetch wrapper around the backend API.
 *
 * Errors are thrown as `ApiError` with the HTTP status, so TanStack Query
 * can surface them cleanly and `ProtectedRoute` can branch on 401/402.
 */

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `Request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export interface TrialExpiredPayload {
  detail: "Trial expired";
  trial_ends_at: string;
  organization_id: string;
}

export function isTrialExpired(err: unknown): err is ApiError & { body: TrialExpiredPayload } {
  if (!(err instanceof ApiError) || err.status !== 402) return false;
  const body = err.body as { detail?: unknown } | undefined;
  const wrapped =
    body && typeof body === "object" && "detail" in body && body.detail
      ? (body.detail as unknown)
      : body;
  return (
    !!wrapped &&
    typeof wrapped === "object" &&
    (wrapped as { detail?: string }).detail === "Trial expired"
  );
}

export interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  token?: string | null;
  body?: BodyInit | Record<string, unknown> | null;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { token, body, headers, ...rest } = options;
  const h = new Headers(headers);
  if (token) h.set("Authorization", `Bearer ${token}`);

  let serializedBody: BodyInit | undefined;
  if (body !== undefined && body !== null) {
    if (typeof body === "string" || body instanceof FormData || body instanceof Blob) {
      serializedBody = body;
    } else {
      h.set("Content-Type", "application/json");
      serializedBody = JSON.stringify(body);
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    ...rest,
    headers: h,
    body: serializedBody,
  });

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status, payload);
  }
  return payload as T;
}
