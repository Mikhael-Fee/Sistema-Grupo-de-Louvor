// Migration 009 in PostgreSQL (PGlite). Auth is simulated; no production/network.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite();
let checks = 0;
const uuid = n => `82000000-0000-4000-a000-${String(n).padStart(12, '0')}`;
const ids = { admin: uuid(1), leader: uuid(2), musician: uuid(3), other: uuid(4), pending: uuid(5),
  person: uuid(11), otherPerson: uuid(12), thirdPerson: uuid(13), service: uuid(15), pastService: uuid(16),
  a1: uuid(21), a2: uuid(22), a3: uuid(23), a4: uuid(24), past: uuid(25) };
const service = { id: ids.service, date: '2099-02-28', time: '19:30', type: 'Santa Ceia', notes: '', isEvent: false,
  assignments: [{ id: ids.a1, personId: ids.person, function: 'Voz' }, { id: ids.a2, personId: ids.otherPerson, function: 'Voz' }], repertoire: [] };
const endpoint = n => `https://push.example.invalid/device-${n}`;
const key = 'B'.repeat(87);

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
const claim = async id => (await db.query('select person_name,functions,email,subscriptions,service_type from public.claim_assignment_notifications($1) order by person_name', [id])).rows;

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
    '005_linked_profile_photos.sql', '006_calendar_videos_private_access.sql', '007_archive_team_people.sql', '008_presence_and_unavailability.sql']) {
    await db.exec(await readFile(new URL(`../../supabase/migrations/${migration}`, import.meta.url), 'utf8'));
  }
  for (const [actor, role, approved] of [['admin','admin',true], ['leader','leader',true], ['musician','musician',true], ['other','musician',true], ['pending','musician',false]]) {
    await db.query('insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values($1,$2,$3,now())', [ids[actor], `${actor}@private.invalid`, { name: actor }]);
    await db.query('update public.profiles set role=$1,approved=$2 where id=$3', [role, approved, ids[actor]]);
  }
  await as('admin');
  await db.query('insert into public.people(id,name,email,functions) values($1,$2,$3,$4),($5,$6,$7,$8),($9,$10,$11,$12)',
    [ids.person, 'Ana', '', ['Voz', 'Teclado'], ids.otherPerson, 'Bruno', 'bruno@private.invalid', ['Voz'], ids.thirdPerson, 'Carla', '', ['Bateria']]);
  await db.query('select public.update_profile($1)', [{ id: ids.musician, name: 'musician', role: 'musician', approved: true, personId: ids.person }]);
  await db.query('select public.save_service($1)', [service]);
  await db.query('select public.save_service($1)', [{ ...service, id: ids.pastService, date: '2020-01-05', assignments: [{ id: ids.past, personId: ids.thirdPerson, function: 'Bateria' }] }]);
  await db.exec('reset role');
  await db.exec(await readFile(new URL('../../supabase/migrations/009_assignment_notifications.sql', import.meta.url), 'utf8'));
  equal((await db.query('select count(*)::int as n from public.assignments where notified_at is null')).rows[0].n, 0, 'existing assignments count as notified');

  // Devices.
  await as('musician');
  await db.query('select public.save_push_subscription($1,$2,$3)', [endpoint(1), key, 'auth-secret-1']);
  await denied('select public.save_push_subscription($1,$2,$3)', ['http://insecure.invalid/device', key, 'auth-secret-1'], '22023');
  await denied('insert into public.push_subscriptions(endpoint,user_id,p256dh,auth) values($1,$2,$3,$4)', [endpoint(2), ids.musician, key, 'auth-secret-1']);
  await denied('select * from public.push_subscriptions');
  await as('pending');
  await denied('select public.save_push_subscription($1,$2,$3)', [endpoint(3), key, 'auth-secret-1']);
  await as(null, 'anon');
  await denied('select public.save_push_subscription($1,$2,$3)', [endpoint(3), key, 'auth-secret-1']);
  await as('other');
  await db.query('select public.delete_push_subscription($1)', [endpoint(1)]);
  await db.exec('reset role');
  equal((await db.query('select user_id from public.push_subscriptions')).rows, [{ user_id: ids.musician }], 'only the owner removes a device');
  await as('musician');
  for (let n = 10; n < 21; n++) await db.query('select public.save_push_subscription($1,$2,$3)', [endpoint(n), key, 'auth-secret-1']);
  await db.exec('reset role');
  equal((await db.query('select count(*)::int as n from public.push_subscriptions')).rows[0].n, 10, 'at most 10 devices per account');
  await db.query('delete from public.push_subscriptions where endpoint <> $1', [endpoint(20)]);

  // New invitations.
  await as('leader');
  equal(await claim(ids.service), [], 'nothing new to announce');
  await db.query('select public.save_service($1)', [{ ...service, assignments: [...service.assignments,
    { id: ids.a3, personId: ids.person, function: 'Teclado' }, { id: ids.a4, personId: ids.thirdPerson, function: 'Bateria' }] }]);
  await as('musician');
  await denied('select * from public.claim_assignment_notifications($1)', [ids.service]);
  await as('leader');
  equal(await claim(ids.service), [
    { person_name: 'Ana', functions: ['Teclado'], email: 'musician@private.invalid', subscriptions: [{ endpoint: endpoint(20), p256dh: key, auth: 'auth-secret-1' }], service_type: 'Santa Ceia' },
    { person_name: 'Carla', functions: ['Bateria'], email: '', subscriptions: [], service_type: 'Santa Ceia' },
  ], 'one notice per person, e-mail from the team record or the linked account');
  equal(await claim(ids.service), [], 'a second call sends nothing twice');
  await db.query('select public.save_service($1)', [{ ...service, assignments: [{ id: ids.a1, personId: ids.person, function: 'Voz' }, { id: ids.a2, personId: ids.thirdPerson, function: 'Bateria' }] }]);
  equal((await claim(ids.service)).map(row => [row.person_name, row.functions, row.email]), [['Carla', ['Bateria'], '']], 'changing the person announces again');
  await db.query('select public.respond_assignment($1,$2)', [ids.a2, 'confirmed']);
  await db.query('update public.assignments set notified_at = null where id = $1', [ids.a2]);
  equal(await claim(ids.service), [], 'direct writes by leaders change nothing (row security)');
  await db.exec('reset role');
  await db.query('update public.assignments set notified_at = null where id = $1', [ids.past]);
  await as('admin');
  equal(await claim(ids.pastService), [], 'past services are never announced');
  await as('leader');
  await db.query('select public.forget_push_subscriptions($1)', [[endpoint(20)]]);
  await as('musician');
  await denied('select public.forget_push_subscriptions($1)', [[endpoint(20)]]);
  await db.exec('reset role');
  equal((await db.query('select count(*)::int as n from public.push_subscriptions')).rows[0].n, 0, 'leaders forget devices that are gone');
  await as(null, 'anon');
  await denied('select * from public.claim_assignment_notifications($1)', [ids.service]);
  console.log(`notification database checks passed (${checks})`);
} finally { await db.close(); }
