import { Flame } from 'lucide-react';

export default function Brand({ compact = false }: { compact?: boolean }) {
  return <span className={`candeia-brand${compact ? ' candeia-brand--compact' : ''}`}>
    <span className="candeia-brand-mark"><Flame size={28} strokeWidth={1.8} aria-hidden="true" /></span>
    <span className="candeia-brand-copy">
      <span className="candeia-brand-name">Candeia</span>
      <span className="candeia-brand-caption">MINISTÉRIO DE LOUVOR</span>
    </span>
  </span>;
}
