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
        /** Google Login */
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
        /** Me */
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
        /** Logout */
        post: operations["logout_api_v1_auth_logout_post"];
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
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
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
            organization: components["schemas"]["OrganizationSummary"];
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
        /**
         * UserRole
         * @enum {string}
         */
        UserRole: "salesperson" | "manager" | "admin";
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
                    "application/json": unknown;
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
    list_contacts_api_v1_contacts_get: {
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
}
