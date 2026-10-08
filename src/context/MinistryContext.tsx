import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { repository, supabase } from '../lib/backend';
import { validatePerson, validateService, validateSong, validateTag } from '../lib/validation';
import type { MinistryData, Person, Profile, Service, Song, Tag } from '../types';

const EMPTY: MinistryData = { songs: [], tags: [], people: [], services: [] };
const PUBLIC_SESSION = 'candeia.public.session';
const PUBLIC_PROFILE: Profile = { id: 'public-reader', name: 'Visitante', role: 'musician', approved: true };
interface MinistryContextValue {
  data: MinistryData; profile: Profile | null; mode: 'supabase' | 'public'; loading: boolean;
  busy: boolean; error: string | null; canEditLibrary: boolean; canPlan: boolean;
  enterPublic(): Promise<void>; signOut(): Promise<void>; refresh(): Promise<void>;
  saveSong(song: Song): Promise<void>; deleteSong(id: string): Promise<void>;
  savePerson(person: Person, photoChange?: Blob | null): Promise<void>; deletePerson(id: string): Promise<void>;
  saveTag(tag: Tag): Promise<void>; deleteTag(id: string): Promise<void>;
  saveService(service: Service): Promise<void>; deleteService(id: string): Promise<void>;
  listProfiles(): Promise<Profile[]>; updateProfile(profile: Profile): Promise<void>;
  updateProfilePhoto(photo: Blob | null): Promise<void>;
}
const Context = createContext<MinistryContextValue | null>(null);
const check = (message: string | null) => { if (message) throw new Error(message); };

export function MinistryProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<MinistryData>(EMPTY);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [mode, setMode] = useState<'supabase' | 'public'>('supabase');
  const modeRef = useRef<'supabase' | 'public'>('supabase');
  const sessionUser = useRef<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const sequence = useRef(0);
  const loadUser = useCallback(async (userId?: string, blocking = true) => {
    const seq = ++sequence.current;
    sessionUser.current = userId;
    if (blocking) setLoading(true);
    setError(null);
    try {
      if (!userId) { setProfile(null); setData(EMPTY); return; }
      const nextProfile = await repository.getProfile(userId);
      const nextData = nextProfile.approved ? await repository.loadData() : EMPTY;
      if (seq === sequence.current) { setProfile(nextProfile); setData(nextData); }
    } catch (e) { if (seq === sequence.current) { if (blocking) { setProfile(null); setData(EMPTY); } setError(e instanceof Error ? e.message : 'Não foi possível carregar o ministério.'); } }
    finally { if (seq === sequence.current) setLoading(false); }
  }, []);
  const enterPublic = useCallback(async () => {
    const seq = ++sequence.current;
    modeRef.current = 'public'; sessionUser.current = undefined;
    setLoading(true); setError(null);
    try {
      const nextData = await repository.loadPublicData();
      if (seq !== sequence.current) return;
      try { sessionStorage.setItem(PUBLIC_SESSION, '1'); } catch { /* In-memory view still works. */ }
      modeRef.current = 'public'; setMode('public'); setProfile(PUBLIC_PROFILE); setData(nextData);
    } catch (e) {
      if (seq === sequence.current) {
        try { sessionStorage.removeItem(PUBLIC_SESSION); } catch { /* Storage can be unavailable. */ }
        modeRef.current = 'supabase'; setMode('supabase'); setProfile(null); setData(EMPTY);
        setError(e instanceof Error ? e.message : 'A consulta pública não está disponível agora.');
      }
      throw e;
    } finally { if (seq === sequence.current) setLoading(false); }
  }, []);
  useEffect(() => {
    let publicSession = false;
    try {
      publicSession = sessionStorage.getItem(PUBLIC_SESSION) === '1';
      sessionStorage.removeItem('louvor.demo.session');
      localStorage.removeItem('louvor.demo.v1');
    } catch { /* Browser storage may be disabled. */ }
    if (publicSession) void enterPublic().catch(() => {});
    if (!supabase) { setLoading(false); return; }
    let active = true;
    void supabase.auth.getSession().then(({ data: session, error: authError }) => {
      if (!active) return;
      if (authError && modeRef.current === 'supabase') { setError(authError.message); setLoading(false); }
      else if (!publicSession && modeRef.current === 'supabase') void loadUser(session.session?.user.id);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active || modeRef.current !== 'supabase') return;
      const userId = session?.user.id;
      // Supabase repeats SIGNED_IN on tab focus and TOKEN_REFRESHED regularly.
      // Reloading with a blocking spinner would unmount every open editor.
      if (userId === sessionUser.current && ['SIGNED_IN', 'TOKEN_REFRESHED', 'INITIAL_SESSION'].includes(event)) return;
      if (event === 'SIGNED_OUT') {
        sequence.current++; sessionUser.current = undefined; setProfile(null); setData(EMPTY); setLoading(false); return;
      }
      setTimeout(() => {
        if (!active || modeRef.current !== 'supabase') return;
        if (userId === sessionUser.current && ['SIGNED_IN', 'TOKEN_REFRESHED', 'INITIAL_SESSION'].includes(event)) return;
        void loadUser(userId, userId !== sessionUser.current);
      }, 0);
    });
    return () => { active = false; listener.subscription.unsubscribe(); sequence.current++; };
  }, [loadUser, enterPublic]);
  const authorize = (kind: 'library' | 'plan' | 'admin') => {
    if (mode === 'public' || !profile?.approved || (kind === 'plan' ? !['admin', 'leader'].includes(profile.role) : profile.role !== 'admin')) throw new Error('Seu perfil não tem permissão para esta ação.');
  };
  const mutate = async (kind: 'library' | 'plan' | 'admin', remote: () => Promise<void>) => {
    authorize(kind);
    if (lock.current) throw new Error('Aguarde a alteração em andamento.');
    const actor = profile?.id;
    lock.current = true; setBusy(true); setError(null);
    try {
      await remote();
      const nextData = await repository.loadData();
      if (modeRef.current === 'supabase' && sessionUser.current === actor) setData(nextData);
    } catch (e) { throw e instanceof Error ? e : new Error('Não foi possível salvar.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const listProfiles = useCallback(async () => {
    if (!profile?.approved || profile.role !== 'admin') throw new Error('Seu perfil não tem permissão para esta ação.');
    return repository.listProfiles();
  }, [profile?.approved, profile?.role]);
  const value: MinistryContextValue = {
    data, profile, mode, loading, busy, error,
    canEditLibrary: Boolean(profile?.approved && profile.role === 'admin'),
    canPlan: Boolean(profile?.approved && ['admin', 'leader'].includes(profile.role)),
    enterPublic,
    async signOut() {
      if (mode === 'supabase' && supabase) { const { error: e } = await supabase.auth.signOut(); if (e) throw e; }
      try {
        sessionStorage.removeItem(PUBLIC_SESSION);
        const prefix = `candeia.draft.v1:${mode}:${profile?.id || 'guest'}:`;
        for (const key of Object.keys(sessionStorage)) if (key.startsWith(prefix)) sessionStorage.removeItem(key);
      } catch { /* Logging out does not depend on browser storage. */ }
      sequence.current++; sessionUser.current = undefined; modeRef.current = 'supabase';
      setProfile(null); setData(EMPTY); setMode('supabase'); setError(null); setLoading(false);
      if (mode === 'public' && supabase) {
        const { data: session } = await supabase.auth.getSession();
        if (session.session) await loadUser(session.session.user.id);
      }
    },
    async refresh() { if (mode === 'supabase') await loadUser(profile?.id, false); else if (mode === 'public') await enterPublic(); },
    async saveSong(song) {
      check(validateSong(song));
      if (song.tagIds.some(id => !data.tags.some(t => t.id === id))) throw new Error('Uma etiqueta selecionada não existe.');
      await mutate('library', () => repository.saveSong(song));
    },
    async deleteSong(id) {
      if (data.services.some(s => s.repertoire.some(i => i.songId === id))) throw new Error('Esta música está em um repertório. Remova-a do culto antes de excluir.');
      await mutate('library', () => repository.deleteSong(id));
    },
    async savePerson(person, photoChange) {
      check(validatePerson(person));
      if (data.services.some(s => s.assignments.some(a => a.personId === person.id && !person.functions.includes(a.function)))) throw new Error('Uma função removida está em uso numa escala. Ajuste a escala primeiro.');
      await mutate('library', async () => {
        const previous = data.people.find(p => p.id === person.id)?.photoUrl;
        const uploaded = photoChange instanceof Blob ? await repository.uploadAvatar(photoChange) : undefined;
        const photoUrl = photoChange === undefined ? person.photoUrl : uploaded ?? '';
        try {
          await repository.savePerson({ ...person, photoUrl });
        } catch (e) {
          if (uploaded) await repository.deleteAvatar(uploaded).catch(() => {});
          throw e;
        }
        // The write has committed. A later refresh error must not delete the
        // new photograph. Old objects are best-effort cleanup after commit.
        if (photoChange !== undefined && previous && previous !== photoUrl) {
          await repository.deleteAvatar(previous).catch(() => {});
        }
      });
    },
    async deletePerson(id) {
      if (data.services.some(s => s.assignments.some(a => a.personId === id))) throw new Error('Esta pessoa está em uma escala ou vinculada a um perfil. Remova os vínculos antes de excluir.');
      await mutate('library', async () => {
        const previous = data.people.find(p => p.id === id)?.photoUrl;
        await repository.deletePerson(id);
        if (previous) await repository.deleteAvatar(previous).catch(() => {});
      });
    },
    async saveTag(tag) {
      check(validateTag(tag));
      if (data.tags.some(t => t.id !== tag.id && t.name.trim().toLocaleLowerCase() === tag.name.trim().toLocaleLowerCase())) throw new Error('Já existe uma etiqueta com esse nome.');
      await mutate('library', () => repository.saveTag(tag));
    },
    async deleteTag(id) { await mutate('library', () => repository.deleteTag(id)); },
    async saveService(service) { check(validateService(service, data)); await mutate('plan', () => repository.saveService(service)); },
    async deleteService(id) { await mutate('plan', () => repository.deleteService(id)); },
    listProfiles,
    async updateProfile(nextProfile) {
      authorize('admin');
      await repository.updateProfile(nextProfile); await loadUser(profile?.id, false);
    },
    async updateProfilePhoto(photo) {
      if (mode !== 'supabase' || !profile || !supabase) throw new Error('Entre na sua conta para alterar a foto.');
      if (lock.current) throw new Error('Aguarde a alteração em andamento.');
      const actor = profile.id;
      const previous = profile.photoUrl;
      lock.current = true; setBusy(true); setError(null);
      try {
        const uploaded = photo ? await repository.uploadAvatar(photo) : undefined;
        const nextUrl = uploaded ?? '';
        try {
          await repository.updateMyProfilePhoto(nextUrl);
        } catch (e) {
          if (uploaded) await repository.deleteAvatar(uploaded).catch(() => {});
          throw e;
        }
        if (modeRef.current === 'supabase' && sessionUser.current === actor) {
          setProfile(current => current?.id === actor ? { ...current, photoUrl: nextUrl || undefined } : current);
        }
        if (previous && previous !== nextUrl) await repository.deleteAvatar(previous).catch(() => {});
      } finally { lock.current = false; setBusy(false); }
    },
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useMinistry() { const value = useContext(Context); if (!value) throw new Error('MinistryProvider ausente.'); return value; }
