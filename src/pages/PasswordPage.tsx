import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/backend';
import { FormError } from '../components/ui';

export default function PasswordPage() {
  const [password, setPassword] = useState(''); const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState(''); const [done, setDone] = useState(false); const [busy, setBusy] = useState(false);
  const [valid, setValid] = useState(false);
  useEffect(() => { if (!supabase) return; void supabase.auth.getSession().then(({ data }) => setValid(Boolean(data.session))); const { data } = supabase.auth.onAuthStateChange((_, session) => setValid(Boolean(session))); return () => data.subscription.unsubscribe(); }, []);
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(''); if (!supabase) return;
    if (password !== confirmation) { setError('As senhas precisam ser iguais.'); return; }
    setBusy(true);
    const { error: authError } = await supabase.auth.updateUser({ password });
    setBusy(false); if (authError) setError(authError.message); else setDone(true);
  }
  return <main className="standalone-page"><section className="card"><h1>Redefinir senha</h1>{done ? <><p className="success-message">Sua senha foi atualizada.</p><Link to="/" className="button button-primary">Voltar ao início</Link></> : !valid ? <><p>Abra o link de recuperação enviado para seu e-mail.</p><Link to="/">Voltar ao login</Link></> : <form onSubmit={submit}><label className="field">Nova senha<input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></label><label className="field">Confirmar senha<input type="password" required minLength={8} autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label><FormError error={error} /><button className="button button-primary" disabled={busy}>Salvar senha</button></form>}</section></main>;
}
