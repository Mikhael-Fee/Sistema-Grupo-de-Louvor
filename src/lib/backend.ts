import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { MinistryData, Person, Profile, Service, Song, Tag } from '../types';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonymousKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

/** Only the public project URL and public anonymous key belong in the browser. */
export const supabase: SupabaseClient | null = url && anonymousKey
  ? createClient(url, anonymousKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

function client(): SupabaseClient {
  if (!supabase) throw new Error('Configure a URL e a chave pública do Supabase para usar os dados compartilhados.');
  return supabase;
}

function check(error: { message: string; code?: string } | null): void {
  if (!error) return;
  if (error.code === '23503') throw new Error('Este registro está vinculado a outros dados. Remova os vínculos antes de excluí-lo.');
  if (error.code === '23505') throw new Error('Já existe um registro com esses dados. Revise os nomes, funções e vínculos.');
  if (error.code === '42501') throw new Error('Seu perfil não tem permissão para esta operação ou ainda aguarda aprovação.');
  if (error.code === 'PGRST116') throw new Error('Registro não encontrado ou acesso não permitido.');
  throw new Error(error.message);
}

type ProfileRow = { id: string; name: string; role: Profile['role']; approved: boolean; person_id: string | null };
function profileFromRow(row: ProfileRow): Profile {
  return { id: row.id, name: row.name, role: row.role, approved: row.approved, personId: row.person_id ?? undefined };
}

export const repository = {
  async loadData(): Promise<MinistryData> {
    const db = client();
    // Unapproved users may read only their own profile. Do not turn RLS-filtered
    // empty rows into an apparently ready application with no ministry data.
    const { data: auth, error: authError } = await db.auth.getUser();
    check(authError);
    if (!auth.user) throw new Error('Entre na sua conta para consultar o ministério.');
    const profile = await repository.getProfile(auth.user.id);
    if (!profile.approved) throw new Error('Seu cadastro aguarda aprovação de um administrador.');

    const [songs, tags, people, services, songTags, assignments, repertoire] = await Promise.all([
      db.from('songs').select('*').order('title'),
      db.from('tags').select('*').order('name'),
      db.from('people').select('*').order('name'),
      db.from('services').select('*').order('date').order('time'),
      db.from('song_tags').select('song_id, tag_id'),
      db.from('assignments').select('*').order('position'),
      db.from('repertoire').select('*').order('position'),
    ]);
    for (const result of [songs, tags, people, services, songTags, assignments, repertoire]) check(result.error);
    return {
      tags: (tags.data ?? []).map(row => ({ id: row.id, name: row.name, color: row.color })),
      people: (people.data ?? []).map(row => ({ id: row.id, name: row.name, email: row.email, functions: row.functions })),
      songs: (songs.data ?? []).map(row => ({
        id: row.id, title: row.title, artist: row.artist, originalKey: row.original_key,
        churchKey: row.church_key, content: row.content, youtubeUrl: row.youtube_url, notes: row.notes,
        tagIds: (songTags.data ?? []).filter(link => link.song_id === row.id).map(link => link.tag_id),
      })),
      services: (services.data ?? []).map(row => ({
        id: row.id, date: row.date, time: row.time.slice(0, 5), type: row.type, notes: row.notes,
        assignments: (assignments.data ?? []).filter(link => link.service_id === row.id).map(link => ({
          id: link.id, personId: link.person_id, function: link.function,
        })),
        repertoire: (repertoire.data ?? []).filter(link => link.service_id === row.id).map(link => ({
          id: link.id, songId: link.song_id, key: link.key, notes: link.notes,
        })),
      })),
    };
  },

  async getProfile(userId: string): Promise<Profile> {
    const { data, error } = await client().from('profiles').select('id, name, role, approved, person_id').eq('id', userId).single();
    check(error);
    return profileFromRow(data as ProfileRow);
  },

  async saveSong(song: Song): Promise<void> {
    const { error } = await client().rpc('save_song', { p_song: song });
    check(error);
  },
  async deleteSong(id: string): Promise<void> {
    const { error } = await client().from('songs').delete().eq('id', id).select('id').single();
    check(error);
  },
  async savePerson(person: Person): Promise<void> {
    const { error } = await client().from('people').upsert({
      id: person.id, name: person.name.trim(), email: person.email.trim(), functions: person.functions,
    }).select('id').single();
    check(error);
  },
  async deletePerson(id: string): Promise<void> {
    const { error } = await client().from('people').delete().eq('id', id).select('id').single();
    check(error);
  },
  async saveTag(tag: Tag): Promise<void> {
    const { error } = await client().from('tags').upsert({ id: tag.id, name: tag.name.trim(), color: tag.color }).select('id').single();
    check(error);
  },
  async deleteTag(id: string): Promise<void> {
    const { error } = await client().from('tags').delete().eq('id', id).select('id').single();
    check(error);
  },
  async saveService(service: Service): Promise<void> {
    const { error } = await client().rpc('save_service', { p_service: service });
    check(error);
  },
  async deleteService(id: string): Promise<void> {
    const { error } = await client().from('services').delete().eq('id', id).select('id').single();
    check(error);
  },
  async listProfiles(): Promise<Profile[]> {
    const { data: auth, error: authError } = await client().auth.getUser();
    check(authError);
    if (!auth.user) throw new Error('Entre na sua conta para consultar os perfis.');
    const actor = await repository.getProfile(auth.user.id);
    if (!actor.approved || actor.role !== 'admin') throw new Error('Somente administradores aprovados podem consultar todos os perfis.');
    const { data, error } = await client().from('profiles').select('id, name, role, approved, person_id').order('name');
    check(error);
    return (data as ProfileRow[]).map(profileFromRow);
  },
  async updateProfile(profile: Profile): Promise<void> {
    const { error } = await client().rpc('update_profile', { p_profile: { ...profile, personId: profile.personId ?? null } });
    check(error);
  },
};
