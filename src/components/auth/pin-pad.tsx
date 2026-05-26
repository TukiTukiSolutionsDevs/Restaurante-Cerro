'use client';

import { useState } from 'react';

export interface PinPadProps {
  onSubmit: (pin: string) => void;
  length?: number;
  disabled?: boolean;
  error?: string;
}

const BUTTONS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'Enter'] as const;

export function PinPad({ onSubmit, length = 6, disabled = false, error }: PinPadProps) {
  const [entry, setEntry] = useState('');

  const [prevErrorProp, setPrevErrorProp] = useState<string | undefined>(error);
  const [displayError, setDisplayError] = useState<string | undefined>(error);
  if (error !== prevErrorProp) {
    setPrevErrorProp(error);
    setDisplayError(error);
  }

  function clearError() {
    setDisplayError(undefined);
  }

  function handleDigit(digit: string) {
    if (disabled || entry.length >= length) return;
    clearError();
    const next = entry + digit;
    setEntry(next);
    if (next.length === length) {
      onSubmit(next);
      setEntry('');
    }
  }

  function handleBackspace() {
    if (disabled) return;
    clearError();
    setEntry((prev) => prev.slice(0, -1));
  }

  function handleEnter() {
    if (disabled || entry.length !== length) return;
    onSubmit(entry);
    setEntry('');
  }

  function handleButton(btn: string) {
    if (btn === '⌫') handleBackspace();
    else if (btn === 'Enter') handleEnter();
    else handleDigit(btn);
  }

  return (
    <div className="flex flex-col items-center gap-5">
      {/* Masked digit display */}
      <div className="flex gap-3" aria-label="PIN ingresado" aria-live="polite">
        {Array.from({ length }).map((_, i) => (
          <span
            key={i}
            className={`block h-4 w-4 rounded-full transition-colors ${
              i < entry.length ? 'bg-neutral-800' : 'bg-neutral-300'
            }`}
          />
        ))}
      </div>

      {/* Error message */}
      {displayError && (
        <p role="alert" className="text-sm font-medium text-danger-500">
          {displayError}
        </p>
      )}

      {/* Keypad — 3 columns × 4 rows */}
      <div className="grid grid-cols-3 gap-3">
        {BUTTONS.map((btn) => {
          const isEnter = btn === 'Enter';
          const isDisabled = disabled || (isEnter && entry.length !== length);
          return (
            <button
              key={btn}
              type="button"
              aria-label={btn === '⌫' ? 'Borrar' : btn === 'Enter' ? 'Confirmar' : btn}
              disabled={isDisabled}
              onClick={() => handleButton(btn)}
              className="flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-100 font-display text-2xl font-semibold text-neutral-800 transition-all hover:bg-neutral-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {btn}
            </button>
          );
        })}
      </div>
    </div>
  );
}
