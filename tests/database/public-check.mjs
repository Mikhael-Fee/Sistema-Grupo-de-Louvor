// Public consultation uses real PostgreSQL rules with simulated Auth, no network.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite();
let checks = 0;
const ids = {
  admin: '10000000-0000-4000-a000-000000000001',
  leader: '10000000-0000-4000-a000-000000000002',
  musician: '10000000-0000-4000-a000-000000000003',
  pending: '10000000-0000-4000-a000-000000000004',
  suspendedAdmin: '10000000-0000-4000-a000-000000000005',
  person: '20000000-0000-4000-a000-000000000001',
  tag: '20000000-0000-4000-a000-000000000002',
  songA: '20000000-0000-4000-a000-000000000003',
  songB: '20000000-0000-4000-a000-000000000004',
  service: '20000000-0000-4000-a000-000000000005',
  assignment: '20000000-0000-4000-a000-000000000006',
  itemA: '20000000-0000-4000-a000-000000000007',
  itemB: '20000000-0000-4000-a000-000000000008',
};
const privateContact = 'private-contact@example.invalid';
const privateAccount = 'private-admin@example.invalid';
const protectedTables = ['profiles', 'people', 'songs', 'tags', 'song_tags', 'services', 'assignments', 'repertoire', 'public_access'];

async function as(user, role = 'authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user ?? '']);
  await db.exec(`set role ${role}`);
}

function equal(actual, expected, description) {
  assert.deepEqual(actual, expected, description);
  checks++;
}

async function denied(sql, parameters = [], code = '42501') {
  let failure;
  try { await db.query(sql, parameters); } catch (error) { failure = error; }
  assert.ok(failure, `Operation must be rejected: ${sql}`);
  assert.equal(failure.code, code, failure.message);
  checks++;
}

const publicData = async () => (await db.query('select public.read_public_ministry() as data')).rows[0].data;
const publicFlag = async () => (await db.query('select public.get_public_access() as enabled')).rows[0].enabled;

try {
  await db.exec(await readFile(new URL('./auth-stub.sql', import.meta.url), 'utf8'));
  for (const filename of ['001_initial.sql', '002_public_consultation.sql']) {
    await db.exec(await readFile(new URL(`../../supabase/migrations/${filename}`, import.meta.url), 'utf8'));
  }
  for (const [name, role, approved] of [
    ['admin', 'admin', true], ['leader', 'leader', true], ['musician', 'musician', true],
    ['pending', 'musician', false], ['suspendedAdmin', 'admin', false],
  ]) {
    await db.query('insert into auth.users(id, email, raw_user_meta_data) values ($1, $2, $3)',
      [ids[name], name === 'admin' ? privateAccount : `${name}@example.invalid`, { name, role: 'admin', approved: true }]);
    await db.query('update public.profiles set role = $1, approved = $2 where id = $3', [role, approved, ids[name]]);
  }

  await as(null, 'anon');
  equal(await publicFlag(), false, 'public access is disabled by default');
  await denied('select public.read_public_ministry()');
  await denied('select public.save_public_access(true)');
  for (const table of protectedTables) await denied(`select * from public.${table}`);

  for (const actor of ['leader', 'musician', 'pending', 'suspendedAdmin']) {
    await as(ids[actor]);
    await denied('select public.save_public_access(true)');
    equal(await publicFlag(), false, 'non-administrators cannot change the feature flag');
  }
  await as(ids.admin);
  await denied('update public.public_access set public_enabled = true');
  await denied('select public.save_public_access($1)', [null], '22023');
  await db.query('select public.save_public_access(true)');
  await as(null, 'anon');
  equal(await publicData(), { songs: [], tags: [], people: [], services: [] }, 'empty public response preserves the application shape');

  await as(ids.admin);
  await db.query('insert into public.people(id, name, email, functions) values ($1, $2, $3, $4)',
    [ids.person, 'Pessoa da escala', privateContact, ['Voz', 'Violão']]);
  await db.query('insert into public.tags(id, name, color) values ($1, $2, $3)', [ids.tag, 'Gratidão', '#552288']);
  const songA = {
    id: ids.songA, title: 'Canção A', artist: 'Equipe', originalKey: 'C', churchKey: 'D',
    content: '[C]Texto original', youtubeUrl: 'https://youtu.be/AbCdEfG_123', notes: 'Começar suavemente.', tagIds: [ids.tag],
  };
  const songB = { ...songA, id: ids.songB, title: 'Canção B', originalKey: 'G', churchKey: 'A', tagIds: [] };
  await db.query('select public.save_song($1)', [songA]);
  await db.query('select public.save_song($1)', [songB]);
  const service = {
    id: ids.service, date: '2099-01-01', time: '19:00', type: 'Especial', notes: 'Ensaio às 18h.',
    assignments: [{ id: ids.assignment, personId: ids.person, function: 'Voz' }],
    repertoire: [
      { id: ids.itemB, songId: ids.songB, key: 'Eb', notes: 'Introdução com violão.' },
      { id: ids.itemA, songId: ids.songA, key: 'F#', notes: 'Finalizar no refrão.' },
    ],
  };
  await db.query('select public.save_service($1)', [service]);
  await as(null, 'anon');
  equal(await publicFlag(), true, 'an anonymous visitor can discover enabled consultation');
  const data = await publicData();
  equal(Object.keys(data).sort(), ['people', 'services', 'songs', 'tags'], 'fixed public top-level whitelist excludes profiles');
  equal(data.songs, [songA, songB], 'lyrics, chords, video, tags, keys and musical notes remain usable');
  equal(data.tags, [{ id: ids.tag, name: 'Gratidão', color: '#552288' }], 'tags use the existing public application shape');
  equal(data.people, [{ id: ids.person, name: 'Pessoa da escala', email: '', functions: ['Voz', 'Violão'] }], 'contacts are redacted while names/capabilities remain available');
  equal(data.services, [service], 'planning, ordered repertoire, independent keys and assignments match the application shape');
  const serialized = JSON.stringify(data);
  equal(serialized.includes(privateContact), false, 'the private contact cannot appear anywhere in the response');
  equal(serialized.includes(privateAccount), false, 'the Auth email cannot appear anywhere in the response');
  equal(serialized.includes(ids.admin), false, 'Auth profile identifiers are not included');
  for (const table of protectedTables) await denied(`select * from public.${table}`);
  await denied('select public.save_public_access(false)');
  await denied('select public.save_song($1)', [songA]);
  await denied('select public.save_service($1)', [service]);
  await denied('insert into public.tags(name, color) values ($1, $2)', ['Proibida', '#552288']);
  await denied('update public.songs set title = $1 where id = $2', ['Proibida', ids.songA]);
  await denied('delete from public.services where id = $1', [ids.service]);

  await as(ids.pending);
  equal((await publicData()).people[0].email, '', 'an unapproved account may consult only the same public response');
  equal((await db.query('select count(*)::integer as n from public.songs')).rows[0].n, 0, 'public mode does not weaken private RLS for unapproved accounts');
  await as(ids.musician);
  equal((await publicData()).people[0].email, '', 'the public RPC also redacts contacts for authenticated callers');
  equal((await db.query('select email from public.people where id = $1', [ids.person])).rows[0].email,
    privateContact, 'approved team members retain the existing private data access');
  await denied('select public.save_public_access(false)');

  await as(ids.admin);
  await db.query('select public.save_public_access(false)');
  await as(null, 'anon');
  equal(await publicFlag(), false, 'an administrator can close public consultation');
  await denied('select public.read_public_ministry()');
  await as(ids.admin);
  equal((await db.query('select count(*)::integer as n from public.songs')).rows[0].n, 2, 'closing public access preserves ministry records');
  console.log(`${checks} public consultation PostgreSQL checks passed (PGlite, Auth simulated).`);
} finally {
  await db.close();
}
