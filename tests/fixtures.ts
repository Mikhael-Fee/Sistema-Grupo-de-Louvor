import { expect, type Page, type Route } from '@playwright/test';
import { createDemoData } from './seed';
import type { MinistryData, Person, Profile, Role, Service, Song, Tag } from '../src/types';

export interface MockMinistry {
  data: MinistryData;
  profiles: Profile[];
  publicAccess: boolean;
  calls: { method: string; path: string }[];
  setRole(role: Role): void;
  login(role?: Role): Promise<void>;
}

const USER_ID = '20000000-0000-4000-8000-000000000001';
const EMAIL = 'fixture@example.invalid';
const PASSWORD = 'local-fixture-password';
type Row = Record<string, unknown>;
const copy = <T>(value: T): T => structuredClone(value);
const put = <T extends { id: string }>(items: T[], item: T): T[] =>
  items.some(existing => existing.id === item.id)
    ? items.map(existing => existing.id === item.id ? copy(item) : existing)
    : [...items, copy(item)];

/** Intercept every Auth/PostgREST request; no mock may fall through to Supabase. */
export async function setupMockMinistry(page: Page, role: Role = 'admin'): Promise<MockMinistry> {
  let signedIn = false;
  const mock: MockMinistry = {
    data: createDemoData(),
    profiles: [
      { id: USER_ID, name: 'Mikhael', role, approved: true },
      { id: '20000000-0000-4000-8000-000000000002', name: 'Ana Clara', role: 'leader', approved: true },
      { id: '20000000-0000-4000-8000-000000000003', name: 'Lucas', role: 'musician', approved: true },
      { id: '20000000-0000-4000-8000-000000000004', name: 'Novo membro', role: 'musician', approved: false },
    ],
    publicAccess: true,
    calls: [],
    setRole(nextRole) { mock.profiles.find(profile => profile.id === USER_ID)!.role = nextRole; },
    async login(nextRole) {
      const logout = page.getByRole('button', { name: /^(Sair|Entrar para editar)$/ }).first();
      if (await logout.isVisible()) await logout.click();
      if (nextRole) mock.setRole(nextRole);
      await page.goto('/');
      await page.getByLabel('E-mail', { exact: true }).fill(EMAIL);
      await page.getByLabel('Senha', { exact: true }).fill(PASSWORD);
      await page.getByRole('button', { name: 'Entrar no ministério', exact: true }).click();
      await expect(page.getByRole('heading', { name: /^Olá,/ })).toBeVisible();
    },
  };
  mock.profiles[0].personId = mock.data.people[0]?.id;
  mock.profiles[1].personId = mock.data.people[1]?.id;
  mock.profiles[2].personId = mock.data.people[3]?.id;
  const actor = () => mock.profiles.find(profile => profile.id === USER_ID)!;
  const authorized = (kind: 'read' | 'library' | 'plan' | 'admin') => signedIn && actor().approved
    && (kind === 'read' || (kind === 'plan' ? ['admin', 'leader'].includes(actor().role) : actor().role === 'admin'));
  const respond = (route: Route, data: unknown, status = 200) => route.fulfill({
    status, contentType: 'application/json', body: JSON.stringify(data),
    headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' },
  });
  const error = (route: Route, code: string, message: string, status = 400) =>
    respond(route, { code, message, details: null, hint: null }, status);
  const denied = (route: Route) => error(route, '42501', 'Sem permissão para esta operação.', 403);
  const user = () => ({
    id: USER_ID, aud: 'authenticated', role: 'authenticated', email: EMAIL,
    email_confirmed_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z',
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { name: actor().name },
    identities: [],
  });
  const session = () => {
    const now = Math.floor(Date.now() / 1000);
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    return {
      access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: USER_ID, aud: 'authenticated', role: 'authenticated', iat: now, exp: now + 86400 })}.local-test-signature`,
      refresh_token: 'local-fixture-refresh-token', token_type: 'bearer', expires_in: 86400,
      expires_at: now + 86400, user: user(),
    };
  };

  await page.route('**/auth/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/auth/v1/', '');
    mock.calls.push({ method: request.method(), path: `/auth/v1/${path}` });
    if (request.method() === 'OPTIONS') return respond(route, null);
    if (path === 'token' && request.method() === 'POST') {
      signedIn = true;
      return respond(route, session());
    }
    if (path === 'logout' && request.method() === 'POST') {
      signedIn = false;
      return route.fulfill({ status: 204, body: '' });
    }
    if (path === 'user' && signedIn) return respond(route, user());
    if (path === 'recover' && request.method() === 'POST') return respond(route, {});
    return error(route, 'mock_auth_unhandled', `Auth não simulado: ${request.method()} ${path}`, 401);
  });

  const profileRow = (profile: Profile): Row => ({ ...profile, person_id: profile.personId ?? null });
  const tableRows = (table: string): Row[] | undefined => {
    switch (table) {
      case 'profiles': return mock.profiles.map(profileRow);
      case 'tags': return mock.data.tags.map(tag => ({ ...tag }));
      case 'people': return mock.data.people.map(person => ({ ...person }));
      case 'songs': return mock.data.songs.map(song => ({
        id: song.id, title: song.title, artist: song.artist, original_key: song.originalKey,
        church_key: song.churchKey, content: song.content, youtube_url: song.youtubeUrl, notes: song.notes,
      }));
      case 'services': return mock.data.services.map(service => ({
        id: service.id, date: service.date, time: `${service.time}:00`, type: service.type, notes: service.notes,
      }));
      case 'song_tags': return mock.data.songs.flatMap(song => song.tagIds.map(tagId => ({ song_id: song.id, tag_id: tagId })));
      case 'assignments': return mock.data.services.flatMap(service => service.assignments.map((assignment, position) => ({
        id: assignment.id, service_id: service.id, person_id: assignment.personId, function: assignment.function, position,
      })));
      case 'repertoire': return mock.data.services.flatMap(service => service.repertoire.map((item, position) => ({
        id: item.id, service_id: service.id, song_id: item.songId, key: item.key, notes: item.notes, position,
      })));
      default: return undefined;
    }
  };
  const filteredRows = (rows: Row[], url: URL) => {
    let result = rows.filter(row => [...url.searchParams].every(([key, filter]) => {
      if (filter.startsWith('eq.')) return String(row[key]) === filter.slice(3);
      if (filter.startsWith('in.(')) return filter.slice(4, -1).split(',').includes(String(row[key]));
      return true;
    }));
    const orders = (url.searchParams.get('order') || '').split(',').filter(Boolean);
    result = [...result].sort((left, right) => {
      for (const order of orders) {
        const [key, direction] = order.split('.');
        const comparison = typeof left[key] === 'number' && typeof right[key] === 'number'
          ? Number(left[key]) - Number(right[key]) : String(left[key] ?? '').localeCompare(String(right[key] ?? ''));
        if (comparison) return direction === 'desc' ? -comparison : comparison;
      }
      return 0;
    });
    return result;
  };

  await page.route('**/rest/v1/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/rest/v1/', '');
    const method = request.method();
    mock.calls.push({ method, path: `/rest/v1/${path}` });
    if (method === 'OPTIONS') return respond(route, null);
    const body = request.postData() ? request.postDataJSON() as Row : {};
    const singular = request.headers().accept?.includes('application/vnd.pgrst.object+json');
    const rowsResponse = (rows: Row[]) => {
      if (singular && rows.length !== 1) return error(route, 'PGRST116', 'Registro não encontrado.', 406);
      return respond(route, singular ? rows[0] : rows);
    };
    if (path.startsWith('rpc/')) {
      const rpc = path.slice(4);
      if (rpc === 'get_public_access') return respond(route, mock.publicAccess);
      if (rpc === 'read_public_ministry') {
        if (!mock.publicAccess) return denied(route);
        return respond(route, { ...copy(mock.data), people: mock.data.people.map(person => ({ ...person, email: '' })) });
      }
      if (rpc === 'save_public_access') {
        if (!authorized('admin')) return denied(route);
        mock.publicAccess = Boolean(body.p_enabled);
        return respond(route, null);
      }
      if (rpc === 'save_song') {
        if (!authorized('library')) return denied(route);
        const song = body.p_song as Song;
        if (song.tagIds.some(id => !mock.data.tags.some(tag => tag.id === id))) return error(route, '23503', 'Etiqueta inexistente.');
        mock.data.songs = put(mock.data.songs, song);
        return respond(route, null);
      }
      if (rpc === 'save_service') {
        if (!authorized('plan')) return denied(route);
        const service = body.p_service as Service;
        if (service.repertoire.some(item => !mock.data.songs.some(song => song.id === item.songId))
          || service.assignments.some(assignment => !mock.data.people.some(person => person.id === assignment.personId))) {
          return error(route, '23503', 'Música ou pessoa inexistente.');
        }
        mock.data.services = put(mock.data.services, service);
        return respond(route, null);
      }
      if (rpc === 'update_profile') {
        if (!authorized('admin')) return denied(route);
        const next = body.p_profile as Profile;
        const previous = mock.profiles.find(profile => profile.id === next.id);
        if (!previous) return error(route, 'PGRST116', 'Perfil inexistente.', 404);
        if (previous.approved && previous.role === 'admin' && (!next.approved || next.role !== 'admin')
          && mock.profiles.filter(profile => profile.approved && profile.role === 'admin').length === 1) {
          return error(route, '23514', 'Mantenha pelo menos um administrador aprovado.');
        }
        if (next.personId && !mock.data.people.some(person => person.id === next.personId)) return error(route, '23503', 'Pessoa inexistente.');
        mock.profiles = put(mock.profiles, next);
        return respond(route, null);
      }
      return error(route, 'mock_rpc_unhandled', `RPC não simulado: ${rpc}`, 404);
    }

    const rows = tableRows(path);
    if (!rows) return error(route, 'mock_table_unhandled', `Tabela não simulada: ${path}`, 404);
    if (method === 'GET') {
      if (!signedIn) return denied(route);
      const visible = path === 'profiles'
        ? rows.filter(row => authorized('admin') || row.id === USER_ID)
        : authorized('read') ? rows : [];
      return rowsResponse(filteredRows(visible, url));
    }
    if (!authorized(path === 'services' ? 'plan' : 'library')) return denied(route);
    if (method === 'POST' && (path === 'tags' || path === 'people')) {
      if (path === 'tags') mock.data.tags = put(mock.data.tags, body as unknown as Tag);
      else {
        const person = body as unknown as Person;
        if (mock.data.services.some(service => service.assignments.some(assignment => assignment.personId === person.id
          && !person.functions.includes(assignment.function)))) return error(route, '23514', 'Função em uso na escala.');
        mock.data.people = put(mock.data.people, person);
      }
      return rowsResponse([{ id: body.id }]);
    }
    if (method === 'DELETE' && ['songs', 'people', 'tags', 'services'].includes(path)) {
      const selected = filteredRows(rows, url);
      const ids = selected.map(row => row.id);
      if ((path === 'songs' && mock.data.services.some(service => service.repertoire.some(item => ids.includes(item.songId))))
        || (path === 'people' && (mock.data.services.some(service => service.assignments.some(assignment => ids.includes(assignment.personId)))
          || mock.profiles.some(profile => ids.includes(profile.personId))))) return error(route, '23503', 'Registro vinculado.');
      if (path === 'songs') mock.data.songs = mock.data.songs.filter(song => !ids.includes(song.id));
      if (path === 'people') mock.data.people = mock.data.people.filter(person => !ids.includes(person.id));
      if (path === 'services') mock.data.services = mock.data.services.filter(service => !ids.includes(service.id));
      if (path === 'tags') {
        mock.data.tags = mock.data.tags.filter(tag => !ids.includes(tag.id));
        mock.data.songs = mock.data.songs.map(song => ({ ...song, tagIds: song.tagIds.filter(id => !ids.includes(id)) }));
      }
      return rowsResponse(selected.map(row => ({ id: row.id })));
    }
    return error(route, 'mock_method_unhandled', `Operação não simulada: ${method} ${path}`, 405);
  });
  return mock;
}

export async function loginAs(page: Page, role: Role = 'admin'): Promise<MockMinistry> {
  const mock = await setupMockMinistry(page, role);
  await mock.login();
  return mock;
}
