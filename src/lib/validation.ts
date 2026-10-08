import { FUNCTIONS } from '../types';
import type { MinistryData, Person, Service, Song, Tag } from '../types';
import { KEYS } from './music';

/** Accept actual YouTube video addresses, never lookalike domains or embedded credentials. */
export function isSafeYoutubeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    const videoId = '[A-Za-z0-9_-]{11}';
    if (url.hostname === 'youtu.be' || url.hostname === 'www.youtu.be') {
      return new RegExp(`^/${videoId}/?$`).test(url.pathname);
    }
    if (!['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) return false;
    if (url.pathname === '/watch') return new RegExp(`^${videoId}$`).test(url.searchParams.get('v') ?? '');
    return new RegExp(`^/(?:embed|shorts|live)/${videoId}/?$`).test(url.pathname);
  } catch {
    return false;
  }
}

export function validateSong(song: Song): string | null {
  if (!song.title.trim()) return 'Informe o título da música.';
  if (!song.artist.trim()) return 'Informe o artista ou compositor.';
  if (!KEYS.includes(song.originalKey) || !KEYS.includes(song.churchKey)) return 'Selecione tons válidos para a música.';
  if (!song.content.trim()) return 'Informe a letra ou cifra da música.';
  if (song.youtubeUrl.trim() && !isSafeYoutubeUrl(song.youtubeUrl.trim())) return 'Informe uma URL HTTPS de vídeo do YouTube ou deixe o campo vazio.';
  if (new Set(song.tagIds).size !== song.tagIds.length) return 'Uma etiqueta não pode aparecer duas vezes na música.';
  return null;
}

export function validatePerson(person: Person): string | null {
  if (!person.name.trim()) return 'Informe o nome da pessoa.';
  if (person.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email.trim())) return 'Informe um e-mail válido ou deixe o campo vazio.';
  if (!person.functions.length || person.functions.some((item) => !FUNCTIONS.includes(item))) return 'Selecione pelo menos uma função válida.';
  if (new Set(person.functions).size !== person.functions.length) return 'Selecione cada função apenas uma vez.';
  return null;
}

export function validateTag(tag: Tag): string | null {
  if (!tag.name.trim()) return 'Informe o nome da etiqueta.';
  if (!/^#[a-f\d]{6}$/i.test(tag.color)) return 'Escolha uma cor válida para a etiqueta.';
  return null;
}

function isRealDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export function validateService(service: Service, data: MinistryData): string | null {
  if (!isRealDate(service.date)) return 'Informe uma data válida para o culto.';
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(service.time)) return 'Informe um horário válido no formato HH:MM.';
  if (!service.type.trim()) return 'Informe o tipo de culto.';
  if ([...service.type.trim()].length > 100) return 'O tipo de culto deve ter no máximo 100 caracteres.';
  const assignments = new Set<string>();
  for (const assignment of service.assignments) {
    const person = data.people.find((item) => item.id === assignment.personId);
    if (!person) return 'Uma pessoa da escala não foi encontrada. Atualize a equipe.';
    if (!FUNCTIONS.includes(assignment.function) || !person.functions.includes(assignment.function)) return `A função escolhida não está cadastrada para ${person.name}.`;
    const signature = `${assignment.personId}:${assignment.function}`;
    if (assignments.has(signature)) return 'A mesma pessoa e função não podem aparecer duas vezes na escala.';
    assignments.add(signature);
  }
  const songs = new Set<string>();
  for (const item of service.repertoire) {
    if (!data.songs.some((song) => song.id === item.songId)) return 'Uma música do repertório não foi encontrada. Atualize a biblioteca.';
    if (!KEYS.includes(item.key)) return 'Selecione um tom válido para cada música do repertório.';
    if (songs.has(item.songId)) return 'Uma música não pode aparecer duas vezes no mesmo repertório.';
    songs.add(item.songId);
  }
  return null;
}
