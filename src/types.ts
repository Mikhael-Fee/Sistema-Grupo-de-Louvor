export type Role = 'admin' | 'leader' | 'musician';
export interface Profile { id: string; name: string; role: Role; approved: boolean; personId?: string; photoUrl?: string }
export interface Tag { id: string; name: string; color: string }
export interface Person { id: string; name: string; email: string; functions: string[]; photoUrl?: string; accountPhotoUrl?: string; active?: boolean }
export interface Song {
  id: string; title: string; artist: string; originalKey: string; churchKey: string;
  content: string; youtubeUrl: string; notes: string; tagIds: string[];
}
export type AssignmentStatus = 'pending' | 'confirmed' | 'declined';
/** status is absent until the presence-confirmation database update is applied. */
export interface Assignment { id: string; personId: string; function: string; status?: AssignmentStatus; statusNote?: string }
export interface Unavailability { id: string; personId: string; date: string; note: string }
export interface SetlistItem { id: string; songId: string; key: string; notes: string; youtubeUrl?: string }
export interface Service {
  id: string; date: string; time: string; type: string; notes: string; isEvent?: boolean;
  assignments: Assignment[]; repertoire: SetlistItem[];
}
export interface MinistryData { songs: Song[]; tags: Tag[]; people: Person[]; services: Service[]; /** Absent until the database update is applied. */ unavailability?: Unavailability[] }
export const ROLE_LABELS: Record<Role, string> = { admin: 'Administrador', leader: 'Líder', musician: 'Músico / vocalista' };
export const FUNCTIONS = ['Voz', 'Teclado', 'Violão', 'Guitarra', 'Baixo', 'Bateria', 'Percussão'];
export const SERVICE_TYPES = ['Culto de Domingo', 'Culto de Quinta', 'Culto de Oração', 'Ceia', 'Jovens', 'Irmãs', 'Varões', 'Especial'];
