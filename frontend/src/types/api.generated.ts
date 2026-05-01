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
    "/api/v1/auth/dev-login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Dev Login
         * @description Dev-only: mint a JWT for an arbitrary email, no OAuth round-trip.
         *
         *     Guarded by both `dev_auth_enabled=True` and `app_env=="dev"`. First
         *     call for an email provisions an Organization + admin User with the
         *     default pipeline; subsequent calls are idempotent. Also sets the
         *     refresh cookie so the dev workflow benefits from /auth/refresh on
         *     cold-load — exactly the same shape as the real OAuth callback.
         */
        post: operations["dev_login_api_v1_auth_dev_login_post"];
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
        post?: never;
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
        /** Move Deal Stage */
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
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /**
         * ActivityEntityType
         * @enum {string}
         */
        ActivityEntityType: "company" | "contact" | "deal";
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
        ActivityType: "note" | "stage_change" | "owner_change" | "deal_won" | "deal_lost" | "company_freed" | "ownership_reassigned";
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
            organization?: components["schemas"]["OrganizationSummary"] | null;
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
        /** DevLoginRequest */
        DevLoginRequest: {
            /**
             * Email
             * Format: email
             * @default admin@example.com
             */
            email: string;
            /** Name */
            name?: string | null;
        };
        /** DevLoginResponse */
        DevLoginResponse: {
            /** Access Token */
            access_token: string;
            user: components["schemas"]["CurrentUser"];
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
            /** Show Leaderboard To Salespeople */
            show_leaderboard_to_salespeople?: boolean | null;
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
    dev_login_api_v1_auth_dev_login_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DevLoginRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DevLoginResponse"];
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
}
