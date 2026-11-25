import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { repository, supabase } from '../lib/backend';
import { validatePerson, validateService, validateSong, validateTag } from '../lib/validation';
import { clearSnapshot, isConnectionFailure, readSnapshot, saveSnapshot } from '../lib/offline-snapshot';
import { ministryToday } from '../lib/service-calendar';
import type { AssignmentStatus, MinistryData, Person, Profile, Service, Song, Tag } from '../types';

const EMPTY: MinistryData = { songs: [], tags: [], people: [], services: [] };
interface MinistryContextValue {
  data: MinistryData; profile: Profile | null; mode: 'supabase' | 'public'; loading: boolean;
  busy: boolean; error: string | null; canEditLibrary: boolean; canPlan: boolean;
  /** When set, the app is showing the copy saved on this device at that time (no connection). */
  offlineSavedAt: string | null;
  signOut(): Promise<void>; refresh(): Promise<void>;
  saveSong(song: Song): Promise<void>; deleteSong(id: string): Promise<void>;
  savePerson(person: Person, photoChange?: Blob | null): Promise<void>; deletePerson(id: string): Promise<void>;
  archivePerson(id: string): Promise<void>; restorePerson(id: string): Promise<void>;
  saveTag(tag: Tag): Promise<void>; deleteTag(id: string): Promise<void>;
  saveService(service: Service): Promise<void>; deleteService(id: string): Promise<void>;
  listProfiles(): Promise<Profile[]>; updateProfile(profile: Profile): Promise<void>;
  updateProfilePhoto(photo: Blob | null): Promise<void>;
  /** True once the database has presence confirmation and unavailable dates (migration 008). */
  presenceEnabled: boolean;
  respondAssignment(assignmentId: string, status: AssignmentStatus, note?: string): Promise<void>;
  setUnavailability(personId: string, date: string, unavailable: boolean, note?: string): Promise<void>;
}
const Context = createContext<MinistryContextValue | null>(null);
const check = (message: string | null) => { if (message) throw new Error(message); };
const OFFLINE_EDIT = 'Sem conexão: você está vendo os dados salvos neste aparelho. Alterações ficam disponíveis quando a internet voltar.';
/** Refresh shared data when coming back to the app after this long, and every few minutes while open. */
const FOCUS_REFRESH_MS = 30_000;
const PERIODIC_REFRESH_MS = 5 * 60_000;

export function MinistryProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<MinistryData>(EMPTY);
  const [profile, setProfile] = useState<Profile | null>(null);
  // Keep the existing account draft namespace; access now always requires Auth.
  const mode = 'supabase';
  const sessionUser = useRef<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offlineSavedAt, setOfflineSavedAt] = useState<string | null>(null);
  const lastLoaded = useRef(0);
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
      if (seq === sequence.current) {
        setProfile(nextProfile); setData(nextData); setOfflineSavedAt(null); lastLoaded.current = Date.now();
        if (nextProfile.approved) saveSnapshot(nextProfile, nextData, ministryToday());
      }
    } catch (e) {
      if (seq !== sequence.current) return;
      if (isConnectionFailure(e)) {
        // Without signal, open the copy saved on this device instead of the login page.
        // A background refresh simply keeps what is already on screen.
        if (blocking) {
          const snapshot = readSnapshot(userId);
          if (snapshot) { setProfile(snapshot.profile); setData(snapshot.data); setOfflineSavedAt(snapshot.savedAt); }
          else { setProfile(null); setData(EMPTY); setError('Sem conexão. Abra o Candeia com internet uma vez para guardar os cultos e as cifras neste aparelho.'); }
        }
      } else { if (blocking) { setProfile(null); setData(EMPTY); } setError(e instanceof Error ? e.message : 'Não foi possível carregar o ministério.'); }
    }
    finally { if (seq === sequence.current) setLoading(false); }
  }, []);
  useEffect(() => {
    try {
      // Discard old guest sessions without touching authenticated sessions or drafts.
      sessionStorage.removeItem('candeia.public.session');
      sessionStorage.removeItem('louvor.demo.session');
      localStorage.removeItem('louvor.demo.v1');
    } catch { /* Browser storage may be disabled. */ }
    if (!supabase) { setLoading(false); return; }
    let active = true;
    // With the phone clearly offline, open the saved copy at once instead of waiting
    // for Supabase retries. The refresh below reloads everything when the signal returns.
    const offlineStart = !navigator.onLine ? readSnapshot() : null;
    if (offlineStart) {
      sessionUser.current = offlineStart.userId;
      setProfile(offlineStart.profile); setData(offlineStart.data); setOfflineSavedAt(offlineStart.savedAt); setLoading(false);
    }
    void supabase.auth.getSession().then(({ data: session, error: authError }) => {
      if (!active || offlineStart) return;
      if (authError) {
        const snapshot = isConnectionFailure(authError) ? readSnapshot() : null;
        if (snapshot) { sessionUser.current = snapshot.userId; setProfile(snapshot.profile); setData(snapshot.data); setOfflineSavedAt(snapshot.savedAt); }
        else setError(authError.message);
        setLoading(false);
      }
      else void loadUser(session.session?.user.id);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      const userId = session?.user.id;
      // Supabase repeats SIGNED_IN on tab focus and TOKEN_REFRESHED regularly.
      // Reloading with a blocking spinner would unmount every open editor.
      if (userId === sessionUser.current && ['SIGNED_IN', 'TOKEN_REFRESHED', 'INITIAL_SESSION'].includes(event)) return;
      if (event === 'SIGNED_OUT') {
        sequence.current++; sessionUser.current = undefined; setProfile(null); setData(EMPTY); setLoading(false); return;
      }
      setTimeout(() => {
        if (!active) return;
        if (userId === sessionUser.current && ['SIGNED_IN', 'TOKEN_REFRESHED', 'INITIAL_SESSION'].includes(event)) return;
        void loadUser(userId, userId !== sessionUser.current);
      }, 0);
    });
    return () => { active = false; listener.subscription.unsubscribe(); sequence.current++; };
  }, [loadUser]);
  // Keep shared data current: on returning to the app, when the connection comes back, and every few minutes.
  const approved = Boolean(profile?.approved);
  useEffect(() => {
    if (!approved) return;
    const refreshIfStale = (minimumAge: number) => {
      if (document.visibilityState !== 'visible' || !navigator.onLine || lock.current || !sessionUser.current) return;
      if (Date.now() - lastLoaded.current < minimumAge) return;
      lastLoaded.current = Date.now();
      void loadUser(sessionUser.current, false);
    };
    const onReturn = () => refreshIfStale(FOCUS_REFRESH_MS);
    const onOnline = () => refreshIfStale(0);
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn);
    window.addEventListener('online', onOnline);
    const timer = window.setInterval(() => refreshIfStale(PERIODIC_REFRESH_MS), 60_000);
    return () => {
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('focus', onReturn);
      window.removeEventListener('online', onOnline);
      window.clearInterval(timer);
    };
  }, [approved, loadUser]);
  const authorize = (kind: 'library' | 'plan' | 'admin' | 'member') => {
    if (offlineSavedAt) throw new Error(OFFLINE_EDIT);
    if (kind === 'member') { if (!profile?.approved) throw new Error('Seu perfil não tem permissão para esta ação.'); return; }
    if (!profile?.approved || (kind === 'plan' ? !['admin', 'leader'].includes(profile.role) : profile.role !== 'admin')) throw new Error('Seu perfil não tem permissão para esta ação.');
  };
  const mutate = async (kind: 'library' | 'plan' | 'admin' | 'member', remote: () => Promise<void>) => {
    authorize(kind);
    if (lock.current) throw new Error('Aguarde a alteração em andamento.');
    const actor = profile?.id;
    lock.current = true; setBusy(true); setError(null);
    try {
      await remote();
      const nextData = await repository.loadData();
      if (sessionUser.current === actor) {
        setData(nextData); lastLoaded.current = Date.now();
        if (profile) saveSnapshot(profile, nextData, ministryToday());
      }
    } catch (e) { throw e instanceof Error ? e : new Error('Não foi possível salvar.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const canPlanNow = () => Boolean(profile?.approved && ['admin', 'leader'].includes(profile.role));
  const listProfiles = useCallback(async () => {
    if (!profile?.approved || profile.role !== 'admin') throw new Error('Seu perfil não tem permissão para esta ação.');
    return repository.listProfiles();
  }, [profile?.approved, profile?.role]);
  const value: MinistryContextValue = {
    data, profile, mode, loading, busy, error, offlineSavedAt,
    canEditLibrary: Boolean(!offlineSavedAt && profile?.approved && profile.role === 'admin'),
    canPlan: Boolean(!offlineSavedAt && profile?.approved && ['admin', 'leader'].includes(profile.role)),
    async signOut() {
      // The device copy belongs to this account only.
      clearSnapshot(); setOfflineSavedAt(null);
      if (supabase) { const { error: e } = await supabase.auth.signOut(); if (e) throw e; }
      try {
        sessionStorage.removeItem('candeia.public.session');
        const prefix = `candeia.draft.v1:${mode}:${profile?.id || 'guest'}:`;
        for (const key of Object.keys(sessionStorage)) if (key.startsWith(prefix)) sessionStorage.removeItem(key);
      } catch { /* Logging out does not depend on browser storage. */ }
      sequence.current++; sessionUser.current = undefined;
      setProfile(null); setData(EMPTY); setError(null); setLoading(false);
    },
    async refresh() { await loadUser(profile?.id, false); },
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
    async archivePerson(id) {
      await mutate('library', () => repository.archivePerson(id));
    },
    async restorePerson(id) {
      await mutate('library', () => repository.restorePerson(id));
    },
    async saveTag(tag) {
      check(validateTag(tag));
      if (data.tags.some(t => t.id !== tag.id && t.name.trim().toLocaleLowerCase() === tag.name.trim().toLocaleLowerCase())) throw new Error('Já existe uma etiqueta com esse nome.');
      await mutate('library', () => repository.saveTag(tag));
    },
    async deleteTag(id) { await mutate('library', () => repository.deleteTag(id)); },
    async saveService(service) {
      check(validateService(service, data));
      const previous = data.services.find(item => item.id === service.id);
      for (const assignment of service.assignments) {
        if (data.people.find(person => person.id === assignment.personId)?.active === false
          && !previous?.assignments.some(item => item.id === assignment.id && item.personId === assignment.personId && item.function === assignment.function)) {
          throw new Error('Este integrante foi retirado da equipe ativa. Escolha uma pessoa ativa para novas escalas.');
        }
      }
      await mutate('plan', () => repository.saveService(service));
    },
    async deleteService(id) { await mutate('plan', () => repository.deleteService(id)); },
    listProfiles,
    presenceEnabled: Array.isArray(data.unavailability),
    async respondAssignment(assignmentId, status, note = '') {
      const assignment = data.services.flatMap(service => service.assignments).find(item => item.id === assignmentId);
      if (!assignment) throw new Error('Escala não encontrada.');
      if (!canPlanNow() && assignment.personId !== profile?.personId) throw new Error('Você só pode responder às suas próprias escalas.');
      await mutate('member', () => repository.respondAssignment(assignmentId, status, note.trim().slice(0, 300)));
    },
    async setUnavailability(personId, date, unavailable, note = '') {
      if (!canPlanNow() && personId !== profile?.personId) throw new Error('Você só pode marcar as suas próprias datas.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Escolha uma data.');
      await mutate('member', () => repository.setUnavailability(personId, date, unavailable, note.trim().slice(0, 200)));
    },
    async updateProfile(nextProfile) {
      authorize('admin');
      await repository.updateProfile(nextProfile); await loadUser(profile?.id, false);
    },
    async updateProfilePhoto(photo) {
      if (offlineSavedAt) throw new Error(OFFLINE_EDIT);
      if (!profile?.approved || !supabase) throw new Error('Entre na sua conta para alterar a foto.');
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
        if (sessionUser.current === actor) {
          setProfile(current => current?.id === actor ? { ...current, photoUrl: nextUrl || undefined } : current);
          if (profile.approved && profile.personId) {
            setData(current => ({ ...current, people: current.people.map(person => person.id === profile.personId
              ? { ...person, accountPhotoUrl: nextUrl || undefined } : person) }));
          }
        }
        if (previous && previous !== nextUrl) await repository.deleteAvatar(previous).catch(() => {});
      } finally { lock.current = false; setBusy(false); }
    },
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useMinistry() { const value = useContext(Context); if (!value) throw new Error('MinistryProvider ausente.'); return value; }
