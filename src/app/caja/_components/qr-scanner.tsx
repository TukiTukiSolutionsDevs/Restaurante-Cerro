'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  open: boolean;
  onScan: (code: string) => void;
  onClose: () => void;
}

const ELEMENT_ID = 'qr-scanner-viewport';

export function QrScanner({ open, onScan, onClose }: Props) {
  const [permissionDenied, setPermissionDenied] = useState(false);
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null);

  useEffect(() => {
    if (!open) return;

    let stopped = false;

    async function startScanner() {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        const scanner = new Html5Qrcode(ELEMENT_ID);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            if (!stopped) {
              stopped = true;
              scanner.stop().catch(() => undefined).finally(() => {
                scannerRef.current = null;
                onScan(decodedText);
              });
            }
          },
          () => undefined, // scan errors are normal (no QR in frame)
        );
      } catch (err) {
        const name = (err as { name?: string }).name;
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setPermissionDenied(true);
        }
      }
    }

    void startScanner();

    return () => {
      stopped = true;
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => undefined);
        scannerRef.current = null;
      }
    };
  }, [open, onScan]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Escanear QR</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-800"
          >
            Cerrar
          </button>
        </div>

        {permissionDenied ? (
          <p className="py-8 text-center text-sm text-amber-700">
            Cámara no disponible — ingresa el código manualmente
          </p>
        ) : (
          <div id={ELEMENT_ID} className="overflow-hidden rounded-lg" />
        )}
      </div>
    </div>
  );
}
