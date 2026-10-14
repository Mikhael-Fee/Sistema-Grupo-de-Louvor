-- Add calendar event markers and per-service video versions without replacing
-- existing tables/IDs, team links, photos or accounts. Public consultation is
-- permanently closed, including for an old installed app. Re-running is safe.
begin;

alter table public.services add column if not exists is_event boolean not null default false;
alter table public.repertoire add column if not exists youtube_url text not null default '';
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.repertoire'::regclass
    and conname = 'repertoire_youtube_url_check') then
    alter table public.repertoire add constraint repertoire_youtube_url_check
      check (char_length(youtube_url) <= 2000 and public.valid_youtube_url(youtube_url));
  end if;
end;
$$;

create or replace function public.save_service(p_service jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_service_id uuid;
  v_is_event boolean;
  v_previous_videos jsonb;
  v_youtube_url text;
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
  if p_service ? 'isEvent' and jsonb_typeof(p_service->'isEvent') is distinct from 'boolean' then
    raise exception 'Indique se o culto é um evento.' using errcode = '22023';
  end if;
  v_service_id := (p_service->>'id')::uuid;
  if v_service_id is null then raise exception 'Informe o identificador do culto.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('service:' || v_service_id::text, 0));
  if not exists (select 1 from public.profiles where id = auth.uid() and approved and role in ('admin', 'leader')) then
    raise exception 'Somente líderes ou administradores aprovados podem planejar cultos.' using errcode = '42501';
  end if;
  -- A previous installed client omits the new fields. Preserve saved event and
  -- video values on those edits; an explicit false/empty string clears them.
  v_is_event := coalesce((p_service->>'isEvent')::boolean,
    (select s.is_event from public.services s where s.id = v_service_id), false);
  select coalesce(jsonb_object_agg(r.id::text, jsonb_build_object('songId', r.song_id, 'url', r.youtube_url)), '{}'::jsonb)
    into v_previous_videos from public.repertoire r where r.service_id = v_service_id;

  insert into public.services(id, date, time, type, notes, is_event)
  values(v_service_id, (p_service->>'date')::date, (p_service->>'time')::time, p_service->>'type', coalesce(p_service->>'notes', ''), v_is_event)
  on conflict(id) do update set date = excluded.date, time = excluded.time, type = excluded.type,
    notes = excluded.notes, is_event = excluded.is_event;
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
    if item ? 'youtubeUrl' and jsonb_typeof(item->'youtubeUrl') is distinct from 'string' then
      raise exception 'Informe um link de vídeo válido para o repertório.' using errcode = '22023';
    end if;
    v_youtube_url := case when item ? 'youtubeUrl' then btrim(item->>'youtubeUrl')
      when v_previous_videos->(item->>'id')->>'songId' = item->>'songId'
        then coalesce(v_previous_videos->(item->>'id')->>'url', '')
      else '' end;
    insert into public.repertoire(id, service_id, song_id, position, key, notes, youtube_url)
    values((item->>'id')::uuid, v_service_id, (item->>'songId')::uuid, item_position,
      item->>'key', coalesce(item->>'notes', ''), v_youtube_url);
    item_position := item_position + 1;
  end loop;
end;
$$;
revoke all on function public.save_service(jsonb) from public, anon, authenticated;
grant execute on function public.save_service(jsonb) to authenticated;

update public.public_access set public_enabled = false where public_enabled;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.public_access'::regclass
    and conname = 'public_access_disabled_check') then
    alter table public.public_access add constraint public_access_disabled_check check (not public_enabled);
  end if;
end;
$$;

-- These compatibility endpoints expose no ministry data and cannot restore
-- guest mode. Direct approved-account reads continue through existing RLS.
create or replace function public.get_public_access() returns boolean
language sql stable security definer set search_path = '' as $$ select false; $$;

create or replace function public.read_public_ministry() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'Entre em uma conta aprovada para consultar o ministério.' using errcode = '42501';
end;
$$;

create or replace function public.save_public_access(p_enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'A consulta sem login foi desativada. Entre em uma conta aprovada.' using errcode = '42501';
end;
$$;
revoke all on function public.get_public_access(), public.read_public_ministry(), public.save_public_access(boolean)
  from public, anon, authenticated;

commit;
