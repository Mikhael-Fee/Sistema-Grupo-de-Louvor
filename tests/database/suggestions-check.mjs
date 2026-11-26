// Migration 011 (Sugestões) in PostgreSQL (PGlite). Auth is simulated; no production/network.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite();
let checks = 0;
const uuid = n => `83000000-0000-4000-a000-${String(n).padStart(12, '0')}`;
const ids = {
  admin: uuid(1),
  leader: uuid(2),
  musician: uuid(3),
  other: uuid(4),
  pending: uuid(5),
  person: uuid(11),
  tag: uuid(21),
  song: uuid(31),
};

function equal(actual, expected, description) {
  assert.deepEqual(actual, expected, description);
  checks++;
}
async function rejected(sql, params = [], code = '42501') {
  let failure;
  try {
    await db.query(sql, params);
  } catch (cause) {
    failure = cause;
  }
  assert.ok(failure, `Operation must be rejected: ${sql}`);
  assert.equal(failure.code, code, failure.message);
  checks++;
}
async function as(actor) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor ? ids[actor] : '']);
  await db.exec('set role authenticated');
}
const read = async () => (await db.query('select public.read_song_suggestions() as list')).rows[0].list;
const create = async (videoId, title = 'Lugar Secreto', tagIds = []) =>
  (
    await db.query('select public.create_song_suggestion($1) as id', [
      { title, artist: 'Gabriela Rocha', videoId, videoTitle: `${title} (Ao Vivo)`, channel: 'Gabriela Rocha', tagIds },
    ])
  ).rows[0].id;

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
  for (const migration of [
    '001_initial.sql',
    '002_public_consultation.sql',
    '003_custom_service_types.sql',
    '004_profile_photos.sql',
    '005_linked_profile_photos.sql',
    '006_calendar_videos_private_access.sql',
    '007_archive_team_people.sql',
    '008_presence_and_unavailability.sql',
    '009_assignment_notifications.sql',
    '010_member_profiles.sql',
    '011_song_suggestions.sql',
    '011_song_suggestions.sql', // re-running is safe
  ]) {
    await db.exec(await readFile(new URL(`../../supabase/migrations/${migration}`, import.meta.url), 'utf8'));
  }
  for (const [actor, role, approved] of [
    ['admin', 'admin', true],
    ['leader', 'leader', true],
    ['musician', 'musician', true],
    ['other', 'musician', true],
    ['pending', 'musician', false],
  ]) {
    await db.query('insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values($1,$2,$3,now())', [
      ids[actor],
      `${actor}@private.invalid`,
      { name: actor },
    ]);
    await db.query('update public.profiles set role=$1,approved=$2 where id=$3', [role, approved, ids[actor]]);
  }
  await db.query("insert into public.people(id,name,email,functions) values($1,'Lucas','',array['Voz'])", [ids.person]);
  await db.query('update public.profiles set person_id=$1 where id=$2', [ids.person, ids.musician]);
  await db.query("insert into public.tags(id,name,color) values($1,'Santa Ceia','#aa5500')", [ids.tag]);

  // Tables are closed: only the functions read or write.
  await as('musician');
  await rejected('select * from public.song_suggestions');
  await rejected('insert into public.song_suggestion_votes(suggestion_id,user_id) values($1,$2)', [uuid(99), ids.musician]);
  await as('pending');
  await rejected('select public.read_song_suggestions()');
  await rejected('select public.create_song_suggestion($1)', [{ title: 'X', artist: 'Y', videoId: 'aaaaaaaaaaa', tagIds: [] }]);

  // A member suggests with a tag; the same open video cannot be suggested twice.
  await as('musician');
  const first = await create('abcdefghijk', 'Lugar Secreto', [ids.tag]);
  await as('other');
  await rejected(
    'select public.create_song_suggestion($1)',
    [{ title: 'Outra', artist: 'Y', videoId: 'abcdefghijk', tagIds: [] }],
    '23505',
  );
  await rejected('select public.create_song_suggestion($1)', [{ title: 'X', artist: 'Y', videoId: 'curto', tagIds: [] }], '23514');
  const second = await create('zyxwvutsrqp', 'Ninguém explica Deus');

  // Likes are anonymous: count + whether I liked. Liking twice counts once.
  await db.query('select public.set_song_suggestion_vote($1,true)', [first]);
  await db.query('select public.set_song_suggestion_vote($1,true)', [first]);
  await as('musician');
  await db.query('select public.set_song_suggestion_vote($1,true)', [first]);
  let list = await read();
  let row = list.find(item => item.id === first);
  equal(
    [row.votes, row.votedByMe, row.mine, row.authorName, row.authorPersonId, row.tagIds],
    [2, true, true, 'musician', ids.person, [ids.tag]],
  );
  equal(Object.keys(row).includes('createdBy'), false, 'no account ids leak');
  await db.query('select public.set_song_suggestion_vote($1,false)', [first]);
  equal((await read()).find(item => item.id === first).votes, 1);

  // Comments: everyone writes; author or leader deletes.
  await db.query("select public.add_song_suggestion_comment($1,'Boa para Santa Ceia')", [first]);
  await rejected("select public.add_song_suggestion_comment($1,'   ')", [first], '22023');
  const commentId = (await read()).find(item => item.id === first).comments[0].id;
  await as('other');
  equal((await read()).find(item => item.id === first).comments[0].mine, false);
  await rejected('select public.delete_song_suggestion_comment($1)', [commentId]);
  await as('leader');
  await db.query('select public.delete_song_suggestion_comment($1)', [commentId]);
  equal((await read()).find(item => item.id === first).comments, []);

  // Only leaders/admins change status or approve.
  await as('musician');
  await rejected("select public.set_song_suggestion_status($1,'reviewing','')", [first]);
  await rejected("select public.approve_song_suggestion($1,'G',null)", [first]);
  // Authors delete their own only while still "Sugerida".
  await as('other');
  await rejected('select public.delete_song_suggestion($1)', [first]);
  await as('leader');
  await db.query("select public.set_song_suggestion_status($1,'reviewing','')", [second]);
  await rejected("select public.set_song_suggestion_status($1,'approved','')", [second], '22023');
  await as('other');
  await rejected('select public.delete_song_suggestion($1)', [second]);

  // A leader approves: the song is created with the video and tags, chords pending.
  await as('leader');
  await rejected("select public.approve_song_suggestion($1,'H',null)", [first], '22023');
  const songId = (await db.query("select public.approve_song_suggestion($1,'G',null) as id", [first])).rows[0].id;
  await db.exec('reset role');
  const song = (await db.query('select title,artist,church_key,youtube_url,notes from public.songs where id=$1', [songId])).rows[0];
  equal(song, {
    title: 'Lugar Secreto',
    artist: 'Gabriela Rocha',
    church_key: 'G',
    youtube_url: 'https://www.youtube.com/watch?v=abcdefghijk',
    notes: 'Sugerida por musician.',
  });
  equal((await db.query('select tag_id from public.song_tags where song_id=$1', [songId])).rows, [{ tag_id: ids.tag }]);
  await as('leader');
  row = (await read()).find(item => item.id === first);
  equal([row.status, row.songId], ['approved', songId]);
  await rejected("select public.approve_song_suggestion($1,'G',null)", [first], '23505');
  await rejected("select public.set_song_suggestion_status($1,'declined','')", [first], 'P0002');
  // After approval the same video may be suggested again only if it is not open.
  await as('other');
  await create('abcdefghijk', 'De novo');

  // Approving by linking an existing library song, and declining with a note.
  await as('leader');
  await db.query('select public.approve_song_suggestion($1,null,$2)', [second, songId]);
  equal((await read()).find(item => item.id === second).songId, songId);
  const third = await create('qqqqqqqqqqq', 'Terceira');
  await db.query("select public.set_song_suggestion_status($1,'declined','Fora do nosso estilo')", [third]);
  row = (await read()).find(item => item.id === third);
  equal([row.status, row.statusNote], ['declined', 'Fora do nosso estilo']);
  await db.query('select public.delete_song_suggestion($1)', [third]);
  equal(
    (await read()).some(item => item.id === third),
    false,
  );

  // Deleting the library song keeps the suggestion, without the link.
  await db.exec('reset role');
  await db.query('delete from public.songs where id=$1', [songId]);
  await as('leader');
  equal((await read()).find(item => item.id === first).songId, null);

  console.log(`suggestion database checks passed (${checks})`);
} finally {
  await db.close();
}
