'use client';

import { Camera } from 'lucide-react';
import { useState } from 'react';

import { QrScanner } from './qr-scanner';

interface Props {
  inputRef: React.RefObject<HTMLInputElement | null>;
  isLoading: boolean;
  onLookup: (code: string) => void;
}

export function LookupForm({ inputRef, isLoading, onLookup }: Props) {
  const [code, setCode] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);

  const submit = () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    onLookup(trimmed);
    setCode('');
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') submit();
  };

  const handleScan = (scannedCode: string) => {
    setScannerOpen(false);
    onLookup(scannedCode);
    setCode('');
  };

  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
        Escanea QR, mesa o código
      </label>
      <div className="flex gap-2.5">
        <input
          ref={inputRef}
          autoFocus
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={handleKey}
          placeholder="M07 o ABCD"
          maxLength={200}
          disabled={isLoading}
          className="h-14 flex-1 rounded-xl border border-neutral-200 bg-white px-5 font-mono text-3xl font-bold uppercase tracking-widest text-neutral-800 placeholder:text-neutral-300 placeholder:font-sans placeholder:text-lg placeholder:normal-case placeholder:tracking-normal focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => setScannerOpen(true)}
          disabled={isLoading}
          className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-50 active:bg-neutral-100 disabled:opacity-50"
        >
          <Camera className="h-4 w-4" />
          Escanear
        </button>
      </div>

      <QrScanner
        open={scannerOpen}
        onScan={handleScan}
        onClose={() => setScannerOpen(false)}
      />
    </div>
  );
}
