import { useState, type FormEvent } from 'react';
import { Music2, ArrowRight, ShieldCheck, CalendarDays, Guitar, LoaderCircle } from 'lucide-react';
import { useMinistry } from '../context/MinistryContext';
import { supabase } from '../lib/backend';
import { FormError } from '../components/ui';

export default function LoginPage() {
  const { enterDemo, error: contextError } = useMinistry();
  const [tab, setTab] = useState<'login' | 'signup' | 'reset'>('login');
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault(); if (!supabase || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      if (tab === 'signup') {
        const { error: authError } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { name: name.trim() }, emailRedirectTo: window.location.origin } });
        if (authError) throw authError;
        setMessage('Cadastro enviado. Confirme seu e-mail e aguarde a aprovação de um administrador.');
      } else if (tab === 'reset') {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/redefinir-senha` });
        if (authError) throw authError;
        setMessage('Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.');
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password }); if (authError) throw authError;
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível entrar.'); }
    finally { setBusy(false); }
  }
  return <main className="login-page"><section className="login-story"><a href="/" className="brand"><span className="brand-icon"><Music2 size={25} /></span><span>louvor<span className="brand-caption">MINISTÉRIO EM HARMONIA</span></span></a><div className="login-story-main"><span className="label-pill">JUNTOS, EM UM SÓ PROPÓSITO</span><h1>Menos organização.<br />Mais adoração.</h1><p>Prepare o repertório, reúna a equipe e tenha tudo à mão para o próximo culto.</p><div className="login-features"><span><CalendarDays size={21} />Cultos e escalas</span><span><Guitar size={21} />Letras, cifras e tons</span><span><ShieldCheck size={21} />Acesso para sua equipe</span></div></div><p className="login-footer">Um lugar para preparar o que fazemos juntos.</p></section><section className="login-form-panel"><div className="login-form-inner"><span className="eyebrow">BEM-VINDO AO LOUVOR</span><h2>{tab === 'signup' ? 'Faça parte da equipe' : tab === 'reset' ? 'Recupere seu acesso' : 'Vamos preparar o próximo culto?'}</h2><p className="muted">{supabase ? 'Entre com sua conta para acessar o ministério.' : 'Conheça o sistema com uma demonstração interativa.'}</p>{supabase && <><div className="segmented"><button className={tab === 'login' ? 'active' : ''} onClick={() => { setTab('login'); setError(''); setMessage(''); }}>Entrar</button><button className={tab === 'signup' ? 'active' : ''} onClick={() => { setTab('signup'); setError(''); setMessage(''); }}>Criar conta</button></div><form onSubmit={submit} className="login-form">{tab === 'signup' && <label className="field">Seu nome<input required maxLength={100} value={name} onChange={e => setName(e.target.value)} autoComplete="name" /></label>}<label className="field">E-mail<input required type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></label>{tab !== 'reset' && <label className="field">Senha<input required type="password" minLength={8} value={password} onChange={e => setPassword(e.target.value)} autoComplete={tab === 'signup' ? 'new-password' : 'current-password'} /></label>}<FormError error={error || contextError} />{message && <p className="success-message" role="status">{message}</p>}<button disabled={busy} className="button button-primary" type="submit">{busy ? <LoaderCircle size={18} className="spin" /> : <ArrowRight size={18} />}{tab === 'signup' ? 'Criar minha conta' : tab === 'reset' ? 'Enviar link de recuperação' : 'Entrar no ministério'}</button>{tab === 'login' && <button type="button" className="text-button" onClick={() => setTab('reset')}>Esqueci minha senha</button>}</form><div className="divider"><span>ou explore primeiro</span></div></>}
    <button className={`button ${supabase ? 'button-secondary' : 'button-primary'} demo-entry`} onClick={enterDemo}>Entrar na demonstração<ArrowRight size={18} /></button><p className="demo-explanation">Dados de exemplo, salvos somente neste navegador. Nenhuma conta necessária.</p>{!supabase && <FormError error={contextError} />}<p className="login-fineprint">No uso compartilhado, novos membros precisam da aprovação do administrador.</p></div></section></main>;
}
