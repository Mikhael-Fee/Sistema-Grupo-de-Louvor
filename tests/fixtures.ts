import { expect, type Page, type Route } from '@playwright/test';
import { createDemoData } from './seed';
import type { MinistryData, Person, Profile, Role, Service, Song, Tag } from '../src/types';

/** A suggestion as the simulated database keeps it (migration 011). */
export interface MockSuggestion {
  id: string;
  title: string;
  artist: string;
  videoId: string;
  videoTitle: string;
  channel: string;
  status: 'suggested' | 'reviewing' | 'approved' | 'declined';
  statusNote: string;
  songId?: string;
  createdBy: string;
  authorPersonId?: string;
  authorName: string;
  createdAt: string;
  statusChangedAt: string;
  tagIds: string[];
  voters: { userId: string; at: string }[];
  comments: { id: string; userId: string; authorPersonId?: string; authorName: string; body: string; createdAt: string }[];
}

export interface MockMinistry {
  data: MinistryData;
  /** Migration 011 rows; set to null to simulate a database without it. */
  suggestions: MockSuggestion[] | null;
  profiles: Profile[];
  publicAccess: boolean;
  calls: { method: string; path: string }[];
  storage: { objects: Map<string, { body: Buffer; contentType: string }> };
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
    ? items.map(existing => (existing.id === item.id ? copy(item) : existing))
    : [...items, copy(item)];

/** Intercept every Auth/PostgREST request; no mock may fall through to Supabase. */
export async function setupMockMinistry(page: Page, role: Role = 'admin', initiallySignedIn = false): Promise<MockMinistry> {
  // A second tab can reuse Auth storage from the same mock browser context.
  let signedIn = initiallySignedIn;
  const mock: MockMinistry = {
    data: createDemoData(),
    profiles: [
      { id: USER_ID, name: 'Mikhael', role, approved: true },
      { id: '20000000-0000-4000-8000-000000000002', name: 'Ana Clara', role: 'leader', approved: true },
      { id: '20000000-0000-4000-8000-000000000003', name: 'Lucas', role: 'musician', approved: true },
      { id: '20000000-0000-4000-8000-000000000004', name: 'Novo membro', role: 'musician', approved: false },
    ],
    publicAccess: false,
    suggestions: [],
    calls: [],
    storage: { objects: new Map() },
    setRole(nextRole) {
      mock.profiles.find(profile => profile.id === USER_ID)!.role = nextRole;
    },
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
  // Migration 008 (presence and unavailable dates) is installed in the simulated project.
  mock.data.unavailability ??= [];
  // Migration 010 (member profiles: birthdays, WhatsApp, keys per singer) too.
  mock.data.songKeys ??= [];
  mock.profiles[0].personId = mock.data.people[0]?.id;
  mock.profiles[1].personId = mock.data.people[1]?.id;
  mock.profiles[2].personId = mock.data.people[3]?.id;
  const actor = () => mock.profiles.find(profile => profile.id === USER_ID)!;
  const authorized = (kind: 'read' | 'library' | 'plan' | 'admin') =>
    signedIn &&
    actor().approved &&
    (kind === 'read' || (kind === 'plan' ? ['admin', 'leader'].includes(actor().role) : actor().role === 'admin'));
  const respond = (route: Route, data: unknown, status = 200) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(data),
      headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' },
    });
  const error = (route: Route, code: string, message: string, status = 400) =>
    respond(route, { code, message, details: null, hint: null }, status);
  const denied = (route: Route) => error(route, '42501', 'Sem permissão para esta operação.', 403);
  const user = () => ({
    id: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: EMAIL,
    email_confirmed_at: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { name: actor().name },
    identities: [],
  });
  const session = () => {
    const now = Math.floor(Date.now() / 1000);
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    return {
      access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: USER_ID, aud: 'authenticated', role: 'authenticated', iat: now, exp: now + 86400 })}.local-test-signature`,
      refresh_token: 'local-fixture-refresh-token',
      token_type: 'bearer',
      expires_in: 86400,
      expires_at: now + 86400,
      user: user(),
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

  const profileRow = (profile: Profile): Row => ({ ...profile, person_id: profile.personId ?? null, photo_url: profile.photoUrl || '' });
  const teamProfilePhotos = () =>
    mock.profiles
      .filter(
        profile =>
          profile.approved && profile.personId && profile.photoUrl && mock.data.people.some(person => person.id === profile.personId),
      )
      .map(profile => ({ personId: profile.personId!, photoUrl: profile.photoUrl! }));
  const tableRows = (table: string): Row[] | undefined => {
    switch (table) {
      case 'profiles':
        return mock.profiles.map(profileRow);
      case 'tags':
        return mock.data.tags.map(tag => ({ ...tag }));
      case 'people':
        return mock.data.people.map(person => ({
          ...person,
          photo_url: person.photoUrl || '',
          birth_month: person.birthMonth ?? null,
          birth_day: person.birthDay ?? null,
          whatsapp: person.whatsapp ?? '',
        }));
      case 'person_song_keys':
        if (!mock.data.songKeys) return undefined;
        return mock.data.songKeys.map(item => ({ person_id: item.personId, song_id: item.songId, key: item.key }));
      case 'songs':
        return mock.data.songs.map(song => ({
          id: song.id,
          title: song.title,
          artist: song.artist,
          original_key: song.originalKey,
          church_key: song.churchKey,
          content: song.content,
          youtube_url: song.youtubeUrl,
          notes: song.notes,
        }));
      case 'services':
        return mock.data.services.map(service => ({
          id: service.id,
          date: service.date,
          time: `${service.time}:00`,
          type: service.type,
          notes: service.notes,
          is_event: service.isEvent === true,
        }));
      case 'song_tags':
        return mock.data.songs.flatMap(song => song.tagIds.map(tagId => ({ song_id: song.id, tag_id: tagId })));
      case 'assignments':
        return mock.data.services.flatMap(service =>
          service.assignments.map((assignment, position) => ({
            id: assignment.id,
            service_id: service.id,
            person_id: assignment.personId,
            function: assignment.function,
            position,
            status: assignment.status ?? 'pending',
            status_note: assignment.statusNote ?? '',
          })),
        );
      case 'unavailability':
        return (mock.data.unavailability ?? []).map(item => ({ id: item.id, person_id: item.personId, date: item.date, note: item.note }));
      case 'repertoire':
        return mock.data.services.flatMap(service =>
          service.repertoire.map((item, position) => ({
            id: item.id,
            service_id: service.id,
            song_id: item.songId,
            key: item.key,
            notes: item.notes,
            position,
            youtube_url: item.youtubeUrl || '',
          })),
        );
      default:
        return undefined;
    }
  };
  const filteredRows = (rows: Row[], url: URL) => {
    let result = rows.filter(row =>
      [...url.searchParams].every(([key, filter]) => {
        if (filter.startsWith('eq.')) return String(row[key]) === filter.slice(3);
        if (filter.startsWith('in.(')) return filter.slice(4, -1).split(',').includes(String(row[key]));
        return true;
      }),
    );
    const orders = (url.searchParams.get('order') || '').split(',').filter(Boolean);
    result = [...result].sort((left, right) => {
      for (const order of orders) {
        const [key, direction] = order.split('.');
        const comparison =
          typeof left[key] === 'number' && typeof right[key] === 'number'
            ? Number(left[key]) - Number(right[key])
            : String(left[key] ?? '').localeCompare(String(right[key] ?? ''));
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
    const body = request.postData() ? (request.postDataJSON() as Row) : {};
    const singular = request.headers().accept?.includes('application/vnd.pgrst.object+json');
    const rowsResponse = (rows: Row[]) => {
      if (singular && rows.length !== 1) return error(route, 'PGRST116', 'Registro não encontrado.', 406);
      return respond(route, singular ? rows[0] : rows);
    };
    if (path.startsWith('rpc/')) {
      const rpc = path.slice(4);
      if (rpc === 'get_public_access') return denied(route);
      if (rpc === 'read_public_ministry') {
        return denied(route);
      }
      if (rpc === 'read_team_profile_photos') {
        if (!authorized('read')) return denied(route);
        return respond(route, teamProfilePhotos());
      }
      if (rpc === 'save_public_access') {
        return denied(route);
      }
      if (rpc === 'save_song') {
        if (!authorized('library')) return denied(route);
        const song = body.p_song as Song;
        if (song.tagIds.some(id => !mock.data.tags.some(tag => tag.id === id))) return error(route, '23503', 'Etiqueta inexistente.');
        mock.data.songs = put(mock.data.songs, song);
        return respond(route, null);
      }
      if (rpc === 'save_person') {
        if (!authorized('library')) return denied(route);
        const next = body.p_person as Person;
        const previous = mock.data.people.find(person => person.id === next.id);
        if (
          mock.data.services.some(service =>
            service.assignments.some(assignment => assignment.personId === next.id && !next.functions.includes(assignment.function)),
          )
        )
          return error(route, '23514', 'Função em uso na escala.');
        mock.data.people = put(mock.data.people, {
          ...previous,
          id: next.id,
          name: next.name,
          email: next.email,
          functions: next.functions,
          active: previous?.active !== false,
          photoUrl: Object.hasOwn(next, 'photoUrl') ? next.photoUrl || undefined : previous?.photoUrl,
        });
        return respond(route, null);
      }
      if (rpc === 'set_person_active') {
        if (!authorized('library')) return denied(route);
        const previous = mock.data.people.find(person => person.id === body.p_person_id);
        if (!previous) return error(route, 'P0002', 'Integrante não encontrado.', 404);
        if (typeof body.p_active !== 'boolean') return error(route, '22023', 'Estado da equipe inválido.');
        mock.data.people = put(mock.data.people, { ...previous, active: body.p_active });
        return respond(route, null);
      }
      if (rpc === 'update_my_profile_photo') {
        if (!authorized('read')) return denied(route);
        const photoUrl = body.p_photo_url;
        if (typeof photoUrl !== 'string') return error(route, '22023', 'Foto inválida.');
        if (photoUrl) {
          const origin = url.origin;
          const prefix = `${origin}/storage/v1/object/public/avatars/${USER_ID}/`;
          if (!photoUrl.startsWith(prefix) || !/^[0-9a-f-]{36}\.(?:webp|png|jpeg)$/i.test(photoUrl.slice(prefix.length))) {
            return denied(route);
          }
        }
        mock.profiles = put(mock.profiles, { ...actor(), photoUrl: photoUrl || undefined });
        return respond(route, null);
      }
      if (rpc === 'save_service') {
        if (!authorized('plan')) return denied(route);
        const service = body.p_service as Service;
        if (
          service.repertoire.some(item => !mock.data.songs.some(song => song.id === item.songId)) ||
          service.assignments.some(assignment => !mock.data.people.some(person => person.id === assignment.personId))
        ) {
          return error(route, '23503', 'Música ou pessoa inexistente.');
        }
        const previous = mock.data.services.find(item => item.id === service.id);
        if (
          service.assignments.some(
            assignment =>
              mock.data.people.find(person => person.id === assignment.personId)?.active === false &&
              !previous?.assignments.some(
                item => item.id === assignment.id && item.personId === assignment.personId && item.function === assignment.function,
              ),
          )
        ) {
          return error(route, '23514', 'Escolha um integrante da equipe ativa para novas escalas.');
        }
        // Like the database: unchanged rows keep their answer; a new person or function asks again.
        const previousAssignments = mock.data.services.find(item => item.id === service.id)?.assignments ?? [];
        service.assignments = service.assignments.map(assignment => {
          const kept = previousAssignments.find(
            item => item.id === assignment.id && item.personId === assignment.personId && item.function === assignment.function,
          );
          const base = { id: assignment.id, personId: assignment.personId, function: assignment.function };
          return kept?.status && kept.status !== 'pending' ? { ...base, status: kept.status, statusNote: kept.statusNote ?? '' } : base;
        });
        mock.data.services = put(mock.data.services, service);
        return respond(route, null);
      }
      if (rpc === 'respond_assignment') {
        if (!authorized('read')) return denied(route);
        const service = mock.data.services.find(item => item.assignments.some(assignment => assignment.id === body.p_assignment_id));
        const assignment = service?.assignments.find(item => item.id === body.p_assignment_id);
        if (!service || !assignment) return error(route, 'P0002', 'Escala não encontrada.', 404);
        if (!['pending', 'confirmed', 'declined'].includes(String(body.p_status))) return error(route, '22023', 'Status inválido.');
        if (!authorized('plan') && actor().personId !== assignment.personId) return denied(route);
        assignment.status = body.p_status as 'pending' | 'confirmed' | 'declined';
        assignment.statusNote = String(body.p_note || '').trim();
        return respond(route, null);
      }
      if (rpc === 'set_unavailability') {
        if (!authorized('read')) return denied(route);
        const personId = String(body.p_person_id);
        const date = String(body.p_date);
        if (!authorized('plan') && actor().personId !== personId) return denied(route);
        const others = (mock.data.unavailability ?? []).filter(item => !(item.personId === personId && item.date === date));
        mock.data.unavailability = body.p_unavailable
          ? [...others, { id: crypto.randomUUID(), personId, date, note: String(body.p_note || '').trim() }]
          : others;
        return respond(route, null);
      }
      if (rpc === 'update_my_person') {
        if (!authorized('read')) return denied(route);
        const personId = actor().personId;
        const previous = mock.data.people.find(person => person.id === personId);
        if (!previous) return denied(route);
        const next = body.p_person as {
          name: string;
          functions: string[];
          birthMonth: number | null;
          birthDay: number | null;
          whatsapp: string;
        };
        if (
          mock.data.services.some(service =>
            service.assignments.some(assignment => assignment.personId === personId && !next.functions.includes(assignment.function)),
          )
        )
          return error(route, '23514', 'Esta função está em uma escala. Ajuste a escala antes de removê-la.');
        const { birthMonth: _month, birthDay: _day, whatsapp: _whatsapp, ...rest } = previous;
        mock.data.people = put(mock.data.people, {
          ...rest,
          name: next.name.trim(),
          functions: next.functions,
          ...(next.birthMonth && next.birthDay ? { birthMonth: next.birthMonth, birthDay: next.birthDay } : {}),
          ...(next.whatsapp ? { whatsapp: next.whatsapp } : {}),
        });
        actor().name = next.name.trim();
        return respond(route, null);
      }
      if (rpc.endsWith('song_suggestions') || rpc.includes('song_suggestion')) {
        if (!mock.suggestions) return error(route, 'PGRST202', `Função ausente: ${rpc}`, 404);
        if (!authorized('read')) return denied(route);
        const me = actor();
        const leader = ['admin', 'leader'].includes(me.role);
        const find = (id: unknown) => mock.suggestions!.find(item => item.id === id);
        const now = new Date().toISOString();
        if (rpc === 'read_song_suggestions') {
          return respond(
            route,
            [...mock.suggestions]
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .map(({ createdBy, voters, comments, ...item }) => ({
                ...item,
                songId: item.songId ?? null,
                authorPersonId: item.authorPersonId ?? null,
                mine: createdBy === me.id,
                votes: voters.length,
                votedByMe: voters.some(vote => vote.userId === me.id),
                lastActivityAt: [item.createdAt, item.statusChangedAt, ...voters.map(v => v.at), ...comments.map(c => c.createdAt)]
                  .sort()
                  .at(-1),
                comments: comments.map(({ userId, ...comment }) => ({ ...comment, mine: userId === me.id })),
              })),
          );
        }
        if (rpc === 'create_song_suggestion') {
          const next = body.p_suggestion as Record<string, unknown>;
          if (mock.suggestions.some(item => item.videoId === next.videoId && ['suggested', 'reviewing'].includes(item.status)))
            return error(route, '23505', 'Este vídeo já foi sugerido.', 409);
          mock.suggestions.push({
            id: crypto.randomUUID(),
            title: String(next.title).trim(),
            artist: String(next.artist).trim(),
            videoId: String(next.videoId),
            videoTitle: String(next.videoTitle ?? ''),
            channel: String(next.channel ?? ''),
            status: 'suggested',
            statusNote: '',
            createdBy: me.id,
            authorPersonId: me.personId,
            authorName: me.name,
            createdAt: now,
            statusChangedAt: now,
            tagIds: (next.tagIds as string[]) ?? [],
            voters: [],
            comments: [],
          });
          return respond(route, null);
        }
        if (rpc === 'set_song_suggestion_vote') {
          const item = find(body.p_suggestion_id);
          if (!item) return error(route, 'P0002', 'Sugestão não encontrada.');
          item.voters = item.voters.filter(vote => vote.userId !== me.id);
          if (body.p_vote) item.voters.push({ userId: me.id, at: now });
          return respond(route, null);
        }
        if (rpc === 'add_song_suggestion_comment') {
          const item = find(body.p_suggestion_id);
          if (!item) return error(route, 'P0002', 'Sugestão não encontrada.');
          item.comments.push({
            id: crypto.randomUUID(),
            userId: me.id,
            authorPersonId: me.personId,
            authorName: me.name,
            body: String(body.p_body).trim(),
            createdAt: now,
          });
          return respond(route, null);
        }
        if (rpc === 'delete_song_suggestion_comment') {
          for (const item of mock.suggestions)
            item.comments = item.comments.filter(comment => !(comment.id === body.p_comment_id && (leader || comment.userId === me.id)));
          return respond(route, null);
        }
        if (!leader && rpc !== 'delete_song_suggestion') return denied(route);
        const item = find(body.p_suggestion_id);
        if (!item) return error(route, 'P0002', 'Sugestão não encontrada.');
        if (rpc === 'set_song_suggestion_status') {
          if (item.status === 'approved') return error(route, 'P0002', 'Já aprovada.');
          Object.assign(item, { status: body.p_status, statusNote: String(body.p_note ?? ''), statusChangedAt: now });
          return respond(route, null);
        }
        if (rpc === 'approve_song_suggestion') {
          let songId = body.p_song_id ? String(body.p_song_id) : '';
          if (!songId) {
            songId = crypto.randomUUID();
            mock.data.songs.push({
              id: songId,
              title: item.title,
              artist: item.artist,
              originalKey: String(body.p_key),
              churchKey: String(body.p_key),
              content: 'Cifra pendente. Edite esta música para adicionar a letra e os acordes.',
              youtubeUrl: `https://www.youtube.com/watch?v=${item.videoId}`,
              notes: `Sugerida por ${item.authorName}.`,
              tagIds: [...item.tagIds],
            });
          }
          Object.assign(item, { status: 'approved', songId, statusNote: '', statusChangedAt: now });
          return respond(route, songId);
        }
        if (rpc === 'delete_song_suggestion') {
          if (!leader && !(item.createdBy === me.id && item.status === 'suggested')) return denied(route);
          mock.suggestions = mock.suggestions.filter(entry => entry.id !== item.id);
          return respond(route, null);
        }
      }
      if (rpc === 'set_song_key') {
        if (!authorized('read')) return denied(route);
        const personId = String(body.p_person_id);
        const songId = String(body.p_song_id);
        if (!authorized('plan') && actor().personId !== personId) return denied(route);
        const others = (mock.data.songKeys ?? []).filter(item => !(item.personId === personId && item.songId === songId));
        mock.data.songKeys = body.p_key ? [...others, { personId, songId, key: String(body.p_key) }] : others;
        return respond(route, null);
      }
      if (rpc === 'update_profile') {
        if (!authorized('admin')) return denied(route);
        const next = body.p_profile as Profile;
        const previous = mock.profiles.find(profile => profile.id === next.id);
        if (!previous) return error(route, 'PGRST116', 'Perfil inexistente.', 404);
        if (
          previous.approved &&
          previous.role === 'admin' &&
          (!next.approved || next.role !== 'admin') &&
          mock.profiles.filter(profile => profile.approved && profile.role === 'admin').length === 1
        ) {
          return error(route, '23514', 'Mantenha pelo menos um administrador aprovado.');
        }
        if (next.personId && !mock.data.people.some(person => person.id === next.personId))
          return error(route, '23503', 'Pessoa inexistente.');
        if (next.personId && mock.profiles.some(profile => profile.id !== next.id && profile.personId === next.personId)) {
          return error(route, '23505', 'Pessoa já vinculada a outra conta.', 409);
        }
        // Administrative access updates never copy or overwrite photographs.
        mock.profiles = put(mock.profiles, {
          id: previous.id,
          name: next.name,
          role: next.role,
          approved: next.approved,
          personId: next.personId || undefined,
          photoUrl: previous.photoUrl,
        });
        return respond(route, null);
      }
      return error(route, 'mock_rpc_unhandled', `RPC não simulado: ${rpc}`, 404);
    }

    const rows = tableRows(path);
    if (!rows) return error(route, 'mock_table_unhandled', `Tabela não simulada: ${path}`, 404);
    if (method === 'GET') {
      if (!signedIn) return denied(route);
      const visible = path === 'profiles' ? rows.filter(row => authorized('admin') || row.id === USER_ID) : authorized('read') ? rows : [];
      return rowsResponse(filteredRows(visible, url));
    }
    if (!authorized(path === 'services' ? 'plan' : 'library')) return denied(route);
    if (method === 'POST' && (path === 'tags' || path === 'people')) {
      if (path === 'tags') mock.data.tags = put(mock.data.tags, body as unknown as Tag);
      else {
        const previous = mock.data.people.find(person => person.id === body.id);
        const person = {
          id: body.id,
          name: body.name,
          email: body.email,
          functions: body.functions,
          active: previous?.active !== false,
          photoUrl: Object.hasOwn(body, 'photo_url') ? body.photo_url || undefined : previous?.photoUrl,
        } as Person;
        if (
          mock.data.services.some(service =>
            service.assignments.some(assignment => assignment.personId === person.id && !person.functions.includes(assignment.function)),
          )
        )
          return error(route, '23514', 'Função em uso na escala.');
        mock.data.people = put(mock.data.people, person);
      }
      return rowsResponse([{ id: body.id }]);
    }
    if (method === 'DELETE' && ['songs', 'people', 'tags', 'services'].includes(path)) {
      const selected = filteredRows(rows, url);
      const ids = selected.map(row => row.id);
      if (
        (path === 'songs' && mock.data.services.some(service => service.repertoire.some(item => ids.includes(item.songId)))) ||
        (path === 'people' &&
          (mock.data.services.some(service => service.assignments.some(assignment => ids.includes(assignment.personId))) ||
            mock.profiles.some(profile => ids.includes(profile.personId))))
      )
        return error(route, '23503', 'Registro vinculado.');
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

  // Storage is also intercepted completely. Uploads remain in this test's
  // memory; no photo or fixture credential reaches a Supabase project.
  await page.route('**/storage/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/storage/v1/', '');
    const method = request.method();
    mock.calls.push({ method, path: `/storage/v1/${path}` });
    if (method === 'OPTIONS') return respond(route, null);
    if (method === 'GET' && path.startsWith('object/public/avatars/')) {
      const key = path.slice('object/public/avatars/'.length);
      const object = mock.storage.objects.get(key);
      return object
        ? route.fulfill({ contentType: object.contentType, body: object.body, headers: { 'access-control-allow-origin': '*' } })
        : error(route, '404', 'Foto não encontrada.', 404);
    }
    if (!authorized('read')) return denied(route);
    if (method === 'POST' && path.startsWith('object/avatars/')) {
      const key = path.slice('object/avatars/'.length);
      if (!key.startsWith(`${USER_ID}/`) || !/^[0-9a-f-]{36}\.(?:webp|png|jpeg)$/i.test(key.slice(USER_ID.length + 1)))
        return denied(route);
      if (mock.storage.objects.has(key)) return error(route, '23505', 'Foto já existe.', 409);
      const raw = request.postDataBuffer() || Buffer.alloc(0);
      let body = raw;
      let contentType = request.headers()['content-type']?.split(';')[0] || '';
      const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(request.headers()['content-type'] || '');
      if (boundary) {
        const sections = raw.toString('latin1').split(`--${boundary[1] || boundary[2]}`);
        const file = sections.find(section => /content-disposition:[^\r\n]*filename=/i.test(section));
        if (!file) return error(route, '22023', 'Upload sem foto.');
        const separator = file.indexOf('\r\n\r\n');
        const headers = file.slice(0, separator);
        contentType = /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1]?.trim() || '';
        body = Buffer.from(file.slice(separator + 4).replace(/\r\n$/, ''), 'latin1');
      }
      if (!['image/webp', 'image/png', 'image/jpeg'].includes(contentType) || body.length > 2_097_152)
        return error(route, '22023', 'Foto inválida.');
      mock.storage.objects.set(key, { body, contentType });
      return respond(route, { Key: `avatars/${key}`, Id: key.split('/')[1] });
    }
    if (method === 'DELETE' && path === 'object/avatars') {
      const body = request.postDataJSON() as { prefixes?: unknown };
      if (!Array.isArray(body.prefixes) || body.prefixes.some(key => typeof key !== 'string' || !key.startsWith(`${USER_ID}/`)))
        return denied(route);
      for (const key of body.prefixes) mock.storage.objects.delete(key);
      return respond(
        route,
        body.prefixes.map(name => ({ name })),
      );
    }
    return error(route, 'mock_storage_unhandled', `Storage não simulado: ${method} ${path}`, 404);
  });
  return mock;
}

export async function loginAs(page: Page, role: Role = 'admin'): Promise<MockMinistry> {
  const mock = await setupMockMinistry(page, role);
  await mock.login();
  return mock;
}

/** On phones the service page shows one tab at a time; on wider screens every section is visible. */
export async function showServiceTab(page: Page, name: 'Repertório' | 'Equipe' | 'Detalhes'): Promise<void> {
  await page.locator('.culto-hero').waitFor();
  const tab = page.getByRole('tab', { name: new RegExp(`^${name}`) });
  if (await tab.isVisible()) await tab.click();
}

/** Turns on the repertoire edit mode, where the reorder, adjust and remove buttons live. */
export async function editRepertoire(page: Page): Promise<void> {
  await showServiceTab(page, 'Repertório');
  const toggle = page.getByRole('button', { name: 'Editar repertório', exact: true });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole('button', { name: 'Concluir', exact: true }).waitFor();
}

/** Opens the "⋯" menu of the service page and clicks one of its items. */
export async function serviceMenu(page: Page, item: string): Promise<void> {
  await page.getByRole('button', { name: 'Mais opções do culto', exact: true }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}
