// Migration007 in PostgreSQL. Auth/Storage are simulated; no production/network.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';

const db = new PGlite();
let checks = 0;
const uuid = n => `71000000-0000-4000-a000-${String(n).padStart(12, '0')}`;
const ids = { admin: uuid(1), leader: uuid(2), musician: uuid(3), pending: uuid(4), suspended: uuid(5),
  person: uuid(11), tag: uuid(12), song: uuid(13), otherSong: uuid(14), service: uuid(15),
  assignment: uuid(16), item: uuid(17), otherItem: uuid(18), photo: uuid(19) };
const originalVideo = 'https://www.youtube.com/watch?v=AbCdEfG_123';
const alternateVideo = 'https://youtu.be/QwErTyU_456';
const photo = `https://fxebsycpbybhzkpnxzoo.supabase.co/storage/v1/object/public/avatars/${ids.admin}/${ids.photo}.png`;
const song = { id: ids.song, title: 'Música que já existe', artist: 'Equipe Candeia', originalKey: 'G', churchKey: 'D',
  content: '[G]Letra preservada', youtubeUrl: originalVideo, notes: 'Nota da biblioteca', tagIds: [ids.tag] };
const service = { id: ids.service, date: '2099-02-28', time: '19:30', type: 'Santa Ceia', notes: 'Observação preservada',
  assignments: [{ id: ids.assignment, personId: ids.person, function: 'Voz' }],
  repertoire: [{ id: ids.item, songId: ids.song, key: 'D', notes: 'Versão ao vivo' },
    { id: ids.otherItem, songId: ids.otherSong, key: 'G', notes: 'Final' }] };

function equal(actual, expected, description) { assert.deepEqual(actual, expected, description); checks++; }
async function denied(sql, params = [], code = '42501', batch = false) {
  let failure;
  try { if (batch) await db.exec(sql); else await db.query(sql, params); } catch (cause) { failure = cause; }
  assert.ok(failure, `Operation must be rejected: ${sql}`);
  assert.equal(failure.code, code, failure.message); checks++;
}
async function as(actor, role = 'authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor ? ids[actor] : '']);
  await db.exec(`set role ${role}`);
}
async function snapshot({ previousColumns = false } = {}) {
  const role = (await db.query('select current_user as role')).rows[0].role;
  await db.exec('reset role');
  try {
  const result = {};
  for (const table of ['profiles', 'people', 'tags', 'songs', 'song_tags', 'services', 'assignments', 'repertoire', 'public_access']) {
    const omit = previousColumns && table === 'people' ? " - 'active'" : '';
    result[table] = (await db.query(`select to_jsonb(t)${omit} as record from public.${table} t
      order by to_jsonb(t)::text`)).rows.map(row => row.record);
  }
  for (const table of ['auth.users', 'storage.buckets', 'storage.objects']) {
    result[table] = (await db.query(`select to_jsonb(t) as record from ${table} t order by to_jsonb(t)::text`)).rows.map(row => row.record);
  }
  return result;
  } finally { if (['authenticated', 'anon'].includes(role)) await db.exec(`set role ${role}`); }
}

try {
  await db.exec(await readFile(new URL('./auth-stub.sql', import.meta.url), 'utf8'));
  await db.exec(`create schema storage;
    create table storage.buckets(id text primary key, name text not null, public boolean not null default false,
      file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text not null references storage.buckets(id),
      name text not null, owner_id text, unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon,authenticated;
    grant select,insert,update,delete on storage.objects to authenticated;`);
  for (const migration of ['001_initial.sql', '002_public_consultation.sql', '003_custom_service_types.sql', '004_profile_photos.sql', '005_linked_profile_photos.sql', '006_calendar_videos_private_access.sql']) {
    await db.exec(await readFile(new URL(`../../supabase/migrations/${migration}`, import.meta.url), 'utf8'));
  }
  for (const [actor, role, approved] of [['admin','admin',true], ['leader','leader',true], ['musician','musician',true], ['pending','musician',false], ['suspended','admin',false]]) {
    await db.query('insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values($1,$2,$3,now())',
      [ids[actor], `${actor}@private.invalid`, { name: actor }]);
    await db.query('update public.profiles set role=$1,approved=$2 where id=$3', [role, approved, ids[actor]]);
  }
  await as('admin');
  await db.query('insert into public.tags(id,name,color) values($1,$2,$3)', [ids.tag, 'Etiqueta preservada', '#b5521a']);
  await db.query('insert into public.people(id,name,email,functions) values($1,$2,$3,$4)', [ids.person, 'Pessoa preservada', 'person@private.invalid', ['Voz']]);
  await db.query('insert into storage.objects(bucket_id,name,owner_id) values($1,$2,$3)', ['avatars', `${ids.admin}/${ids.photo}.png`, ids.admin]);
  await db.query('select public.update_my_profile_photo($1)', [photo]);
  await db.query('select public.update_profile($1)', [{ id: ids.admin, name: 'Admin preservado', role: 'admin', approved: true, personId: ids.person }]);
  await db.query('update public.people set photo_url=$1 where id=$2', [photo, ids.person]);
  await db.query('select public.save_song($1)', [song]);
  await db.query('select public.save_song($1)', [{ ...song, id: ids.otherSong, title: 'Outra música preservada' }]);
  await db.query('select public.save_service($1)', [service]);
  await db.exec('reset role');
  const before = await snapshot({ previousColumns: true });
  const migration = await readFile(new URL('../../supabase/migrations/007_archive_team_people.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  equal(await snapshot({ previousColumns: true }), before, '007 preserves all existing columns, account links and Storage');
  equal((await db.query('select active from public.people')).rows, [{ active: true }], 'every existing person starts active');

  const helper = await readFile(new URL('../../scripts/configure-archived-people.mjs', import.meta.url), 'utf8');
  const match = helper.match(/const \[state\] = await query\(`(select[\s\S]*?)`\);/);
  assert.ok(match, 'real helper inspection SQL present');
  const beforeInspection = (await db.query(match[1])).rows[0];
  for (const field of ['rls_tables','photo_columns','event_column','video_column','active_column']) {
    equal(beforeInspection[field], field === 'rls_tables' ? 9 : field === 'photo_columns' ? 2 : 1, `${field} inspected`);
  }
  for (const field of ['status_rpc_guarded','person_rpc_guarded','inactive_assignment_guarded','save_service_preserves_history','status_rpc_grants',
    'public_disabled','no_anonymous_table_read','no_direct_profile_write','linked_photos_guarded','public_data_closed']) {
    equal(beforeInspection[field], true, `${field} inspected`);
  }
  await as(null, 'anon');
  for (const sql of ['select public.set_person_active($1,false)','select public.save_person($1)']) {
    await denied(sql, [sql.includes('save_person') ? { id: ids.person, name: 'Changed', functions: ['Voz'] } : ids.person]);
  }
  await denied('select * from public.people');
  for (const actor of ['leader','musician','pending','suspended']) {
    await as(actor);
    await denied('select public.set_person_active($1,false)', [ids.person]);
    await denied('select public.save_person($1)', [{ id: ids.person, name: 'Changed', functions: ['Voz'] }]);
  }
  await as('admin');
  await denied('select public.set_person_active($1,null)', [ids.person], '22023');
  await denied('select public.set_person_active($1,false)', [uuid(999)], 'P0002');
  for (const functions of [null, 'Voz', {}, [1], [null]]) {
    await denied('select public.save_person($1)', [{ id: ids.person, name: 'Inválido', functions }], '22023');
  }
  const allBeforeArchive = await snapshot();
  await db.query('select public.set_person_active($1,false)', [ids.person]);
  const allAfterArchive = await snapshot();
  const expected = structuredClone(allBeforeArchive);
  expected.people[0].active = false;
  equal(allAfterArchive, expected, 'archive changes exactly one active flag, keeps assignments, profile link, Auth and images');
  await db.query('select public.set_person_active($1,false)', [ids.person]);
  equal(await snapshot(), allAfterArchive, 'archive is idempotent');
  await denied('delete from public.people where id=$1', [ids.person], '23503');
  await db.query('select public.save_person($1)', [{ id: ids.person, name: 'Pessoa editada', email: 'person@private.invalid', functions: ['Voz'] }]);
  equal((await db.query('select name,active,photo_url from public.people where id=$1', [ids.person])).rows,
    [{ name: 'Pessoa editada', active: false, photo_url: photo }], 'omitted active and photo fields preserve both');
  await db.query('select public.save_person($1)', [{ id: ids.person, name: 'Pessoa editada', email: 'person@private.invalid', functions: ['Voz'], active: true }]);
  equal((await db.query('select active from public.people')).rows, [{ active: false }], 'even a stale editor with active:true cannot revive archived person');
  await db.query(`insert into public.people(id,name,email,functions) values($1,$2,$3,$4)
    on conflict(id) do update set name=excluded.name,email=excluded.email,functions=excluded.functions`,
    [ids.person, 'Pessoa editada', 'person@private.invalid', ['Voz']]);
  equal((await db.query('select active,photo_url from public.people')).rows, [{ active: false, photo_url: photo }], 'legacy column-specific upsert preserves status and photo');
  await denied('select public.save_person($1)', [{ id: ids.person, name: 'Inválido', functions: ['Teclado'] }], '23514');
  equal((await db.query('select public.read_team_profile_photos() as photos')).rows[0].photos,
    [{ personId: ids.person, photoUrl: photo }], 'archived account photo remains available to historical scales');
  await as('musician');
  equal((await db.query('select id,active from public.people')).rows, [{ id: ids.person, active: false }], 'approved readers retain archived identity for historical services');
  equal((await db.query('select person_id from public.assignments')).rows, [{ person_id: ids.person }], 'historical assignment readable');
  await as('leader');
  const retained = { ...service, isEvent: true, notes: 'Culto editado, histórico mantido', repertoire: service.repertoire.map(item => ({ ...item, youtubeUrl: alternateVideo })) };
  await db.query('select public.save_service($1)', [retained]);
  equal((await db.query('select id,person_id,function,position from public.assignments')).rows,
    [{ id: ids.assignment, person_id: ids.person, function: 'Voz', position: 0 }], 'leaders can edit an existing service without losing its archived assignment');
  const beforeInvalid = await snapshot();
  await denied('select public.save_service($1)', [{ ...retained, id: uuid(200), assignments: [{ ...service.assignments[0], id: uuid(201) }] }], '23514');
  await denied('select public.save_service($1)', [{ ...retained, assignments: [{ ...service.assignments[0], id: uuid(202) }] }], '23514');
  await denied('insert into public.assignments(id,service_id,person_id,function,position) values($1,$2,$3,$4,1)', [uuid(203), ids.service, ids.person, 'Voz'], '23514');
  await denied('update public.assignments set id=$1 where id=$2', [uuid(204), ids.assignment], '23514');
  equal(await snapshot(), beforeInvalid, 'every rejected inactive assignment rolls back all service and repertoire edits');
  await as('admin');
  const second = { id: uuid(31), name: 'Pessoa ativa', email: '', functions: ['Teclado'] };
  await db.query('select public.save_person($1)', [second]);
  equal((await db.query('select active,photo_url from public.people where id=$1', [second.id])).rows, [{ active: true, photo_url: '' }], 'new person defaults to active with no photo');
  const extraAssignment = { id: uuid(32), personId: second.id, function: 'Teclado' };
  await db.query('select public.save_service($1)', [{ ...retained, assignments: [...retained.assignments, extraAssignment] }]);
  const reordered = { ...retained, assignments: [extraAssignment, ...retained.assignments] };
  await db.query('select public.save_service($1)', [reordered]);
  equal((await db.query('select id,position from public.assignments order by position')).rows,
    [{ id: extraAssignment.id, position: 0 }, { id: ids.assignment, position: 1 }], 'reordering keeps archived link identity and contiguous positions');
  await denied('select public.save_service($1)', [{ ...reordered, assignments: [...reordered.assignments, extraAssignment] }], '23505');
  await db.query('select public.set_person_active($1,true)', [ids.person]);
  await db.query('select public.set_person_active($1,true)', [ids.person]);
  equal((await db.query('select active from public.people where id=$1', [ids.person])).rows, [{ active: true }], 'restoring is explicit and idempotent');
  await db.query('select public.save_service($1)', [{ ...retained, id: uuid(205), assignments: [{ ...service.assignments[0], id: uuid(206) }],
    repertoire: retained.repertoire.map((item, index) => ({ ...item, id: uuid(210 + index) })) }]);
  equal((await db.query('select count(*)::integer as n from public.assignments where person_id=$1', [ids.person])).rows[0].n, 2, 'restored person can receive new assignments');
  await db.query('select public.set_person_active($1,false)', [ids.person]);
  await db.exec('reset role');
  const beforeRepeat = await snapshot();
  await db.exec(migration);
  equal(await snapshot(), beforeRepeat, 'reapplying007 changes no rows and never reactivates people');
  equal((await db.query(match[1])).rows[0], beforeInspection, 'helper still recognizes installed007');
  const calendarHelper = await readFile(new URL('../../scripts/configure-calendar-videos.mjs', import.meta.url), 'utf8');
  const calendarInspect = calendarHelper.match(/const \[state\] = await query\(`(select[\s\S]*?)`\);/);
  const calendarInstalled = calendarHelper.match(/function installed\(state\) \{([\s\S]*?)\n\}/);
  assert.ok(calendarInspect && calendarInstalled, 'previous helper inspection and predicate present');
  const calendarState = (await db.query(calendarInspect[1])).rows[0];
  equal(runInNewContext(`state => {${calendarInstalled[1]}}`, Object.create(null))(calendarState), true,
    '006 helper recognizes compatibility and will not reinstall the old assignment writer');

  const snapshotSource = helper.match(/const oldColumnSnapshot = [\s\S]*?\n\ntry \{/);
  assert.ok(snapshotSource, 'helper snapshot SQL present');
  const snapshotSql = runInNewContext(`${snapshotSource[0].replace(/\n\ntry \{$/, '')}\noldColumnSnapshot;`, Object.create(null));
  const wrappedSource = helper.match(/await query\(`(begin;[\s\S]*?commit;)`\);/);
  assert.ok(wrappedSource, 'helper transaction present');
  const wrappedSql = runInNewContext('`' + wrappedSource[1] + '`', {
    oldColumnSnapshot: snapshotSql, migration: migration.replace(/^begin;$/m, '').replace(/^commit;$/m, ''),
  });
  await db.exec(wrappedSql);
  equal(await snapshot(), beforeRepeat, 'actual helper transaction validates preservation of every old value');
  const badWrappedSql = runInNewContext('`' + wrappedSource[1] + '`', {
    oldColumnSnapshot: snapshotSql, migration: `update public.repertoire set youtube_url='' where youtube_url<>'';`,
  });
  await denied(badWrappedSql, [], 'P0001', true);
  await db.exec('rollback');
  equal(await snapshot(), beforeRepeat, 'hash guard detects and rolls back accidental old video modification');
  console.log(`${checks} archived-team PostgreSQL checks passed (PGlite; Auth/Storage simulated, zero network writes).`);
} finally { await db.close(); }
