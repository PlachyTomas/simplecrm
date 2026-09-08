/** The one-to-one composer is parked until mailbox sync ships; bulk campaigns stay the only outbound path. */
export const SINGLE_EMAIL_COMPOSE_ENABLED = import.meta.env.VITE_SINGLE_EMAIL_COMPOSE === "1";
