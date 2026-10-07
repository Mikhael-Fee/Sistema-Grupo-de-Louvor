import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, ExternalLink, Globe } from 'lucide-react';
import { repository } from '../lib/backend';
import { FormError } from './ui';

export default function PublicAccessSettings() {
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void repository.getPublicAccess().then(value => { if (active) { setEnabled(value); setReady(true); } })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Não foi possível consultar o acesso.'); });
    return () => { active = false; };
  }, []);
  async function save() {
    setSaving(true); setError(''); setMessage('');
    try { await repository.setPublicAccess(enabled); setMessage(enabled ? 'Consulta sem cadastro liberada.' : 'Consulta sem cadastro desativada.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar.'); }
    finally { setSaving(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(`${window.location.origin}/consulta`); setMessage('Link copiado. Compartilhe com a equipe.'); }
    catch { setError('Abra a consulta e copie o endereço do navegador.'); }
  }
  return <section className="card public-settings"><div className="card-heading"><div><p className="eyebrow">UM LINK PARA A EQUIPE</p><h2><Globe size={20} /> Consulta sem cadastro</h2></div></div>
    <p className="muted">Compartilhe cultos, repertórios, nomes, funções e cifras. Visitantes podem transpor a visualização; criação e edição continuam reservadas aos perfis autorizados. E-mails e contas não aparecem na consulta.</p>
    <label className="admin-approval"><input type="checkbox" checked={enabled} disabled={!ready || saving} onChange={event => { setEnabled(event.target.checked); setMessage(''); }} /><span><strong>Permitir consulta sem cadastro</strong><small className="muted">O endereço pode ser aberto por quem receber o link.</small></span></label>
    <FormError error={error} />{message && <p className="success-message" role="status"><Check size={15} /> {message}</p>}
    <div className="form-actions"><button type="button" className="button button-secondary" onClick={() => void copy()}><Copy size={15} /> Copiar link</button><Link className="button button-secondary" to="/consulta" target="_blank" rel="noopener noreferrer">Abrir consulta<ExternalLink size={15} /></Link><button className="button button-primary" disabled={!ready || saving} onClick={() => void save()}>{saving ? 'Salvando…' : 'Salvar acesso público'}</button></div>
  </section>;
}
