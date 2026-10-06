import { useEffect, useRef, type ReactNode } from 'react';
import { X, Music2 } from 'lucide-react';

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <header className="page-header"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{action}</header>;
}
export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="empty-state"><Music2 size={30} /><h3>{title}</h3><p>{description}</p>{action}</div>;
}
export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const el = ref.current; el?.showModal(); return () => el?.close(); }, []);
  return <dialog ref={ref} className={`modal ${wide ? 'modal-wide' : ''}`} onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}><div className="modal-heading"><h2>{title}</h2><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></div>{children}</dialog>;
}
export function FormError({ error }: { error?: string | null }) { return error ? <p className="form-error" role="alert">{error}</p> : null; }
