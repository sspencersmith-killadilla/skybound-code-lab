export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-display text-xl font-bold text-foreground ${className}`}>
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
        <defs>
          <linearGradient id="tinker-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--primary)" />
            <stop offset="1" stopColor="var(--brand-green)" />
          </linearGradient>
        </defs>
        <path d="M5 9l7 7-7 7" fill="none" stroke="url(#tinker-g)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16 23h11" fill="none" stroke="url(#tinker-g)" strokeWidth="4" strokeLinecap="round" />
      </svg>
      Tinker
    </span>
  );
}
