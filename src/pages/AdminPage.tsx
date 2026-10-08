import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Check, Clock3, Pencil, RefreshCw, Search, ShieldCheck, UserCheck, Users } from 'lucide-react';
import { useMinistry } from '../context/MinistryContext';
import { EmptyState, FormError, Modal, PageHeader } from '../components/ui';
import { ROLE_LABELS, type Profile, type Role } from '../types';
import { normalizeSearch } from '../lib/music';
import { getProfilePhoto } from '../lib/avatars';
import ProfileAvatar from '../components/ProfileAvatar';
import './people.css';
import PublicAccessSettings from '../components/PublicAccessSettings';

const readableError = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível concluir a operação. Tente novamente.';

export default function AdminPage() {
  const { data, profile, listProfiles, updateProfile } = useMinistry();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editing, setEditing] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const isAdmin = profile?.role === 'admin' && profile.approved;

  const loadProfiles = useCallback(async () => {
    if (!isAdmin) { setLoading(false); return; }
    setLoading(true); setError(null);
    try { setProfiles(await listProfiles()); }
    catch (err) { setError(readableError(err)); }
    finally { setLoading(false); }
  }, [isAdmin, listProfiles]);

  useEffect(() => { void loadProfiles(); }, [loadProfiles]);

  const visibleProfiles = useMemo(() => profiles.filter(user => normalizeSearch(user.name).includes(normalizeSearch(query.trim())) && (!statusFilter || (statusFilter === 'pending' ? !user.approved : user.approved))), [profiles, query, statusFilter]);
  const approvedAdmins = profiles.filter(user => user.role === 'admin' && user.approved);
  const pendingCount = profiles.filter(user => !user.approved).length;
  const persistedEditing = editing ? profiles.find(user => user.id === editing.id) : undefined;
  const isLastAdmin = !!persistedEditing && persistedEditing.role === 'admin' && persistedEditing.approved && approvedAdmins.length <= 1;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || !isAdmin || loading || saveLock.current) return;
    if (!editing.name.trim()) { setFormError('Informe o nome do usuário.'); return; }
    if (isLastAdmin && (editing.role !== 'admin' || !editing.approved)) { setFormError('Mantenha pelo menos um administrador aprovado.'); return; }
    if (editing.personId && profiles.some(user => user.id !== editing.id && user.personId === editing.personId)) { setFormError('Esta pessoa já está vinculada a outra conta.'); return; }
    const savedProfile = { ...editing, name: editing.name.trim() };
    saveLock.current = true; setSaving(true); setFormError(null);
    try {
      await updateProfile(savedProfile);
      setProfiles(current => current.map(user => user.id === savedProfile.id ? savedProfile : user));
      setEditing(null);
      setError(null);
      if (savedProfile.id !== profile?.id || (savedProfile.role === 'admin' && savedProfile.approved)) {
        setLoading(true);
        try { setProfiles(await listProfiles()); }
        catch (err) { setError(`Acesso salvo. Não foi possível atualizar a lista: ${readableError(err)}`); }
        finally { setLoading(false); }
      }
    } catch (err) { setFormError(readableError(err)); }
    finally { saveLock.current = false; setSaving(false); }
  }

  if (!isAdmin) return <><PageHeader eyebrow="Acesso ao ministério" title="Administração" /><EmptyState title="Área administrativa" description="A gestão de acessos está disponível para administradores aprovados." /></>;

  return <>
    <PageHeader eyebrow="Cuidado com o ministério" title="Administração" description="Gerencie quem pode acessar e organizar as informações." action={<button className="button button-secondary" disabled={loading || saving} onClick={() => void loadProfiles()}><RefreshCw size={17} /> Atualizar</button>} />

    <PublicAccessSettings />
    <div className="admin-stats"><div className="card admin-stat"><Users size={21} /><div><strong>{profiles.length}</strong><span>Usuários</span></div></div><div className="card admin-stat"><UserCheck size={21} /><div><strong>{profiles.filter(user => user.approved).length}</strong><span>Aprovados</span></div></div><div className="card admin-stat"><Clock3 size={21} /><div><strong>{pendingCount}</strong><span>Aguardando aprovação</span></div></div></div>
    <div className="toolbar people-toolbar"><label className="people-search"><Search size={18} aria-hidden="true" /><span className="people-sr-only">Buscar usuários</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar usuário…" /></label><label className="people-function-filter"><span className="people-sr-only">Filtrar usuários por aprovação</span><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="">Todos os usuários</option><option value="pending">Aguardando aprovação</option><option value="approved">Aprovados</option></select></label></div>
    <FormError error={error} />
    {loading ? <div className="admin-loading card" role="status">Carregando usuários…</div> : visibleProfiles.length ? <div className="admin-users card"><div className="admin-table-heading"><span>Usuário</span><span>Permissão</span><span>Acesso</span><span>Pessoa vinculada</span><span /></div>{visibleProfiles.map(user => <article className="admin-user-row" key={user.id}><div className="admin-user-name"><ProfileAvatar name={user.name} photoUrl={getProfilePhoto(user, data)} size={37} className="admin-user-avatar" decorative /><div><strong>{user.name}</strong>{user.id === profile.id && <small className="muted">Você</small>}</div></div><span className={`badge admin-role admin-role-${user.role}`}>{ROLE_LABELS[user.role]}</span><span className={`admin-status ${user.approved ? 'admin-status-approved' : 'admin-status-pending'}`}>{user.approved ? <Check size={14} /> : <Clock3 size={14} />}{user.approved ? 'Aprovado' : 'Pendente'}</span><span className="admin-person muted">{data.people.find(person => person.id === user.personId)?.name || 'Sem vínculo'}</span><button className="icon-button" disabled={saving} aria-label={`Editar acesso de ${user.name}`} onClick={() => { setFormError(null); setEditing({ ...user }); }}><Pencil size={17} /></button></article>)}</div> : <EmptyState title="Nenhum usuário encontrado" description={profiles.length ? 'Experimente outro nome ou filtro.' : 'Os usuários cadastrados aparecerão aqui para aprovação.'} />}
    <section className="admin-permissions"><h2>O que cada pessoa pode fazer</h2><div className="admin-permission-grid"><article><ShieldCheck size={20} /><h3>Administrador</h3><p>Gerencia acessos, biblioteca, pessoas, etiquetas e planejamento dos cultos.</p></article><article><UserCheck size={20} /><h3>Líder</h3><p>Organiza cultos, escolhe músicas, define tons e monta a escala da equipe.</p></article><article><Users size={20} /><h3>Músico / vocalista</h3><p>Consulta cultos, escalas e repertórios, acompanha letras e transpõe cifras.</p></article></div></section>
    {editing && <Modal title="Editar acesso" onClose={() => { if (!saving) setEditing(null); }}><form className="form-grid" onSubmit={submit}>
      <label className="field">Nome<input autoFocus required disabled={saving} maxLength={120} value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })} /></label>
      <label className="field">Permissão<select disabled={isLastAdmin || saving} value={editing.role} onChange={event => setEditing({ ...editing, role: event.target.value as Role })}>{(Object.entries(ROLE_LABELS) as [Role, string][]).map(([role, label]) => <option key={role} value={role}>{label}</option>)}</select></label>
      <label className="field">Pessoa vinculada<select disabled={saving} value={editing.personId || ''} onChange={event => setEditing({ ...editing, personId: event.target.value || undefined })}><option value="">Sem vínculo</option>{data.people.map(person => {
        const linkedAccount = profiles.find(user => user.id !== editing.id && user.personId === person.id);
        return <option key={person.id} value={person.id} disabled={!!linkedAccount}>{person.name}{linkedAccount ? ` — vinculada a ${linkedAccount.name}` : ''}</option>;
      })}</select><small className="muted">O vínculo identifica a escala pessoal e mostra a foto da pessoa automaticamente quando a conta não tem foto própria.</small></label>
      <label className="admin-approval"><input type="checkbox" checked={editing.approved} disabled={isLastAdmin || saving} onChange={event => setEditing({ ...editing, approved: event.target.checked })} /><span><strong>Acesso aprovado</strong><small className="muted">Permite consultar as informações do ministério.</small></span></label>
      {isLastAdmin && <p className="admin-last-admin">Este é o único administrador aprovado. Aprove outro administrador antes de alterar sua permissão ou suspender seu acesso.</p>}
      <FormError error={formError} /><div className="form-actions"><button type="button" className="button button-secondary" disabled={saving} onClick={() => setEditing(null)}>Cancelar</button><button className="button button-primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar acesso'}</button></div>
    </form></Modal>}
  </>;
}
