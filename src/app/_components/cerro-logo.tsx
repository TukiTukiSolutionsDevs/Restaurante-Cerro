interface CerroLogoProps {
  size?: number;
  color?: string;
}

export function CerroLogo({ size = 16, color = 'var(--brand-700)' }: CerroLogoProps) {
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
      aria-label="Restaurante Cerro"
    >
      <svg
        width={Math.round(size * 1.6)}
        height={Math.round(size * 1.3)}
        viewBox="0 0 32 26"
        fill="none"
        aria-hidden="true"
      >
        <path d="M19 22 L25 11 L31 22Z" fill={color} opacity="0.4" />
        <path d="M1 26 L16 2 L31 26Z" fill={color} />
      </svg>
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          fontSize: size,
          color,
          letterSpacing: '-0.03em',
          lineHeight: 1,
        }}
      >
        Cerro
      </span>
    </div>
  );
}
