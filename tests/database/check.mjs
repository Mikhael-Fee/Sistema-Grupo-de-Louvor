// PostgreSQL-backed assertions. Auth is simulated; no network or production data.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
let checked = 0;
await db.exec(await readFile(new URL('./auth-stub.sql', import.meta.url), 'utf8'));
await db.exec(await readFile(new URL('../../supabase/migrations/001_initial.sql', import.meta.url), 'utf8'));
const ids = { admin: '00000000-0000-4000-a000-000000000001', leader: '00000000-0000-4000-a000-000000000002', musician:'00000000-0000-4000-a000-000000000003', pending:'00000000-0000-4000-a000-000000000004', secondAdmin:'00000000-0000-4000-a000-000000000005', song:'00000000-0000-4000-a000-000000000011', tag:'00000000-0000-4000-a000-000000000012', person:'00000000-0000-4000-a000-000000000013', service:'00000000-0000-4000-a000-000000000014', assignment:'00000000-0000-4000-a000-000000000015', item:'00000000-0000-4000-a000-000000000016' };
for (const key of ['admin', 'leader', 'musician', 'pending', 'secondAdmin']) await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)', [ids[key], key+'@test.example', {name:'Nome\u0001 seguro',role:'admin',approved:true}]);
const pending = (await db.query('select role,approved,name from public.profiles where id=$1',[ids.pending])).rows[0];
assert.equal(pending.role,'musician'); assert.equal(pending.approved,false); assert.equal(pending.name,'Nome seguro'); checked += 3;
await db.query("update public.profiles set role='admin',approved=true where id=$1",[ids.admin]);
await db.query("update public.profiles set role='leader',approved=true where id=$1",[ids.leader]);
await db.query("update public.profiles set approved=true where id=$1",[ids.musician]);
async function as(user, role='authenticated') { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user ?? '']); await db.exec(`set role ${role}`); }
async function rejected(sql, params, code) { let e; try { await db.query(sql,params); } catch(error) { e=error; } assert.ok(e, 'Operation should fail: '+sql); if(code) assert.equal(e.code, code, e.message); checked++; }
async function count(table,n) { assert.equal((await db.query('select count(*)::integer as n from public.'+table)).rows[0].n,n); checked++; }
const song = {id:ids.song,title:'Canção',artist:'Artista',originalKey:'C',churchKey:'D',content:'[C]Olá',youtubeUrl:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',notes:'',tagIds:[ids.tag]};
const service = {id:ids.service,date:'2026-10-11',time:'19:00',type:'Culto de Domingo',notes:'',assignments:[{id:ids.assignment,personId:ids.person,function:'Voz'}],repertoire:[{id:ids.item,songId:ids.song,key:'Eb',notes:'Abertura'}]};
await as(ids.admin);
await db.query('insert into public.tags(id,name,color) values($1,$2,$3)',[ids.tag,'Adoração','#552288']);
await db.query('insert into public.people(id,name,email,functions) values($1,$2,$3,$4)',[ids.person,'Pessoa','',['Voz','Violão']]);
await db.query('select public.save_song($1)',[song]); checked++;
await db.query('select public.save_service($1)',[service]); checked++;
for (const table of ['songs','song_tags','services','assignments','repertoire']) await count(table,1);
await rejected('delete from public.songs where id=$1',[ids.song],'23503');
await rejected('delete from public.people where id=$1',[ids.person],'23503');
await rejected('update public.people set functions=$1 where id=$2',[['Violão'],ids.person],'23514');
await rejected('select public.save_song($1)',[{...song,title:'Alteração perdida',tagIds:['00000000-0000-4000-a000-000000000099']}],'23503');
assert.equal((await db.query('select title from public.songs')).rows[0].title,'Canção'); checked++;
await count('song_tags',1);
await rejected('select public.save_service($1)',[{...service,notes:'Alteração perdida',repertoire:[{...service.repertoire[0],songId:'00000000-0000-4000-a000-000000000099'}]}],'23503');
assert.equal((await db.query('select notes from public.services')).rows[0].notes,''); checked++;
await count('assignments',1); await count('repertoire',1);
await rejected('select public.save_service($1)',[{...service,assignments:[{...service.assignments[0],function:'Bateria'}]}],'23514');

await rejected('select public.save_song($1)',[{...song,content:' \n \t '}],'23514');
await rejected('select public.save_song($1)',[{...song,title:' \n \t '}],'23514');
await rejected('update public.people set functions=$1 where id=$2',[['Voz','Voz'],ids.person],'23514');
await rejected('select public.save_service($1)',[{...service,repertoire:[service.repertoire[0],{...service.repertoire[0],id:'00000000-0000-4000-a000-000000000098'}]}],'23505');
await count('repertoire',1);
await rejected("update public.services set time='24:00' where id=$1",[ids.service],'23514');
await rejected("update public.services set time='18:30:40' where id=$1",[ids.service],'23514');
for (const url of ['https://www.youtube.com/watch?v=AbCdEfG_123&t=20','https://youtu.be/AbCdEfG_123?si=sample','https://www.youtu.be/AbCdEfG_123/','https://m.youtube.com/watch?v=AbCdEfG_123','https://youtube.com/shorts/AbCdEfG_123','https://www.youtube.com/embed/AbCdEfG_123','https://www.youtube.com/live/AbCdEfG_123/','https://www.youtube.com/watch?t=20&v=AbCdEfG_123']) {
  assert.equal((await db.query('select public.valid_youtube_url($1) as ok',[url])).rows[0].ok,true,url); checked++;
}
for (const url of ['javascript:alert(1)','http://youtube.com/watch?v=AbCdEfG_123','https://youtube.com.evil.example/watch?v=AbCdEfG_123','https://youtube.com@evil.example/watch?v=AbCdEfG_123','https://someone:password@youtube.com/watch?v=AbCdEfG_123','https://youtu.be/','https://youtube.com/watch?v=short','https://youtube.com/playlist?list=PLtest','https://youtube.com:8443/watch?v=AbCdEfG_123','https://vimeo.com/123456789','https://youtube.com/watch?v=short&v=AbCdEfG_123']) {
  assert.equal((await db.query('select public.valid_youtube_url($1) as ok',[url])).rows[0].ok,false,url); checked++;
}
await rejected('select public.save_song($1)',[{...song,originalKey:'H'}],'23514');
await rejected('select public.save_song($1)',[{...song,youtubeUrl:'https://youtube.com.attacker.example/watch?v=dQw4w9WgXcQ'}],'23514');
await rejected('select public.save_service($1)',[{...service,time:'24:00'}],'22023');
await rejected('select public.save_service($1)',[{...service,date:'2026-02-30'}],'22008');
await rejected('select public.update_profile($1)',[{id:ids.admin,name:'Admin',role:'musician',approved:true}],'23514');
await rejected('select public.update_profile($1)',[{id:ids.admin,name:'Admin',role:'admin',approved:false}],'23514');
await rejected('update public.profiles set role=$1 where id=$2',['admin',ids.musician],'42501');
await db.query('select public.update_profile($1)',[{id:ids.secondAdmin,name:'Admin 2',role:'admin',approved:true,personId:ids.person}]); checked++;
await db.query('select public.update_profile($1)',[{id:ids.admin,name:'Admin 1',role:'musician',approved:true}]); checked++;
await as(ids.secondAdmin);
await rejected('select public.update_profile($1)',[{id:ids.secondAdmin,name:'Admin 2',role:'musician',approved:true}],'23514');
await as(ids.leader);
await count('songs',1); await count('profiles',1);
await db.query('select public.save_service($1)',[{...service,notes:'Planejado por líder'}]); checked++;
await rejected('select public.save_song($1)',[song],'42501');
await rejected('insert into public.tags(name,color) values($1,$2)',['Não permitido','#112233'],'42501');
await rejected('select public.update_profile($1)',[{id:ids.leader,name:'Líder',role:'admin',approved:true}],'42501');
await as(ids.musician);
await count('songs',1); await count('services',1); await count('profiles',1);
await rejected('select public.save_song($1)',[song],'42501');
await rejected('select public.save_service($1)',[service],'42501');
await rejected('select public.update_profile($1)',[{id:ids.musician,name:'Músico',role:'admin',approved:true}],'42501');
await as(ids.pending);
for (const table of ['songs','tags','people','services','song_tags','assignments','repertoire']) await count(table,0);
await count('profiles',1);
await rejected('select public.save_song($1)',[song],'42501');
await rejected('select public.save_service($1)',[service],'42501');
await rejected('select public.update_profile($1)',[{id:ids.pending,name:'Pendente',role:'admin',approved:true}],'42501');
await as(null,'anon');
for (const table of ['profiles','songs','tags','people','services','song_tags','assignments','repertoire']) await rejected('select * from public.'+table,[],'42501');
await rejected('select public.save_song($1)',[song],'42501');
await rejected('select public.save_service($1)',[service],'42501');
await rejected('select public.update_profile($1)',[{id:ids.pending,name:'Pendente',role:'admin',approved:true}],'42501');
await as(ids.secondAdmin);
await db.query('delete from public.services where id=$1',[ids.service]); checked++;
await count('assignments',0); await count('repertoire',0);
await db.query('delete from public.songs where id=$1',[ids.song]); checked++;
await count('song_tags',0);
await rejected('delete from public.people where id=$1',[ids.person],'23503');
await db.query('select public.update_profile($1)',[{id:ids.secondAdmin,name:'Admin 2',role:'admin',approved:true,personId:null}]);
await db.query('delete from public.people where id=$1',[ids.person]); checked++;
console.log(`${checked} PostgreSQL assertions passed (PGlite, Supabase Auth simulated).`);
await db.close();
