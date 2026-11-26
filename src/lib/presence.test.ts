import { describe, expect, it } from 'vitest';
import { presenceSummary, unavailableOn, upcomingUnavailability } from './presence';

const data = {
  unavailability: [
    { id: '1', personId: 'p1', date: '2026-12-06', note: 'Viagem' },
    { id: '2', personId: 'p1', date: '2026-11-01', note: '' },
    { id: '3', personId: 'p2', date: '2026-12-06', note: '' },
    { id: '4', personId: 'p1', date: '2026-11-29', note: '' },
  ],
};

describe('presença e datas indisponíveis', () => {
  it('encontra a data marcada pela pessoa', () => {
    expect(unavailableOn(data, 'p1', '2026-12-06')?.note).toBe('Viagem');
    expect(unavailableOn(data, 'p1', '2026-12-13')).toBeUndefined();
    expect(unavailableOn({}, 'p1', '2026-12-06')).toBeUndefined();
  });
  it('conta as respostas, tratando sem resposta como aguardando', () => {
    expect(
      presenceSummary([
        { id: 'a', personId: 'p', function: 'Voz', status: 'confirmed' },
        { id: 'b', personId: 'p', function: 'Voz' },
        { id: 'c', personId: 'p', function: 'Voz', status: 'declined' },
      ]),
    ).toEqual({ confirmed: 1, declined: 1, pending: 1 });
  });
  it('quem marcou a data como indisponível e não respondeu conta como "não poderão", não como aguardando', () => {
    const away = (personId: string) => Boolean(unavailableOn(data, personId, '2026-12-06'));
    expect(
      presenceSummary(
        [
          { id: 'a', personId: 'p1', function: 'Teclado' },
          { id: 'b', personId: 'p3', function: 'Voz' },
          { id: 'c', personId: 'p2', function: 'Voz', status: 'confirmed' },
        ],
        away,
      ),
    ).toEqual({ confirmed: 1, declined: 1, pending: 1 });
  });
  it('lista só as próximas datas da pessoa, em ordem', () => {
    expect(upcomingUnavailability(data, 'p1', '2026-11-25').map(item => item.date)).toEqual(['2026-11-29', '2026-12-06']);
  });
});
