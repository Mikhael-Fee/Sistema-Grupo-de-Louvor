import { lazy, Suspense, useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet, Route, Routes, Link, useNavigate } from 'react-router-dom';
import { CalendarDays, Guitar, House, LogOut, Menu, Music2, Settings2, Tags, Users, X, WifiOff, LoaderCircle } from 'lucide-react';
import { useMinistry } from './context/MinistryContext';
import { ROLE_LABELS } from './types';
import LoginPage from './pages/LoginPage';
import PasswordPage from './pages/PasswordPage';
import HomePage from './pages/HomePage';
import { FormError } from './components/ui';
import Brand from './components/Brand';

const SongsPage = lazy(() => import('./pages/SongsPage'));
const SongPage = lazy(() => import('./pages/SongPage'));
const ServicesPage = lazy(() => import('./pages/ServicesPage'));
const ServicePage = lazy(() => import('./pages/ServicePage'));
const PeoplePage = lazy(() => import('./pages/PeoplePage'));
const TagsPage = lazy(() => import('./pages/TagsPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));

const links = [{ path: '/', label: 'Início', icon: House }, { path: '/cultos', label: 'Cultos', icon: CalendarDays }, { path: '/musicas', label: 'Biblioteca', icon: Music2 }, { path: '/pessoas', label: 'Equipe', icon: Users }, { path: '/etiquetas', label: 'Etiquetas', icon: Tags }];
function Shell() {
  const { profile, mode, signOut, error } = useMinistry();
  const [menu, setMenu] = useState(false); const [actionError, setActionError] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  // Connectivity is advisory; shared data requires an online connection.
  useEffect(() => { const update = () => setOnline(navigator.onLine); window.addEventListener('online', update); window.addEventListener('offline', update); return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); }; }, []);
  async function logout() { try { await signOut(); } catch(e) { setActionError(e instanceof Error ? e.message : 'Não foi possível sair.'); } }
  return <div className="app-shell"><aside className={`sidebar ${menu ? 'sidebar-open' : ''}`}><Link to="/" className="brand" onClick={() => setMenu(false)}><Brand /></Link><p className="nav-caption">SEU MINISTÉRIO</p><nav aria-label="Navegação principal">{links.map(({path,label,icon:Icon}) => <NavLink key={path} to={path} end={path === '/'} onClick={() => setMenu(false)} className={({isActive}) => `nav-item ${isActive ? 'nav-active' : ''}`}><Icon size={20} /><span>{label}</span></NavLink>)}{profile?.role === 'admin' && <NavLink to="/administracao" onClick={() => setMenu(false)} className={({isActive}) => `nav-item ${isActive ? 'nav-active' : ''}`}><Settings2 size={20} /><span>Administração</span></NavLink>}</nav><div className="sidebar-bottom"><div className="ministry-card"><span className="ministry-icon"><Guitar size={23} /></span><strong>Um só propósito.</strong><p>Uma equipe. Muitas vozes.<br />Tudo para a glória de Deus.</p></div><button className="nav-item logout-button" onClick={() => void logout()}><LogOut size={19} /><span>{mode === 'public' ? 'Entrar para editar' : 'Sair'}</span></button><span className="version-label">CANDEIA · MINISTÉRIO DE LOUVOR</span></div></aside>{menu && <button className="sidebar-overlay" aria-label="Fechar menu" onClick={() => setMenu(false)} />}
  <div className="app-main"><header className="topbar"><button className="icon-button mobile-menu-button" aria-label={menu ? 'Fechar menu' : 'Abrir menu'} onClick={() => setMenu(!menu)}>{menu ? <X size={22} /> : <Menu size={22} />}</button><div className="topbar-context"><Brand compact /></div><div className="topbar-profile"><div className="profile-copy"><strong>{profile?.name}</strong><span>{profile ? ROLE_LABELS[profile.role] : ''}</span></div><span className="avatar avatar-green">{profile?.name.split(' ').map(n => n[0]).slice(0,2).join('')}</span></div></header>{mode === 'public' && <div className="public-banner"><span>Consulta sem cadastro · cultos, equipe e cifras. A troca de tom altera apenas sua visualização.</span></div>}{!online && <div className="offline-banner"><WifiOff size={16} />Sem conexão. Dados compartilhados não podem ser atualizados.</div>}<main className="content"><FormError error={actionError || error} /><Outlet /></main><footer className="app-footer">Feito para servir, juntos.<span>Candeia</span></footer></div><nav className="bottom-nav" aria-label="Navegação no celular">{links.slice(0,4).map(({path,label,icon:Icon}) => <NavLink key={path} to={path} end={path === '/'}><Icon size={21} /><span>{label === 'Biblioteca' ? 'Músicas' : label}</span></NavLink>)}<button onClick={() => setMenu(!menu)} aria-label="Mais opções"><Menu size={21} /><span>Mais</span></button></nav></div>;
}
function Access() {
  const { profile, loading, error, refresh, signOut } = useMinistry();
  if (loading) return <main className="loading-page"><LoaderCircle size={30} className="spin" /><p>Preparando seu ministério…</p></main>;
  if (!profile) return <LoginPage />;
  if (!profile.approved) return <main className="standalone-page"><section className="card"><span className="brand-icon"><Music2 size={24} /></span><h1>Seu cadastro está em análise</h1><p>Olá, {profile.name}. Um administrador precisa aprovar sua conta antes de liberar os dados do ministério.</p><FormError error={error} /><div className="form-actions"><button className="button button-primary" onClick={() => void refresh()}>Verificar aprovação</button><button className="button button-secondary" onClick={() => void signOut()}>Sair</button></div></section></main>;
  return <Shell />;
}
function AdminAccess() { const { profile } = useMinistry(); return profile?.role === 'admin' ? <AdminPage /> : <Navigate to="/" replace />; }
export default function App() {
  return <Suspense fallback={<main className="loading-page"><LoaderCircle size={26} className="spin" /><p>Carregando…</p></main>}><Routes><Route path="/consulta" element={<PublicEntry />} /><Route path="/redefinir-senha" element={<PasswordPage />} /><Route element={<Access />}><Route index element={<HomePage />} /><Route path="cultos" element={<ServicesPage />} /><Route path="cultos/:id" element={<ServicePage />} /><Route path="musicas" element={<SongsPage />} /><Route path="musicas/:id" element={<SongPage />} /><Route path="pessoas" element={<PeoplePage />} /><Route path="etiquetas" element={<TagsPage />} /><Route path="administracao" element={<AdminAccess />} /><Route path="*" element={<section className="card"><h1>Página não encontrada</h1><Link to="/" className="button button-primary">Voltar ao início</Link></section>} /></Route></Routes></Suspense>;
}

function PublicEntry() {
  const { enterPublic } = useMinistry();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void enterPublic().then(() => { if (active) navigate('/cultos', { replace: true }); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Não foi possível abrir a consulta.'); });
    return () => { active = false; };
  }, [enterPublic, navigate]);
  return error ? <main className="standalone-page"><section className="card"><Brand /><h1>Consulta do Candeia</h1><FormError error={error} /><Link className="button button-secondary" to="/">Voltar ao início</Link></section></main>
    : <main className="loading-page"><LoaderCircle size={26} className="spin" /><p>Abrindo a consulta do Candeia…</p></main>;
}
