// Migration 008 in PostgreSQL (PGlite). Auth/Storage are simulated; no production/network.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite();
let checks = 0;
const uuid = n => `81000000-0000-4000-a000-${String(n).padStart(12, '0')}`;
const ids = { admin: uuid(1), leader: uuid(2), musician: uuid(3), other: uuid(4), pending: uuid(5),
  person: uuid(11), otherPerson: uuid(12), song: uuid(13), service: uuid(15), assignment: uuid(16), otherAssignment: uuid(17), item: uuid(18) };
const today = new Date().toISOString().slice(0, 10);
const future = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
const service = { id: ids.service, date: '2099-02-28', time: '19:30', type: 'Santa Ceia', notes: '', isEvent: false,
  assignments: [{ id: ids.assignment, personId: ids.person, function: 'Voz' }, { id: ids.otherAssignment, personId: ids.otherPerson, function: 'Voz' }],
  repertoire: [{ id: ids.item, songId: ids.song, key: 'D', notes: '' }] };

function equal(actual, expected, description) { assert.deepEqual(actual, expected, description); checks++; }
async function denied(sql, params = [], code = '42501') {
  let failure;
  try { await db.query(sql, params); } catch (cause) { failure = cause; }
  assert.ok(failure, `Operation must be rejected: ${sql}`);
  assert.equal(failure.code, code, failure.message); checks++;
}
async function as(actor, role = 'authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor ? ids[actor] : '']);
  await db.exec(`set role ${role}`);
}
const statuses = async () => (await db.query('select id,status,status_note from public.assignments order by id')).rows;

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
  for (const migration of ['001_initial.sql', '002_public_consultation.sql', '003_custom_service_types.sql', '004_profile_photos.sql',
    '005_linked_profile_photos.sql', '006_calendar_videos_private_access.sql', '007_archive_team_people.sql']) {
    await db.exec(await readFile(new URL(`../../supabase/migrations/${migration}`, import.meta.url), 'utf8'));
  }
  for (const [actor, role, approved] of [['admin','admin',true], ['leader','leader',true], ['musician','musician',true], ['other','musician',true], ['pending','musician',false]]) {
    await db.query('insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values($1,$2,$3,now())', [ids[actor], `${actor}@private.invalid`, { name: actor }]);
    await db.query('update public.profiles set role=$1,approved=$2 where id=$3', [role, approved, ids[actor]]);
  }
  await as('admin');
  await db.query('insert into public.people(id,name,email,functions) values($1,$2,$3,$4),($5,$6,$7,$8)',
    [ids.person, 'Musicista', '', ['Voz', 'Teclado'], ids.otherPerson, 'Outra pessoa', '', ['Voz']]);
  await db.query('select public.update_profile($1)', [{ id: ids.musician, name: 'musician', role: 'musician', approved: true, personId: ids.person }]);
  await db.query('select public.save_song($1)', [{ id: ids.song, title: 'Canção', artist: 'Equipe', originalKey: 'D', churchKey: 'D', content: '[D]Luz', youtubeUrl: '', notes: '', tagIds: [] }]);
  await db.query('select public.save_service($1)', [service]);
  await db.exec('reset role');
  const before = (await db.query('select id,service_id,person_id,function,position from public.assignments order by id')).rows;
  await db.exec(await readFile(new URL('../../supabase/migrations/008_presence_and_unavailability.sql', import.meta.url), 'utf8'));
  equal((await db.query('select id,service_id,person_id,function,position from public.assignments order by id')).rows, before, '008 keeps every assignment');
  equal((await statuses()).map(row => row.status), ['pending', 'pending'], 'existing assignments start pending');

  // Presence confirmation.
  await as('musician');
  await db.query('select public.respond_assignment($1,$2,$3)', [ids.assignment, 'confirmed', ' ok ']);
  equal((await statuses())[0], { id: ids.assignment, status: 'confirmed', status_note: 'ok' }, 'member confirms own assignment');
  await denied('select public.respond_assignment($1,$2)', [ids.otherAssignment, 'declined']);
  await denied('select public.respond_assignment($1,$2)', [ids.assignment, 'talvez'], '22023');
  await denied('select public.respond_assignment($1,$2)', [uuid(999), 'confirmed'], 'P0002');
  await db.query('update public.assignments set status=$1 where id=$2', ['declined', ids.otherAssignment]);
  equal((await statuses())[1].status, 'pending', 'direct table writes by members change nothing (row security)');
  for (const actor of ['other', 'pending']) { await as(actor); await denied('select public.respond_assignment($1,$2)', [ids.assignment, 'declined']); }
  await as(null, 'anon');
  await denied('select public.respond_assignment($1,$2)', [ids.assignment, 'declined']);
  await as('leader');
  await db.query('select public.respond_assignment($1,$2,$3)', [ids.otherAssignment, 'declined', 'Viagem']);
  equal((await statuses())[1].status, 'declined', 'leader records an answer for anyone');
  await db.query('select public.save_service($1)', [{ ...service, notes: 'Editado' }]);
  equal((await statuses()).map(row => row.status), ['confirmed', 'declined'], 'saving the service keeps the answers');
  await db.query('select public.save_service($1)', [{ ...service, assignments: [{ id: ids.assignment, personId: ids.person, function: 'Teclado' }, service.assignments[1]] }]);
  equal((await statuses())[0], { id: ids.assignment, status: 'pending', status_note: '' }, 'changing the function asks again');

  // Unavailable dates.
  await as('musician');
  await db.query('select public.set_unavailability($1,$2,true,$3)', [ids.person, future, 'Viagem']);
  await db.query('select public.set_unavailability($1,$2,true,$3)', [ids.person, future, 'Viagem longa']);
  equal((await db.query('select person_id,date::text,note from public.unavailability')).rows, [{ person_id: ids.person, date: future, note: 'Viagem longa' }], 'member marks own date once');
  await denied('select public.set_unavailability($1,$2,true)', [ids.otherPerson, future]);
  await denied('insert into public.unavailability(person_id,date) values($1,$2)', [ids.person, '2099-03-01']);
  await denied('select public.set_unavailability($1,$2,true)', [ids.person, '2000-01-01'], '22023');
  await db.query('select public.set_unavailability($1,$2,true)', [ids.person, today]);
  await as('other');
  equal((await db.query('select count(*)::int as n from public.unavailability')).rows[0].n, 2, 'approved members can read the dates');
  await as('pending');
  equal((await db.query('select count(*)::int as n from public.unavailability')).rows[0].n, 0, 'pending accounts read nothing');
  await as(null, 'anon');
  await denied('select * from public.unavailability');
  await as('leader');
  await db.query('select public.set_unavailability($1,$2,true)', [ids.otherPerson, future]);
  await as('musician');
  await db.query('select public.set_unavailability($1,$2,false)', [ids.person, future]);
  equal((await db.query('select person_id::text from public.unavailability where date=$1', [future])).rows, [{ person_id: ids.otherPerson }], 'member removes own date');
  await as('admin');
  await db.query('delete from public.assignments');
  await db.query('delete from public.people where id=$1', [ids.otherPerson]);
  equal((await db.query('select count(*)::int as n from public.unavailability where person_id=$1', [ids.otherPerson])).rows[0].n, 0, 'removing a person removes their dates');
  console.log(`presence/unavailability database checks passed (${checks})`);
} finally { await db.close(); }
