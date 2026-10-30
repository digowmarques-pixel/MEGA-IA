/** Marca MEGA HUB AI — "MEG" + o "A" com as três faixas da identidade. */
export function MegaA({ className = "h-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 58 36" className={className} aria-hidden>
      <path d="M0 36 L15 0 H23 L38 36 H29.5 L26.6 29 H11.4 L8.5 36 Z M14 22.5 H24 L19 10.5 Z" fill="currentColor" />
      <path d="M23 0 H29.5 L44.5 36 H38 Z" fill="#F7981D" />
      <path d="M29.5 0 H36 L51 36 H44.5 Z" fill="#FDC010" />
      <path d="M36 0 H42.5 L57.5 36 H51 Z" fill="#FFDF15" />
    </svg>
  );
}

export function Logo({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  if (compact) return <MegaA className={`h-6 text-white ${className}`} />;
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex items-end text-white">
        <span className="font-display text-[22px] font-black leading-none tracking-tight">MEG</span>
        <MegaA className="ml-[1px] h-[16.5px]" />
      </div>
      <span className="rounded bg-raised px-1.5 py-0.5 text-[10px] font-bold tracking-[0.18em] text-mega-yellow">HUB AI</span>
    </div>
  );
}
