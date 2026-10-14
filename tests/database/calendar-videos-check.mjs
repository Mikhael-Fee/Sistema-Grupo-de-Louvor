// Migration006 in PostgreSQL. Auth/Storage are simulated; no production/network.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const db = new PGlite();
let checks = 0;
const uuid = n => `61000000-0000-4000-a000-${String(n).padStart(12, '0')}`;
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
  const result = {};
  for (const table of ['profiles', 'people', 'tags', 'songs', 'song_tags', 'services', 'assignments', 'repertoire']) {
    const omit = previousColumns && table === 'services' ? " - 'is_event'"
      : previousColumns && table === 'repertoire' ? " - 'youtube_url'" : '';
    result[table] = (await db.query(`select to_jsonb(t)${omit} as record from public.${table} t
      order by to_jsonb(t)::text`)).rows.map(row => row.record);
  }
  for (const table of ['auth.users', 'storage.buckets', 'storage.objects']) {
    result[table] = (await db.query(`select to_jsonb(t) as record from ${table} t order by to_jsonb(t)::text`)).rows.map(row => row.record);
  }
  return result;
}
async function serviceState() {
  return {
    service: (await db.query('select * from public.services order by id')).rows,
    assignments: (await db.query('select * from public.assignments order by position')).rows,
    repertoire: (await db.query('select * from public.repertoire order by position')).rows,
  };
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
  for (const migration of ['001_initial.sql', '002_public_consultation.sql', '003_custom_service_types.sql', '004_profile_photos.sql', '005_linked_profile_photos.sql']) {
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
  await db.query('select public.save_public_access(true)');
  await as(null, 'anon');
  equal((await db.query('select public.read_public_ministry() as data')).rows[0].data.services.length, 1, 'consultation was enabled before006');
  await db.exec('reset role');
  const before = await snapshot({ previousColumns: true });
  const migration = await readFile(new URL('../../supabase/migrations/006_calendar_videos_private_access.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  equal(await snapshot({ previousColumns: true }), before, 'every existing column/ID/order/photo/link/Auth/Storage value survives006');
  equal((await db.query('select is_event from public.services')).rows, [{ is_event: false }], 'old services become regular services');
  equal((await db.query('select youtube_url from public.repertoire order by position')).rows, [{ youtube_url: '' }, { youtube_url: '' }], 'old repertoire entries keep library-video fallback');
  equal((await db.query('select public_enabled from public.public_access')).rows, [{ public_enabled: false }], 'previous enabled guest access is closed');
  await denied('update public.public_access set public_enabled=true', [], '23514');

  // Verify the exact inspection SQL used by the real helper without networking.
  const helper = await readFile(new URL('../../scripts/configure-calendar-videos.mjs', import.meta.url), 'utf8');
  const match = helper.match(/const \[state\] = await query\(`(select[\s\S]*?)`\);/);
  assert.ok(match, 'helper inspection SQL must be present');
  const inspected = (await db.query(match[1])).rows[0];
  for (const field of ['event_column', 'video_column', 'video_constraint', 'closed_constraint']) equal(inspected[field], 1, `${field} detected by helper`);
  for (const field of ['public_disabled', 'no_anonymous_table_read', 'no_direct_profile_write', 'no_public_rpc_grants', 'save_service_guarded', 'save_service_grants', 'linked_photos_guarded', 'public_data_closed']) {
    equal(inspected[field], true, `${field} detected by helper`);
  }

  await as(null, 'anon');
  for (const table of ['profiles','people','tags','songs','song_tags','services','assignments','repertoire']) await denied(`select * from public.${table}`);
  for (const sql of ['select public.get_public_access()', 'select public.read_public_ministry()', 'select public.save_public_access(true)', 'select public.save_service($1)', 'select public.read_team_profile_photos()']) {
    await denied(sql, sql.includes('$1') ? [service] : []);
  }
  for (const actor of ['pending', 'suspended']) {
    await as(actor);
    for (const table of ['people','tags','songs','song_tags','services','assignments','repertoire']) {
      equal((await db.query(`select count(*)::integer as n from public.${table}`)).rows[0].n, 0, `${actor} cannot read ${table}`);
    }
    for (const sql of ['select public.get_public_access()', 'select public.read_public_ministry()', 'select public.save_public_access(true)', 'select public.read_team_profile_photos()', 'select public.save_service($1)']) {
      await denied(sql, sql.includes('$1') ? [{ ...service, isEvent: true }] : []);
    }
    equal((await db.query('select id from public.profiles')).rows, [{ id: ids[actor] }], `${actor} retains its own approval screen profile only`);
  }
  await as('musician');
  equal((await db.query('select is_event from public.services')).rows, [{ is_event: false }], 'approved musicians can read calendar data');
  equal((await db.query('select public.read_team_profile_photos() as photos')).rows[0].photos, [{ personId: ids.person, photoUrl: photo }], 'approved linked photos remain available');
  await denied('select public.save_service($1)', [{ ...service, isEvent: true }]);
  await denied('select public.read_public_ministry()');

  await as('admin');
  const event = { ...service, isEvent: true, repertoire: service.repertoire.map((item, i) => ({ ...item, youtubeUrl: i ? '' : alternateVideo })) };
  await db.query('select public.save_service($1)', [event]);
  equal((await db.query('select is_event from public.services')).rows, [{ is_event: true }], 'admin saves event flag');
  equal((await db.query('select youtube_url from public.repertoire order by position')).rows, [{ youtube_url: alternateVideo }, { youtube_url: '' }], 'only the selected service entry stores its chosen version');
  equal((await db.query('select youtube_url from public.songs where id=$1', [ids.song])).rows, [{ youtube_url: originalVideo }], 'per-service video never overwrites the library song');
  await db.query('select public.save_service($1)', [{ ...service, repertoire: [...service.repertoire].reverse(), notes: 'Editado por cliente anterior' }]);
  equal((await db.query('select is_event from public.services')).rows, [{ is_event: true }], 'legacy client edit preserves event');
  equal((await db.query('select id,youtube_url,position from public.repertoire order by position')).rows,
    [{ id: ids.otherItem, youtube_url: '', position: 0 }, { id: ids.item, youtube_url: alternateVideo, position: 1 }], 'legacy reordering preserves the version by entry ID and song');
  const beforeInvalid = await serviceState();
  for (const isEvent of [null, 'true', 1, [], {}]) await denied('select public.save_service($1)', [{ ...event, isEvent }], '22023');
  for (const youtubeUrl of [null, true, 1, {}]) await denied('select public.save_service($1)', [{ ...event, repertoire: [{ ...event.repertoire[0], youtubeUrl }] }], '22023');
  for (const youtubeUrl of ['javascript:alert(1)', 'http://youtu.be/AbCdEfG_123', 'https://youtube.com.evil.invalid/watch?v=AbCdEfG_123', 'https://youtube.com/playlist?list=PLtest', 'https://youtube.com/watch?v=short&v=AbCdEfG_123', `https://youtu.be/AbCdEfG_123?data=${'a'.repeat(2000)}`]) {
    await denied('select public.save_service($1)', [{ ...event, notes: 'Perdida', repertoire: [{ ...event.repertoire[0], youtubeUrl }] }], '23514');
  }
  await denied('select public.save_service($1)', [{ ...event, notes: 'Perdida', repertoire: [{ ...event.repertoire[0], songId: uuid(999) }] }], '23503');
  await denied('select public.save_service($1)', [{ ...event, repertoire: [event.repertoire[0], { ...event.repertoire[0], id: uuid(998) }] }], '23505');
  equal(await serviceState(), beforeInvalid, 'all failed RPCs atomically preserve service, event, scale, IDs, order and video');
  await denied('select public.update_profile($1)', [{ id: ids.admin, name: 'Admin preservado', approved: false, role: 'admin' }], '23514');
  await denied('select public.save_public_access(true)');
  await denied('select public.get_public_access()');

  await as('leader');
  await db.query('select public.save_service($1)', [{ ...event, isEvent: false, repertoire: event.repertoire.map(item => ({ ...item, youtubeUrl: '' })) }]);
  equal((await db.query('select is_event from public.services')).rows, [{ is_event: false }], 'approved leader can explicitly clear event');
  equal((await db.query('select youtube_url from public.repertoire order by position')).rows, [{ youtube_url: '' }, { youtube_url: '' }], 'explicit empty version returns to the library video fallback');
  await db.query('select public.save_service($1)', [event]);
  await db.exec('reset role');
  const beforeRepeat = await snapshot();
  await db.exec(migration);
  equal(await snapshot(), beforeRepeat, 'replaying006 preserves new event/video values and every existing record');
  equal((await db.query('select public_enabled from public.public_access')).rows, [{ public_enabled: false }], 'replay never reopens guest consultation');
  const repeatInspection = (await db.query(match[1])).rows[0];
  equal(repeatInspection, inspected, 'helper inspection stays idempotently installed');

  // Build the helper's actual transaction template with only local trusted
  // source and DB calls. No helper initialization, env or network is evaluated.
  const snapshotSource = helper.match(/const oldColumnSnapshot = [\s\S]*?\n\ntry \{/);
  assert.ok(snapshotSource, 'helper snapshot source must be present');
  const snapshotSql = runInNewContext(`${snapshotSource[0].replace(/\n\ntry \{$/, '')}\noldColumnSnapshot;`, Object.create(null));
  const wrappedSource = helper.match(/await query\(`(begin;[\s\S]*?commit;)`\);/);
  assert.ok(wrappedSource, 'helper transaction template must be present');
  const wrappedSql = runInNewContext('`' + wrappedSource[1] + '`', {
    oldColumnSnapshot: snapshotSql, migration: migration.replace(/^begin;$/m, '').replace(/^commit;$/m, ''),
  });
  const beforeWrapped = await snapshot();
  await db.exec(wrappedSql);
  equal(await snapshot(), beforeWrapped, 'real helper transaction validates preservation without resetting existing event/video data');

  // A deliberate bad change is detected and the entire helper transaction is
  // aborted, so a future unsafe migration cannot modify registered songs.
  const badWrappedSql = runInNewContext('`' + wrappedSource[1] + '`', {
    oldColumnSnapshot: snapshotSql,
    migration: `update public.songs set youtube_url='' where id='${ids.song}';`,
  });
  await denied(badWrappedSql, [], 'P0001', true);
  await db.exec('rollback');
  equal(await snapshot(), beforeWrapped, 'preservation guard rolls back a changed original library video (not excluded with the new repertoire column)');

  // A maintenance call to the older005 helper must recognize006 and skip its
  // old guest-read definition/grants rather than installing it again.
  const olderHelper = await readFile(new URL('../../scripts/configure-linked-profile-photos.mjs', import.meta.url), 'utf8');
  const olderInspect = olderHelper.match(/const rows = await query\(`(select[\s\S]*?)`\);/);
  const olderSecurity = olderHelper.match(/const security = await query\(`(select[\s\S]*?)`\);/);
  const olderInstalled = olderHelper.match(/const installed = state => ([\s\S]*?);\ntry \{/);
  assert.ok(olderInspect && olderSecurity && olderInstalled, 'older helper inspection/installed predicate must be present');
  const olderState = Object.assign((await db.query(olderInspect[1])).rows[0], (await db.query(olderSecurity[1])).rows[0]);
  const olderIsInstalled = runInNewContext(`state => ${olderInstalled[1]}`, Object.create(null));
  equal(olderState.public_consultation_retired, true, '005 helper detects retired guest access');
  equal(olderIsInstalled(olderState), true, '005 helper treats approved linked photos as installed after006');
  equal(olderState.anonymous_public_rpc, false, '005 helper respects revoked guest RPC grant');
  equal(olderState.public_whitelist_updated, false, 'a retired whitelist does not trigger005 reinstallation');

  const publicHelper = await readFile(new URL('../../scripts/configure-public-consultation.mjs', import.meta.url), 'utf8');
  const publicInspect = publicHelper.match(/const rows = await query\(`(select[\s\S]*?)`\);/);
  assert.ok(publicInspect, 'public maintenance inspection must be present');
  equal((await db.query(publicInspect[1])).rows[0].public_consultation_retired, true, 'public helper detects006 without altering settings');
  const enableRefused = await new Promise(resolve => execFile(process.execPath,
    [fileURLToPath(new URL('../../scripts/configure-public-consultation.mjs', import.meta.url)), '--apply', '--enable'],
    { env: { PATH: process.env.PATH }, maxBuffer: 4096 }, (error, stdout, stderr) => resolve({ error, stdout, stderr })));
  equal(enableRefused.error?.code, 1, 'old --enable is refused before token lookup or network');
  equal(enableRefused.stdout, '', 'refused --enable does not print records or credentials');
  equal(enableRefused.stderr.includes('--enable não é mais permitido'), true, 'maintenance rejection explains retired guest feature');
  console.log(`${checks} calendar/video/private-access PostgreSQL checks passed (PGlite; Auth/Storage simulated).`);
} finally { await db.close(); }
