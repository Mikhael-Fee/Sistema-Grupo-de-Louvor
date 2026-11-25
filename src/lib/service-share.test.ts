import { describe, expect, it } from 'vitest';
import { buildServiceShareText, whatsappShareUrl } from './service-share';
import type { Service } from '../types';

const service: Service = { id: 's1', date: '2026-11-29', time: '18:00', type: 'Ceia', notes: 'Chegar 17h', isEvent: false,
  assignments: [{ id: 'x1', personId: 'p2', function: 'Violão' }, { id: 'x2', personId: 'p1', function: 'Voz' }, { id: 'x3', personId: 'p3', function: 'Voz' }],
  repertoire: [{ id: 'r1', songId: 'm1', key: 'G', notes: 'Abertura suave\nseguir a condução' }, { id: 'r2', songId: 'm2', key: 'C', notes: '' }] };
const data = {
  songs: [{ id: 'm1', title: 'Casa de paz' }, { id: 'm2', title: 'Teu amor nos guia' }] as never,
  people: [{ id: 'p1', name: 'Helena' }, { id: 'p2', name: 'Mikhael' }, { id: 'p3', name: 'Ana' }] as never,
};

describe('texto para compartilhar o culto', () => {
  it('monta data, repertório com tom e observação, equipe por função e link', () => {
    expect(buildServiceShareText(service, data, 'https://app.test/cultos/s1')).toBe([
      '*Ceia*', 'Domingo, 29 de novembro · 18:00', '', 'Chegar 17h', '',
      '*Repertório*', '1. Casa de paz (G)', '   Obs.: Abertura suave seguir a condução', '2. Teu amor nos guia (C)', '',
      '*Equipe*', 'Voz: Helena, Ana', 'Violão: Mikhael', '', 'Ver no Candeia: https://app.test/cultos/s1',
    ].join('\n'));
  });
  it('avisa quando repertório e equipe ainda estão vazios', () => {
    const text = buildServiceShareText({ ...service, notes: '', repertoire: [], assignments: [] }, data, 'https://app.test');
    expect(text).toContain('*Repertório*\nAinda não definido');
    expect(text).toContain('*Equipe*\nAinda não definida');
  });
  it('codifica o texto no link do WhatsApp', () => {
    expect(whatsappShareUrl('Olá & tchau')).toBe('https://wa.me/?text=Ol%C3%A1+%26+tchau');
  });
});
