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

type ProfileRow = { id: string; name: string; role: Profile['role']; approved: boolean; person_id: string | null; photo_url?: string };
function profileFromRow(row: ProfileRow): Profile {
  return { id: row.id, name: row.name, role: row.role, approved: row.approved, personId: row.person_id ?? undefined, photoUrl: row.photo_url || undefined };
}

const AVATAR_LIMIT = 2 * 1024 * 1024;
const AVATAR_TYPES: Record<string, string> = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpeg' };
const AVATAR_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|png|jpeg)$/;

function avatarPath(photoUrl: string): string {
  if (!url) throw new Error('Configure o armazenamento do ministério.');
  const origin = new URL(url).origin;
  const parsed = new URL(photoUrl);
  const prefix = '/storage/v1/object/public/avatars/';
  const path = parsed.pathname.slice(prefix.length);
  if (parsed.origin !== origin || parsed.protocol !== 'https:' || !parsed.pathname.startsWith(prefix)
    || parsed.search || parsed.hash || !AVATAR_PATH.test(path)) {
    throw new Error('A foto precisa usar o armazenamento deste ministério.');
  }
  return path;
}

export const repository = {
  async getPublicAccess(): Promise<boolean> {
    const { data, error } = await client().rpc('get_public_access');
    check(error);
    if (typeof data !== 'boolean') throw new Error('Não foi possível consultar a configuração de acesso público.');
    return data;
  },

  async setPublicAccess(enabled: boolean): Promise<void> {
    const { error } = await client().rpc('save_public_access', { p_enabled: enabled });
    check(error);
  },

  async loadPublicData(): Promise<MinistryData> {
    const { data, error } = await client().rpc('read_public_ministry');
    if (error?.code === '42501') throw new Error('A consulta pública ainda não foi liberada pelo ministério.');
    check(error);
    if (!data || !['songs', 'tags', 'people', 'services'].every(key => Array.isArray(data[key]))) {
      throw new Error('Não foi possível carregar os dados de consulta pública.');
    }
    return data as MinistryData;
  },

  async loadData(): Promise<MinistryData> {
    const db = client();
    // Unapproved users may read only their own profile. Do not turn RLS-filtered
    // empty rows into an apparently ready application with no ministry data.
    const { data: auth, error: authError } = await db.auth.getUser();
    check(authError);
    if (!auth.user) throw new Error('Entre na sua conta para consultar o ministério.');
    const profile = await repository.getProfile(auth.user.id);
    if (!profile.approved) throw new Error('Seu cadastro aguarda aprovação de um administrador.');

    const [songs, tags, people, services, songTags, assignments, repertoire, teamPhotos] = await Promise.all([
      db.from('songs').select('*').order('title'),
      db.from('tags').select('*').order('name'),
      db.from('people').select('*').order('name'),
      db.from('services').select('*').order('date').order('time'),
      db.from('song_tags').select('song_id, tag_id'),
      db.from('assignments').select('*').order('position'),
      db.from('repertoire').select('*').order('position'),
      db.rpc('read_team_profile_photos', {}, { get: true }),
    ]);
    for (const result of [songs, tags, people, services, songTags, assignments, repertoire, teamPhotos]) check(result.error);
    if (!Array.isArray(teamPhotos.data)) throw new Error('Não foi possível consultar as fotos vinculadas à equipe.');
    const accountPhotos = new Map<string, string>(teamPhotos.data.map((row: { personId: string; photoUrl: string }) => [row.personId, row.photoUrl]));
    return {
      tags: (tags.data ?? []).map(row => ({ id: row.id, name: row.name, color: row.color })),
      people: (people.data ?? []).map(row => ({ id: row.id, name: row.name, email: row.email, functions: row.functions,
        photoUrl: row.photo_url || undefined, accountPhotoUrl: accountPhotos.get(row.id) || undefined })),
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
    const { data, error } = await client().from('profiles').select('id, name, role, approved, person_id, photo_url').eq('id', userId).single();
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
      ...(person.photoUrl === undefined ? {} : { photo_url: person.photoUrl }),
    }).select('id').single();
    check(error);
  },
  async uploadAvatar(photo: Blob): Promise<string> {
    const extension = AVATAR_TYPES[photo.type];
    if (!extension || photo.size === 0 || photo.size > AVATAR_LIMIT) {
      throw new Error('Escolha uma foto PNG, JPEG ou WebP com até 2 MB.');
    }
    const { data: auth, error: authError } = await client().auth.getUser();
    check(authError);
    if (!auth.user) throw new Error('Entre na sua conta para enviar uma foto.');
    const path = `${auth.user.id}/${crypto.randomUUID()}.${extension}`;
    const { error } = await client().storage.from('avatars').upload(path, photo, {
      upsert: false, contentType: photo.type, cacheControl: '31536000',
    });
    check(error);
    const publicUrl = client().storage.from('avatars').getPublicUrl(path).data.publicUrl;
    avatarPath(publicUrl);
    return publicUrl;
  },
  async deleteAvatar(photoUrl: string): Promise<void> {
    const path = avatarPath(photoUrl);
    const { error } = await client().storage.from('avatars').remove([path]);
    check(error);
  },
  async updateMyProfilePhoto(photoUrl: string): Promise<void> {
    if (photoUrl) avatarPath(photoUrl);
    const { error } = await client().rpc('update_my_profile_photo', { p_photo_url: photoUrl });
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
    const { data, error } = await client().from('profiles').select('id, name, role, approved, person_id, photo_url').order('name');
    check(error);
    return (data as ProfileRow[]).map(profileFromRow);
  },
  async updateProfile(profile: Profile): Promise<void> {
    const { error } = await client().rpc('update_profile', { p_profile: { ...profile, personId: profile.personId ?? null } });
    if (error?.code === '23505') throw new Error('Esta pessoa já está vinculada a outra conta. Desvincule a conta anterior ou escolha outra pessoa.');
    check(error);
  },
};
