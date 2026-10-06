import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { repository, supabase } from '../lib/backend';
import { createDemoData, DEMO_PROFILE } from '../lib/seed';
import { validatePerson, validateService, validateSong, validateTag } from '../lib/validation';
import type { MinistryData, Person, Profile, Role, Service, Song, Tag } from '../types';

const EMPTY: MinistryData = { songs: [], tags: [], people: [], services: [] };
const STORAGE = 'louvor.demo.v1';
const SESSION = 'louvor.demo.session';
function defaultProfiles(): Profile[] {
  return [DEMO_PROFILE,
    { id: 'demo-leader', name: 'Ana · demonstração', role: 'leader', approved: true },
    { id: 'demo-musician', name: 'Lucas · demonstração', role: 'musician', approved: true }];
}
function readDemo(): { data: MinistryData; profiles: Profile[] } {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE) || 'null');
    if (stored && ['songs', 'tags', 'people', 'services'].every(k => Array.isArray(stored.data?.[k])) && Array.isArray(stored.profiles)) return stored;
  } catch { /* Invalid local demo state starts a fresh demonstration. */ }
  return { data: createDemoData(), profiles: defaultProfiles() };
}
interface MinistryContextValue {
  data: MinistryData; profile: Profile | null; mode: 'demo' | 'supabase'; loading: boolean;
  busy: boolean; error: string | null; canEditLibrary: boolean; canPlan: boolean;
  enterDemo(): void; switchDemoRole(role: Role): void; signOut(): Promise<void>; refresh(): Promise<void>;
  saveSong(song: Song): Promise<void>; deleteSong(id: string): Promise<void>;
  savePerson(person: Person): Promise<void>; deletePerson(id: string): Promise<void>;
  saveTag(tag: Tag): Promise<void>; deleteTag(id: string): Promise<void>;
  saveService(service: Service): Promise<void>; deleteService(id: string): Promise<void>;
  listProfiles(): Promise<Profile[]>; updateProfile(profile: Profile): Promise<void>;
}
const Context = createContext<MinistryContextValue | null>(null);
const put = <T extends { id: string }>(items: T[], item: T) => items.some(i => i.id === item.id) ? items.map(i => i.id === item.id ? item : i) : [...items, item];
const check = (message: string | null) => { if (message) throw new Error(message); };

export function MinistryProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<MinistryData>(EMPTY);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [mode, setMode] = useState<'demo' | 'supabase'>('supabase');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>(defaultProfiles);
  const lock = useRef(false);
  const sequence = useRef(0);
  const loadUser = useCallback(async (userId?: string) => {
    const seq = ++sequence.current;
    setLoading(true); setError(null);
    try {
      if (!userId) { setProfile(null); setData(EMPTY); return; }
      const nextProfile = await repository.getProfile(userId);
      const nextData = nextProfile.approved ? await repository.loadData() : EMPTY;
      if (seq === sequence.current) { setProfile(nextProfile); setData(nextData); }
    } catch (e) { if (seq === sequence.current) { setProfile(null); setData(EMPTY); setError(e instanceof Error ? e.message : 'Não foi possível carregar o ministério.'); } }
    finally { if (seq === sequence.current) setLoading(false); }
  }, []);
  const enterDemo = useCallback(() => {
    sequence.current++;
    const state = readDemo();
    const nextProfile = state.profiles.find(p => p.role === 'admin' && p.approved) || DEMO_PROFILE;
    try { sessionStorage.setItem(SESSION, nextProfile.id); localStorage.setItem(STORAGE, JSON.stringify(state)); }
    catch { setError('O navegador não permitiu salvar a demonstração. As alterações podem não persistir.'); }
    setMode('demo'); setData(state.data); setProfiles(state.profiles); setProfile(nextProfile); setLoading(false);
  }, []);
  useEffect(() => {
    let demoSession: string | null = null;
    try { demoSession = sessionStorage.getItem(SESSION); } catch { /* Browser storage may be disabled. */ }
    if (demoSession) {
      const state = readDemo();
      setMode('demo'); setData(state.data); setProfiles(state.profiles);
      setProfile(state.profiles.find(p => p.id === demoSession) || DEMO_PROFILE); setLoading(false);
      return;
    }
    if (!supabase) { setLoading(false); return; }
    let active = true;
    void supabase.auth.getSession().then(({ data: session, error: authError }) => {
      if (!active) return;
      if (authError) { setError(authError.message); setLoading(false); }
      else void loadUser(session.session?.user.id);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      let demo = false;
      try { demo = Boolean(sessionStorage.getItem(SESSION)); } catch { /* No storage. */ }
      if (active && !demo) setTimeout(() => { if (active) void loadUser(session?.user.id); }, 0);
    });
    return () => { active = false; listener.subscription.unsubscribe(); sequence.current++; };
  }, [loadUser]);
  const persistDemo = (nextData: MinistryData, nextProfiles = profiles) => {
    try { localStorage.setItem(STORAGE, JSON.stringify({ data: nextData, profiles: nextProfiles })); }
    catch { throw new Error('Não foi possível salvar no navegador. Libere armazenamento para esta página.'); }
    setData(nextData); setProfiles(nextProfiles);
  };
  const authorize = (kind: 'library' | 'plan' | 'admin') => {
    if (!profile?.approved || (kind === 'plan' ? !['admin', 'leader'].includes(profile.role) : profile.role !== 'admin')) throw new Error('Seu perfil não tem permissão para esta ação.');
  };
  const mutate = async (kind: 'library' | 'plan' | 'admin', next: () => MinistryData, remote: () => Promise<void>) => {
    authorize(kind);
    if (lock.current) throw new Error('Aguarde a alteração em andamento.');
    lock.current = true; setBusy(true); setError(null);
    try {
      if (mode === 'demo') persistDemo(next());
      else { await remote(); setData(await repository.loadData()); }
    } catch (e) { throw e instanceof Error ? e : new Error('Não foi possível salvar.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const listProfiles = useCallback(async () => {
    if (!profile?.approved || profile.role !== 'admin') throw new Error('Seu perfil não tem permissão para esta ação.');
    return mode === 'demo' ? profiles : repository.listProfiles();
  }, [mode, profile?.approved, profile?.role, profiles]);
  const value: MinistryContextValue = {
    data, profile, mode, loading, busy, error,
    canEditLibrary: Boolean(profile?.approved && profile.role === 'admin'),
    canPlan: Boolean(profile?.approved && ['admin', 'leader'].includes(profile.role)),
    enterDemo,
    switchDemoRole(role) {
      if (mode !== 'demo') return;
      const next = profiles.find(p => p.role === role && p.approved);
      if (!next) throw new Error('Não há perfil aprovado com esse papel na demonstração.');
      sessionStorage.setItem(SESSION, next.id); setProfile(next);
    },
    async signOut() {
      if (mode === 'supabase' && supabase) { const { error: e } = await supabase.auth.signOut(); if (e) throw e; }
      sessionStorage.removeItem(SESSION); sequence.current++; setProfile(null); setData(EMPTY); setMode('supabase'); setError(null);
    },
    async refresh() { if (mode === 'supabase') await loadUser(profile?.id); },
    async saveSong(song) {
      check(validateSong(song));
      if (song.tagIds.some(id => !data.tags.some(t => t.id === id))) throw new Error('Uma etiqueta selecionada não existe.');
      await mutate('library', () => ({ ...data, songs: put(data.songs, song) }), () => repository.saveSong(song));
    },
    async deleteSong(id) {
      if (data.services.some(s => s.repertoire.some(i => i.songId === id))) throw new Error('Esta música está em um repertório. Remova-a do culto antes de excluir.');
      await mutate('library', () => ({ ...data, songs: data.songs.filter(s => s.id !== id) }), () => repository.deleteSong(id));
    },
    async savePerson(person) {
      check(validatePerson(person));
      if (data.services.some(s => s.assignments.some(a => a.personId === person.id && !person.functions.includes(a.function)))) throw new Error('Uma função removida está em uso numa escala. Ajuste a escala primeiro.');
      await mutate('library', () => ({ ...data, people: put(data.people, person) }), () => repository.savePerson(person));
    },
    async deletePerson(id) {
      if (data.services.some(s => s.assignments.some(a => a.personId === id)) || profiles.some(p => p.personId === id)) throw new Error('Esta pessoa está em uma escala ou vinculada a um perfil. Remova os vínculos antes de excluir.');
      await mutate('library', () => ({ ...data, people: data.people.filter(p => p.id !== id) }), () => repository.deletePerson(id));
    },
    async saveTag(tag) {
      check(validateTag(tag));
      if (data.tags.some(t => t.id !== tag.id && t.name.trim().toLocaleLowerCase() === tag.name.trim().toLocaleLowerCase())) throw new Error('Já existe uma etiqueta com esse nome.');
      await mutate('library', () => ({ ...data, tags: put(data.tags, tag) }), () => repository.saveTag(tag));
    },
    async deleteTag(id) { await mutate('library', () => ({ ...data, tags: data.tags.filter(t => t.id !== id), songs: data.songs.map(s => ({ ...s, tagIds: s.tagIds.filter(t => t !== id) })) }), () => repository.deleteTag(id)); },
    async saveService(service) { check(validateService(service, data)); await mutate('plan', () => ({ ...data, services: put(data.services, service) }), () => repository.saveService(service)); },
    async deleteService(id) { await mutate('plan', () => ({ ...data, services: data.services.filter(s => s.id !== id) }), () => repository.deleteService(id)); },
    listProfiles,
    async updateProfile(nextProfile) {
      authorize('admin');
      if (mode === 'demo') {
        const admins = profiles.filter(p => p.role === 'admin' && p.approved);
        if (admins.length === 1 && admins[0].id === nextProfile.id && (nextProfile.role !== 'admin' || !nextProfile.approved)) throw new Error('Mantenha ao menos um administrador aprovado.');
        if (nextProfile.personId && !data.people.some(p => p.id === nextProfile.personId)) throw new Error('Pessoa vinculada inexistente.');
        persistDemo(data, put(profiles, nextProfile));
        if (profile?.id === nextProfile.id) setProfile(nextProfile);
      } else { await repository.updateProfile(nextProfile); await loadUser(profile?.id); }
    },
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useMinistry() { const value = useContext(Context); if (!value) throw new Error('MinistryProvider ausente.'); return value; }
