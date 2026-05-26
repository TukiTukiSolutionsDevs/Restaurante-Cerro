import argon2 from 'argon2';
import { randomInt } from 'crypto';

import { PIN_LENGTH, PIN_REGEX } from './pin.constants';

// Insecure PIN rules (design.md §2, admin-panel/spec.md §4 NFR-3):
//   too_short   — fewer than 6 characters
//   non_numeric — does not match /^[0-9]{6}$/
//   all_same    — every digit is identical (e.g. 000000, 111111)
//   sequence    — 6 consecutive digits ascending or descending (e.g. 123456, 987654)

export function hashPin(pin: string): Promise<string> {
  if (!PIN_REGEX.test(pin)) {
    throw new Error(`PIN must be exactly ${PIN_LENGTH} numeric digits`);
  }
  return argon2.hash(pin, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, pin);
  } catch {
    return false;
  }
}

export function isInsecurePin(pin: string): {
  insecure: boolean;
  reason?: 'too_short' | 'non_numeric' | 'all_same' | 'sequence';
} {
  if (pin.length < PIN_LENGTH) {
    return { insecure: true, reason: 'too_short' };
  }
  if (!PIN_REGEX.test(pin)) {
    return { insecure: true, reason: 'non_numeric' };
  }

  const digits = pin.split('').map(Number);

  if (digits.every((d) => d === digits[0])) {
    return { insecure: true, reason: 'all_same' };
  }

  const isAscending = digits.every((d, i) => i === 0 || d === digits[i - 1]! + 1);
  const isDescending = digits.every((d, i) => i === 0 || d === digits[i - 1]! - 1);
  if (isAscending || isDescending) {
    return { insecure: true, reason: 'sequence' };
  }

  return { insecure: false };
}

export function randomPin(): string {
  let pin: string;
  do {
    pin = String(randomInt(0, 1_000_000)).padStart(PIN_LENGTH, '0');
  } while (isInsecurePin(pin).insecure);
  return pin;
}
