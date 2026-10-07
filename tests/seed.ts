import type { MinistryData, Profile } from '../src/types';

const id = (group: number, item: number) => `10000000-0000-4000-8000-${String(group * 100 + item).padStart(12, '0')}`;

export const DEMO_PROFILE: Profile = {
  id: id(0, 1), name: 'Mikhael', role: 'admin', approved: true, personId: id(1, 1),
};

/** Return a fresh, entirely local demonstration with original placeholder compositions. */
export function createDemoData(): MinistryData {
  const tags = [
    { id: id(2, 1), name: 'Celebração', color: '#ca8047' },
    { id: id(2, 2), name: 'Adoração', color: '#6e7eaf' },
    { id: id(2, 3), name: 'Gratidão', color: '#558b6e' },
    { id: id(2, 4), name: 'Comunhão', color: '#af7394' },
    { id: id(2, 5), name: 'Esperança', color: '#b99843' },
  ];
  const people = [
    { id: id(1, 1), name: 'Mikhael', email: '', functions: ['Voz', 'Violão'] },
    { id: id(1, 2), name: 'Ana Clara', email: '', functions: ['Voz', 'Teclado'] },
    { id: id(1, 3), name: 'Gabriel', email: '', functions: ['Guitarra', 'Violão'] },
    { id: id(1, 4), name: 'Lucas', email: '', functions: ['Baixo'] },
    { id: id(1, 5), name: 'Helena', email: '', functions: ['Voz'] },
    { id: id(1, 6), name: 'Davi', email: '', functions: ['Bateria', 'Percussão'] },
  ];
  const songs = [
    {
      id: id(3, 1), title: 'Casa de paz', artist: 'Composição de demonstração', originalKey: 'G', churchKey: 'G',
      content: 'Verso\n[G]Nesta casa há [D/F#]lugar\n[Em7]Para a vida re[Cadd9]começar\n\nRefrão\n[G]Tua paz nos [D]reúne aqui\n[C]Nossa voz se [D]volta a [G]Ti',
      youtubeUrl: '', notes: 'Composição original de exemplo. Começar com violão e voz.', tagIds: [id(2, 2), id(2, 4)],
    },
    {
      id: id(3, 2), title: 'Teu amor nos guia', artist: 'Composição de demonstração', originalKey: 'D', churchKey: 'C',
      content: 'Verso\n[D]Cada passo, cada [A]dia\n[Bm7]Teu amor nos [G]guia\n\nRefrão\n[D]Seguiremos com [A]alegria\n[G]Tua luz em nossa [D]vida',
      youtubeUrl: '', notes: 'Composição original de exemplo. Refrão com toda a equipe.', tagIds: [id(2, 1), id(2, 5)],
    },
    {
      id: id(3, 3), title: 'Um só coração', artist: 'Composição de demonstração', originalKey: 'C', churchKey: 'D',
      content: 'Verso\n[C]Muitas vozes, uma [G/B]canção\n[Am7]Tua graça em cada [F]irmão\n\nRefrão\n[C]Nos reúne em a[G]mor\n[F]Um só coração, Se[C]nhor',
      youtubeUrl: '', notes: 'Composição original de exemplo. Entrar suavemente após a oração.', tagIds: [id(2, 4), id(2, 3)],
    },
    {
      id: id(3, 4), title: 'Manhã de esperança', artist: 'Composição de demonstração', originalKey: 'A', churchKey: 'G',
      content: 'Verso\n[A]Quando a noite se [E/G#]vai\n[F#m7]Tua bondade perma[D]nece\n\nRefrão\n[A]Nova manhã, nova espe[E]rança\n[D]Nosso caminho em Ti des[A]cansa',
      youtubeUrl: '', notes: 'Composição original de exemplo. Crescer na segunda passagem do refrão.', tagIds: [id(2, 5), id(2, 1)],
    },
    {
      id: id(3, 5), title: 'Mesa da graça', artist: 'Composição de demonstração', originalKey: 'F', churchKey: 'F',
      content: 'Verso\n[F]Partilhamos o [C/E]pão\n[Dm7]Com amor e grati[Bb]dão\n\nRefrão\n[F]Tua mesa nos [C]acolhe\n[Bb]Tua graça nos trans[F]forma',
      youtubeUrl: '', notes: 'Composição original de exemplo. Arranjo tranquilo para a Ceia.', tagIds: [id(2, 2), id(2, 4)],
    },
    {
      id: id(3, 6), title: 'Nossa canção', artist: 'Composição de demonstração', originalKey: 'E', churchKey: 'D',
      content: 'Verso\n[E]Há um canto em nossa [B/D#]voz\n[C#m7]Pelo bem que nasce em [A]nós\n\nRefrão\n[E]Te agradecemos, Se[B]nhor\n[A]Nossa canção é de a[E]mor',
      youtubeUrl: '', notes: 'Composição original de exemplo. Finalizar repetindo o refrão.', tagIds: [id(2, 3), id(2, 1)],
    },
  ];
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((value) => value.type === type)!.value;
  const localDay = new Date(`${part('year')}-${part('month')}-${part('day')}T12:00:00Z`);
  const nextSunday = (7 - localDay.getUTCDay()) % 7 || 7;
  const services = [0, 1, 2].map((index) => {
    const date = new Date(localDay);
    date.setUTCDate(date.getUTCDate() + nextSunday + index * 7);
    const selected = index === 0 ? [0, 1, 4] : index === 1 ? [3, 2, 5] : [1, 0, 5];
    return {
      id: id(4, index + 1), date: date.toISOString().slice(0, 10), time: '18:00',
      type: index === 0 ? 'Ceia' : 'Culto de Domingo',
      notes: index === 0 ? 'Ensaio às 16h30. Momento de comunhão antes da última música.' : 'Ensaio às 16h30. Revisar os tons e as transições do repertório.',
      assignments: [
        { id: id(5 + index, 1), personId: people[0].id, function: 'Violão' },
        { id: id(5 + index, 2), personId: people[1].id, function: 'Teclado' },
        { id: id(5 + index, 3), personId: people[2].id, function: 'Guitarra' },
        { id: id(5 + index, 4), personId: people[3].id, function: 'Baixo' },
        { id: id(5 + index, 5), personId: people[4].id, function: 'Voz' },
        { id: id(5 + index, 6), personId: people[5].id, function: 'Bateria' },
      ],
      repertoire: selected.map((songIndex, position) => ({
        id: id(8 + index, position + 1), songId: songs[songIndex].id,
        key: songs[songIndex].churchKey,
        notes: position === 0 ? 'Abertura suave; seguir a condução da voz.' : '',
      })),
    };
  });
  return { songs, tags, people, services };
}
