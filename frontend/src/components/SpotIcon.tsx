export type SpotIconKind = 'reformer' | 'mat' | 'barre' | 'generic' | 'wunda';

interface SpotIconProps {
  kind: SpotIconKind;
  className?: string;
}

export function SpotIcon({ kind, className = '' }: SpotIconProps) {
  if (kind === 'reformer') {
    return (
      <svg viewBox="0 0 64 96" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        <rect x="8" y="10" width="48" height="76" rx="8" fill="currentColor" opacity="0.15" />
        <rect x="12" y="14" width="40" height="68" rx="6" stroke="currentColor" strokeWidth="2.5" />
        <rect x="18" y="22" width="28" height="52" rx="4" stroke="currentColor" strokeWidth="2" opacity="0.7" />
        <circle cx="20" cy="20" r="4" fill="currentColor" opacity="0.5" />
        <circle cx="44" cy="20" r="4" fill="currentColor" opacity="0.5" />
        <circle cx="20" cy="76" r="4" fill="currentColor" opacity="0.5" />
        <circle cx="44" cy="76" r="4" fill="currentColor" opacity="0.5" />
        <rect x="24" y="40" width="16" height="16" rx="3" fill="currentColor" opacity="0.4" />
      </svg>
    );
  }

  if (kind === 'mat') {
    return (
      <svg viewBox="0 0 80 56" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        <rect x="4" y="8" width="72" height="40" rx="6" stroke="currentColor" strokeWidth="2.5" />
        <rect x="8" y="12" width="64" height="32" rx="4" fill="currentColor" opacity="0.08" />
        <line x1="20" y1="12" x2="20" y2="44" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
        <line x1="36" y1="12" x2="36" y2="44" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
        <line x1="52" y1="12" x2="52" y2="44" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
        <line x1="4" y1="20" x2="76" y2="20" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
        <line x1="4" y1="36" x2="76" y2="36" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
      </svg>
    );
  }

  if (kind === 'barre') {
    return (
      <svg viewBox="0 0 80 56" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        <line x1="10" y1="28" x2="70" y2="28" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        <line x1="18" y1="10" x2="18" y2="46" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <line x1="62" y1="10" x2="62" y2="46" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <line x1="14" y1="46" x2="22" y2="46" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <line x1="58" y1="46" x2="66" y2="46" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }

  if (kind === 'wunda') {
    return (
      <svg viewBox="0 0 64 80" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        <rect x="10" y="12" width="44" height="56" rx="7" stroke="currentColor" strokeWidth="2.5" />
        <rect x="16" y="18" width="32" height="20" rx="4" stroke="currentColor" strokeWidth="2" opacity="0.7" />
        <line x1="16" y1="46" x2="48" y2="46" stroke="currentColor" strokeWidth="2" opacity="0.5" />
        <line x1="16" y1="52" x2="48" y2="52" stroke="currentColor" strokeWidth="1.5" opacity="0.35" strokeDasharray="4 4" />
        <circle cx="22" cy="62" r="4" stroke="currentColor" strokeWidth="2" opacity="0.55" />
        <circle cx="42" cy="62" r="4" stroke="currentColor" strokeWidth="2" opacity="0.55" />
      </svg>
    );
  }

  // generic
  return (
    <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="8" y="8" width="40" height="40" rx="8" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="28" cy="28" r="8" fill="currentColor" opacity="0.3" />
    </svg>
  );
}
