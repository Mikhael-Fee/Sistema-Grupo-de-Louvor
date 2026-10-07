-- Optional consultation without a login. Disabled until an approved admin
-- enables it; no private table privileges are changed by this migration.
-- Close access immediately with save_public_access(false) as an approved admin.
-- Full reversal: drop these three functions, then public.public_access. The
-- ministry tables and records from 001_initial.sql remain intact.
begin;

create table public.public_access (
  id boolean primary key default true check (id),
  public_enabled boolean not null default false
);
insert into public.public_access (id, public_enabled) values (true, false);
alter table public.public_access enable row level security;
create policy public_access_admin_read on public.public_access for select to authenticated
using (public.current_ministry_role() = 'admin');
revoke all on public.public_access from public, anon, authenticated;
grant select on public.public_access to authenticated;

-- Feature availability is nonsecret; never exposes accounts or contacts.
create function public.get_public_access() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select public_enabled from public.public_access where id), false);
$$;

create function public.save_public_access(p_enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_enabled is null then
    raise exception 'Informe se a consulta pública deve ser habilitada.' using errcode = '22023';
  end if;
  perform 1 from public.public_access where id for update;
  if not exists (select 1 from public.profiles where id = auth.uid() and approved and role = 'admin') then
    raise exception 'Somente administradores aprovados podem configurar a consulta pública.' using errcode = '42501';
  end if;
  insert into public.public_access (id, public_enabled) values (true, p_enabled)
  on conflict (id) do update set public_enabled = excluded.public_enabled;
end;
$$;

-- A fixed whitelist supplies the existing MinistryData shape. Contacts are
-- replaced with an empty string; profiles/auth users are never queried here.
-- Names, capabilities, musical notes, planning, lyrics and chords are shared
-- only when the ministry deliberately enables this consultation mode.
create function public.read_public_ministry() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce((select public_enabled from public.public_access where id), false) then
    raise exception 'A consulta pública ainda não foi liberada pelo ministério.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'songs', coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id, 'title', s.title, 'artist', s.artist,
      'originalKey', s.original_key, 'churchKey', s.church_key,
      'content', s.content, 'youtubeUrl', s.youtube_url, 'notes', s.notes,
      'tagIds', coalesce((select jsonb_agg(st.tag_id order by st.tag_id) from public.song_tags st where st.song_id = s.id), '[]'::jsonb)
    ) order by s.title, s.id) from public.songs s), '[]'::jsonb),
    'tags', coalesce((select jsonb_agg(jsonb_build_object(
      'id', t.id, 'name', t.name, 'color', t.color
    ) order by t.name, t.id) from public.tags t), '[]'::jsonb),
    'people', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'email', '', 'functions', p.functions
    ) order by p.name, p.id) from public.people p), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id, 'date', to_char(s.date, 'YYYY-MM-DD'), 'time', left(s.time::text, 5), 'type', s.type, 'notes', s.notes,
      'assignments', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'personId', a.person_id, 'function', a.function
      ) order by a.position) from public.assignments a where a.service_id = s.id), '[]'::jsonb),
      'repertoire', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'songId', r.song_id, 'key', r.key, 'notes', r.notes
      ) order by r.position) from public.repertoire r where r.service_id = s.id), '[]'::jsonb)
    ) order by s.date, s.time, s.id) from public.services s), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_public_access(), public.save_public_access(boolean), public.read_public_ministry()
from public, anon, authenticated;
grant execute on function public.get_public_access(), public.read_public_ministry() to anon, authenticated;
grant execute on function public.save_public_access(boolean) to authenticated;

commit;
