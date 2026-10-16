-- Remove people from the active roster without deleting their identity,
-- existing scales, linked accounts or photographs. Re-running is safe.
begin;

alter table public.people add column if not exists active boolean not null default true;

-- Status changes have one explicit API. Saving a person (including from an old
-- open editor) preserves the current status and an omitted stored photograph.
create or replace function public.save_person(p_person jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_person_id uuid;
  v_functions text[];
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and approved and role = 'admin') then
    raise exception 'Somente administradores aprovados podem salvar integrantes.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_person) is distinct from 'object'
    or jsonb_typeof(p_person->'functions') is distinct from 'array'
    or exists (select 1 from jsonb_array_elements(p_person->'functions') f where jsonb_typeof(f) is distinct from 'string')
    or (p_person ? 'photoUrl' and jsonb_typeof(p_person->'photoUrl') is distinct from 'string') then
    raise exception 'Informe um integrante e suas funções válidas.' using errcode = '22023';
  end if;
  v_person_id := (p_person->>'id')::uuid;
  if v_person_id is null then raise exception 'Informe o identificador do integrante.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('person:' || v_person_id::text, 0));
  select coalesce(array_agg(f.value), '{}'::text[]) into v_functions
    from jsonb_array_elements_text(p_person->'functions') f(value);
  insert into public.people(id, name, email, functions, photo_url)
  values(v_person_id, btrim(p_person->>'name'), btrim(coalesce(p_person->>'email', '')), v_functions,
    coalesce(p_person->>'photoUrl', (select p.photo_url from public.people p where p.id = v_person_id), ''))
  on conflict(id) do update set name = excluded.name, email = excluded.email,
    functions = excluded.functions, photo_url = case when p_person ? 'photoUrl' then excluded.photo_url else public.people.photo_url end;
end;
$$;

create or replace function public.set_person_active(p_person_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and approved and role = 'admin') then
    raise exception 'Somente administradores aprovados podem alterar a equipe ativa.' using errcode = '42501';
  end if;
  if p_person_id is null or p_active is null then
    raise exception 'Informe o integrante e seu estado na equipe.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('person:' || p_person_id::text, 0));
  update public.people set active = p_active where id = p_person_id;
  if not found then raise exception 'Integrante não encontrado.' using errcode = 'P0002'; end if;
end;
$$;
revoke all on function public.save_person(jsonb), public.set_person_active(uuid, boolean) from public, anon, authenticated;
grant execute on function public.save_person(jsonb), public.set_person_active(uuid, boolean) to authenticated;

create or replace function public.check_assignment_function() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  person_functions text[];
  person_active boolean;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and approved and role in ('admin', 'leader')) then
    raise exception 'Seu perfil não pode alterar escalas.' using errcode = '42501';
  end if;
  -- The same row lock also serializes adding a scale against archiving a person.
  select functions, active into person_functions, person_active from public.people where id = new.person_id for share;
  if person_functions is null or not (new.function = any(person_functions)) then
    raise exception 'A função da escala deve constar no cadastro da pessoa.' using errcode = '23514';
  end if;
  if not person_active then
    if tg_op <> 'UPDATE' then
      raise exception 'Escolha um integrante da equipe ativa para novas escalas.' using errcode = '23514';
    end if;
    if new.id is distinct from old.id or new.service_id is distinct from old.service_id
      or new.person_id is distinct from old.person_id or new.function is distinct from old.function then
      raise exception 'O vínculo de um integrante retirado só pode ser mantido no culto existente.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.check_assignment_function() from public, anon, authenticated;

create or replace function public.save_service(p_service jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_service_id uuid;
  v_is_event boolean;
  v_previous_videos jsonb;
  v_youtube_url text;
  item jsonb;
  item_position integer;
  v_position_offset integer;
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
  -- Keep retained assignment rows instead of deleting/recreating them. An
  -- archived person's existing link is allowed to move position, but cannot be
  -- added to another service, changed to another function, or recreated.
  if exists (select 1 from jsonb_array_elements(p_service->'assignments') a
    where jsonb_typeof(a) is distinct from 'object' or a->>'id' is null) then
    raise exception 'Item de escala inválido.' using errcode = '22023';
  end if;
  if (select count(*) <> count(distinct a->>'id') from jsonb_array_elements(p_service->'assignments') a) then
    raise exception 'Uma escala não pode repetir o identificador de um integrante.' using errcode = '23505';
  end if;
  if exists (select 1 from public.assignments a
    join jsonb_array_elements(p_service->'assignments') i on a.id = (i->>'id')::uuid
    where a.service_id <> v_service_id) then
    raise exception 'Um item de escala pertence a outro culto.' using errcode = '23514';
  end if;
  delete from public.assignments a where a.service_id = v_service_id
    and not exists (select 1 from jsonb_array_elements(p_service->'assignments') i where (i->>'id')::uuid = a.id);
  -- A temporary disjoint range permits arbitrary reordering with the existing
  -- immediate UNIQUE(service_id, position) constraint. No constraint is removed.
  select coalesce(max(a.position), -1) + jsonb_array_length(p_service->'assignments') + 1
    into v_position_offset from public.assignments a where a.service_id = v_service_id;
  update public.assignments set position = position + v_position_offset where service_id = v_service_id;
  delete from public.repertoire where public.repertoire.service_id = v_service_id;
  item_position := 0;
  for item in select value from jsonb_array_elements(p_service->'assignments') loop
    if jsonb_typeof(item) is distinct from 'object' or (item->>'id') is null then
      raise exception 'Item de escala inválido.' using errcode = '22023';
    end if;
    update public.assignments set person_id = (item->>'personId')::uuid,
      function = item->>'function', position = item_position
      where id = (item->>'id')::uuid and service_id = v_service_id;
    if not found then
      insert into public.assignments(id, service_id, person_id, function, position)
      values((item->>'id')::uuid, v_service_id, (item->>'personId')::uuid, item->>'function', item_position);
    end if;
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

commit;
