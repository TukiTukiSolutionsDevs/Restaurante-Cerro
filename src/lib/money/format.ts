// convención local: sin espacio entre S/ y dígitos
const peFormatter = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatSoles(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new TypeError(`formatSoles: cents must be an integer, got ${cents}`);
  }
  if (cents < 0) {
    throw new RangeError(`formatSoles: cents must be non-negative, got ${cents}`);
  }
  const raw = peFormatter.format(cents / 100);
  // ICU may emit "S/ ", "S/\u00a0" (non-breaking space), or "PEN " depending on
  // Node.js ICU data version. Normalize all variants to the local convention: no space.
  return raw.replace(/^(?:S\/|PEN)[\s\u00a0]*/u, 'S/');
}

// Display formatter for customer-facing UI: drops trailing ".00" when whole soles.
// Use formatSoles() for receipts, audit logs, and anywhere we want strict 2-decimal format.
export function formatSolesCompact(cents: number): string {
  const full = formatSoles(cents);
  return cents % 100 === 0 ? full.replace(/\.00$/, '') : full;
}
