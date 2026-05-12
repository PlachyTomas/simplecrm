/**
 * Typed wrappers around the email-auth endpoints. Sits on top of `apiFetch`
 * so each call still throws `ApiError` on a non-2xx response — the pages
 * branch on `err.body.detail.code` to render specific UI states (e.g. show
 * "use Google" CTA on `oauth_only_account`, "verify your email" on
 * `email_not_verified`, etc.).
 */

import { apiFetch } from "@/lib/api";

import type { CurrentUser } from "@/auth/useCurrentUser";

export interface AuthSuccessResponse {
  access_token: string;
  token_type: string;
  user: CurrentUser;
}

export interface TokenCheckResponse {
  email: string;
  requires_password: boolean;
}

export interface AuthErrorBody {
  detail?: {
    code?: string;
    message?: string;
    retry_after_seconds?: number;
  };
}

/** Reads the `detail.code` discriminator out of an ApiError's body. */
export function authErrorCode(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const detail = (body as AuthErrorBody).detail;
  if (!detail || typeof detail !== "object") return null;
  return typeof detail.code === "string" ? detail.code : null;
}

export function authErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const detail = (body as AuthErrorBody).detail;
  if (!detail || typeof detail !== "object") return null;
  return typeof detail.message === "string" ? detail.message : null;
}

/** Result shape for `POST /auth/signup`.
 *
 * Brand-new users are auto-logged-in (`access_token` set, `detail`
 * undefined). The Google-only-linking path still returns a 202 with only
 * `detail` set — in that case `access_token` is undefined and the page
 * keeps showing the "check your email" panel.
 */
export type SignupResponse =
  | (AuthSuccessResponse & { detail?: undefined })
  | { detail: string; access_token?: undefined };

export function signup(body: { email: string; password: string; name: string }) {
  return apiFetch<SignupResponse>("/api/v1/auth/signup", {
    method: "POST",
    body,
  });
}

export function checkVerifyToken(token: string) {
  return apiFetch<TokenCheckResponse>("/api/v1/auth/verify-email/check", {
    method: "POST",
    body: { token },
  });
}

export function consumeVerifyToken(args: { token: string; password?: string }) {
  return apiFetch<AuthSuccessResponse>("/api/v1/auth/verify-email/consume", {
    method: "POST",
    body: args,
  });
}

export function resendVerification(email: string) {
  return apiFetch<{ detail: string }>("/api/v1/auth/verify-email/resend", {
    method: "POST",
    body: { email },
  });
}

export function login(body: { email: string; password: string }) {
  return apiFetch<AuthSuccessResponse>("/api/v1/auth/login", {
    method: "POST",
    body,
  });
}

export function requestPasswordReset(email: string) {
  return apiFetch<{ detail: string }>("/api/v1/auth/password-reset/request", {
    method: "POST",
    body: { email },
  });
}

export function confirmPasswordReset(args: { token: string; newPassword: string }) {
  return apiFetch<AuthSuccessResponse>("/api/v1/auth/password-reset/confirm", {
    method: "POST",
    body: { token: args.token, new_password: args.newPassword },
  });
}

export function acceptInvite(args: { token: string; password: string; name: string }) {
  return apiFetch<AuthSuccessResponse>("/api/v1/auth/invite/accept", {
    method: "POST",
    body: args,
  });
}
