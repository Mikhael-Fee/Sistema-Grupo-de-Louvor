// PostgreSQL avatar permissions with simulated Auth/Storage; no network requests.
// Storage's HTTP MIME/byte checks are represented by bucket configuration only.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite();
let checks = 0;
const origin = 'https://fxebsycpbybhzkpnxzoo.supabase.co/storage/v1/object/public/avatars/';
const ids = {
  admin: '10000000-0000-4000-a000-000000000001',
  otherAdmin: '10000000-0000-4000-a000-000000000002',
  leader: '10000000-0000-4000-a000-000000000003',
  musician: '10000000-0000-4000-a000-000000000004',
  pending: '10000000-0000-4000-a000-000000000005',
  suspendedAdmin: '10000000-0000-4000-a000-000000000006',
  person: '20000000-0000-4000-a000-000000000001',
  pendingPerson: '20000000-0000-4000-a000-000000000002',
  tag: '20000000-0000-4000-a000-000000000003',
  song: '20000000-0000-4000-a000-000000000004',
  service: '20000000-0000-4000-a000-000000000005',
  assignment: '20000000-0000-4000-a000-000000000006',
  item: '20000000-0000-4000-a000-000000000007',
};
const file = (n, extension = 'png') => `30000000-0000-4000-a000-${String(n).padStart(12, '0')}.${extension}`;
const objectName = (actor, n, extension) => `${ids[actor]}/${file(n, extension)}`;
const photoUrl = (actor, n, extension) => `${origin}${objectName(actor, n, extension)}`;
const privateContact = 'private-person@example.invalid';
const privateAccount = 'private-admin@example.invalid';

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

async function removeObject(name) {
  return (await db.query('delete from storage.objects where bucket_id = $1 and name = $2 returning name', ['avatars', name])).rows;
}

async function ownProfile(actor) {
  return (await db.query('select * from public.profiles where id = $1', [ids[actor]])).rows[0];
}

async function snapshot() {
  const result = {};
  for (const table of ['profiles', 'people', 'tags', 'songs', 'services', 'assignments', 'repertoire', 'song_tags', 'public_access']) {
    const order = table === 'song_tags' ? 'song_id, tag_id' : 'id';
    result[table] = (await db.query(`select to_jsonb(t) - 'photo_url' as record from public.${table} t order by ${order}`)).rows.map((row) => row.record);
  }
  result.auth = (await db.query('select * from auth.users order by id')).rows;
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
  for (const migration of ['001_initial.sql', '002_public_consultation.sql', '003_custom_service_types.sql']) {
    await db.exec(await readFile(new URL(`../../supabase/migrations/${migration}`, import.meta.url), 'utf8'));
  }
  for (const [actor, role, approved] of [
    ['admin', 'admin', true], ['otherAdmin', 'admin', true], ['leader', 'leader', true],
    ['musician', 'musician', true], ['pending', 'musician', false], ['suspendedAdmin', 'admin', false],
  ]) {
    await db.query('insert into auth.users(id, email, raw_user_meta_data) values ($1, $2, $3)',
      [ids[actor], actor === 'admin' ? privateAccount : `${actor}@example.invalid`, { name: actor, role: 'admin', approved: true }]);
    await db.query('update public.profiles set role = $1, approved = $2 where id = $3', [role, approved, ids[actor]]);
  }
  await as('admin');
  await db.query('insert into public.people(id, name, email, functions) values ($1, $2, $3, $4), ($5, $6, $7, $8)',
    [ids.person, 'Pessoa da escala', privateContact, ['Voz'], ids.pendingPerson, 'Pessoa vinculada', '', ['Violão']]);
  await db.query('insert into public.tags(id, name, color) values ($1, $2, $3)', [ids.tag, 'Adoração', '#552288']);
  const song = {
    id: ids.song, title: 'Canção existente', artist: 'Equipe', originalKey: 'C', churchKey: 'D',
    content: '[C]Letra existente', youtubeUrl: '', notes: 'Nota musical existente.', tagIds: [ids.tag],
  };
  const service = {
    id: ids.service, date: '2099-01-01', time: '19:00', type: 'Tema personalizado', notes: 'Ensaio existente.',
    assignments: [{ id: ids.assignment, personId: ids.person, function: 'Voz' }],
    repertoire: [{ id: ids.item, songId: ids.song, key: 'Eb', notes: 'Introdução existente.' }],
  };
  await db.query('select public.save_song($1)', [song]);
  await db.query('select public.save_service($1)', [service]);
  await db.exec('reset role');
  await db.query('update public.profiles set person_id = $1 where id = $2', [ids.pendingPerson, ids.pending]);
  const beforeMigration = await snapshot();
  await db.exec(await readFile(new URL('../../supabase/migrations/004_profile_photos.sql', import.meta.url), 'utf8'));
  equal(await snapshot(), beforeMigration, 'the photo migration preserves all existing business, profile and Auth fields');
  equal((await db.query('select photo_url from public.profiles order by id')).rows.map((row) => row.photo_url),
    Array(6).fill(''), 'all existing profiles receive an empty default photo');
  equal((await db.query('select photo_url from public.people order by id')).rows.map((row) => row.photo_url),
    ['', ''], 'all existing people receive an empty default photo');
  equal((await db.query('select id, name, public, file_size_limit, allowed_mime_types from storage.buckets')).rows,
    [{ id: 'avatars', name: 'avatars', public: true, file_size_limit: 2097152, allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'] }],
    'public Storage downloads are limited to 2 MiB and JPEG/PNG/WebP by bucket configuration');

  await as(null, 'anon');
  await denied('select * from storage.objects');
  await denied('insert into storage.objects(bucket_id, name) values ($1, $2)', ['avatars', objectName('pending', 1)]);
  await denied('select public.update_my_profile_photo($1)', [photoUrl('pending', 1)]);
  await denied('select public.can_delete_ministry_avatar($1)', [objectName('pending', 1)]);

  await as('pending');
  const initialPending = await ownProfile('pending');
  await upload('pending', 1);
  equal((await db.query('select name from storage.objects')).rows.map((row) => row.name), [objectName('pending', 1)],
    'a pending account can upload and see its own immutable object');
  await db.query('select public.update_my_profile_photo($1)', [photoUrl('pending', 1)]);
  equal(await ownProfile('pending'), { ...initialPending, photo_url: photoUrl('pending', 1) },
    'self-service photos preserve pending approval, role, name and person link');
  equal((await db.query('select count(*)::integer as n from public.people')).rows[0].n, 0,
    'a pending photo upload does not grant private team access');
  await denied('update public.profiles set role = $1, approved = true where id = $2', ['admin', ids.pending]);
  await denied('insert into storage.objects(bucket_id, name) values ($1, $2)', ['other-bucket', objectName('pending', 2)]);
  for (const name of [
    objectName('admin', 2), `${ids.pending}/${file(2, 'svg')}`, `${ids.pending}/${file(2, 'jpg')}`,
    `${ids.pending}/nested/${file(2)}`, `${ids.pending}/../${file(2)}`, `${ids.pending}/not-a-uuid.png`,
    `${ids.pending}/${file(2).toUpperCase()}`, `${ids.pending}/${file(2)}?download=true`,
  ]) {
    await denied('insert into storage.objects(bucket_id, name) values ($1, $2)', ['avatars', name]);
  }
  equal((await db.query('update storage.objects set name = $1 where name = $2 returning name',
    [objectName('pending', 2), objectName('pending', 1)])).rows, [], 'existing image objects cannot be overwritten or renamed');
  for (const url of [
    null, photoUrl('admin', 2), photoUrl('pending', 99), photoUrl('pending', 1).replace('https:', 'http:'),
    photoUrl('pending', 1).replace('fxebsycpbybhzkpnxzoo.supabase.co', 'other-project.supabase.co'),
    photoUrl('pending', 1).replace('fxebsycpbybhzkpnxzoo.supabase.co', 'fxebsycpbybhzkpnxzoo.supabase.co.evil.invalid'),
    'javascript:alert(1)', 'data:image/png;base64,aGVsbG8=', 'https://example.invalid/photo.png',
    `${photoUrl('pending', 1)}?download=true`, `${photoUrl('pending', 1)}#fragment`,
    photoUrl('pending', 1).replace('/avatars/', '/avatars/%2e%2e/'),
    photoUrl('pending', 1).replace('.png', '.svg'),
  ]) {
    await denied('select public.update_my_profile_photo($1)', [url], '23514');
  }
  equal((await ownProfile('pending')).photo_url, photoUrl('pending', 1), 'rejected image references leave the saved profile photo intact');
  equal(await removeObject(objectName('pending', 1)), [], 'an account cannot delete a file still used by its profile');
  await as('admin');
  equal(await removeObject(objectName('pending', 1)), [], 'administrators cannot delete another account\'s referenced profile photo');
  await denied('select public.update_my_profile_photo($1)', [photoUrl('pending', 1)], '23514');
  await denied('update public.profiles set photo_url = $1 where id = $2', [photoUrl('pending', 1), ids.pending]);
  equal((await ownProfile('pending')).photo_url, photoUrl('pending', 1), 'an administrator cannot target another account with the self-service RPC');
  await as('pending');
  await db.query('select public.update_my_profile_photo($1)', ['']);
  equal((await ownProfile('pending')).photo_url, '', 'self-service can clear the profile reference');
  equal((await removeObject(objectName('pending', 1))).map((row) => row.name), [objectName('pending', 1)],
    'an account can remove its old file after clearing the profile reference');
  await upload('pending', 2, 'jpeg');
  await db.query('select public.update_my_profile_photo($1)', [photoUrl('pending', 2, 'jpeg')]);

  await as('admin');
  await upload('admin', 3, 'webp');
  await db.query('select public.update_my_profile_photo($1)', [photoUrl('admin', 3, 'webp')]);
  await upload('admin', 4, 'jpeg');
  await db.query(`insert into public.people(id, name, email, functions, photo_url) values ($1, $2, $3, $4, $5)
    on conflict (id) do update set name = excluded.name, email = excluded.email, functions = excluded.functions, photo_url = excluded.photo_url`,
  [ids.person, 'Pessoa da escala', privateContact, ['Voz'], photoUrl('admin', 4, 'jpeg')]);
  equal((await db.query('select photo_url from public.people where id = $1', [ids.person])).rows[0].photo_url,
    photoUrl('admin', 4, 'jpeg'), 'an approved administrator can attach its uploaded image through the existing people upsert');
  equal(await removeObject(objectName('admin', 4, 'jpeg')), [], 'even administrators must unlink a person photo before deleting its file');
  equal(await removeObject(objectName('admin', 3, 'webp')), [], 'administrators cannot delete their own file while their profile references it');
  await denied('insert into storage.objects(bucket_id, name) values ($1, $2)', ['avatars', objectName('pending', 3)]);
  await denied('update public.people set photo_url = $1 where id = $2', [photoUrl('admin', 99), ids.person], '23514');
  await denied('update public.people set photo_url = $1 where id = $2', [photoUrl('pending', 2, 'jpeg'), ids.person]);
  for (const url of ['https://example.invalid/photo.png', photoUrl('admin', 4, 'jpeg').replace('https:', 'http:'), `${photoUrl('admin', 4, 'jpeg')}?token=secret`]) {
    await denied('update public.people set photo_url = $1 where id = $2', [url, ids.person], '23514');
  }

  for (const actor of ['leader', 'musician', 'pending', 'suspendedAdmin']) {
    await as(actor);
    await upload(actor, 5, actor === 'musician' ? 'webp' : 'png');
    const beforeSelfPhoto = await ownProfile(actor);
    await db.query('select public.update_my_profile_photo($1)', [photoUrl(actor, 5, actor === 'musician' ? 'webp' : 'png')]);
    equal(await ownProfile(actor), { ...beforeSelfPhoto, photo_url: photoUrl(actor, 5, actor === 'musician' ? 'webp' : 'png') },
      `${actor} can set only its own picture without changing profile permissions`);
    equal((await db.query('update public.people set photo_url = $1 where id = $2 returning id',
      [photoUrl(actor, 5, actor === 'musician' ? 'webp' : 'png'), ids.person])).rows, [],
    `${actor} cannot change an existing person's photo`);
    await denied('insert into public.people(name, functions, photo_url) values ($1, $2, $3)',
      ['Proibida', ['Voz'], photoUrl(actor, 5, actor === 'musician' ? 'webp' : 'png')]);
  }
  await as('otherAdmin');
  await denied('insert into public.people(name, functions, photo_url) values ($1, $2, $3)',
    ['Outra pessoa', ['Voz'], photoUrl('admin', 4, 'jpeg')]);
  await denied('update public.people set photo_url = $1 where id = $2', [photoUrl('admin', 4, 'jpeg'), ids.pendingPerson]);
  equal((await db.query(`insert into public.people(id, name, email, functions, photo_url) values ($1, $2, $3, $4, $5)
    on conflict (id) do update set name = excluded.name, email = excluded.email, functions = excluded.functions, photo_url = excluded.photo_url returning photo_url`,
  [ids.person, 'Pessoa da escala', privateContact, ['Voz'], photoUrl('admin', 4, 'jpeg')])).rows,
  [{ photo_url: photoUrl('admin', 4, 'jpeg') }], 'another approved administrator can edit a person while preserving an existing photo from the previous administrator');
  await upload('otherAdmin', 6);
  await as('admin');
  equal((await removeObject(objectName('otherAdmin', 6))).map((row) => row.name), [objectName('otherAdmin', 6)],
    'an approved administrator can clean up an unreferenced image uploaded by another administrator');
  await upload('admin', 7);
  await db.query('update public.people set photo_url = $1 where id = $2', [photoUrl('admin', 7), ids.person]);
  equal((await removeObject(objectName('admin', 4, 'jpeg'))).map((row) => row.name), [objectName('admin', 4, 'jpeg')],
    'replacing a person photo permits cleanup of the old image only after saving the replacement');

  const beforeLegacyEdit = await ownProfile('pending');
  await db.query('select public.update_profile($1)', [{
    id: ids.pending, name: 'Nome atualizado', role: 'musician', approved: false, personId: ids.pendingPerson,
    photoUrl: photoUrl('admin', 7),
  }]);
  equal(await ownProfile('pending'), { ...beforeLegacyEdit, name: 'Nome atualizado' },
    'the existing administrative profile RPC preserves photos and ignores injected photo fields');
  await db.query('select public.update_profile($1)', [{ id: ids.otherAdmin, name: 'otherAdmin', role: 'admin', approved: false }]);
  await denied('select public.update_profile($1)', [{ id: ids.admin, name: 'admin', role: 'musician', approved: true }], '23514');
  equal((await ownProfile('admin')).photo_url, photoUrl('admin', 3, 'webp'), 'last-administrator protection still preserves the profile photo');
  await db.query('select public.save_public_access(true)');
  await as(null, 'anon');
  const data = (await db.query('select public.read_public_ministry() as data')).rows[0].data;
  equal(Object.keys(data).sort(), ['people', 'services', 'songs', 'tags'], 'the public payload still excludes accounts and profiles');
  equal(data.people, [
    { id: ids.person, name: 'Pessoa da escala', email: '', functions: ['Voz'], photoUrl: photoUrl('admin', 7) },
    { id: ids.pendingPerson, name: 'Pessoa vinculada', email: '', functions: ['Violão'], photoUrl: '' },
  ], 'public consultation includes only permitted person photos and always redacts contacts');
  equal(data.songs, [song], 'adding photos preserves existing public song data');
  equal(data.services, [service], 'adding photos preserves custom service themes, planning and ordered repertoire');
  equal(JSON.stringify(data).includes(privateContact), false, 'person contacts remain absent from every public field');
  equal(JSON.stringify(data).includes(privateAccount), false, 'Auth contacts remain absent from every public field');
  equal(JSON.stringify(data).includes(photoUrl('pending', 5)), false, 'private account profile pictures are not exported through public team consultation');
  await denied('select * from public.profiles');
  await denied('select * from storage.objects');
  await denied('delete from storage.objects where name = $1', [objectName('admin', 7)]);
  console.log(`${checks} profile photo PostgreSQL checks passed (PGlite; Auth/Storage simulated, MIME/size configuration only).`);
} finally {
  await db.close();
}
