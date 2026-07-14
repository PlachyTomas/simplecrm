/**
 * Centralized `data-testid` map.
 *
 * Why central:
 *   1. Stable selectors for E2E tests (Playwright) and for AI agents
 *      driving the app via Playwright MCP — the values don't drift when
 *      copy or markup changes.
 *   2. One place to read when picking a new testid so we don't fork
 *      naming conventions across the codebase.
 *
 * Convention: `{page-or-area}-{component}-{action-or-role}` in
 * kebab-case. Functions accept dynamic IDs as suffixes and return a
 * fully-resolved string (e.g. `pipelineStage("s1") → "pipeline-stage-s1"`).
 *
 * Tag interactive primitives only — buttons users click, inputs they
 * fill, items they select. Don't tag layout-only nodes.
 */
export const testIds = {
  nav: {
    overview: "nav-overview",
    pipeline: "nav-pipeline",
    companies: "nav-companies",
    contacts: "nav-contacts",
    deals: "nav-deals",
    calendar: "nav-calendar",
    reports: "nav-reports",
    settings: "nav-settings",
  },
  pwa: {
    nudge: "pwa-nudge",
    nudgeInstall: "pwa-nudge-install",
    nudgeLater: "pwa-nudge-later",
    nudgeNever: "pwa-nudge-never",
    moreInstall: "pwa-more-install",
    settingsInstall: "pwa-settings-install",
    iosModalClose: "pwa-ios-modal-close",
  },
  companies: {
    addButton: "companies-add-button",
    addModal: {
      icoInput: "companies-add-modal-ico",
      nameInput: "companies-add-modal-name",
      emailInput: "companies-add-modal-email",
      websiteInput: "companies-add-modal-website",
      submit: "companies-add-modal-submit",
      cancel: "companies-add-modal-cancel",
    },
  },
  contacts: {
    addButton: "contacts-add-button",
    addModal: {
      firstNameInput: "contacts-add-modal-first-name",
      lastNameInput: "contacts-add-modal-last-name",
      emailInput: "contacts-add-modal-email",
      submit: "contacts-add-modal-submit",
      cancel: "contacts-add-modal-cancel",
    },
  },
  deals: {
    addButton: "deals-add-button",
    addModal: {
      nameInput: "deals-add-modal-name",
      companyInput: "deals-add-modal-company-search",
      newCompanyToggle: "deals-add-modal-new-company-toggle",
      stageSelect: "deals-add-modal-stage",
      submit: "deals-add-modal-submit",
      cancel: "deals-add-modal-cancel",
      missingSummary: "deals-add-modal-missing",
    },
  },
  pipeline: {
    stage: (stageId: string) => `pipeline-stage-${stageId}`,
    deal: (dealId: string) => `pipeline-deal-${dealId}`,
  },
  reports: {
    addWidget: "reports-add-widget",
  },
  dashboard: {
    editLayout: "dashboard-edit-layout",
    addWidget: "dashboard-add-widget",
    quickAction: (type: string) => `dashboard-quick-action-${type}`,
    widgetRemove: (id: string) => `dashboard-widget-remove-${id}`,
    widgetConfig: {
      open: (id: string) => `dashboard-widget-config-open-${id}`,
      popover: "dashboard-widget-config-popover",
      preset: (preset: string) => `dashboard-widget-config-preset-${preset}`,
    },
  },
  events: {
    dealPicker: {
      input: "event-form-deal-picker-input",
      option: (id: string) => `event-form-deal-picker-option-${id}`,
    },
  },
  widgets: {
    picker: {
      modal: "widget-picker-modal",
      close: "widget-picker-close",
      item: (type: string) => `widget-picker-item-${type}`,
    },
    mobileList: {
      dragHandle: (id: string) => `widget-mobile-drag-${id}`,
      moveUp: (id: string) => `widget-mobile-move-up-${id}`,
      moveDown: (id: string) => `widget-mobile-move-down-${id}`,
    },
  },
  onboarding: {
    wizard: {
      nameInput: "onboarding-name-input",
      seatCountInput: "onboarding-seat-count-input",
      next: "onboarding-next",
      back: "onboarding-back",
      submit: "onboarding-submit",
    },
  },
  billing: {
    kindBusiness: "billing-kind-business",
    kindIndividual: "billing-kind-individual",
    ico: "billing-ico",
    billingName: "billing-name",
    addressStreet: "billing-address-street",
    addressCity: "billing-address-city",
    addressZip: "billing-address-zip",
    submit: "billing-submit",
  },
} as const;
