export const PIN_LENGTH = 6;
export const PIN_REGEX = /^[0-9]{6}$/;

// Lockout policy — design.md §2, cashier-checkout/spec.md §3 FR-1
export const PIN_MAX_ATTEMPTS = 5;
export const PIN_LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
