-- Dedicated to one ministry. Apply once in the Supabase SQL Editor (as postgres).
-- No demonstration records or privileged user credentials are installed.
begin;

create table public.people (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 160 and name ~ '[^[:space:]]'),
  email text not null default '' check (email = '' or (char_length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  functions text[] not null check (
    cardinality(functions) between 1 and 7 and array_position(functions, null) is null
    and functions <@ array['Voz', 'Teclado', 'Violão', 'Guitarra', 'Baixo', 'Bateria', 'Percussão']::text[]
  )
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160 and name ~ '[^[:space:]]'),
  role text not null default 'musician' check (role in ('admin', 'leader', 'musician')),
  approved boolean not null default false,
  person_id uuid unique references public.people(id) on delete restrict
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80 and name ~ '[^[:space:]]'),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$')
);
create unique index tags_name_unique on public.tags (lower(btrim(name)));

create function public.valid_youtube_url(value text) returns boolean
language sql immutable set search_path = '' as $$
  select value = '' or (
    value ~ '^https://(www\.|m\.)?youtube\.com/watch\?[^[:space:]#]+(#[^[:space:]]*)?$'
    and value ~ '[?&]v=[A-Za-z0-9_-]{11}(&|#|$)'
    and (select count(*) from regexp_matches(value, '[?&]v=', 'g')) = 1
  ) or value ~ '^https://(www\.|m\.)?youtube\.com/(shorts|embed|live)/[A-Za-z0-9_-]{11}/?([?][^[:space:]#]*)?(#[^[:space:]]*)?$'
    or value ~ '^https://(www\.)?youtu\.be/[A-Za-z0-9_-]{11}/?([?][^[:space:]#]*)?(#[^[:space:]]*)?$';
$$;

create table public.songs (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 160 and title ~ '[^[:space:]]'),
  artist text not null check (char_length(btrim(artist)) between 1 and 160 and artist ~ '[^[:space:]]'),
  original_key text not null check (original_key ~ '^[A-G](#|b)?m?$'),
  church_key text not null check (church_key ~ '^[A-G](#|b)?m?$'),
  content text not null check (char_length(content) <= 200000 and content ~ '[^[:space:]]'),
  youtube_url text not null default '' check (char_length(youtube_url) <= 2000 and public.valid_youtube_url(youtube_url)),
  notes text not null default '' check (char_length(notes) <= 20000)
);

create table public.song_tags (
  song_id uuid not null references public.songs(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (song_id, tag_id)
);
create index song_tags_tag_idx on public.song_tags(tag_id);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  time time without time zone not null check (time < time '24:00:00' and extract(second from time) = 0),
  type text not null check (type in ('Culto de Domingo', 'Culto de Quinta', 'Culto de Oração', 'Ceia', 'Jovens', 'Irmãs', 'Varões', 'Especial')),
  notes text not null default '' check (char_length(notes) <= 20000)
);
create index services_date_idx on public.services(date, time);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete restrict,
  function text not null check (function in ('Voz', 'Teclado', 'Violão', 'Guitarra', 'Baixo', 'Bateria', 'Percussão')),
  position integer not null check (position >= 0),
  unique(service_id, person_id, function),
  unique(service_id, position)
);
create index assignments_person_idx on public.assignments(person_id);

create table public.repertoire (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete restrict,
  position integer not null check (position >= 0),
  key text not null check (key ~ '^[A-G](#|b)?m?$'),
  notes text not null default '' check (char_length(notes) <= 20000),
  unique(service_id, position),
  unique(service_id, song_id)
);
create index repertoire_song_idx on public.repertoire(song_id);

-- Only this helper bypasses profile RLS to avoid recursive policy evaluation.
-- It returns the current caller's approved role, never another person's data.
create function public.current_ministry_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid() and approved;
$$;

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  safe_name text;
begin
  safe_name := case when jsonb_typeof(new.raw_user_meta_data->'name') = 'string'
    then btrim(left(regexp_replace(new.raw_user_meta_data->>'name', '[[:cntrl:]]', '', 'g'), 160))
    else '' end;
  if safe_name = '' then safe_name := 'Novo integrante'; end if;
  -- Neither role nor approval is taken from user-controlled metadata.
  insert into public.profiles (id, name, role, approved)
  values (new.id, safe_name, 'musician', false);
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Assignment functions must match the person's registered abilities. Removing
-- an ability that is already in use is blocked even through direct table writes.
create function public.check_assignment_function() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  person_functions text[];
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and approved and role in ('admin', 'leader')) then
    raise exception 'Seu perfil não pode alterar escalas.' using errcode = '42501';
  end if;
  -- SHARE conflicts with updates of this person's abilities. This prevents a
  -- concurrent ability removal and assignment from each accepting stale data.
  -- Definer is required because leaders may lock/read, but not update, people.
  select functions into person_functions from public.people where id = new.person_id for share;
  if person_functions is null or not (new.function = any(person_functions)) then
    raise exception 'A função da escala deve constar no cadastro da pessoa.' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger assignment_function_check before insert or update on public.assignments
for each row execute function public.check_assignment_function();

create function public.check_person_functions() returns trigger
language plpgsql set search_path = '' as $$
begin
  if cardinality(new.functions) <> (select count(distinct value) from unnest(new.functions) as value) then
    raise exception 'Selecione cada função da pessoa apenas uma vez.' using errcode = '23514';
  end if;
  if exists (select 1 from public.assignments where person_id = new.id and not (function = any(new.functions))) then
    raise exception 'Esta função está em uma escala. Ajuste a escala antes de removê-la.' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger person_functions_check before insert or update of functions on public.people
for each row execute function public.check_person_functions();

alter table public.profiles enable row level security;
alter table public.people enable row level security;
alter table public.tags enable row level security;
alter table public.songs enable row level security;
alter table public.song_tags enable row level security;
alter table public.services enable row level security;
alter table public.assignments enable row level security;
alter table public.repertoire enable row level security;

create policy profiles_read on public.profiles for select to authenticated
using (id = auth.uid() or public.current_ministry_role() = 'admin');

create policy people_read on public.people for select to authenticated using (public.current_ministry_role() is not null);
create policy people_admin on public.people for all to authenticated
using (public.current_ministry_role() = 'admin') with check (public.current_ministry_role() = 'admin');
create policy tags_read on public.tags for select to authenticated using (public.current_ministry_role() is not null);
create policy tags_admin on public.tags for all to authenticated
using (public.current_ministry_role() = 'admin') with check (public.current_ministry_role() = 'admin');
create policy songs_read on public.songs for select to authenticated using (public.current_ministry_role() is not null);
create policy songs_admin on public.songs for all to authenticated
using (public.current_ministry_role() = 'admin') with check (public.current_ministry_role() = 'admin');
create policy song_tags_read on public.song_tags for select to authenticated using (public.current_ministry_role() is not null);
create policy song_tags_admin on public.song_tags for all to authenticated
using (public.current_ministry_role() = 'admin') with check (public.current_ministry_role() = 'admin');
create policy services_read on public.services for select to authenticated using (public.current_ministry_role() is not null);
create policy services_planners on public.services for all to authenticated
using (public.current_ministry_role() in ('admin', 'leader')) with check (public.current_ministry_role() in ('admin', 'leader'));
create policy assignments_read on public.assignments for select to authenticated using (public.current_ministry_role() is not null);
create policy assignments_planners on public.assignments for all to authenticated
using (public.current_ministry_role() in ('admin', 'leader')) with check (public.current_ministry_role() in ('admin', 'leader'));
create policy repertoire_read on public.repertoire for select to authenticated using (public.current_ministry_role() is not null);
create policy repertoire_planners on public.repertoire for all to authenticated
using (public.current_ministry_role() in ('admin', 'leader')) with check (public.current_ministry_role() in ('admin', 'leader'));

-- Aggregate writes are atomic: invalid links roll back the entire operation.
-- Advisory locks serialize edits of the same aggregate without locking every
-- service/song in the ministry. UUID hash collisions only cause extra waiting.
create function public.save_song(p_song jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_song_id uuid;
  tag jsonb;
begin
  if jsonb_typeof(p_song) is distinct from 'object' or jsonb_typeof(p_song->'tagIds') is distinct from 'array' then
    raise exception 'Informe uma música e uma lista de etiquetas válidas.' using errcode = '22023';
  end if;
  v_song_id := (p_song->>'id')::uuid;
  if v_song_id is null then raise exception 'Informe o identificador da música.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('song:' || v_song_id::text, 0));
  if not exists (select 1 from public.profiles where id = auth.uid() and approved and role = 'admin') then
    raise exception 'Somente administradores aprovados podem salvar músicas.' using errcode = '42501';
  end if;
  insert into public.songs(id, title, artist, original_key, church_key, content, youtube_url, notes)
  values (v_song_id, btrim(p_song->>'title'), btrim(p_song->>'artist'), p_song->>'originalKey', p_song->>'churchKey',
    coalesce(p_song->>'content', ''), btrim(coalesce(p_song->>'youtubeUrl', '')), coalesce(p_song->>'notes', ''))
  on conflict (id) do update set title = excluded.title, artist = excluded.artist, original_key = excluded.original_key,
    church_key = excluded.church_key, content = excluded.content, youtube_url = excluded.youtube_url, notes = excluded.notes;
  delete from public.song_tags where public.song_tags.song_id = v_song_id;
  for tag in select value from jsonb_array_elements(p_song->'tagIds') loop
    if jsonb_typeof(tag) is distinct from 'string' then
      raise exception 'Etiqueta inválida.' using errcode = '22023';
    end if;
    insert into public.song_tags(song_id, tag_id) values(v_song_id, (tag #>> '{}')::uuid);
  end loop;
end;
$$;

create function public.save_service(p_service jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_service_id uuid;
  item jsonb;
  item_position integer;
begin
  if jsonb_typeof(p_service) is distinct from 'object'
    or jsonb_typeof(p_service->'assignments') is distinct from 'array'
    or jsonb_typeof(p_service->'repertoire') is distinct from 'array' then
    raise exception 'Informe um culto com escala e repertório válidos.' using errcode = '22023';
  end if;
  if coalesce(p_service->>'date', '') !~ '^\d{4}-\d{2}-\d{2}$'
    or coalesce(p_service->>'time', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Informe data e horário válidos para o culto.' using errcode = '22023';
  end if;
  v_service_id := (p_service->>'id')::uuid;
  if v_service_id is null then raise exception 'Informe o identificador do culto.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('service:' || v_service_id::text, 0));
  if not exists (select 1 from public.profiles where id = auth.uid() and approved and role in ('admin', 'leader')) then
    raise exception 'Somente líderes ou administradores aprovados podem planejar cultos.' using errcode = '42501';
  end if;
  insert into public.services(id, date, time, type, notes)
  values(v_service_id, (p_service->>'date')::date, (p_service->>'time')::time, p_service->>'type', coalesce(p_service->>'notes', ''))
  on conflict(id) do update set date = excluded.date, time = excluded.time, type = excluded.type, notes = excluded.notes;
  delete from public.assignments where public.assignments.service_id = v_service_id;
  delete from public.repertoire where public.repertoire.service_id = v_service_id;
  item_position := 0;
  for item in select value from jsonb_array_elements(p_service->'assignments') loop
    if jsonb_typeof(item) is distinct from 'object' or (item->>'id') is null then
      raise exception 'Item de escala inválido.' using errcode = '22023';
    end if;
    insert into public.assignments(id, service_id, person_id, function, position)
    values((item->>'id')::uuid, v_service_id, (item->>'personId')::uuid, item->>'function', item_position);
    item_position := item_position + 1;
  end loop;
  item_position := 0;
  for item in select value from jsonb_array_elements(p_service->'repertoire') loop
    if jsonb_typeof(item) is distinct from 'object' or (item->>'id') is null then
      raise exception 'Item de repertório inválido.' using errcode = '22023';
    end if;
    insert into public.repertoire(id, service_id, song_id, position, key, notes)
    values((item->>'id')::uuid, v_service_id, (item->>'songId')::uuid, item_position, item->>'key', coalesce(item->>'notes', ''));
    item_position := item_position + 1;
  end loop;
end;
$$;

create function public.update_profile(p_profile jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  target_id uuid;
  target_role text;
  target_approved boolean;
  old_profile public.profiles%rowtype;
begin
  if jsonb_typeof(p_profile) is distinct from 'object' or jsonb_typeof(p_profile->'approved') is distinct from 'boolean' then
    raise exception 'Informe um perfil e um estado de aprovação válidos.' using errcode = '22023';
  end if;
  -- All administrative profile changes share this transaction lock. In
  -- concurrent demotions, the second transaction sees the first one's result.
  perform pg_advisory_xact_lock(7381285602679431);
  if not exists (select 1 from public.profiles where id = auth.uid() and approved and role = 'admin') then
    raise exception 'Somente administradores aprovados podem alterar perfis.' using errcode = '42501';
  end if;
  target_id := (p_profile->>'id')::uuid;
  target_role := p_profile->>'role';
  target_approved := (p_profile->>'approved')::boolean;
  select * into old_profile from public.profiles where id = target_id for update;
  if not found then raise exception 'Perfil não encontrado.' using errcode = 'P0002'; end if;
  if old_profile.role = 'admin' and old_profile.approved
    and (target_role is distinct from 'admin' or not target_approved)
    and (select count(*) from public.profiles where role = 'admin' and approved) <= 1 then
    raise exception 'Mantenha pelo menos um administrador aprovado antes de alterar este perfil.' using errcode = '23514';
  end if;
  update public.profiles set name = btrim(p_profile->>'name'), role = target_role, approved = target_approved,
    person_id = nullif(p_profile->>'personId', '')::uuid where id = target_id;
end;
$$;

-- Explicit privileges remove Supabase's broad default table/function grants.
-- Anonymous sessions cannot read data. Profiles have no direct write grant or
-- write policy: even administrators must use the guarded administrative RPC.
revoke all on public.people, public.profiles, public.tags, public.songs, public.song_tags,
  public.services, public.assignments, public.repertoire from public, anon, authenticated;
grant select on public.people, public.profiles, public.tags, public.songs, public.song_tags,
  public.services, public.assignments, public.repertoire to authenticated;
grant insert, update, delete on public.people, public.tags, public.songs, public.song_tags,
  public.services, public.assignments, public.repertoire to authenticated;

revoke all on function public.current_ministry_role(), public.valid_youtube_url(text),
  public.handle_new_user(), public.check_assignment_function(), public.check_person_functions(),
  public.save_song(jsonb), public.save_service(jsonb), public.update_profile(jsonb) from public, anon, authenticated;
grant execute on function public.current_ministry_role(), public.valid_youtube_url(text),
  public.save_song(jsonb), public.save_service(jsonb), public.update_profile(jsonb) to authenticated;

commit;
