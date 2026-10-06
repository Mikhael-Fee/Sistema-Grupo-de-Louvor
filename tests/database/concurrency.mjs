// Optional live PostgreSQL validation: requires Docker, never connects to Supabase.
import { spawn, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const container = `louvor-pg-validation-${process.pid}`;
const image = 'postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24';
const a = '00000000-0000-4000-a000-000000000001';
const b = '00000000-0000-4000-a000-000000000002';
const person = '00000000-0000-4000-a000-000000000003';
const service = '00000000-0000-4000-a000-000000000004';
const assignment = '00000000-0000-4000-a000-000000000005';
const args = ['exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-X', '-U', 'postgres'];

function run(sql) {
  const result = spawnSync('docker', args, { input: sql, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function actor(id) {
  return `set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`;
}

function update(id, role) {
  return `select public.update_profile('${JSON.stringify({ id, name: 'Administrador', role, approved: true })}'::jsonb);`;
}

async function race(firstSql, secondSql) {
  let launched = false;
  let second;
  const first = spawn('docker', args);
  let firstError = '';
  first.stderr.on('data', chunk => { firstError += chunk; });
  const firstDone = new Promise(resolve => first.on('close', status => resolve({ status, error: firstError })));
  first.stdout.on('data', chunk => {
    if (!launched && chunk.toString().includes('HOLDING')) {
      launched = true;
      const child = spawn('docker', args);
      let error = '';
      child.stderr.on('data', chunk => { error += chunk; });
      child.stdout.resume();
      second = new Promise(resolve => child.on('close', status => resolve({ status, error })));
      child.stdin.end(secondSql);
    }
  });
  first.stdin.end(firstSql);
  const firstResult = await firstDone;
  assert.ok(launched, 'Second session must start while the first transaction holds its lock');
  const secondResult = await second;
  assert.equal(firstResult.status, 0, firstResult.error);
  return secondResult;
}

try {
  const started = spawnSync('docker', [
    'run', '--detach', '--rm', '--name', container, '--network', 'none',
    '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', image,
  ], { encoding: 'utf8' });
  assert.equal(started.status, 0, started.stderr);

  let ready = false;
  for (let attempt = 0; attempt < 200; attempt++) {
    const logs = spawnSync('docker', ['logs', container], { encoding: 'utf8' });
    if (`${logs.stdout}${logs.stderr}`.includes('PostgreSQL init process complete; ready for start up.')) {
      const probe = spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'postgres'], { encoding: 'utf8' });
      if (probe.status === 0) { ready = true; break; }
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'PostgreSQL did not become ready within the startup deadline');
  run(await readFile(new URL('./auth-stub.sql', import.meta.url), 'utf8'));
  run(await readFile(new URL('../../supabase/migrations/001_initial.sql', import.meta.url), 'utf8'));
  run(`insert into auth.users(id,email,raw_user_meta_data)
    values('${a}','a@test.example','{}'),('${b}','b@test.example','{}');
    update public.profiles set role='admin',approved=true;
    insert into public.people(id,name,email,functions) values('${person}','Pessoa','',array['Voz','Violão']);
    insert into public.services(id,date,time,type) values('${service}','2026-10-11','19:00','Culto de Domingo');`);

  let result = await race(
    `begin; ${actor(a)} ${update(a, 'musician')}\n\\echo HOLDING\nselect pg_sleep(1.5); commit;`,
    `begin; ${actor(b)} ${update(b, 'musician')} commit;`,
  );
  assert.notEqual(result.status, 0);
  assert.match(result.error, /pelo menos um administrador aprovado/);
  assert.match(run("select count(*) from public.profiles where approved and role='admin';"), /1/);

  run("update public.profiles set role='admin',approved=true;");
  result = await race(
    `begin; ${actor(a)} insert into public.assignments(id,service_id,person_id,function,position)
      values('${assignment}','${service}','${person}','Voz',0);
      \n\\echo HOLDING\nselect pg_sleep(1.5); commit;`,
    `begin; ${actor(b)} update public.people set functions=array['Violão'] where id='${person}'; commit;`,
  );
  assert.notEqual(result.status, 0);
  assert.match(result.error, /função está em uma escala/);
  assert.match(run(`select functions from public.people where id='${person}';`), /Voz/);

  run('delete from public.assignments;');
  result = await race(
    `begin; ${actor(a)} update public.people set functions=array['Violão'] where id='${person}';
      \n\\echo HOLDING\nselect pg_sleep(1.5); commit;`,
    `begin; ${actor(b)} insert into public.assignments(id,service_id,person_id,function,position)
      values('${assignment}','${service}','${person}','Voz',0); commit;`,
  );
  assert.notEqual(result.status, 0);
  assert.match(result.error, /função da escala deve constar/);
  assert.match(run('select count(*) from public.assignments;'), /0/);

  run(`update public.people set functions=array['Voz','Violão'] where id='${person}';
    update public.profiles set role='leader' where id='${b}';`);
  run(`${actor(b)} insert into public.assignments(id,service_id,person_id,function,position)
    values('${assignment}','${service}','${person}','Voz',0);`);
  console.log('4 live PostgreSQL 17 scenarios passed: concurrent admin demotions, both assignment/function update orders, leader row locking.');
} finally {
  spawnSync('docker', ['rm', '--force', container], { encoding: 'utf8' });
}
