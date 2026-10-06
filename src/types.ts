export type Role = 'admin' | 'leader' | 'musician';
export interface Profile { id: string; name: string; role: Role; approved: boolean; personId?: string }
export interface Tag { id: string; name: string; color: string }
export interface Person { id: string; name: string; email: string; functions: string[] }
export interface Song {
  id: string; title: string; artist: string; originalKey: string; churchKey: string;
  content: string; youtubeUrl: string; notes: string; tagIds: string[];
}
export interface Assignment { id: string; personId: string; function: string }
export interface SetlistItem { id: string; songId: string; key: string; notes: string }
export interface Service {
  id: string; date: string; time: string; type: string; notes: string;
  assignments: Assignment[]; repertoire: SetlistItem[];
}
export interface MinistryData { songs: Song[]; tags: Tag[]; people: Person[]; services: Service[] }
export const ROLE_LABELS: Record<Role, string> = { admin: 'Administrador', leader: 'Líder', musician: 'Músico / vocalista' };
export const FUNCTIONS = ['Voz', 'Teclado', 'Violão', 'Guitarra', 'Baixo', 'Bateria', 'Percussão'];
export const SERVICE_TYPES = ['Culto de Domingo', 'Culto de Quinta', 'Culto de Oração', 'Ceia', 'Jovens', 'Irmãs', 'Varões', 'Especial'];
