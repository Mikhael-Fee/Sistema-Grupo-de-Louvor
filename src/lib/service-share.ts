import { FUNCTIONS, type MinistryData, type Service } from '../types';

function capitalize(text: string) {
  return text.charAt(0).toLocaleUpperCase('pt-BR') + text.slice(1);
}

const FUNCTION_EMOJI: Record<string, string> = {
  Voz: '🎤',
  Teclado: '🎹',
  Violão: '🎸',
  Guitarra: '🎸',
  Baixo: '🎸',
  Bateria: '🥁',
  Percussão: '🪘',
};
export function functionEmoji(role: string): string {
  return FUNCTION_EMOJI[role] || '🎵';
}

/** WhatsApp text: bold headings (*texto*), one item per line and an emoji for each function. */
export function buildServiceShareText(service: Service, data: Pick<MinistryData, 'songs' | 'people'>, link: string): string {
  const date = capitalize(
    new Date(`${service.date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }),
  );
  const lines = [`${service.isEvent ? '✨' : '⛪'} *${service.type}*`, `📅 ${date}`, `🕒 ${service.time}`];
  if (service.notes.trim())
    lines.push(
      '',
      `📝 ${service.notes
        .trim()
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .join('\n')}`,
    );
  lines.push('', '🎶 *Repertório*');
  if (service.repertoire.length) {
    service.repertoire.forEach((item, index) => {
      const song = data.songs.find(candidate => candidate.id === item.songId);
      lines.push(`${index + 1}. ${song?.title || 'Música indisponível'} · Tom *${item.key}*`);
      const note = item.notes
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .join(' ');
      if (note) lines.push(`      _${note}_`);
    });
  } else lines.push('Ainda não definido');
  lines.push('', '👥 *Equipe*');
  if (service.assignments.length) {
    const order = [...FUNCTIONS, ...service.assignments.map(item => item.function).filter(name => !FUNCTIONS.includes(name))];
    for (const role of [...new Set(order)]) {
      const names = service.assignments
        .filter(item => item.function === role)
        .map(item => data.people.find(person => person.id === item.personId)?.name || 'Pessoa indisponível');
      if (names.length) lines.push(`${functionEmoji(role)} *${role}:* ${names.join(', ')}`);
    }
  } else lines.push('Ainda não definida');
  lines.push('', '🔗 Ver no Candeia:', link);
  return lines.join('\n');
}

/** %0A line breaks (encodeURIComponent) survive wa.me on phones and on WhatsApp Web/Desktop. */
export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
