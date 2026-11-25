import { useId, useState, type ReactNode } from 'react';
import { CircleHelp } from 'lucide-react';

/** Keeps explanations one tap away instead of always on screen. */
export default function HelpTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <span className="help-tip">
    <button type="button" className="help-tip-button" aria-expanded={open} aria-controls={id} aria-label={`Ajuda: ${label}`} title={`Ajuda: ${label}`} onClick={() => setOpen(value => !value)}><CircleHelp size={16} /></button>
    {open && <span id={id} className="help-tip-text" role="note">{children}</span>}
  </span>;
}
