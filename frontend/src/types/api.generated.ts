/* eslint-disable */
/* prettier-ignore */
// AUTO-GENERATED — do not edit by hand.
// Run `pnpm run types:generate` to regenerate from the backend OpenAPI spec.

export interface paths {
    "/api/v1/healthz": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Healthz */
        get: operations["healthz_api_v1_healthz_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/healthz/db": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Healthz Db */
        get: operations["healthz_db_api_v1_healthz_db_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/google/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Google Login
         * @description Kick off Google OAuth. An optional `invite` query carries a signed
         *     invitation token — we tunnel it through the OAuth `state` so it
         *     survives the round-trip back to `/google/callback`. Tokens are
         *     transparent to Google; they're only meaningful to us.
         */
        get: operations["google_login_api_v1_auth_google_login_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/google/callback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Google Callback */
        get: operations["google_callback_api_v1_auth_google_callback_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Me
         * @description Returns the current user. Gated by trial status — when the org's trial
         *     has ended and no subscription is active, this 402s so the frontend's
         *     `ProtectedRoute` can render `<TrialExpiredGate />`.
         */
        get: operations["me_api_v1_auth_me_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Logout
         * @description Clear the refresh cookie + revoke the server-side allowlist row.
         *
         *     Best-effort revoke: if the cookie's JWT is decodable and carries a `jti`,
         *     we delete the matching row so the rotated-out token can't be replayed
         *     even with a stolen pre-logout copy. A bad/missing cookie still 204s —
         *     logout is idempotent from the client's perspective.
         */
        post: operations["logout_api_v1_auth_logout_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Refresh
         * @description Exchange the httponly refresh cookie for a fresh access token + rotated refresh.
         *
         *     401 when the cookie is missing, expired, malformed, the user no longer
         *     exists / is inactive, or the `jti` is not in the active allowlist (QA-024
         *     Part B — covers the leaked-then-rotated case). Frontend treats any 401
         *     here as "not logged in" and routes to /login. The trial gate is **not**
         *     applied here on purpose — refreshing the session must work even with an
         *     expired trial so the `<TrialExpiredGate />` can render after `/auth/me`
         *     402s.
         *
         *     Rotation: on success, the incoming `jti` is deleted and a new row is
         *     inserted, so the old refresh JWT is server-side invalid even though it
         *     remains cryptographically valid until its `exp`.
         */
        post: operations["refresh_api_v1_auth_refresh_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/signup": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Signup
         * @description Start an email-signup flow.
         *
         *     For a brand-new email this creates the User and immediately mints a
         *     session — verification is no longer a hard gate, it surfaces as an
         *     in-app banner the user can dismiss once they click the verification
         *     link. Returns the same `AuthSuccessResponse` shape as `/login` so the
         *     frontend can drop the user into the app right away.
         *
         *     For an email that already belongs to a Google-only user, we still send
         *     a "verify to add a password" link without touching the row — the
         *     password is written when the link is consumed (so a stranger who knows
         *     your email can't overwrite a pending password). In that case the
         *     response stays a 202 with `detail`, and the frontend keeps showing the
         *     "check your email" panel.
         */
        post: operations["signup_api_v1_auth_signup_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/verify-email/check": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Verify Email Check
         * @description Inspect a verification token without consuming it.
         *
         *     Powers VerifyEmailPage's first call: the page uses `requires_password`
         *     to decide whether to prompt for a password before calling consume.
         */
        post: operations["verify_email_check_api_v1_auth_verify_email_check_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/verify-email/consume": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Verify Email Consume
         * @description Consume a verification token, mark the user verified, auto-login.
         *
         *     Same auto-login shape as the Google callback (access token in body,
         *     refresh cookie set), so the frontend can hand the user a logged-in app
         *     immediately after they click the link.
         */
        post: operations["verify_email_consume_api_v1_auth_verify_email_consume_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/verify-email/resend": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Verify Email Resend
         * @description Resend the verification email if the user is unverified.
         *
         *     Always returns 202 — we don't reveal whether the email is registered or
         *     already verified. A 429 cooldown is the one exception (carries a clear
         *     'wait N seconds' signal which the user already knows applies to them).
         */
        post: operations["verify_email_resend_api_v1_auth_verify_email_resend_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Login
         * @description Log in with email + password. Issues access + refresh tokens.
         *
         *     Returns 401 with `code=oauth_only_account` when the email belongs to a
         *     Google-only user; the frontend renders a "use Google to sign in" CTA.
         *     Unverified emails are *not* rejected — the user is logged in and the
         *     app shows a "verify your email" banner instead.
         */
        post: operations["login_api_v1_auth_login_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/password-reset/request": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Password Reset Request
         * @description Email a password-reset link to the user (if they exist + have a password).
         *
         *     Silent on missing / oauth-only emails; only the cooldown surfaces a
         *     distinct 429.
         */
        post: operations["password_reset_request_api_v1_auth_password_reset_request_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/password-reset/confirm": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Password Reset Confirm
         * @description Set a new password and auto-login. Revokes every existing refresh
         *     token for the user so a stolen pre-reset session can't outlive the
         *     reset.
         */
        post: operations["password_reset_confirm_api_v1_auth_password_reset_confirm_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/invite/accept": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Invite Accept
         * @description Accept an invitation by signing up with email + password.
         *
         *     Mirrors the Google invite path on `/auth/google/callback` but for
         *     email-only invitees: the invite click is treated as proof of email
         *     ownership (the link was sent to that exact address), so we mark the
         *     user verified and auto-login without a separate verify-email step.
         *
         *     Errors map to the same set the Google path emits, so the AcceptInvitePage
         *     can render one localized message for each:
         *       404 invitation_not_found
         *       410 invitation_expired
         *       409 invitation_consumed
         *       409 user_already_in_organization
         *       422 weak_password
         */
        post: operations["invite_accept_api_v1_auth_invite_accept_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/onboarding/organization": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Create Organization
         * @description Provision a new Organization for the currently logged-in user.
         *
         *     Only callable by users who don't already belong to an org — calling
         *     this from an existing-org user is a 409 (the create-org page is
         *     front-end-gated, so this is just a defense-in-depth check).
         */
        post: operations["create_organization_api_v1_onboarding_organization_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/onboarding/invite/{token}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Preview Invitation
         * @description Public preview for the AcceptInvitePage. Distinguishes signature
         *     failure (404), expiry (410 Gone), and already-consumed (409) so the
         *     UI can render a precise message.
         */
        get: operations["preview_invitation_api_v1_onboarding_invite__token__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reports/export-csv": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Export Deals Csv
         * @description Deals CSV export matching the caller's visibility scope.
         *
         *     Available even when the org's trial has ended — see module docstring.
         */
        get: operations["export_deals_csv_api_v1_reports_export_csv_get"];
        put?: never;
        /**
         * Export Widgets Csv
         * @description Render the visible widget set + filters as a single CSV.
         *
         *     REPORTS_TASK §R7: one section per widget separated by a blank
         *     line and a header row, UTF-8 with BOM so Excel renders Czech
         *     diacritics. The legacy `GET /reports/export-csv` (deals data
         *     export, mounted in `data_export.py`) is intentionally a different
         *     endpoint — same path, distinct method.
         */
        post: operations["export_widgets_csv_api_v1_reports_export_csv_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/feedback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Submit Feedback */
        post: operations["submit_feedback_api_v1_feedback_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/organizations/current": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Current Organization */
        get: operations["get_current_organization_api_v1_organizations_current_get"];
        /** Update Current Organization */
        put: operations["update_current_organization_api_v1_organizations_current_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/companies": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Companies */
        get: operations["list_companies_api_v1_companies_get"];
        put?: never;
        /** Create Company */
        post: operations["create_company_api_v1_companies_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/companies/lookup-registry": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Lookup Registry */
        get: operations["lookup_registry_api_v1_companies_lookup_registry_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/companies/{company_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Company */
        get: operations["get_company_api_v1_companies__company_id__get"];
        /** Update Company */
        put: operations["update_company_api_v1_companies__company_id__put"];
        post?: never;
        /** Delete Company */
        delete: operations["delete_company_api_v1_companies__company_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/companies/{company_id}/free": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Free Company
         * @description Admin/manager-initiated release into the shared pool.
         */
        post: operations["free_company_api_v1_companies__company_id__free_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/companies/{company_id}/reassign": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Reassign Company Endpoint
         * @description Transfer a company to a specific new owner (admin or manager).
         */
        post: operations["reassign_company_endpoint_api_v1_companies__company_id__reassign_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/contacts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Contacts */
        get: operations["list_contacts_api_v1_contacts_get"];
        put?: never;
        /** Create Contact */
        post: operations["create_contact_api_v1_contacts_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/contacts/{contact_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Contact */
        get: operations["get_contact_api_v1_contacts__contact_id__get"];
        /** Update Contact */
        put: operations["update_contact_api_v1_contacts__contact_id__put"];
        post?: never;
        /** Delete Contact */
        delete: operations["delete_contact_api_v1_contacts__contact_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/deals": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Deals */
        get: operations["list_deals_api_v1_deals_get"];
        put?: never;
        /** Create Deal */
        post: operations["create_deal_api_v1_deals_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/deals/{deal_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Deal */
        get: operations["get_deal_api_v1_deals__deal_id__get"];
        /** Update Deal */
        put: operations["update_deal_api_v1_deals__deal_id__put"];
        post?: never;
        /** Delete Deal */
        delete: operations["delete_deal_api_v1_deals__deal_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/deals/{deal_id}/move-stage": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Move Deal Stage
         * @description Drag-and-drop endpoint for the kanban board.
         *
         *     Syncs `closed_at` and `lost_reason` to the destination stage's type:
         *       * Drag into a `won` stage  → set `closed_at = now`, clear lost_reason,
         *         refresh the company's last_order_at + ownership_expires_at (matches
         *         `mark-won` semantics; otherwise the deal would be invisible from
         *         the board's won-window filter).
         *       * Drag into a `lost` stage → set `closed_at = now` so the deal is
         *         marked terminal. `lost_reason` is left as-is — drag has no UI for
         *         capturing it; the founder can edit via the deal detail page.
         *       * Drag into an `open` stage → clear `closed_at` and `lost_reason`
         *         ("reopen"). Without this, dragging a won deal back to an earlier
         *         stage would leave `closed_at` set, and the board's visibility
         *         filter would hide the row.
         */
        post: operations["move_deal_stage_api_v1_deals__deal_id__move_stage_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/deals/{deal_id}/mark-won": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Mark Deal Won
         * @description Stamp the deal as won, move it to the pipeline's `won` stage, and
         *     refresh the company's last_order_at so the auto-free clock resets.
         */
        post: operations["mark_deal_won_api_v1_deals__deal_id__mark_won_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/deals/{deal_id}/mark-lost": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Mark Deal Lost
         * @description Stamp the deal as lost with a required reason. Stage stays the same
         *     unless a dedicated `lost` stage exists, in which case we move to it.
         */
        post: operations["mark_deal_lost_api_v1_deals__deal_id__mark_lost_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/deals/{deal_id}/payment": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Update Deal Payment
         * @description Toggle a won deal's paid/unpaid flag.
         *
         *     The UI exposes the checkbox on cards in the won column. Trying to
         *     flip a deal that isn't in a won stage is a 409 — the flag only
         *     carries meaning there and we'd rather force the caller to mark-won
         *     first than have stale `is_paid=true` rows sitting in early stages.
         */
        post: operations["update_deal_payment_api_v1_deals__deal_id__payment_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/invitations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Invitations
         * @description List pending (unaccepted, unrevoked) invitations for the current org.
         *     Acceptance and revocation history is implicit and not exposed here —
         *     the create-form is the single source of truth for what's outstanding.
         */
        get: operations["list_invitations_api_v1_invitations_get"];
        put?: never;
        /** Create */
        post: operations["create_api_v1_invitations_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/invitations/{invitation_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Revoke */
        delete: operations["revoke_api_v1_invitations__invitation_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/organizations/current/invoices": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List My Invoices
         * @description Paginated list of the caller's organization's tax invoices.
         *     Drafts are excluded from the customer surface — those are the
         *     founder's review queue.
         */
        get: operations["list_my_invoices_api_v1_organizations_current_invoices_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/organizations/current/invoices/{invoice_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get My Invoice */
        get: operations["get_my_invoice_api_v1_organizations_current_invoices__invoice_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/organizations/current/invoices/{invoice_id}/pdf": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get My Invoice Pdf
         * @description Stream the archived PDF, hash-verified.
         *
         *     503 (rather than 200 with corrupted bytes) when the stored bytes
         *     fail integrity verification — the customer should know something
         *     is wrong rather than silently file a tampered document.
         */
        get: operations["get_my_invoice_pdf_api_v1_organizations_current_invoices__invoice_id__pdf_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/pipelines/default": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Default Pipeline */
        get: operations["get_default_pipeline_api_v1_pipelines_default_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/pipelines/default/board": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Default Pipeline Board */
        get: operations["get_default_pipeline_board_api_v1_pipelines_default_board_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/pipelines/default/stages": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create Stage */
        post: operations["create_stage_api_v1_pipelines_default_stages_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/pipelines/stages/{stage_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete Stage */
        delete: operations["delete_stage_api_v1_pipelines_stages__stage_id__delete"];
        options?: never;
        head?: never;
        /** Update Stage */
        patch: operations["update_stage_api_v1_pipelines_stages__stage_id__patch"];
        trace?: never;
    };
    "/api/v1/pipelines/default/reorder-stages": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Reorder Stages */
        post: operations["reorder_stages_api_v1_pipelines_default_reorder_stages_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reports/kpi-summary": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Kpi Summary */
        get: operations["kpi_summary_api_v1_reports_kpi_summary_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reports/leaderboard": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Leaderboard */
        get: operations["leaderboard_api_v1_reports_leaderboard_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reports/loss-reasons": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Loss Reasons */
        get: operations["loss_reasons_api_v1_reports_loss_reasons_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reports/pipeline-velocity": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Pipeline Velocity
         * @description Average days from `created_at` to `closed_at` for deals that finished
         *     inside the window, grouped by the final stage. MVP proxy for "time in
         *     stage" — the activity-log-driven accurate version is a later task.
         */
        get: operations["pipeline_velocity_api_v1_reports_pipeline_velocity_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reports/team-leaderboard": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Team Leaderboard
         * @description Aggregate stats grouped by team for the date window.
         *
         *     Every metric is computed on every row so the frontend can switch the
         *     chart's metric without re-fetching. `metric` only seeds the row sort.
         */
        get: operations["team_leaderboard_api_v1_reports_team_leaderboard_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reports/my-summary": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * My Summary
         * @description Personal rollup for the caller across the date window.
         *
         *     `companies_added` is the count of `Company` rows the caller owns whose
         *     `created_at` falls in the window — i.e. "leads I added to the pipeline".
         */
        get: operations["my_summary_api_v1_reports_my_summary_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reports/dashboard-config": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Dashboard Config
         * @description Return the user's persisted layout, or the 8-widget default.
         *
         *     Empty `{}` (column-default for new rows) means "first visit — give
         *     them the starter set." We don't persist on first read; the frontend
         *     PUTs once the user makes a modification.
         */
        get: operations["get_dashboard_config_api_v1_reports_dashboard_config_get"];
        /**
         * Put Dashboard Config
         * @description Validate and persist the user's layout. Returns the round-tripped value.
         */
        put: operations["put_dashboard_config_api_v1_reports_dashboard_config_put"];
        post?: never;
        /**
         * Delete Dashboard Config
         * @description Reset the user's layout to the default. The empty `{}` triggers the
         *     GET endpoint's default-layout fallback on the next read.
         */
        delete: operations["delete_dashboard_config_api_v1_reports_dashboard_config_delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reports/widgets/pipeline-value": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Widget Pipeline Value */
        get: operations["widget_pipeline_value_api_v1_reports_widgets_pipeline_value_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reports/widgets/deals-won": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Widget Deals Won */
        get: operations["widget_deals_won_api_v1_reports_widgets_deals_won_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reports/widgets/win-rate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Widget Win Rate */
        get: operations["widget_win_rate_api_v1_reports_widgets_win_rate_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reports/widgets/avg-deal-size": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Widget Avg Deal Size */
        get: operations["widget_avg_deal_size_api_v1_reports_widgets_avg_deal_size_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reports/widgets/new-companies": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Widget New Companies */
        get: operations["widget_new_companies_api_v1_reports_widgets_new_companies_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reports/widgets/sales-cycle-length": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Widget Sales Cycle Length */
        get: operations["widget_sales_cycle_length_api_v1_reports_widgets_sales_cycle_length_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reports/widgets/lead-to-deal-conversion": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Widget Lead To Deal Conversion */
        get: operations["widget_lead_to_deal_conversion_api_v1_reports_widgets_lead_to_deal_conversion_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reports/widgets/lost-reasons-breakdown": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Widget Lost Reasons Breakdown */
        get: operations["widget_lost_reasons_breakdown_api_v1_reports_widgets_lost_reasons_breakdown_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reports/widgets/sales-leaderboard": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Widget Sales Leaderboard */
        get: operations["widget_sales_leaderboard_api_v1_reports_widgets_sales_leaderboard_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reports/widgets/rep-activity": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Widget Rep Activity */
        get: operations["widget_rep_activity_api_v1_reports_widgets_rep_activity_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reports/widgets/stale-deals": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Widget Stale Deals */
        get: operations["widget_stale_deals_api_v1_reports_widgets_stale_deals_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reports/widgets/companies-at-risk": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Widget Companies At Risk */
        get: operations["widget_companies_at_risk_api_v1_reports_widgets_companies_at_risk_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/teams": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Teams */
        get: operations["list_teams_api_v1_teams_get"];
        put?: never;
        /** Create Team */
        post: operations["create_team_api_v1_teams_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/teams/{team_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Team */
        get: operations["get_team_api_v1_teams__team_id__get"];
        /** Update Team */
        put: operations["update_team_api_v1_teams__team_id__put"];
        post?: never;
        /** Delete Team */
        delete: operations["delete_team_api_v1_teams__team_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/teams/{team_id}/members": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Replace Team Members */
        put: operations["replace_team_members_api_v1_teams__team_id__members_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/users": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Users */
        get: operations["list_users_api_v1_users_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/users/{user_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update User */
        patch: operations["update_user_api_v1_users__user_id__patch"];
        trace?: never;
    };
    "/api/v1/activities": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Activities */
        get: operations["list_activities_api_v1_activities_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/blocked-companies": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Blocked Companies */
        get: operations["list_blocked_companies_api_v1_admin_blocked_companies_get"];
        put?: never;
        /** Create Blocked Company */
        post: operations["create_blocked_company_api_v1_admin_blocked_companies_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/blocked-companies/{blocked_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete Blocked Company */
        delete: operations["delete_blocked_company_api_v1_admin_blocked_companies__blocked_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/organizations/current/subscription": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Current Subscription */
        get: operations["get_current_subscription_api_v1_organizations_current_subscription_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/organizations/current/billing-summary": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Current Billing Summary
         * @description Numbers the in-app pricing/settings surface needs in one round-trip.
         */
        get: operations["get_current_billing_summary_api_v1_organizations_current_billing_summary_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/organizations/current/subscription/choose-plan": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Choose Plan
         * @description Customer (org admin) chooses a plan from the pay-gate.
         *
         *     .. deprecated::
         *         Prefer ``POST /api/v1/payments/initial-payment-init`` — that
         *         endpoint creates a Charge + ComGate hosted-payment URL and
         *         returns ``{redirect_url}``. This endpoint is kept for backwards
         *         compatibility while the frontend migrates; new code should not
         *         call it. Sets ``status='pending_activation'`` and emails the
         *         founder, which is no longer how billing actually advances.
         */
        post: operations["choose_plan_api_v1_organizations_current_subscription_choose_plan_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/organizations/current/subscription/contact-enterprise": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Contact Enterprise
         * @description Send an internal email to the founder requesting an enterprise quote.
         */
        post: operations["contact_enterprise_api_v1_organizations_current_subscription_contact_enterprise_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/organizations/current/subscription/seat-count": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Update Seat Count
         * @description Org admin tunes the contracted seat count.
         *
         *     Four shapes:
         *
         *     - **Cancel queued change** (target == current `seat_count`): clear
         *       both pending fields without changing anything else. Used by the
         *       "Zrušit naplánovanou změnu" button in Organizace + the per-row
         *       pill cancel in Uživatelé.
         *     - **Trial bump** (status='trialing', target > contracted): apply
         *       immediately. The trial-time slider play is locked in at first
         *       payment and billed for the picked count from then on.
         *     - **Increase ≤ contracted** (target > current `seat_count` but
         *       target ≤ contracted_seat_count): apply immediately. Customer is
         *       either un-queueing a downsize or staying within their paid
         *       baseline; no charge needed.
         *     - **Increase > contracted, status='active'**: rejected with HTTP 402
         *       and a `redirect_url` pointing at `POST /payments/seat-change-init`.
         *       The frontend kicks the customer through ComGate; the webhook
         *       eventually applies the bump via `billing.apply_seat_charge_success`.
         *       Closes the bump-then-drop-before-billing abuse documented in
         *       qa-artifacts/2026-05-03-adversary-testing-report.md (Finding 1).
         *     - **Decrease** (target < active): queue the change. `seat_count`
         *       stays at the current contracted value through this period;
         *       `pending_seat_count` and `pending_user_deactivations` carry the
         *       target + the picked victims. The rollover service
         *       (`billing.apply_renewal_success` for ComGate-driven renewals,
         *       `billing.activate_subscription` for super-admin manual flows)
         *       applies the queue at the next period boundary.
         *
         *     The user-creation cap (`Subscription.seat_count`) is unchanged for
         *     queued downsizes — customers keep the seats they paid for through
         *     the current period.
         */
        put: operations["update_seat_count_api_v1_organizations_current_subscription_seat_count_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/organizations/current/subscription/change-interval": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Change Billing Interval
         * @description Queue a monthly ↔ annual switch for the next period.
         *
         *     Mid-period plan changes that require pro-rating are out of scope
         *     (PAYGATE §9). We store the chosen plan in `pending_plan_id`; the
         *     super-admin Aktivovat path applies it on the next activation, and a
         *     future scheduled-rollover job will apply it at period end.
         */
        post: operations["change_billing_interval_api_v1_organizations_current_subscription_change_interval_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/organizations/current/subscription/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Cancel Subscription
         * @description Org admin cancels their own subscription.
         *
         *     Distinct from the super-admin `/admin/.../cancel` route. The customer
         *     keeps app access through `current_period_ends_at` (standard SaaS
         *     courtesy); this endpoint just stops future scheduled charges. Comp
         *     + enterprise can't self-cancel — those go through the founder.
         *
         *     Best-effort: also calls ComGate `disable_recurring` to revoke the
         *     saved-card authorization on their side. ComGate failure does NOT
         *     block the local cancel — the scheduler's `is_comp=False` /
         *     `status='active'` filter is what actually stops further charges.
         */
        post: operations["cancel_subscription_api_v1_organizations_current_subscription_cancel_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/organizations/current/subscription/reactivate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Reactivate Subscription
         * @description Org admin un-cancels before the period actually ends.
         *
         *     Only valid while `status='canceled'` AND
         *     `current_period_ends_at > now()`. Once the period has expired the
         *     customer must re-enter card details (initial-payment-init from
         *     scratch), so reactivation isn't available there.
         */
        post: operations["reactivate_subscription_api_v1_organizations_current_subscription_reactivate_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/payments/initial-payment-init": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Initial Payment Init
         * @description Customer is moving from trial → paid plan.
         *
         *     Creates a `Charge(kind=initial, status=pending)`, asks ComGate
         *     for a hosted-payment-page URL, returns it for the frontend to
         *     redirect to. The webhook lands later and promotes to active.
         */
        post: operations["initial_payment_init_api_v1_payments_initial_payment_init_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/payments/seat-change-init": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Seat Change Init
         * @description Mid-period seat upgrade — paid orgs only.
         *
         *     Trial bumps and decreases never reach this endpoint; they're
         *     handled directly by `PUT /subscription/seat-count`. This is only
         *     called when the active org wants to lift `contracted_seat_count`,
         *     which requires an immediate prorated ComGate charge.
         */
        post: operations["seat_change_init_api_v1_payments_seat_change_init_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/payments/return": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Payment Return
         * @description ComGate redirects the customer's browser here after they
         *     complete (or cancel) the hosted-payment page.
         *
         *     We don't trust this for billing state — that's the webhook's job.
         *     Read the charge if we know its ID, then 302 the customer to the
         *     frontend's billing-return route with whatever status we can see.
         */
        get: operations["payment_return_api_v1_payments_return_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/payments/invoices": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Charges */
        get: operations["list_charges_api_v1_payments_invoices_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/payments/webhook": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Comgate Webhook
         * @description ComGate server-to-server payment-outcome notification.
         *
         *     1. Verify the HMAC-SHA256 signature on the raw request body.
         *     2. Dedupe via `webhook_events.comgate_event_id` — re-deliveries
         *        silently 204.
         *     3. Parse the payload, look up the matching Charge via `refId`
         *        (which we set to the Charge ID at create-time).
         *     4. Dispatch to the appropriate `services/billing.apply_*_success`
         *        or `mark_charge_failed` based on Charge.kind + payload status.
         *
         *     Returns 204 on every successful processing path (including dedupes
         *     and known-bad inputs that we've decided to swallow). Returns 4xx
         *     only when ComGate should be told to retry.
         */
        post: operations["comgate_webhook_api_v1_payments_webhook_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/plans/public": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Public Plans
         * @description Plans where `is_public=True`, ordered by `sort_order`.
         *
         *     Annual plans get derived `monthly_equivalent_minor` (12 * monthly
         *     price) and `savings_minor` so the frontend can render the savings
         *     line without a second round-trip.
         */
        get: operations["list_public_plans_api_v1_plans_public_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/plans/billing-settings/public": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Public Billing Settings
         * @description Read-only public subset of billing_settings — `is_vat_payer`,
         *     `vat_rate_percent`, support email. Powers `<PriceDisplay>` on the
         *     marketing pricing page so unauthenticated visitors see correct DPH
         *     copy.
         */
        get: operations["get_public_billing_settings_api_v1_plans_billing_settings_public_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/organizations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Organizations */
        get: operations["list_organizations_api_v1_admin_organizations_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/organizations/{org_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Organization Subscription
         * @description Org detail, returned as a Subscription view (org metadata is on the
         *     Plan object inside it; the frontend already has the org row from the
         *     list).
         */
        get: operations["get_organization_subscription_api_v1_admin_organizations__org_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/organizations/{org_id}/subscription/activate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Activate Subscription */
        post: operations["activate_subscription_api_v1_admin_organizations__org_id__subscription_activate_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/organizations/{org_id}/subscription/set-comp": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Set Comp */
        post: operations["set_comp_api_v1_admin_organizations__org_id__subscription_set_comp_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/organizations/{org_id}/subscription/set-enterprise": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Set Enterprise */
        post: operations["set_enterprise_api_v1_admin_organizations__org_id__subscription_set_enterprise_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/organizations/{org_id}/subscription/extend-trial": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Extend Trial */
        post: operations["extend_trial_api_v1_admin_organizations__org_id__subscription_extend_trial_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/organizations/{org_id}/subscription/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cancel Subscription */
        post: operations["cancel_subscription_api_v1_admin_organizations__org_id__subscription_cancel_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/organizations/{org_id}/activity": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Org Subscription Activity
         * @description Subscription-scoped activity rows for the admin detail drawer.
         *
         *     Subscription mutations write Activity rows with
         *     `entity_type=organization` + `activity_type=subscription_change`
         *     (see `BillingService._audit`). Filter on both so unrelated org-scoped
         *     activity (e.g. team events that may write to the same org row in the
         *     future) doesn't leak into the timeline.
         */
        get: operations["get_org_subscription_activity_api_v1_admin_organizations__org_id__activity_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/billing-settings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Billing Settings */
        get: operations["get_billing_settings_api_v1_admin_billing_settings_get"];
        /** Update Billing Settings */
        put: operations["update_billing_settings_api_v1_admin_billing_settings_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/organizations/{org_id}/invoices": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Org Invoices
         * @description Founder-facing invoice list for one org.
         *
         *     Mirrors the customer-facing `GET /payments/invoices` shape but
         *     skips the `require_role(admin)` org-membership check — super-admin
         *     operates across orgs.
         */
        get: operations["list_org_invoices_api_v1_admin_organizations__org_id__invoices_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/organizations/{org_id}/users": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Org Users
         * @description All members of an org, ordered admin → manager → salesperson then
         *     by name. Drives the impersonation picker on the org detail drawer.
         */
        get: operations["list_org_users_api_v1_admin_organizations__org_id__users_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/users/{user_id}/impersonate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Impersonate User
         * @description Mint an access token for `user_id` so the calling super-admin can
         *     operate the app as that user (demo / support diagnostics).
         *
         *     Returns access token only — no refresh cookie is set, so the
         *     super-admin's own session survives a page reload. To "stop
         *     impersonating," the operator simply reloads the SPA: AuthContext's
         *     cold-load `/auth/refresh` will re-hydrate using the existing
         *     super-admin refresh cookie.
         *
         *     Guardrails:
         *       - `require_super_admin` rejects non-super-admin callers.
         *       - Refuses to impersonate another super-admin (privilege isolation).
         *       - Refuses to impersonate inactive users or users without an org
         *         (the resulting session would be unusable).
         */
        post: operations["impersonate_user_api_v1_admin_users__user_id__impersonate_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/invoices": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Invoices
         * @description Cross-org invoice list with filter chain.
         *
         *     Filters compose with AND semantics. `q` matches against invoice
         *     number OR customer_name (ILIKE substring); useful for the search box
         *     in the admin UI.
         */
        get: operations["list_invoices_api_v1_admin_invoices_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/invoices/{invoice_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Invoice Detail */
        get: operations["get_invoice_detail_api_v1_admin_invoices__invoice_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/invoices/{invoice_id}/mark-paid": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Mark Paid */
        post: operations["mark_paid_api_v1_admin_invoices__invoice_id__mark_paid_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/invoices/{invoice_id}/void": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Void Invoice */
        post: operations["void_invoice_api_v1_admin_invoices__invoice_id__void_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/invoices/{invoice_id}/credit-note": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Issue Credit Note
         * @description Issue a credit-note row referencing this invoice. Returns the
         *     detail of the **new credit-note** invoice (not the original).
         */
        post: operations["issue_credit_note_api_v1_admin_invoices__invoice_id__credit_note_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/invoices/manual": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Issue Manual Invoice
         * @description Founder-driven issuance — no ComGate charge involved. Used for
         *     refunds, comp-org back-charges, and one-off corrections.
         */
        post: operations["issue_manual_invoice_api_v1_admin_invoices_manual_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/invoices/{invoice_id}/send": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Send Invoice */
        post: operations["send_invoice_api_v1_admin_invoices__invoice_id__send_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/invoices/export/csv": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Export Year Csv */
        get: operations["export_year_csv_api_v1_admin_invoices_export_csv_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/invoices/export/pdfs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Export Year Pdf Zip */
        get: operations["export_year_pdf_zip_api_v1_admin_invoices_export_pdfs_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/invoices/export/full": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Export Year Full */
        get: operations["export_year_full_api_v1_admin_invoices_export_full_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/invoices/integrity/check": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Run Integrity Check
         * @description Walk every issued invoice's stored bytes and verify hashes.
         *
         *     Synchronous — finishes within the request. Acceptable at our scale
         *     (sub-second per invoice). If we ever take more than a few seconds,
         *     move to a background job + a status-poll endpoint.
         */
        post: operations["run_integrity_check_api_v1_admin_invoices_integrity_check_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/invoices/integrity/last-run": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Last Integrity Run
         * @description Return the most recent integrity-check run summary, or null if
         *     no run has happened yet.
         */
        get: operations["get_last_integrity_run_api_v1_admin_invoices_integrity_last_run_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** ActivateSubscriptionIn */
        ActivateSubscriptionIn: {
            /**
             * Plan Code
             * @enum {string}
             */
            plan_code: "monthly" | "annual" | "enterprise";
            /** Override Price Per User Minor */
            override_price_per_user_minor?: number | null;
            /** Period Months */
            period_months?: number | null;
        };
        /**
         * ActivityEntityType
         * @enum {string}
         */
        ActivityEntityType: "company" | "contact" | "deal" | "organization";
        /** ActivityOut */
        ActivityOut: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Organization Id
             * Format: uuid
             */
            organization_id: string;
            entity_type: components["schemas"]["ActivityEntityType"];
            /**
             * Entity Id
             * Format: uuid
             */
            entity_id: string;
            /** User Id */
            user_id: string | null;
            activity_type: components["schemas"]["ActivityType"];
            /** Payload */
            payload: {
                [key: string]: unknown;
            };
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /**
         * ActivityType
         * @enum {string}
         */
        ActivityType: "note" | "stage_change" | "owner_change" | "deal_won" | "deal_lost" | "company_freed" | "ownership_reassigned" | "subscription_change";
        /** AdminActivityActor */
        AdminActivityActor: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Name */
            name: string;
            /** Email */
            email: string;
        };
        /** AdminActivityList */
        AdminActivityList: {
            /** Items */
            items: components["schemas"]["AdminActivityRow"][];
            /** Total */
            total: number;
        };
        /** AdminActivityRow */
        AdminActivityRow: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Activity Type */
            activity_type: string;
            /** Payload */
            payload: {
                [key: string]: unknown;
            };
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            actor?: components["schemas"]["AdminActivityActor"] | null;
        };
        /** AdminCreditNoteIn */
        AdminCreditNoteIn: {
            /** Reason */
            reason: string;
            /** Lines */
            lines: components["schemas"]["AdminCreditNoteLineIn"][];
        };
        /** AdminCreditNoteLineIn */
        AdminCreditNoteLineIn: {
            /** Description */
            description: string;
            /** Quantity */
            quantity: number | string;
            /**
             * Unit Price Minor
             * @description Must be ≤ 0 for a credit
             */
            unit_price_minor: number;
            /** Unit Label */
            unit_label?: string | null;
            /** Vat Rate Percent */
            vat_rate_percent?: number | string | null;
        };
        /** AdminIntegrityFailure */
        AdminIntegrityFailure: {
            /**
             * Invoice Id
             * Format: uuid
             */
            invoice_id: string;
            /** Invoice Number */
            invoice_number: string;
            /**
             * Kind
             * @enum {string}
             */
            kind: "pdf" | "isdoc";
            /** Error */
            error: string;
        };
        /** AdminIntegrityRunOut */
        AdminIntegrityRunOut: {
            /**
             * Run Id
             * Format: uuid
             */
            run_id: string;
            /** Checked */
            checked: number;
            /** Ok */
            ok: number;
            /** Failed */
            failed: number;
            /** Failures */
            failures: components["schemas"]["AdminIntegrityFailure"][];
            /** Created At */
            created_at?: string | null;
        };
        /** AdminInvoiceAuditEntry */
        AdminInvoiceAuditEntry: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Event */
            event: string;
            /** Actor User Id */
            actor_user_id: string | null;
            /** Payload */
            payload: {
                [key: string]: unknown;
            };
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /** AdminInvoiceDetail */
        AdminInvoiceDetail: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Organization Id
             * Format: uuid
             */
            organization_id: string;
            /** Organization Name */
            organization_name: string;
            /** Subscription Id */
            subscription_id: string | null;
            /** Charge Id */
            charge_id: string | null;
            /** Number */
            number: string;
            /** Variable Symbol */
            variable_symbol: string;
            /**
             * Kind
             * @enum {string}
             */
            kind: "invoice" | "credit_note" | "proforma";
            /**
             * Status
             * @enum {string}
             */
            status: "draft" | "issued" | "paid" | "overdue" | "voided";
            /** Related Invoice Id */
            related_invoice_id: string | null;
            /**
             * Issued At
             * Format: date-time
             */
            issued_at: string;
            /**
             * Taxable Supply Date
             * Format: date
             */
            taxable_supply_date: string;
            /**
             * Due At
             * Format: date
             */
            due_at: string;
            /** Paid At */
            paid_at: string | null;
            /** Issuer Name */
            issuer_name: string;
            /** Issuer Address */
            issuer_address: string;
            /** Issuer Ico */
            issuer_ico: string;
            /** Issuer Dic */
            issuer_dic: string | null;
            /** Issuer Iban */
            issuer_iban: string;
            /** Issuer Account Domestic */
            issuer_account_domestic: string | null;
            /** Issuer Register Text */
            issuer_register_text: string;
            /** Issuer Is Vat Payer */
            issuer_is_vat_payer: boolean;
            /** Customer Name */
            customer_name: string;
            /** Customer Address */
            customer_address: string;
            /** Customer Ico */
            customer_ico: string | null;
            /** Customer Dic */
            customer_dic: string | null;
            /** Customer Email */
            customer_email: string | null;
            /** Currency */
            currency: string;
            /** Subtotal Minor */
            subtotal_minor: number;
            /** Vat Amount Minor */
            vat_amount_minor: number;
            /** Total Minor */
            total_minor: number;
            /** Vat Rate Percent */
            vat_rate_percent: string;
            /** Payment Method */
            payment_method: string;
            /** Note */
            note: string | null;
            /** Sent At */
            sent_at: string | null;
            /** Sent To Email */
            sent_to_email: string | null;
            /** Pdf Object Key */
            pdf_object_key: string | null;
            /** Pdf Sha256 */
            pdf_sha256: string | null;
            /** Pdf Size Bytes */
            pdf_size_bytes: number | null;
            /** Isdoc Object Key */
            isdoc_object_key: string | null;
            /** Isdoc Sha256 */
            isdoc_sha256: string | null;
            /** Lines */
            lines: components["schemas"]["AdminInvoiceLine"][];
            /** Audit Log */
            audit_log: components["schemas"]["AdminInvoiceAuditEntry"][];
        };
        /** AdminInvoiceLine */
        AdminInvoiceLine: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Position */
            position: number;
            /** Description */
            description: string;
            /** Quantity */
            quantity: string;
            /** Unit Label */
            unit_label: string | null;
            /** Unit Price Minor */
            unit_price_minor: number;
            /** Vat Rate Percent */
            vat_rate_percent: string;
            /** Line Subtotal Minor */
            line_subtotal_minor: number;
            /** Line Vat Minor */
            line_vat_minor: number;
            /** Line Total Minor */
            line_total_minor: number;
        };
        /** AdminInvoiceList */
        AdminInvoiceList: {
            /** Items */
            items: components["schemas"]["AdminInvoiceListItem"][];
            /** Total */
            total: number;
        };
        /**
         * AdminInvoiceListItem
         * @description Compact row for the admin list table — adds organization name +
         *     customer name to what the customer-facing list shows so the founder
         *     can pivot across orgs without an extra fetch.
         */
        AdminInvoiceListItem: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Organization Id
             * Format: uuid
             */
            organization_id: string;
            /** Organization Name */
            organization_name: string;
            /** Number */
            number: string;
            /**
             * Kind
             * @enum {string}
             */
            kind: "invoice" | "credit_note" | "proforma";
            /**
             * Status
             * @enum {string}
             */
            status: "draft" | "issued" | "paid" | "overdue" | "voided";
            /**
             * Issued At
             * Format: date-time
             */
            issued_at: string;
            /**
             * Due At
             * Format: date
             */
            due_at: string;
            /** Paid At */
            paid_at: string | null;
            /** Sent At */
            sent_at: string | null;
            /** Customer Name */
            customer_name: string;
            /** Currency */
            currency: string;
            /** Total Minor */
            total_minor: number;
            /** Related Invoice Id */
            related_invoice_id: string | null;
        };
        /** AdminManualInvoiceIn */
        AdminManualInvoiceIn: {
            /**
             * Org Id
             * Format: uuid
             */
            org_id: string;
            /** Lines */
            lines: components["schemas"]["AdminManualLineIn"][];
            /** Note */
            note?: string | null;
            /** Taxable Supply Date */
            taxable_supply_date?: string | null;
            /** Due At */
            due_at?: string | null;
        };
        /** AdminManualLineIn */
        AdminManualLineIn: {
            /** Description */
            description: string;
            /** Quantity */
            quantity: number | string;
            /** Unit Price Minor */
            unit_price_minor: number;
            /** Unit Label */
            unit_label?: string | null;
            /** Vat Rate Percent */
            vat_rate_percent?: number | string | null;
        };
        /** AdminMarkPaidIn */
        AdminMarkPaidIn: {
            /**
             * Paid At
             * @description When the payment was received. NULL → server-side now().
             */
            paid_at?: string | null;
        };
        /** AdminOrgList */
        AdminOrgList: {
            /** Items */
            items: components["schemas"]["AdminOrgRow"][];
            /** Total */
            total: number;
        };
        /** AdminOrgRow */
        AdminOrgRow: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Name */
            name: string;
            /** Plan Code */
            plan_code: string;
            /** Plan Display */
            plan_display: string;
            /**
             * Status
             * @enum {string}
             */
            status: "trialing" | "pending_activation" | "active" | "past_due" | "canceled";
            /** Is Comp */
            is_comp: boolean;
            /** User Count */
            user_count: number;
            /**
             * Trial Ends At
             * Format: date-time
             */
            trial_ends_at: string;
            /** Current Period Ends At */
            current_period_ends_at: string | null;
            /** Last Activity At */
            last_activity_at: string | null;
        };
        /** AdminOrgUserList */
        AdminOrgUserList: {
            /** Items */
            items: components["schemas"]["AdminOrgUserRow"][];
        };
        /** AdminOrgUserRow */
        AdminOrgUserRow: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Email */
            email: string;
            /** Name */
            name: string;
            /** Role */
            role: string;
            /** Is Active */
            is_active: boolean;
            /** Is Super Admin */
            is_super_admin: boolean;
            /** Last Login At */
            last_login_at: string | null;
        };
        /** AdminSendIn */
        AdminSendIn: {
            /**
             * Override To
             * @description Override the invoice's recorded customer email.
             */
            override_to?: string | null;
        };
        /** AdminVoidIn */
        AdminVoidIn: {
            /** Reason */
            reason: string;
        };
        /**
         * AuthSuccessResponse
         * @description Returned by signup-verify, login, password-reset-confirm — the same
         *     shape as the Google callback's hash redirect, just over JSON.
         */
        AuthSuccessResponse: {
            /** Access Token */
            access_token: string;
            /**
             * Token Type
             * @default bearer
             */
            token_type: string;
            user: components["schemas"]["CurrentUser"];
        };
        /**
         * AvgDealSizeConfig
         * @description Mean Deal.value over a scoped subset of deals.
         */
        AvgDealSizeConfig: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "avg_deal_size";
            /**
             * Scope
             * @default won
             * @enum {string}
             */
            scope: "won" | "open";
        };
        /**
         * AvgDealSizeResponse
         * @description Mean Deal.value across the configured scope.
         */
        AvgDealSizeResponse: {
            /** Value */
            value: string;
            /** Currency */
            currency: string;
            /** Sample Count */
            sample_count: number;
            comparison: components["schemas"]["Comparison"] | null;
        };
        /** BillingSettingsOut */
        BillingSettingsOut: {
            /** Is Vat Payer */
            is_vat_payer: boolean;
            /** Vat Rate Percent */
            vat_rate_percent: string;
            /** Seller Iban */
            seller_iban: string | null;
            /** Seller Ico */
            seller_ico: string | null;
            /** Contact Email */
            contact_email: string;
            /** Issuer Name */
            issuer_name: string;
            /** Issuer Address Street */
            issuer_address_street: string;
            /** Issuer Address City */
            issuer_address_city: string;
            /** Issuer Address Zip */
            issuer_address_zip: string;
            /** Issuer Register Text */
            issuer_register_text: string;
            /** Issuer Account Domestic */
            issuer_account_domestic: string | null;
            /** Default Payment Term Days */
            default_payment_term_days: number;
            /** Invoice Email Subject Template */
            invoice_email_subject_template: string;
            /** Invoice Email Body Template */
            invoice_email_body_template: string;
            /**
             * Updated At
             * Format: date-time
             */
            updated_at: string;
        };
        /**
         * BillingSettingsPublic
         * @description Public-readable subset — backs the marketing pricing page's PriceDisplay
         *     so unauthenticated visitors see correct DPH copy without exposing IBAN/IČO.
         */
        BillingSettingsPublic: {
            /** Is Vat Payer */
            is_vat_payer: boolean;
            /** Vat Rate Percent */
            vat_rate_percent: string;
            /** Contact Email */
            contact_email: string;
        };
        /** BillingSettingsUpdate */
        BillingSettingsUpdate: {
            /** Is Vat Payer */
            is_vat_payer?: boolean | null;
            /** Vat Rate Percent */
            vat_rate_percent?: number | string | null;
            /** Seller Iban */
            seller_iban?: string | null;
            /** Seller Ico */
            seller_ico?: string | null;
            /** Contact Email */
            contact_email?: string | null;
            /** Issuer Name */
            issuer_name?: string | null;
            /** Issuer Address Street */
            issuer_address_street?: string | null;
            /** Issuer Address City */
            issuer_address_city?: string | null;
            /** Issuer Address Zip */
            issuer_address_zip?: string | null;
            /** Issuer Register Text */
            issuer_register_text?: string | null;
            /** Issuer Account Domestic */
            issuer_account_domestic?: string | null;
            /** Default Payment Term Days */
            default_payment_term_days?: number | null;
            /** Invoice Email Subject Template */
            invoice_email_subject_template?: string | null;
            /** Invoice Email Body Template */
            invoice_email_body_template?: string | null;
        };
        /** BillingSummary */
        BillingSummary: {
            /**
             * Organization Id
             * Format: uuid
             */
            organization_id: string;
            /** User Count */
            user_count: number;
            /** Effective Price Per User Minor */
            effective_price_per_user_minor: number | null;
            /** Monthly Total Minor */
            monthly_total_minor: number | null;
            /** Monthly Total With Vat Minor */
            monthly_total_with_vat_minor: number | null;
            /** Annual Total Minor */
            annual_total_minor: number | null;
            /** Annual Total With Vat Minor */
            annual_total_with_vat_minor: number | null;
            /** Savings Minor */
            savings_minor: number | null;
            /** Savings Percent */
            savings_percent: number | null;
            /** Is Vat Payer */
            is_vat_payer: boolean;
            /** Vat Rate Percent */
            vat_rate_percent: string;
        };
        /** BlockedCompanyCreate */
        BlockedCompanyCreate: {
            /** Ico */
            ico: string;
            reason_category: components["schemas"]["BlockedCompanyReason"];
            /** Note */
            note?: string | null;
        };
        /** BlockedCompanyOut */
        BlockedCompanyOut: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Ico */
            ico: string;
            reason_category: components["schemas"]["BlockedCompanyReason"];
            /** Note */
            note?: string | null;
            /** Ares Name */
            ares_name?: string | null;
            /** Created By */
            created_by?: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /**
         * BlockedCompanyReason
         * @description Why an IČO is on the org's blocked list.
         *
         *     Free-form note is on the row itself; this enum keeps reporting
         *     buckets stable across orgs.
         * @enum {string}
         */
        BlockedCompanyReason: "competitor" | "do_not_contact" | "bankrupt" | "legal_issue" | "other";
        /** BoardStage */
        BoardStage: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Name */
            name: string;
            /** Color */
            color: string;
            /** Position */
            position: number;
            stage_type: components["schemas"]["StageType"];
            /** Default Probability */
            default_probability: number;
            /** Deal Count */
            deal_count: number;
            /** Total Value */
            total_value: string;
            /** Currency */
            currency: string;
            /** Deals */
            deals: components["schemas"]["DealOut"][];
        };
        /** Body_submit_feedback_api_v1_feedback_post */
        Body_submit_feedback_api_v1_feedback_post: {
            kind: components["schemas"]["FeedbackKind"];
            /** Caption */
            caption: string;
            /** Body */
            body: string;
            /** Attachments */
            attachments?: string[] | null;
        };
        /**
         * CancelSelfServeIn
         * @description Body for `POST /subscription/cancel`. Optional free-form reason
         *     is stored in the Activity audit row for support follow-up.
         */
        CancelSelfServeIn: {
            /** Reason */
            reason?: string | null;
        };
        /** CancelSubscriptionIn */
        CancelSubscriptionIn: {
            /** Effective At */
            effective_at?: string | null;
        };
        /**
         * ChangeIntervalIn
         * @description Body for `POST /subscription/change-interval`. Stored as
         *     `Subscription.pending_plan_id`; the existing super-admin Aktivovat
         *     path applies it on period rollover.
         */
        ChangeIntervalIn: {
            /**
             * Plan Code
             * @enum {string}
             */
            plan_code: "monthly" | "annual";
        };
        /** ChargeList */
        ChargeList: {
            /** Items */
            items: components["schemas"]["ChargeOut"][];
            /** Total */
            total: number;
        };
        /**
         * ChargeOut
         * @description Serialized ComGate charge attempt (renamed from `InvoiceOut`).
         *
         *     The Czech-law tax-invoice schema is `InvoiceOut` in the `invoicing`
         *     schema module — distinct concept, distinct shape.
         */
        ChargeOut: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Kind
             * @enum {string}
             */
            kind: "initial" | "renewal" | "seat_upgrade";
            /** Amount Minor */
            amount_minor: number;
            /** Currency */
            currency: string;
            /**
             * Status
             * @enum {string}
             */
            status: "pending" | "paid" | "failed" | "refunded";
            /** Seats */
            seats?: number | null;
            /** Period Starts At */
            period_starts_at?: string | null;
            /** Period Ends At */
            period_ends_at?: string | null;
            /** Failure Reason */
            failure_reason?: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Paid At */
            paid_at?: string | null;
        };
        /** ChoosePlanIn */
        ChoosePlanIn: {
            /**
             * Plan Code
             * @enum {string}
             */
            plan_code: "monthly" | "annual";
        };
        /**
         * CompaniesAtRiskConfig
         * @description Companies whose `ownership_expires_at` is within `threshold` days.
         */
        CompaniesAtRiskConfig: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "companies_at_risk";
            /**
             * Threshold
             * @default 30
             * @enum {integer}
             */
            threshold: 30 | 14 | 7;
        };
        /** CompaniesAtRiskResponse */
        CompaniesAtRiskResponse: {
            /** Items */
            items: components["schemas"]["CompanyAtRiskItem"][];
            /** Threshold Days */
            threshold_days: number;
        };
        /** CompanyAtRiskItem */
        CompanyAtRiskItem: {
            /**
             * Company Id
             * Format: uuid
             */
            company_id: string;
            /** Company Name */
            company_name: string;
            /** Owner User Id */
            owner_user_id: string | null;
            /** Owner Name */
            owner_name: string;
            /** Days Until Freeing */
            days_until_freeing: number;
            /** Last Activity At */
            last_activity_at: string | null;
        };
        /** CompanyCreate */
        CompanyCreate: {
            /** Name */
            name: string;
            /** Ico */
            ico?: string | null;
            /** Dic */
            dic?: string | null;
            /** Address Street */
            address_street?: string | null;
            /** Address City */
            address_city?: string | null;
            /** Address Zip */
            address_zip?: string | null;
            /** Legal Form */
            legal_form?: string | null;
            /** Website */
            website?: string | null;
            /** Note */
            note?: string | null;
            /** Owner User Id */
            owner_user_id?: string | null;
        };
        /** CompanyOut */
        CompanyOut: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Organization Id
             * Format: uuid
             */
            organization_id: string;
            /** Name */
            name: string;
            /** Ico */
            ico?: string | null;
            /** Dic */
            dic?: string | null;
            /** Address Street */
            address_street?: string | null;
            /** Address City */
            address_city?: string | null;
            /** Address Zip */
            address_zip?: string | null;
            /** Legal Form */
            legal_form?: string | null;
            /** Website */
            website?: string | null;
            /** Note */
            note?: string | null;
            /** Owner User Id */
            owner_user_id?: string | null;
            /** Last Order At */
            last_order_at?: string | null;
            /**
             * Ownership Expires At
             * Format: date-time
             */
            ownership_expires_at: string;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /**
             * Updated At
             * Format: date-time
             */
            updated_at: string;
        };
        /** CompanyReassign */
        CompanyReassign: {
            /**
             * New Owner User Id
             * Format: uuid
             */
            new_owner_user_id: string;
        };
        /** CompanyUpdate */
        CompanyUpdate: {
            /** Name */
            name?: string | null;
            /** Ico */
            ico?: string | null;
            /** Dic */
            dic?: string | null;
            /** Address Street */
            address_street?: string | null;
            /** Address City */
            address_city?: string | null;
            /** Address Zip */
            address_zip?: string | null;
            /** Legal Form */
            legal_form?: string | null;
            /** Website */
            website?: string | null;
            /** Note */
            note?: string | null;
            /** Owner User Id */
            owner_user_id?: string | null;
        };
        /** Comparison */
        Comparison: {
            /** Value */
            value: string | number;
            /** Delta Pct */
            delta_pct: number | null;
            /**
             * Previous From
             * Format: date
             */
            previous_from: string;
            /**
             * Previous To
             * Format: date
             */
            previous_to: string;
        };
        /** ContactCreate */
        ContactCreate: {
            /** First Name */
            first_name: string;
            /** Last Name */
            last_name: string;
            /** Company Id */
            company_id?: string | null;
            /** Position */
            position?: string | null;
            /** Email */
            email?: string | null;
            /** Phone */
            phone?: string | null;
            /** Linkedin Url */
            linkedin_url?: string | null;
            /** Note */
            note?: string | null;
        };
        /** ContactEnterpriseIn */
        ContactEnterpriseIn: {
            /** Message */
            message: string;
            /** Expected Users */
            expected_users: number;
        };
        /** ContactOut */
        ContactOut: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Organization Id
             * Format: uuid
             */
            organization_id: string;
            /** Company Id */
            company_id?: string | null;
            /** First Name */
            first_name: string;
            /** Last Name */
            last_name: string;
            /** Position */
            position?: string | null;
            /** Email */
            email?: string | null;
            /** Phone */
            phone?: string | null;
            /** Linkedin Url */
            linkedin_url?: string | null;
            /** Note */
            note?: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /**
             * Updated At
             * Format: date-time
             */
            updated_at: string;
        };
        /** ContactUpdate */
        ContactUpdate: {
            /** First Name */
            first_name?: string | null;
            /** Last Name */
            last_name?: string | null;
            /** Company Id */
            company_id?: string | null;
            /** Position */
            position?: string | null;
            /** Email */
            email?: string | null;
            /** Phone */
            phone?: string | null;
            /** Linkedin Url */
            linkedin_url?: string | null;
            /** Note */
            note?: string | null;
        };
        /**
         * CreateOrganizationIn
         * @description Body for `POST /onboarding/organization` — submitted by a freshly
         *     signed-up user with no org yet.
         */
        CreateOrganizationIn: {
            /** Name */
            name: string;
            /**
             * Seat Count
             * @default 1
             */
            seat_count: number;
            /** Intended Plan Code */
            intended_plan_code?: string | null;
        };
        /** CurrentUser */
        CurrentUser: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Email
             * Format: email
             */
            email: string;
            /** Name */
            name: string;
            /** Avatar Url */
            avatar_url?: string | null;
            role: components["schemas"]["UserRole"];
            /** Can Invite */
            can_invite: boolean;
            /**
             * Is Super Admin
             * @default false
             */
            is_super_admin: boolean;
            /**
             * Email Verified
             * @default false
             */
            email_verified: boolean;
            organization?: components["schemas"]["OrganizationSummary"] | null;
        };
        /**
         * DashboardConfig
         * @description The full persisted shape of `User.reports_dashboard_config`.
         *
         *     Empty `{}` is valid input — the API treats it as "use the default
         *     layout" and returns the defaults instead.
         */
        DashboardConfig: {
            /**
             * Version
             * @default 1
             * @constant
             */
            version: 1;
            /** Widgets */
            widgets?: components["schemas"]["WidgetEntry"][];
            globalFilters?: components["schemas"]["GlobalFilters"];
        };
        /** DateRangeFilter */
        DateRangeFilter: {
            /**
             * Preset
             * @default last_30_days
             * @enum {string}
             */
            preset: "last_7_days" | "last_30_days" | "this_quarter" | "this_year" | "last_12_months" | "custom";
            /** From */
            from?: string | null;
            /** To */
            to?: string | null;
        };
        /** DealCreate */
        DealCreate: {
            /** Name */
            name: string;
            /**
             * Company Id
             * Format: uuid
             */
            company_id: string;
            /**
             * Stage Id
             * Format: uuid
             */
            stage_id: string;
            /** Owner User Id */
            owner_user_id?: string | null;
            /** Primary Contact Id */
            primary_contact_id?: string | null;
            /**
             * Value
             * @default 0
             */
            value: number | string;
            /** Currency */
            currency?: string | null;
            /** Probability Override */
            probability_override?: number | null;
            /** Expected Close Date */
            expected_close_date?: string | null;
        };
        /** DealMarkLost */
        DealMarkLost: {
            /** Lost Reason */
            lost_reason: string;
        };
        /** DealOut */
        DealOut: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Organization Id
             * Format: uuid
             */
            organization_id: string;
            /**
             * Company Id
             * Format: uuid
             */
            company_id: string;
            /**
             * Stage Id
             * Format: uuid
             */
            stage_id: string;
            /** Owner User Id */
            owner_user_id?: string | null;
            /** Primary Contact Id */
            primary_contact_id?: string | null;
            /** Name */
            name: string;
            /** Value */
            value: string;
            /** Currency */
            currency: string;
            /** Probability Override */
            probability_override?: number | null;
            /** Expected Close Date */
            expected_close_date?: string | null;
            /** Closed At */
            closed_at?: string | null;
            /** Lost Reason */
            lost_reason?: string | null;
            /**
             * Is Paid
             * @default false
             */
            is_paid: boolean;
            /** Paid At */
            paid_at?: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /**
             * Updated At
             * Format: date-time
             */
            updated_at: string;
        };
        /** DealPaymentUpdate */
        DealPaymentUpdate: {
            /** Paid */
            paid: boolean;
        };
        /** DealStageMove */
        DealStageMove: {
            /**
             * Stage Id
             * Format: uuid
             */
            stage_id: string;
        };
        /** DealUpdate */
        DealUpdate: {
            /** Name */
            name?: string | null;
            /** Company Id */
            company_id?: string | null;
            /** Stage Id */
            stage_id?: string | null;
            /** Owner User Id */
            owner_user_id?: string | null;
            /** Primary Contact Id */
            primary_contact_id?: string | null;
            /** Value */
            value?: number | string | null;
            /** Currency */
            currency?: string | null;
            /** Probability Override */
            probability_override?: number | null;
            /** Expected Close Date */
            expected_close_date?: string | null;
            /** Lost Reason */
            lost_reason?: string | null;
        };
        /**
         * DealsWonConfig
         * @description Count + total value of deals closed-won in the date range.
         */
        DealsWonConfig: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "deals_won";
            /**
             * Display
             * @default both
             * @enum {string}
             */
            display: "count" | "value" | "both";
        };
        /**
         * DealsWonResponse
         * @description Count + total value of closed-won deals in range.
         */
        DealsWonResponse: {
            /** Count */
            count: number;
            /** Value */
            value: string;
            /** Currency */
            currency: string;
            /** Sparkline */
            sparkline: components["schemas"]["SparklineBucket"][];
            comparison: components["schemas"]["Comparison"] | null;
        };
        /** ExtendTrialIn */
        ExtendTrialIn: {
            /** Days */
            days: number;
        };
        /**
         * FeedbackAccepted
         * @description Returned on a successful submission. Deliberately minimal — there
         *     is no server-side record to surface back; the email is the artifact.
         */
        FeedbackAccepted: {
            /** Delivered */
            delivered: boolean;
            /** Recipient */
            recipient: string;
        };
        /**
         * FeedbackKind
         * @enum {string}
         */
        FeedbackKind: "bug" | "improvement";
        /** GlobalFilters */
        GlobalFilters: {
            dateRange?: components["schemas"]["DateRangeFilter"];
            /** Teamid */
            teamId?: string | null;
            /** Owneruserid */
            ownerUserId?: string | null;
        };
        /** HTTPValidationError */
        HTTPValidationError: {
            /** Detail */
            detail?: components["schemas"]["ValidationError"][];
        };
        /** HealthResponse */
        HealthResponse: {
            /** Status */
            status: string;
        };
        /**
         * ImpersonateOut
         * @description Returned by `POST /admin/users/{id}/impersonate`. Carries an access
         *     token minted for the target user — but no refresh cookie is set, so
         *     the calling super-admin's own refresh cookie remains intact and a
         *     page reload restores their session.
         */
        ImpersonateOut: {
            /** Access Token */
            access_token: string;
            /**
             * User Id
             * Format: uuid
             */
            user_id: string;
            /** Email */
            email: string;
        };
        /**
         * InitialPaymentInitIn
         * @description Body for `POST /payments/initial-payment-init`.
         *
         *     The customer is choosing their first paid plan; backend computes
         *     `seat_count * effective_price` and hands them a ComGate hosted-page
         *     redirect URL.
         */
        InitialPaymentInitIn: {
            /**
             * Plan Code
             * @enum {string}
             */
            plan_code: "monthly" | "annual";
        };
        /** InvitationCreate */
        InvitationCreate: {
            /**
             * Email
             * Format: email
             */
            email: string;
            role: components["schemas"]["UserRole"];
            /** Team Id */
            team_id?: string | null;
            /**
             * Can Invite
             * @default false
             */
            can_invite: boolean;
        };
        /**
         * InvitationCreated
         * @description Response payload for `POST /invitations`. Includes the dev-only
         *     `invite_url` for testability — once a real SMTP backend is wired in,
         *     this field stays useful for admins who want to copy the link manually
         *     (e.g. when the invitee never received the email).
         */
        InvitationCreated: {
            invitation: components["schemas"]["InvitationOut"];
            /** Invite Url */
            invite_url: string;
        };
        /** InvitationOut */
        InvitationOut: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Organization Id
             * Format: uuid
             */
            organization_id: string;
            /**
             * Email
             * Format: email
             */
            email: string;
            role: components["schemas"]["UserRole"];
            /** Team Id */
            team_id?: string | null;
            /** Can Invite */
            can_invite: boolean;
            /** Invited By User Id */
            invited_by_user_id?: string | null;
            /**
             * Expires At
             * Format: date-time
             */
            expires_at: string;
            /** Accepted At */
            accepted_at?: string | null;
            /** Revoked At */
            revoked_at?: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Invite Url */
            invite_url: string;
        };
        /**
         * InvitationPreview
         * @description Public preview shown on the AcceptInvitePage before the invitee
         *     signs in with Google. No tokens or org IDs are exposed beyond what's
         *     strictly needed to render the page.
         */
        InvitationPreview: {
            /** Organization Name */
            organization_name: string;
            /**
             * Email
             * Format: email
             */
            email: string;
            role: components["schemas"]["UserRole"];
            /** Team Name */
            team_name?: string | null;
        };
        /**
         * InviteAcceptRequest
         * @description Body for `POST /auth/invite/accept`. Email is taken from the invite
         *     row, not the request, so the user can't accept under a different
         *     address. Password is ignored if the matched User already has one set
         *     (preserving an existing credential).
         */
        InviteAcceptRequest: {
            /** Token */
            token: string;
            /** Password */
            password: string;
            /** Name */
            name: string;
        };
        /**
         * KpiSummary
         * @description Reports snapshot for the caller (and their visibility scope).
         */
        KpiSummary: {
            /** Currency */
            currency: string;
            /** Open Deal Count */
            open_deal_count: number;
            /** Open Pipeline Value */
            open_pipeline_value: string;
            /** Won This Month Count */
            won_this_month_count: number;
            /** Won This Month Value */
            won_this_month_value: string;
        };
        /** LeadConversionBreakdownItem */
        LeadConversionBreakdownItem: {
            /** Owner User Id */
            owner_user_id: string | null;
            /** Owner Name */
            owner_name: string;
            /** Converted */
            converted: number;
            /** Total */
            total: number;
        };
        /**
         * LeadToDealConversionConfig
         * @description % of companies created in the range that got at least one deal.
         */
        LeadToDealConversionConfig: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "lead_to_deal_conversion";
            /**
             * Breakdown
             * @default none
             * @enum {string}
             */
            breakdown: "none" | "by_owner";
        };
        /** LeadToDealConversionResponse */
        LeadToDealConversionResponse: {
            /** Value */
            value: number | null;
            /** Converted Count */
            converted_count: number;
            /** Total Count */
            total_count: number;
            comparison: components["schemas"]["Comparison"] | null;
            /** Breakdown */
            breakdown: components["schemas"]["LeadConversionBreakdownItem"][];
        };
        /** Leaderboard */
        Leaderboard: {
            /** Currency */
            currency: string;
            /**
             * From Date
             * Format: date
             */
            from_date: string;
            /**
             * To Date
             * Format: date
             */
            to_date: string;
            /** Rows */
            rows: components["schemas"]["LeaderboardRow"][];
        };
        /** LeaderboardRow */
        LeaderboardRow: {
            /**
             * User Id
             * Format: uuid
             */
            user_id: string;
            /** Name */
            name: string;
            /** Won Count */
            won_count: number;
            /** Won Value */
            won_value: string;
        };
        /** LoginRequest */
        LoginRequest: {
            /**
             * Email
             * Format: email
             */
            email: string;
            /** Password */
            password: string;
        };
        /** LossReasonRow */
        LossReasonRow: {
            /** Lost Reason */
            lost_reason: string;
            /** Count */
            count: number;
            /** Total Value */
            total_value: string;
        };
        /** LossReasons */
        LossReasons: {
            /** Currency */
            currency: string;
            /**
             * From Date
             * Format: date
             */
            from_date: string;
            /**
             * To Date
             * Format: date
             */
            to_date: string;
            /** Rows */
            rows: components["schemas"]["LossReasonRow"][];
        };
        /** LostReasonItem */
        LostReasonItem: {
            /** Reason */
            reason: string;
            /** Count */
            count: number;
            /** Value */
            value: string;
        };
        /**
         * LostReasonsBreakdownConfig
         * @description Horizontal bar chart of lost-deal reasons. Long tail collapses to Ostatní.
         */
        LostReasonsBreakdownConfig: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "lost_reasons_breakdown";
            /**
             * Display
             * @default count
             * @enum {string}
             */
            display: "count" | "value";
        };
        /** LostReasonsBreakdownResponse */
        LostReasonsBreakdownResponse: {
            /** Items */
            items: components["schemas"]["LostReasonItem"][];
            /** Total Count */
            total_count: number;
            /** Total Value */
            total_value: string;
            /** Currency */
            currency: string;
        };
        /**
         * MySummary
         * @description Personal salesperson rollup for the date window.
         *
         *     `companies_added` counts `Company` rows the caller owns whose
         *     `created_at` falls in the window — i.e. "leads I added to the
         *     pipeline". `conversion_rate` is `null` when the user closed no
         *     deals in the window (zero denominator).
         */
        MySummary: {
            /** Currency */
            currency: string;
            /**
             * From Date
             * Format: date
             */
            from_date: string;
            /**
             * To Date
             * Format: date
             */
            to_date: string;
            /** Companies Added */
            companies_added: number;
            /** Deals Won Count */
            deals_won_count: number;
            /** Deals Won Value */
            deals_won_value: string;
            /** Conversion Rate */
            conversion_rate: number | null;
            /** Avg Cycle Days */
            avg_cycle_days: number | null;
        };
        /** NewCompaniesBreakdownItem */
        NewCompaniesBreakdownItem: {
            /** Owner User Id */
            owner_user_id: string | null;
            /** Owner Name */
            owner_name: string;
            /** Count */
            count: number;
        };
        /**
         * NewCompaniesConfig
         * @description Count of `Company` rows created in the date range.
         */
        NewCompaniesConfig: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "new_companies";
            /**
             * Breakdown
             * @default none
             * @enum {string}
             */
            breakdown: "none" | "by_owner";
        };
        /**
         * NewCompaniesResponse
         * @description Count of `Company` rows created in range.
         */
        NewCompaniesResponse: {
            /** Value */
            value: number;
            /** Sparkline */
            sparkline: components["schemas"]["SparklineBucket"][];
            comparison: components["schemas"]["Comparison"] | null;
            /** Breakdown */
            breakdown: components["schemas"]["NewCompaniesBreakdownItem"][];
        };
        /** OrganizationOut */
        OrganizationOut: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Name */
            name: string;
            /** Ico */
            ico?: string | null;
            /** Dic */
            dic?: string | null;
            /** Address Street */
            address_street?: string | null;
            /** Address City */
            address_city?: string | null;
            /** Address Zip */
            address_zip?: string | null;
            /** Legal Form */
            legal_form?: string | null;
            /** Billing Name */
            billing_name?: string | null;
            /** Billing Email */
            billing_email?: string | null;
            /** Locale */
            locale: string;
            /** Currency */
            currency: string;
            /**
             * Trial Ends At
             * Format: date-time
             */
            trial_ends_at: string;
            /** Stripe Customer Id */
            stripe_customer_id?: string | null;
            /** Show Leaderboard To Salespeople */
            show_leaderboard_to_salespeople: boolean;
            /** Ownership Window Days */
            ownership_window_days: number;
        };
        /** OrganizationSummary */
        OrganizationSummary: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Name */
            name: string;
            /** Ico */
            ico?: string | null;
            /** Locale */
            locale: string;
            /** Currency */
            currency: string;
            /**
             * Trial Ends At
             * Format: date-time
             */
            trial_ends_at: string;
            /** Show Leaderboard To Salespeople */
            show_leaderboard_to_salespeople: boolean;
            /** Ownership Window Days */
            ownership_window_days: number;
        };
        /**
         * OrganizationUpdate
         * @description Fields an admin can change on their own organization.
         *
         *     Every field is optional so that the onboarding form can submit a partial
         *     update (e.g., IČO + name first, address later) and the settings page can
         *     patch any subset.
         */
        OrganizationUpdate: {
            /** Name */
            name?: string | null;
            /** Ico */
            ico?: string | null;
            /** Dic */
            dic?: string | null;
            /** Address Street */
            address_street?: string | null;
            /** Address City */
            address_city?: string | null;
            /** Address Zip */
            address_zip?: string | null;
            /** Legal Form */
            legal_form?: string | null;
            /** Billing Name */
            billing_name?: string | null;
            /** Billing Email */
            billing_email?: string | null;
            /** Show Leaderboard To Salespeople */
            show_leaderboard_to_salespeople?: boolean | null;
            /** Ownership Window Days */
            ownership_window_days?: number | null;
        };
        /** Page[ActivityOut] */
        Page_ActivityOut_: {
            /** Items */
            items: components["schemas"]["ActivityOut"][];
            /** Total */
            total: number;
            /** Limit */
            limit: number;
            /** Offset */
            offset: number;
        };
        /** Page[BlockedCompanyOut] */
        Page_BlockedCompanyOut_: {
            /** Items */
            items: components["schemas"]["BlockedCompanyOut"][];
            /** Total */
            total: number;
            /** Limit */
            limit: number;
            /** Offset */
            offset: number;
        };
        /** Page[CompanyOut] */
        Page_CompanyOut_: {
            /** Items */
            items: components["schemas"]["CompanyOut"][];
            /** Total */
            total: number;
            /** Limit */
            limit: number;
            /** Offset */
            offset: number;
        };
        /** Page[ContactOut] */
        Page_ContactOut_: {
            /** Items */
            items: components["schemas"]["ContactOut"][];
            /** Total */
            total: number;
            /** Limit */
            limit: number;
            /** Offset */
            offset: number;
        };
        /** Page[DealOut] */
        Page_DealOut_: {
            /** Items */
            items: components["schemas"]["DealOut"][];
            /** Total */
            total: number;
            /** Limit */
            limit: number;
            /** Offset */
            offset: number;
        };
        /** Page[InvitationOut] */
        Page_InvitationOut_: {
            /** Items */
            items: components["schemas"]["InvitationOut"][];
            /** Total */
            total: number;
            /** Limit */
            limit: number;
            /** Offset */
            offset: number;
        };
        /** Page[TeamOut] */
        Page_TeamOut_: {
            /** Items */
            items: components["schemas"]["TeamOut"][];
            /** Total */
            total: number;
            /** Limit */
            limit: number;
            /** Offset */
            offset: number;
        };
        /** Page[UserOut] */
        Page_UserOut_: {
            /** Items */
            items: components["schemas"]["UserOut"][];
            /** Total */
            total: number;
            /** Limit */
            limit: number;
            /** Offset */
            offset: number;
        };
        /** PasswordResetConfirmRequest */
        PasswordResetConfirmRequest: {
            /** Token */
            token: string;
            /** New Password */
            new_password: string;
        };
        /** PasswordResetRequest */
        PasswordResetRequest: {
            /**
             * Email
             * Format: email
             */
            email: string;
        };
        /**
         * PaymentInitOut
         * @description Response for any `*-init` endpoint that creates a ComGate payment.
         *
         *     `redirect_url` is the ComGate hosted-page URL the frontend should
         *     `window.location` to. `charge_id` lets the frontend poll for
         *     completion if it doesn't want to wait for the return-URL.
         */
        PaymentInitOut: {
            /** Redirect Url */
            redirect_url: string;
            /**
             * Charge Id
             * Format: uuid
             */
            charge_id: string;
            /** Amount Minor */
            amount_minor: number;
            /** Currency */
            currency: string;
        };
        /** PipelineBoard */
        PipelineBoard: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Name */
            name: string;
            /** Is Default */
            is_default: boolean;
            /** Currency */
            currency: string;
            /** Stages */
            stages: components["schemas"]["BoardStage"][];
        };
        /** PipelineSummary */
        PipelineSummary: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Name */
            name: string;
            /** Is Default */
            is_default: boolean;
            /** Stages */
            stages: components["schemas"]["StageOut"][];
        };
        /**
         * PipelineValueConfig
         * @description Sum of open `Deal.value` in the date range. Optional grouping.
         */
        PipelineValueConfig: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "pipeline_value";
            /**
             * Group By
             * @default none
             * @enum {string}
             */
            group_by: "none" | "stage" | "owner";
        };
        /**
         * PipelineValueResponse
         * @description Sum of open deals + comparison vs. previous period of equal length.
         */
        PipelineValueResponse: {
            /** Value */
            value: string;
            /** Currency */
            currency: string;
            /** Sparkline */
            sparkline: components["schemas"]["SparklineBucket"][];
            comparison: components["schemas"]["Comparison"] | null;
        };
        /** PlanOut */
        PlanOut: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Code */
            code: string;
            /** Display Name Cs */
            display_name_cs: string;
            /** Description Cs */
            description_cs?: string | null;
            /** Billing Interval */
            billing_interval: string;
            /** Price Per User Minor */
            price_per_user_minor: number | null;
            /** Currency */
            currency: string;
            /** Is Public */
            is_public: boolean;
            /** Is Active */
            is_active: boolean;
            /** Sort Order */
            sort_order: number;
            /** Trial Days */
            trial_days?: number | null;
        };
        /**
         * PublicPlanOut
         * @description A public-pricing-page entry. Includes derived savings vs monthly so the
         *     frontend doesn't recompute the math.
         */
        PublicPlanOut: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Code */
            code: string;
            /** Display Name Cs */
            display_name_cs: string;
            /** Description Cs */
            description_cs?: string | null;
            /** Billing Interval */
            billing_interval: string;
            /** Price Per User Minor */
            price_per_user_minor: number | null;
            /** Currency */
            currency: string;
            /** Is Public */
            is_public: boolean;
            /** Is Active */
            is_active: boolean;
            /** Sort Order */
            sort_order: number;
            /** Trial Days */
            trial_days?: number | null;
            /** Monthly Equivalent Minor */
            monthly_equivalent_minor?: number | null;
            /** Savings Minor */
            savings_minor?: number | null;
            /** Savings Percent */
            savings_percent?: number | null;
        };
        /** RefreshResponse */
        RefreshResponse: {
            /** Access Token */
            access_token: string;
            user: components["schemas"]["CurrentUser"];
        };
        /**
         * RegistryLookupResult
         * @description Response body for /companies/lookup-registry.
         *
         *     Mirrors `app.services.business_registry.CompanyRegistryData` 1:1 so the
         *     generated OpenAPI schema is clean.
         */
        RegistryLookupResult: {
            /** Name */
            name: string;
            /** Ico */
            ico: string;
            /** Dic */
            dic?: string | null;
            /** Address Street */
            address_street?: string | null;
            /** Address City */
            address_city?: string | null;
            /** Address Zip */
            address_zip?: string | null;
            /** Legal Form */
            legal_form?: string | null;
            /** Registered On */
            registered_on?: string | null;
        };
        /**
         * RepActivityConfig
         * @description Pipeline-starvation early-warning: new deals added per rep.
         */
        RepActivityConfig: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "rep_activity";
        };
        /** RepActivityItem */
        RepActivityItem: {
            /** User Id */
            user_id: string | null;
            /** Name */
            name: string;
            /** Deals Added */
            deals_added: number;
        };
        /** RepActivityResponse */
        RepActivityResponse: {
            /** Items */
            items: components["schemas"]["RepActivityItem"][];
        };
        /** ResendVerificationRequest */
        ResendVerificationRequest: {
            /**
             * Email
             * Format: email
             */
            email: string;
        };
        /**
         * SalesCycleLengthConfig
         * @description Days between Company.created_at and Deal.closed_at for won deals.
         *
         *     Default `median` is more robust for SMB sample sizes — averages
         *     skew badly when one big-ticket deal sits at the long tail.
         */
        SalesCycleLengthConfig: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "sales_cycle_length";
            /**
             * Metric
             * @default median
             * @enum {string}
             */
            metric: "mean" | "median";
        };
        /**
         * SalesCycleLengthResponse
         * @description Days between Company.created_at and Deal.closed_at for won deals.
         */
        SalesCycleLengthResponse: {
            /** Value */
            value: number | null;
            /** Median Days */
            median_days: number | null;
            /** Mean Days */
            mean_days: number | null;
            /** Sample Count */
            sample_count: number;
        };
        /**
         * SalesLeaderboardConfig
         * @description Bar chart of reps ranked by a configurable metric.
         */
        SalesLeaderboardConfig: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "sales_leaderboard";
            /**
             * Metric
             * @default won_value
             * @enum {string}
             */
            metric: "won_count" | "won_value" | "win_rate" | "deals_added";
        };
        /** SalesLeaderboardItem */
        SalesLeaderboardItem: {
            /** User Id */
            user_id: string | null;
            /** Name */
            name: string;
            /** Metric Value */
            metric_value: string | number;
        };
        /** SalesLeaderboardResponse */
        SalesLeaderboardResponse: {
            /** Items */
            items: components["schemas"]["SalesLeaderboardItem"][];
            /** Metric */
            metric: string;
            /** Currency */
            currency: string;
        };
        /**
         * SeatChangeInitIn
         * @description Body for `POST /payments/seat-change-init`.
         *
         *     `seat_count` is the target number of seats. When the target is
         *     above the current `contracted_seat_count` AND status is 'active',
         *     the endpoint kicks off a prorated ComGate charge. All other
         *     transitions (decreases, trial bumps, no-ops) are handled by
         *     `PUT /subscription/seat-count` directly without this endpoint.
         */
        SeatChangeInitIn: {
            /** Seat Count */
            seat_count: number;
        };
        /**
         * SeatChangeInitOut
         * @description Response for `POST /payments/seat-change-init`.
         *
         *     `status='accepted'`: ComGate took the charge for processing; the
         *     final outcome lands via webhook. `charge_id` lets the frontend
         *     poll `GET /payments/invoices/{id}` for the terminal state.
         */
        SeatChangeInitOut: {
            /**
             * Status
             * @constant
             */
            status: "accepted";
            /**
             * Charge Id
             * Format: uuid
             */
            charge_id: string;
            /** Amount Minor */
            amount_minor: number;
            /** Currency */
            currency: string;
        };
        /** SetCompIn */
        SetCompIn: {
            /** Reason */
            reason: string;
            /** Ends At */
            ends_at?: string | null;
        };
        /** SetEnterpriseIn */
        SetEnterpriseIn: {
            /** Override Price Per User Minor */
            override_price_per_user_minor: number;
            /** Period Months */
            period_months: number;
            /** Notes */
            notes?: string | null;
        };
        /** SignupRequest */
        SignupRequest: {
            /**
             * Email
             * Format: email
             */
            email: string;
            /** Password */
            password: string;
            /** Name */
            name: string;
        };
        /** SparklineBucket */
        SparklineBucket: {
            /**
             * Bucket Date
             * Format: date
             */
            bucket_date: string;
            /** Value */
            value: string | number;
        };
        /** StageCreate */
        StageCreate: {
            /** Name */
            name: string;
            /**
             * Default Probability
             * @default 0
             */
            default_probability: number;
            /**
             * Color
             * @default #3D5AFE
             */
            color: string;
            /** @default open */
            stage_type: components["schemas"]["StageType"];
        };
        /** StageOut */
        StageOut: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Pipeline Id
             * Format: uuid
             */
            pipeline_id: string;
            /** Name */
            name: string;
            /** Default Probability */
            default_probability: number;
            /** Color */
            color: string;
            /** Position */
            position: number;
            stage_type: components["schemas"]["StageType"];
        };
        /** StageReorder */
        StageReorder: {
            /** Stage Ids */
            stage_ids: string[];
        };
        /**
         * StageType
         * @enum {string}
         */
        StageType: "open" | "won" | "lost";
        /** StageUpdate */
        StageUpdate: {
            /** Name */
            name?: string | null;
            /** Default Probability */
            default_probability?: number | null;
            /** Color */
            color?: string | null;
            stage_type?: components["schemas"]["StageType"] | null;
        };
        /** StaleDealItem */
        StaleDealItem: {
            /**
             * Deal Id
             * Format: uuid
             */
            deal_id: string;
            /** Deal Name */
            deal_name: string;
            /**
             * Company Id
             * Format: uuid
             */
            company_id: string;
            /** Company Name */
            company_name: string;
            /** Stage Name */
            stage_name: string;
            /** Value */
            value: string;
            /** Currency */
            currency: string;
            /** Owner User Id */
            owner_user_id: string | null;
            /** Owner Name */
            owner_name: string;
            /** Days Since Change */
            days_since_change: number;
        };
        /**
         * StaleDealsConfig
         * @description Open deals whose stage hasn't moved for at least `threshold` days.
         */
        StaleDealsConfig: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "stale_deals";
            /**
             * Threshold
             * @default 60
             * @enum {integer}
             */
            threshold: 30 | 60 | 90;
        };
        /** StaleDealsResponse */
        StaleDealsResponse: {
            /** Items */
            items: components["schemas"]["StaleDealItem"][];
            /** Threshold Days */
            threshold_days: number;
        };
        /** SubscriptionOut */
        SubscriptionOut: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Organization Id
             * Format: uuid
             */
            organization_id: string;
            plan: components["schemas"]["PlanOut"];
            /**
             * Status
             * @enum {string}
             */
            status: "trialing" | "pending_activation" | "active" | "past_due" | "canceled";
            /**
             * Started At
             * Format: date-time
             */
            started_at: string;
            /** Current Period Starts At */
            current_period_starts_at: string | null;
            /** Current Period Ends At */
            current_period_ends_at: string | null;
            /** Canceled At */
            canceled_at: string | null;
            /** Override Price Per User Minor */
            override_price_per_user_minor: number | null;
            /** Is Comp */
            is_comp: boolean;
            /** Comp Reason */
            comp_reason: string | null;
            /** Notes */
            notes: string | null;
            /**
             * Seat Count
             * @default 1
             */
            seat_count: number;
            /**
             * Contracted Seat Count
             * @default 1
             */
            contracted_seat_count: number;
            pending_plan?: components["schemas"]["PlanOut"] | null;
            /** Pending Seat Count */
            pending_seat_count?: number | null;
            /** Pending User Deactivations */
            pending_user_deactivations?: string[] | null;
            /** Effective Price Per User Minor */
            effective_price_per_user_minor?: number | null;
            /** Access Status */
            access_status: string;
        };
        /**
         * TaxInvoiceDetailOut
         * @description Full invoice payload for the detail drawer. Includes line items
         *     + customer snapshot + payment instructions. Issuer fields are
         *     omitted from the customer surface for the same reason as in the
         *     list — the customer cares about *their* details + the total.
         */
        TaxInvoiceDetailOut: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Number */
            number: string;
            /**
             * Kind
             * @enum {string}
             */
            kind: "invoice" | "credit_note" | "proforma";
            /**
             * Status
             * @enum {string}
             */
            status: "draft" | "issued" | "paid" | "overdue" | "voided";
            /**
             * Issued At
             * Format: date-time
             */
            issued_at: string;
            /**
             * Due At
             * Format: date
             */
            due_at: string;
            /** Paid At */
            paid_at: string | null;
            /** Sent At */
            sent_at: string | null;
            /** Currency */
            currency: string;
            /** Subtotal Minor */
            subtotal_minor: number;
            /** Vat Amount Minor */
            vat_amount_minor: number;
            /** Total Minor */
            total_minor: number;
            /** Related Invoice Id */
            related_invoice_id: string | null;
            /** Customer Name */
            customer_name: string;
            /** Customer Address */
            customer_address: string;
            /** Customer Ico */
            customer_ico: string | null;
            /** Customer Dic */
            customer_dic: string | null;
            /**
             * Taxable Supply Date
             * Format: date
             */
            taxable_supply_date: string;
            /** Variable Symbol */
            variable_symbol: string;
            /** Payment Method */
            payment_method: string;
            /** Note */
            note: string | null;
            /** Issuer Iban */
            issuer_iban: string;
            /** Issuer Account Domestic */
            issuer_account_domestic: string | null;
            /** Lines */
            lines: components["schemas"]["TaxInvoiceLineOut"][];
        };
        /** TaxInvoiceLineOut */
        TaxInvoiceLineOut: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Position */
            position: number;
            /** Description */
            description: string;
            /** Quantity */
            quantity: string;
            /** Unit Label */
            unit_label: string | null;
            /** Unit Price Minor */
            unit_price_minor: number;
            /** Vat Rate Percent */
            vat_rate_percent: string;
            /** Line Subtotal Minor */
            line_subtotal_minor: number;
            /** Line Vat Minor */
            line_vat_minor: number;
            /** Line Total Minor */
            line_total_minor: number;
        };
        /** TaxInvoiceList */
        TaxInvoiceList: {
            /** Items */
            items: components["schemas"]["TaxInvoiceOut"][];
            /** Total */
            total: number;
        };
        /**
         * TaxInvoiceOut
         * @description Compact summary for the customer-facing list. Omits the issuer
         *     snapshot fields (the customer doesn't need to see SimpleCRM's IČO
         *     in every row) and the storage keys (those are an implementation
         *     detail of the PDF stream endpoint).
         */
        TaxInvoiceOut: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Number */
            number: string;
            /**
             * Kind
             * @enum {string}
             */
            kind: "invoice" | "credit_note" | "proforma";
            /**
             * Status
             * @enum {string}
             */
            status: "draft" | "issued" | "paid" | "overdue" | "voided";
            /**
             * Issued At
             * Format: date-time
             */
            issued_at: string;
            /**
             * Due At
             * Format: date
             */
            due_at: string;
            /** Paid At */
            paid_at: string | null;
            /** Sent At */
            sent_at: string | null;
            /** Currency */
            currency: string;
            /** Subtotal Minor */
            subtotal_minor: number;
            /** Vat Amount Minor */
            vat_amount_minor: number;
            /** Total Minor */
            total_minor: number;
            /** Related Invoice Id */
            related_invoice_id: string | null;
        };
        /** TeamCreate */
        TeamCreate: {
            /** Name */
            name: string;
            /** Manager User Id */
            manager_user_id?: string | null;
        };
        /** TeamLeaderboard */
        TeamLeaderboard: {
            /** Currency */
            currency: string;
            /**
             * From Date
             * Format: date
             */
            from_date: string;
            /**
             * To Date
             * Format: date
             */
            to_date: string;
            metric: components["schemas"]["TeamMetric"];
            /** Rows */
            rows: components["schemas"]["TeamLeaderboardRow"][];
        };
        /** TeamLeaderboardRow */
        TeamLeaderboardRow: {
            /**
             * Team Id
             * Format: uuid
             */
            team_id: string;
            /** Team Name */
            team_name: string;
            /** Manager User Id */
            manager_user_id: string | null;
            /** Manager Name */
            manager_name: string | null;
            /** Member Count */
            member_count: number;
            /** Won Count */
            won_count: number;
            /** Won Value */
            won_value: string;
            /** Open Pipeline Value */
            open_pipeline_value: string;
            /** Conversion Rate */
            conversion_rate: number | null;
            /** Avg Cycle Days */
            avg_cycle_days: number | null;
        };
        /**
         * TeamMemberUpdate
         * @description Replace the team's member set in one call.
         */
        TeamMemberUpdate: {
            /** Member Ids */
            member_ids: string[];
        };
        /**
         * TeamMetric
         * @description Metric the manager can pick on the team-vs-team leaderboard.
         *
         *     Stored as a string enum so it round-trips cleanly through the
         *     `?metric=` query parameter and the OpenAPI spec.
         * @enum {string}
         */
        TeamMetric: "won_value" | "won_count" | "open_pipeline_value" | "conversion_rate" | "avg_cycle_days";
        /** TeamOut */
        TeamOut: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Organization Id
             * Format: uuid
             */
            organization_id: string;
            /** Name */
            name: string;
            /** Manager User Id */
            manager_user_id?: string | null;
            /** Is Default */
            is_default: boolean;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /** TeamUpdate */
        TeamUpdate: {
            /** Name */
            name?: string | null;
            /** Manager User Id */
            manager_user_id?: string | null;
        };
        /** TokenCheckRequest */
        TokenCheckRequest: {
            /** Token */
            token: string;
        };
        /** TokenCheckResponse */
        TokenCheckResponse: {
            /**
             * Email
             * Format: email
             */
            email: string;
            /** Requires Password */
            requires_password: boolean;
        };
        /**
         * UpdateSeatCountIn
         * @description Body for `PUT /subscription/seat-count`. The admin sends a target
         *     seat count and, when reducing below the current active-user count, a
         *     list of users to deactivate. The list length must be exactly
         *     `(current_active − new_seat_count)`.
         */
        UpdateSeatCountIn: {
            /** Seat Count */
            seat_count: number;
            /** Deactivate User Ids */
            deactivate_user_ids?: string[];
        };
        /** UserOut */
        UserOut: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Email
             * Format: email
             */
            email: string;
            /** Name */
            name: string;
            /** Avatar Url */
            avatar_url?: string | null;
            role: components["schemas"]["UserRole"];
            /** Team Id */
            team_id?: string | null;
            /** Can Invite */
            can_invite: boolean;
            /** Is Active */
            is_active: boolean;
            /** Max Owned Companies */
            max_owned_companies?: number | null;
            /** Last Login At */
            last_login_at?: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /**
         * UserRole
         * @enum {string}
         */
        UserRole: "salesperson" | "manager" | "admin";
        /** UserUpdate */
        UserUpdate: {
            role?: components["schemas"]["UserRole"] | null;
            /** Team Id */
            team_id?: string | null;
            /** Can Invite */
            can_invite?: boolean | null;
            /** Is Active */
            is_active?: boolean | null;
            /** Max Owned Companies */
            max_owned_companies?: number | null;
        };
        /** ValidationError */
        ValidationError: {
            /** Location */
            loc: (string | number)[];
            /** Message */
            msg: string;
            /** Error Type */
            type: string;
            /** Input */
            input?: unknown;
            /** Context */
            ctx?: Record<string, never>;
        };
        /** Velocity */
        Velocity: {
            /**
             * From Date
             * Format: date
             */
            from_date: string;
            /**
             * To Date
             * Format: date
             */
            to_date: string;
            /** Stages */
            stages: components["schemas"]["VelocityByStage"][];
        };
        /** VelocityByStage */
        VelocityByStage: {
            /**
             * Stage Id
             * Format: uuid
             */
            stage_id: string;
            /** Stage Name */
            stage_name: string;
            /** Avg Days In Stage */
            avg_days_in_stage: number | null;
            /** Deal Count */
            deal_count: number;
        };
        /** VerifyConsumeRequest */
        VerifyConsumeRequest: {
            /** Token */
            token: string;
            /** Password */
            password?: string | null;
        };
        /**
         * WidgetEntry
         * @description One widget on the dashboard.
         *
         *     `id` is a client-generated ULID. We don't enforce ULID format
         *     server-side because the client is the only writer; we just
         *     require it to be a non-empty string.
         */
        WidgetEntry: {
            /** Id */
            id: string;
            position: components["schemas"]["WidgetPosition"];
            /** Config */
            config: components["schemas"]["PipelineValueConfig"] | components["schemas"]["NewCompaniesConfig"] | components["schemas"]["DealsWonConfig"] | components["schemas"]["WinRateConfig"] | components["schemas"]["AvgDealSizeConfig"] | components["schemas"]["SalesCycleLengthConfig"] | components["schemas"]["LeadToDealConversionConfig"] | components["schemas"]["LostReasonsBreakdownConfig"] | components["schemas"]["SalesLeaderboardConfig"] | components["schemas"]["RepActivityConfig"] | components["schemas"]["StaleDealsConfig"] | components["schemas"]["CompaniesAtRiskConfig"];
        };
        /** WidgetPosition */
        WidgetPosition: {
            /** X */
            x: number;
            /** Y */
            y: number;
            /** W */
            w: number;
            /** H */
            h: number;
        };
        /**
         * WinRateConfig
         * @description won_count / (won_count + lost_count) × 100. No tunable knobs.
         */
        WinRateConfig: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "win_rate";
        };
        /**
         * WinRateResponse
         * @description won_count / (won_count + lost_count) × 100, or None when no closes.
         */
        WinRateResponse: {
            /** Value */
            value: number | null;
            /** Won Count */
            won_count: number;
            /** Lost Count */
            lost_count: number;
            comparison: components["schemas"]["Comparison"] | null;
        };
        /**
         * _ExportCsvRequest
         * @description Multi-widget CSV export body. Frontend sends the resolved
         *     `from`/`to` ISO date pair (it already does the preset → range
         *     resolution per widget request) plus the widget set + scope.
         */
        _ExportCsvRequest: {
            /** Widgets */
            widgets: components["schemas"]["_ExportWidgetItem"][];
            /**
             * From
             * Format: date
             */
            from: string;
            /**
             * To
             * Format: date
             */
            to: string;
            /** Teamid */
            teamId?: string | null;
            /** Owneruserid */
            ownerUserId?: string | null;
        };
        /** _ExportWidgetItem */
        _ExportWidgetItem: {
            /** Type */
            type: string;
            /** Config */
            config?: {
                [key: string]: unknown;
            };
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    healthz_api_v1_healthz_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HealthResponse"];
                };
            };
        };
    };
    healthz_db_api_v1_healthz_db_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HealthResponse"];
                };
            };
        };
    };
    google_login_api_v1_auth_google_login_get: {
        parameters: {
            query?: {
                invite?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    google_callback_api_v1_auth_google_callback_get: {
        parameters: {
            query: {
                code: string;
                state: string;
            };
            header?: never;
            path?: never;
            cookie?: {
                simplecrm_oauth_state?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    me_api_v1_auth_me_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CurrentUser"];
                };
            };
        };
    };
    logout_api_v1_auth_logout_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                simplecrm_refresh?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    refresh_api_v1_auth_refresh_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                simplecrm_refresh?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RefreshResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    signup_api_v1_auth_signup_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SignupRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthSuccessResponse"] | {
                        [key: string]: string;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    verify_email_check_api_v1_auth_verify_email_check_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TokenCheckRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TokenCheckResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    verify_email_consume_api_v1_auth_verify_email_consume_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VerifyConsumeRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthSuccessResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    verify_email_resend_api_v1_auth_verify_email_resend_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ResendVerificationRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: string;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    login_api_v1_auth_login_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LoginRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthSuccessResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    password_reset_request_api_v1_auth_password_reset_request_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PasswordResetRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: string;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    password_reset_confirm_api_v1_auth_password_reset_confirm_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PasswordResetConfirmRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthSuccessResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    invite_accept_api_v1_auth_invite_accept_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["InviteAcceptRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthSuccessResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_organization_api_v1_onboarding_organization_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateOrganizationIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CurrentUser"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    preview_invitation_api_v1_onboarding_invite__token__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                token: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvitationPreview"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    export_deals_csv_api_v1_reports_export_csv_get: {
        parameters: {
            query?: {
                from?: string | null;
                to?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    export_widgets_csv_api_v1_reports_export_csv_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["_ExportCsvRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    submit_feedback_api_v1_feedback_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": components["schemas"]["Body_submit_feedback_api_v1_feedback_post"];
            };
        };
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FeedbackAccepted"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_current_organization_api_v1_organizations_current_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrganizationOut"];
                };
            };
        };
    };
    update_current_organization_api_v1_organizations_current_put: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OrganizationUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrganizationOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_companies_api_v1_companies_get: {
        parameters: {
            query?: {
                /** @description Case-insensitive partial match on name or IČO. */
                search?: string | null;
                /** @description Sort key. One of: name, ownership_expires_at, last_order_at, last_activity_at, created_at. */
                sort?: string;
                order?: string;
                /** @description Ownership filter: 'mine' (only my own), 'mine_and_unowned' (mine + pool), or 'unowned' (pool only). */
                ownership?: string | null;
                limit?: number;
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Page_CompanyOut_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_company_api_v1_companies_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CompanyCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CompanyOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    lookup_registry_api_v1_companies_lookup_registry_get: {
        parameters: {
            query: {
                /** @description ISO-ish country code */
                country: string;
                /** @description Registration number (e.g. IČO) */
                number: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RegistryLookupResult"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_company_api_v1_companies__company_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                company_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CompanyOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_company_api_v1_companies__company_id__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                company_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CompanyUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CompanyOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_company_api_v1_companies__company_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                company_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    free_company_api_v1_companies__company_id__free_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                company_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CompanyOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    reassign_company_endpoint_api_v1_companies__company_id__reassign_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                company_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CompanyReassign"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CompanyOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_contacts_api_v1_contacts_get: {
        parameters: {
            query?: {
                company_id?: string | null;
                limit?: number;
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Page_ContactOut_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_contact_api_v1_contacts_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ContactCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ContactOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_contact_api_v1_contacts__contact_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                contact_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ContactOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_contact_api_v1_contacts__contact_id__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                contact_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ContactUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ContactOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_contact_api_v1_contacts__contact_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                contact_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_deals_api_v1_deals_get: {
        parameters: {
            query?: {
                company_id?: string | null;
                limit?: number;
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Page_DealOut_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_deal_api_v1_deals_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DealCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DealOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_deal_api_v1_deals__deal_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                deal_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DealOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_deal_api_v1_deals__deal_id__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                deal_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DealUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DealOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_deal_api_v1_deals__deal_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                deal_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    move_deal_stage_api_v1_deals__deal_id__move_stage_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                deal_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DealStageMove"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DealOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    mark_deal_won_api_v1_deals__deal_id__mark_won_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                deal_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DealOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    mark_deal_lost_api_v1_deals__deal_id__mark_lost_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                deal_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DealMarkLost"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DealOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_deal_payment_api_v1_deals__deal_id__payment_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                deal_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DealPaymentUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DealOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_invitations_api_v1_invitations_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Page_InvitationOut_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_api_v1_invitations_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["InvitationCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvitationCreated"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    revoke_api_v1_invitations__invitation_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                invitation_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_my_invoices_api_v1_organizations_current_invoices_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaxInvoiceList"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_my_invoice_api_v1_organizations_current_invoices__invoice_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                invoice_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaxInvoiceDetailOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_my_invoice_pdf_api_v1_organizations_current_invoices__invoice_id__pdf_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                invoice_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_default_pipeline_api_v1_pipelines_default_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PipelineSummary"];
                };
            };
        };
    };
    get_default_pipeline_board_api_v1_pipelines_default_board_get: {
        parameters: {
            query?: {
                /** @description Rolling window (in days) for deals shown in won stages. Omit to show all wons; the frontend defaults to 30. */
                won_window_days?: number | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PipelineBoard"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_stage_api_v1_pipelines_default_stages_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StageCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StageOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_stage_api_v1_pipelines_stages__stage_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                stage_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_stage_api_v1_pipelines_stages__stage_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                stage_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StageUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StageOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    reorder_stages_api_v1_pipelines_default_reorder_stages_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StageReorder"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PipelineSummary"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    kpi_summary_api_v1_reports_kpi_summary_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["KpiSummary"];
                };
            };
        };
    };
    leaderboard_api_v1_reports_leaderboard_get: {
        parameters: {
            query?: {
                from?: string | null;
                to?: string | null;
                team_id?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Leaderboard"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    loss_reasons_api_v1_reports_loss_reasons_get: {
        parameters: {
            query?: {
                from?: string | null;
                to?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LossReasons"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    pipeline_velocity_api_v1_reports_pipeline_velocity_get: {
        parameters: {
            query?: {
                from?: string | null;
                to?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Velocity"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    team_leaderboard_api_v1_reports_team_leaderboard_get: {
        parameters: {
            query?: {
                from?: string | null;
                to?: string | null;
                metric?: components["schemas"]["TeamMetric"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TeamLeaderboard"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_summary_api_v1_reports_my_summary_get: {
        parameters: {
            query?: {
                from?: string | null;
                to?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MySummary"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_dashboard_config_api_v1_reports_dashboard_config_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
        };
    };
    put_dashboard_config_api_v1_reports_dashboard_config_put: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DashboardConfig"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_dashboard_config_api_v1_reports_dashboard_config_delete: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    widget_pipeline_value_api_v1_reports_widgets_pipeline_value_get: {
        parameters: {
            query: {
                from: string;
                to: string;
                team_id?: string | null;
                owner_user_id?: string | null;
                group_by?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PipelineValueResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    widget_deals_won_api_v1_reports_widgets_deals_won_get: {
        parameters: {
            query: {
                from: string;
                to: string;
                team_id?: string | null;
                owner_user_id?: string | null;
                display?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DealsWonResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    widget_win_rate_api_v1_reports_widgets_win_rate_get: {
        parameters: {
            query: {
                from: string;
                to: string;
                team_id?: string | null;
                owner_user_id?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WinRateResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    widget_avg_deal_size_api_v1_reports_widgets_avg_deal_size_get: {
        parameters: {
            query: {
                from: string;
                to: string;
                team_id?: string | null;
                owner_user_id?: string | null;
                scope?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AvgDealSizeResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    widget_new_companies_api_v1_reports_widgets_new_companies_get: {
        parameters: {
            query: {
                from: string;
                to: string;
                team_id?: string | null;
                owner_user_id?: string | null;
                breakdown?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NewCompaniesResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    widget_sales_cycle_length_api_v1_reports_widgets_sales_cycle_length_get: {
        parameters: {
            query: {
                from: string;
                to: string;
                team_id?: string | null;
                owner_user_id?: string | null;
                metric?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SalesCycleLengthResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    widget_lead_to_deal_conversion_api_v1_reports_widgets_lead_to_deal_conversion_get: {
        parameters: {
            query: {
                from: string;
                to: string;
                team_id?: string | null;
                owner_user_id?: string | null;
                breakdown?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LeadToDealConversionResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    widget_lost_reasons_breakdown_api_v1_reports_widgets_lost_reasons_breakdown_get: {
        parameters: {
            query: {
                from: string;
                to: string;
                team_id?: string | null;
                owner_user_id?: string | null;
                display?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LostReasonsBreakdownResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    widget_sales_leaderboard_api_v1_reports_widgets_sales_leaderboard_get: {
        parameters: {
            query: {
                from: string;
                to: string;
                team_id?: string | null;
                owner_user_id?: string | null;
                metric?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SalesLeaderboardResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    widget_rep_activity_api_v1_reports_widgets_rep_activity_get: {
        parameters: {
            query: {
                from: string;
                to: string;
                team_id?: string | null;
                owner_user_id?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RepActivityResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    widget_stale_deals_api_v1_reports_widgets_stale_deals_get: {
        parameters: {
            query: {
                from: string;
                to: string;
                team_id?: string | null;
                owner_user_id?: string | null;
                threshold?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StaleDealsResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    widget_companies_at_risk_api_v1_reports_widgets_companies_at_risk_get: {
        parameters: {
            query: {
                from: string;
                to: string;
                team_id?: string | null;
                owner_user_id?: string | null;
                threshold?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CompaniesAtRiskResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_teams_api_v1_teams_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Page_TeamOut_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_team_api_v1_teams_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TeamCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TeamOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_team_api_v1_teams__team_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                team_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TeamOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_team_api_v1_teams__team_id__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                team_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TeamUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TeamOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_team_api_v1_teams__team_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                team_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    replace_team_members_api_v1_teams__team_id__members_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                team_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TeamMemberUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TeamOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_users_api_v1_users_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Page_UserOut_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_user_api_v1_users__user_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UserUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_activities_api_v1_activities_get: {
        parameters: {
            query?: {
                entity_type?: components["schemas"]["ActivityEntityType"] | null;
                entity_id?: string | null;
                limit?: number;
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Page_ActivityOut_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_blocked_companies_api_v1_admin_blocked_companies_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Page_BlockedCompanyOut_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_blocked_company_api_v1_admin_blocked_companies_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BlockedCompanyCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BlockedCompanyOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_blocked_company_api_v1_admin_blocked_companies__blocked_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                blocked_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_current_subscription_api_v1_organizations_current_subscription_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SubscriptionOut"];
                };
            };
        };
    };
    get_current_billing_summary_api_v1_organizations_current_billing_summary_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BillingSummary"];
                };
            };
        };
    };
    choose_plan_api_v1_organizations_current_subscription_choose_plan_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ChoosePlanIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SubscriptionOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    contact_enterprise_api_v1_organizations_current_subscription_contact_enterprise_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ContactEnterpriseIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: string;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_seat_count_api_v1_organizations_current_subscription_seat_count_put: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateSeatCountIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SubscriptionOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    change_billing_interval_api_v1_organizations_current_subscription_change_interval_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ChangeIntervalIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SubscriptionOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    cancel_subscription_api_v1_organizations_current_subscription_cancel_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CancelSelfServeIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SubscriptionOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    reactivate_subscription_api_v1_organizations_current_subscription_reactivate_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SubscriptionOut"];
                };
            };
        };
    };
    initial_payment_init_api_v1_payments_initial_payment_init_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["InitialPaymentInitIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PaymentInitOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    seat_change_init_api_v1_payments_seat_change_init_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SeatChangeInitIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SeatChangeInitOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    payment_return_api_v1_payments_return_get: {
        parameters: {
            query?: {
                transId?: string | null;
                refId?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_charges_api_v1_payments_invoices_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChargeList"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    comgate_webhook_api_v1_payments_webhook_post: {
        parameters: {
            query?: never;
            header?: {
                "x-comgate-signature"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_public_plans_api_v1_plans_public_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicPlanOut"][];
                };
            };
        };
    };
    get_public_billing_settings_api_v1_plans_billing_settings_public_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BillingSettingsPublic"];
                };
            };
        };
    };
    list_organizations_api_v1_admin_organizations_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description Substring match on org name */
                q?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminOrgList"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_organization_subscription_api_v1_admin_organizations__org_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                org_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SubscriptionOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    activate_subscription_api_v1_admin_organizations__org_id__subscription_activate_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                org_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ActivateSubscriptionIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SubscriptionOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    set_comp_api_v1_admin_organizations__org_id__subscription_set_comp_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                org_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SetCompIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SubscriptionOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    set_enterprise_api_v1_admin_organizations__org_id__subscription_set_enterprise_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                org_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SetEnterpriseIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SubscriptionOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    extend_trial_api_v1_admin_organizations__org_id__subscription_extend_trial_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                org_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ExtendTrialIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SubscriptionOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    cancel_subscription_api_v1_admin_organizations__org_id__subscription_cancel_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                org_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CancelSubscriptionIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SubscriptionOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_org_subscription_activity_api_v1_admin_organizations__org_id__activity_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
            };
            header?: never;
            path: {
                org_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminActivityList"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_billing_settings_api_v1_admin_billing_settings_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BillingSettingsOut"];
                };
            };
        };
    };
    update_billing_settings_api_v1_admin_billing_settings_put: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BillingSettingsUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BillingSettingsOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_org_invoices_api_v1_admin_organizations__org_id__invoices_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
            };
            header?: never;
            path: {
                org_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChargeList"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_org_users_api_v1_admin_organizations__org_id__users_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                org_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminOrgUserList"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    impersonate_user_api_v1_admin_users__user_id__impersonate_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ImpersonateOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_invoices_api_v1_admin_invoices_get: {
        parameters: {
            query?: {
                year?: number | null;
                status?: string[] | null;
                kind?: string | null;
                org_id?: string | null;
                date_from?: string | null;
                date_to?: string | null;
                q?: string | null;
                limit?: number;
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminInvoiceList"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_invoice_detail_api_v1_admin_invoices__invoice_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                invoice_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminInvoiceDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    mark_paid_api_v1_admin_invoices__invoice_id__mark_paid_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                invoice_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AdminMarkPaidIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminInvoiceDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    void_invoice_api_v1_admin_invoices__invoice_id__void_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                invoice_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AdminVoidIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminInvoiceDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    issue_credit_note_api_v1_admin_invoices__invoice_id__credit_note_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                invoice_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AdminCreditNoteIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminInvoiceDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    issue_manual_invoice_api_v1_admin_invoices_manual_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AdminManualInvoiceIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminInvoiceDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    send_invoice_api_v1_admin_invoices__invoice_id__send_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                invoice_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AdminSendIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminInvoiceDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    export_year_csv_api_v1_admin_invoices_export_csv_get: {
        parameters: {
            query: {
                year: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    export_year_pdf_zip_api_v1_admin_invoices_export_pdfs_get: {
        parameters: {
            query: {
                year: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    export_year_full_api_v1_admin_invoices_export_full_get: {
        parameters: {
            query: {
                year: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    run_integrity_check_api_v1_admin_invoices_integrity_check_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminIntegrityRunOut"];
                };
            };
        };
    };
    get_last_integrity_run_api_v1_admin_invoices_integrity_last_run_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminIntegrityRunOut"] | null;
                };
            };
        };
    };
}
