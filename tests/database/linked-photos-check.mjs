// Linked account photos under PostgreSQL permissions; Auth/Storage are simulated.
// Public avatar URLs contain their permitted storage path, never account metadata.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite();
let checks = 0;
const origin = 'https://fxebsycpbybhzkpnxzoo.supabase.co/storage/v1/object/public/avatars/';
const ids = {
  admin: '51000000-0000-4000-a000-000000000001',
  otherAdmin: '51000000-0000-4000-a000-000000000002',
  leader: '51000000-0000-4000-a000-000000000003',
  musician: '51000000-0000-4000-a000-000000000004',
  pending: '51000000-0000-4000-a000-000000000005',
  suspended: '51000000-0000-4000-a000-000000000006',
  explicitPerson: '52000000-0000-4000-a000-000000000001',
  fallbackPerson: '52000000-0000-4000-a000-000000000002',
  pendingPerson: '52000000-0000-4000-a000-000000000003',
  suspendedPerson: '52000000-0000-4000-a000-000000000004',
  emptyPerson: '52000000-0000-4000-a000-000000000005',
  song: '52000000-0000-4000-a000-000000000006',
  service: '52000000-0000-4000-a000-000000000007',
  assignment: '52000000-0000-4000-a000-000000000008',
  item: '52000000-0000-4000-a000-000000000009',
};
const actors = [
  { key: 'admin', role: 'admin', approved: true, personId: ids.explicitPerson },
  { key: 'otherAdmin', role: 'admin', approved: true, personId: ids.emptyPerson },
  { key: 'leader', role: 'leader', approved: true, personId: null },
  { key: 'musician', role: 'musician', approved: true, personId: ids.fallbackPerson },
  { key: 'pending', role: 'musician', approved: false, personId: ids.pendingPerson },
  { key: 'suspended', role: 'admin', approved: false, personId: ids.suspendedPerson },
];
const file = (n, extension = 'png') => `53000000-0000-4000-a000-${String(n).padStart(12, '0')}.${extension}`;
const objectName = (actor, n, extension) => `${ids[actor]}/${file(n, extension)}`;
const photoUrl = (actor, n, extension) => `${origin}${objectName(actor, n, extension)}`;
const accountName = (actor) => `Conta privada ${actor}`;
const accountEmail = (actor) => `private-account-${actor}@example.invalid`;
const personEmail = 'private-person@example.invalid';

async function as(actor, role = 'authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [actor ? ids[actor] : '']);
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

async function upload(actor, n, extension = 'png') {
  await db.query('insert into storage.objects(bucket_id, name, owner_id) values ($1, $2, $3)',
    ['avatars', objectName(actor, n, extension), ids[actor]]);
}

async function linkedPhotos() {
  const result = (await db.query('select public.read_team_profile_photos() as photos')).rows[0].photos;
  return result.toSorted((a, b) => a.personId.localeCompare(b.personId));
}

async function publicData() {
  return (await db.query('select public.read_public_ministry() as data')).rows[0].data;
}

async function peopleRows() {
  return (await db.query('select * from public.people order by id')).rows;
}

async function ownProfile(actor) {
  return (await db.query('select * from public.profiles where id = $1', [ids[actor]])).rows[0];
}

async function updateProfile(actor, overrides = {}) {
  const original = actors.find((entry) => entry.key === actor);
  await db.query('select public.update_profile($1)', [{
    id: ids[actor], name: accountName(actor), role: original.role,
    approved: original.approved, personId: original.personId, ...overrides,
  }]);
}

async function snapshot() {
  const result = {};
  for (const table of ['profiles', 'people', 'tags', 'songs', 'services', 'assignments', 'repertoire', 'song_tags', 'public_access']) {
    const order = table === 'song_tags' ? 'song_id, tag_id' : 'id';
    result[table] = (await db.query(`select * from public.${table} order by ${order}`)).rows;
  }
  result.auth = (await db.query('select * from auth.users order by id')).rows;
  result.buckets = (await db.query('select * from storage.buckets order by id')).rows;
  result.objects = (await db.query('select * from storage.objects order by name')).rows;
  return result;
}

try {
  await db.exec(await readFile(new URL('./auth-stub.sql', import.meta.url), 'utf8'));
  await db.exec(`
    create schema storage;
    create table storage.buckets (
      id text primary key, name text not null, public boolean not null default false,
      file_size_limit bigint, allowed_mime_types text[]
    );
    create table storage.objects (
      id uuid primary key default gen_random_uuid(), bucket_id text not null references storage.buckets(id),
      name text not null, owner_id text, unique(bucket_id, name)
    );
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated;
    grant select, insert, update, delete on storage.objects to authenticated;
  `);
  for (const migration of ['001_initial.sql', '002_public_consultation.sql', '003_custom_service_types.sql', '004_profile_photos.sql']) {
    await db.exec(await readFile(new URL(`../../supabase/migrations/${migration}`, import.meta.url), 'utf8'));
  }
  for (const actor of actors) {
    await db.query('insert into auth.users(id, email, raw_user_meta_data) values ($1, $2, $3)',
      [ids[actor.key], accountEmail(actor.key), { name: accountName(actor.key) }]);
    await db.query('update public.profiles set role = $1, approved = $2 where id = $3', [actor.role, actor.approved, ids[actor.key]]);
  }
  for (const { key } of actors.filter((actor) => actor.key !== 'otherAdmin')) {
    await as(key);
    await upload(key, 1);
    await db.query('select public.update_my_profile_photo($1)', [photoUrl(key, 1)]);
  }
  await as('admin');
  await upload('admin', 2, 'jpeg');
  const people = [
    { id: ids.explicitPerson, name: 'A foto escolhida', email: personEmail, functions: ['Voz'], photoUrl: photoUrl('admin', 2, 'jpeg') },
    { id: ids.fallbackPerson, name: 'B foto vinculada', email: '', functions: ['Violão'], photoUrl: '' },
    { id: ids.pendingPerson, name: 'C conta pendente', email: '', functions: ['Voz'], photoUrl: '' },
    { id: ids.suspendedPerson, name: 'D conta suspensa', email: '', functions: ['Bateria'], photoUrl: '' },
    { id: ids.emptyPerson, name: 'E sem foto na conta', email: '', functions: ['Teclado'], photoUrl: '' },
  ];
  for (const person of people) {
    await db.query('insert into public.people(id, name, email, functions, photo_url) values ($1, $2, $3, $4, $5)',
      [person.id, person.name, person.email, person.functions, person.photoUrl]);
  }
  for (const { key } of actors) await updateProfile(key);
  const song = {
    id: ids.song, title: 'Canção preservada', artist: 'Ministério', originalKey: 'C', churchKey: 'D',
    content: '[C]Letra preservada', youtubeUrl: '', notes: 'Nota musical preservada.', tagIds: [],
  };
  const service = {
    id: ids.service, date: '2099-01-01', time: '19:00', type: 'Tema preservado', notes: 'Ensaio preservado.',
    assignments: [{ id: ids.assignment, personId: ids.explicitPerson, function: 'Voz' }],
    repertoire: [{ id: ids.item, songId: ids.song, key: 'Eb', notes: 'Introdução preservada.' }],
  };
  await db.query('select public.save_song($1)', [song]);
  await db.query('select public.save_service($1)', [service]);
  await db.exec('reset role');
  const beforeMigration = await snapshot();
  await db.exec(await readFile(new URL('../../supabase/migrations/005_linked_profile_photos.sql', import.meta.url), 'utf8'));
  equal(await snapshot(), beforeMigration, 'the linked-photo migration preserves business rows, photos, account records and Storage');

  const expectedLinked = [
    { personId: ids.explicitPerson, photoUrl: photoUrl('admin', 1) },
    { personId: ids.fallbackPerson, photoUrl: photoUrl('musician', 1) },
  ];
  for (const actor of ['admin', 'leader', 'musician']) {
    await as(actor);
    equal(await linkedPhotos(), expectedLinked, `${actor} receives only approved, linked, nonempty account photos and person IDs`);
  }
  for (const actor of ['pending', 'suspended']) {
    await as(actor);
    await denied('select public.read_team_profile_photos()');
  }
  await as(null, 'anon');
  await denied('select public.read_team_profile_photos()');
  await denied('select * from public.profiles');
  await denied('select public.read_public_ministry()');

  for (const actor of ['leader', 'musician', 'pending']) {
    await as(actor);
    equal((await db.query('select id from public.profiles')).rows, [{ id: ids[actor] }],
      `${actor} still sees only its own profile through the original RLS`);
  }
  await as('musician');
  await denied('update public.profiles set role = $1, approved = true where id = $2', ['admin', ids.musician]);
  await denied('select public.update_profile($1)', [{ id: ids.musician, name: accountName('musician'), role: 'admin', approved: true }]);
  equal((await db.query('update public.people set name = $1 where id = $2 returning id', ['Forbidden', ids.fallbackPerson])).rows,
    [], 'reading linked photos grants no team-write permission');
  await as('admin');
  await denied('update public.profiles set photo_url = $1 where id = $2', ['', ids.musician]);
  await db.query('select public.save_public_access(true)');
  await as(null, 'anon');
  const publicPayload = await publicData();
  const expectedPublicPeople = people.map((person) => ({
    ...person, email: '', accountPhotoUrl: person.id === ids.explicitPerson ? photoUrl('admin', 1)
      : person.id === ids.fallbackPerson ? photoUrl('musician', 1) : '',
  }));
  equal(publicPayload.people, expectedPublicPeople,
    'public people retain explicit photos and expose a separate approved-account fallback; pending, suspended and empty photos are omitted');
  equal({ songs: publicPayload.songs, services: publicPayload.services }, { songs: [song], services: [service] },
    'public songs, custom service themes, assignments and repertoire remain unchanged');
  equal(Object.keys(publicPayload).sort(), ['people', 'services', 'songs', 'tags'], 'public consultation exports no account collection');
  const withoutPhotoPaths = JSON.stringify({
    ...publicPayload, people: publicPayload.people.map(({ photoUrl, accountPhotoUrl, ...person }) => person),
  });
  equal([personEmail, ...actors.flatMap(({ key }) => [accountEmail(key), accountName(key), ids[key]])]
    .some((privateValue) => withoutPhotoPaths.includes(privateValue)), false,
  'public data redacts person contacts and excludes account IDs, account names and Auth contacts outside the authorized avatar paths');

  await as('musician');
  const beforeSelfUpdate = await ownProfile('musician');
  await upload('musician', 3, 'webp');
  await db.query('select public.update_my_profile_photo($1)', [photoUrl('musician', 3, 'webp')]);
  equal(await ownProfile('musician'), { ...beforeSelfUpdate, photo_url: photoUrl('musician', 3, 'webp') },
    'changing a linked account photo preserves its role, approval, name and person link');
  await as('admin');
  equal(await peopleRows(), beforeMigration.people, 'linking and changing account photos never copy or change raw person records');
  equal(await linkedPhotos(), [expectedLinked[0], { personId: ids.fallbackPerson, photoUrl: photoUrl('musician', 3, 'webp') }],
    'approved readers receive a changed linked photo on their next query');
  await as(null, 'anon');
  equal((await publicData()).people.find((person) => person.id === ids.fallbackPerson).accountPhotoUrl,
    photoUrl('musician', 3, 'webp'), 'public consultation reads the current linked photo without a stale copied value');

  await as('admin');
  const leaderBeforeFailedLink = await ownProfile('leader');
  await denied('select public.update_profile($1)', [{
    id: ids.leader, name: 'Must roll back', role: 'musician', approved: false, personId: ids.fallbackPerson,
  }], '23505');
  equal(await ownProfile('leader'), leaderBeforeFailedLink,
    'linking an occupied person keeps the existing UNIQUE constraint and rolls back all target profile changes');
  await updateProfile('musician', { approved: false });
  equal(await linkedPhotos(), [expectedLinked[0]], 'revoking approval hides the linked photo from subsequent member queries');
  await as(null, 'anon');
  equal((await publicData()).people.find((person) => person.id === ids.fallbackPerson).accountPhotoUrl, '',
    'revoking approval also hides the fallback from subsequent public queries');
  await as('admin');
  await updateProfile('musician', { approved: true, personId: null });
  equal(await linkedPhotos(), [expectedLinked[0]], 'removing a person link hides an approved account photo from the member RPC');
  await as(null, 'anon');
  equal((await publicData()).people.find((person) => person.id === ids.fallbackPerson).accountPhotoUrl, '',
    'removing a person link also hides the fallback from public consultation');
  await as('admin');
  await updateProfile('otherAdmin', { approved: false });
  await denied('select public.update_profile($1)', [{
    id: ids.admin, name: accountName('admin'), role: 'musician', approved: true, personId: ids.explicitPerson,
  }], '23514');
  equal({ role: (await ownProfile('admin')).role, approved: (await ownProfile('admin')).approved },
    { role: 'admin', approved: true }, 'the linked-photo migration keeps last-administrator protection');
  console.log(`${checks} linked profile photo PostgreSQL checks passed (PGlite; Auth/Storage simulated).`);
} finally {
  await db.close();
}
