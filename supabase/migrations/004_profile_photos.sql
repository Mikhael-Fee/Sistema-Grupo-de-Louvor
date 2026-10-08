-- Optional public avatars. Existing profiles, people and ministry permissions stay intact.
-- This project origin is deliberate; configure-profile-photos.mjs substitutes only
-- the validated project-ref literal when installing into another Supabase project.
-- Files are immutable: upload a new UUID, commit its URL, then delete the old file.
begin;

create function public.valid_ministry_avatar_url(value text) returns boolean
language sql immutable set search_path = '' as $$
  select value = '' or value ~ '^https://fxebsycpbybhzkpnxzoo\.supabase\.co/storage/v1/object/public/avatars/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|png|jpeg)$';
$$;

create function public.ministry_avatar_object_name(value text) returns text
language sql immutable set search_path = '' as $$
  select case when value <> '' and public.valid_ministry_avatar_url(value)
    then substring(value from '/storage/v1/object/public/avatars/(.+)$') else null end;
$$;

alter table public.profiles add column photo_url text not null default '';
alter table public.people add column photo_url text not null default '';
alter table public.profiles add constraint profiles_photo_url_check check (
  public.valid_ministry_avatar_url(photo_url)
  and (photo_url = '' or split_part(public.ministry_avatar_object_name(photo_url), '/', 1) = id::text)
);
alter table public.people add constraint people_photo_url_check check (public.valid_ministry_avatar_url(photo_url));

-- Supabase Storage checks MIME/size before upload. No SVG, GIF or arbitrary URL.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Do not grant administrators write access to other users' profile pictures.
-- This predicate sees references under definer privileges and exposes only a
-- deletion decision; pending users cannot read ministry records through it.
create function public.can_delete_ministry_avatar(object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and object_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|png|jpeg)$'
    and not exists (select 1 from public.profiles p where public.ministry_avatar_object_name(p.photo_url) = object_name)
    and not exists (select 1 from public.people p where public.ministry_avatar_object_name(p.photo_url) = object_name)
    and (public.current_ministry_role() = 'admin' or split_part(object_name, '/', 1) = auth.uid()::text);
$$;

create policy ministry_avatars_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars' and auth.uid() is not null
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|png|jpeg)$'
  and split_part(name, '/', 1) = auth.uid()::text
);
create policy ministry_avatars_select on storage.objects for select to authenticated
using (bucket_id = 'avatars' and (split_part(name, '/', 1) = auth.uid()::text or public.can_delete_ministry_avatar(name)));
create policy ministry_avatars_delete on storage.objects for delete to authenticated
using (bucket_id = 'avatars' and public.can_delete_ministry_avatar(name));
-- No UPDATE policy: uploading always uses upsert=false and a fresh object UUID.
-- Public bucket downloads use Storage's public endpoint; anon cannot list/write.

create function public.check_person_avatar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.photo_url = '' or (tg_op = 'UPDATE' and new.photo_url is not distinct from old.photo_url) then return new; end if;
  -- PostgREST upsert runs BEFORE INSERT before ON CONFLICT reaches UPDATE.
  -- Another approved admin may preserve the same person's existing picture;
  -- the UPDATE trigger still checks any actual change after a concurrent edit.
  if tg_op = 'INSERT' and exists (
    select 1 from public.people p where p.id = new.id and p.photo_url = new.photo_url
  ) then return new; end if;
  if not public.valid_ministry_avatar_url(new.photo_url) then
    raise exception 'A foto deve usar o armazenamento de imagens deste ministério.' using errcode = '23514';
  end if;
  if auth.uid() is not null and (
    public.current_ministry_role() is distinct from 'admin'
    or split_part(public.ministry_avatar_object_name(new.photo_url), '/', 1) <> auth.uid()::text
  ) then
    raise exception 'Somente administradores aprovados podem usar seu próprio envio na equipe.' using errcode = '42501';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'avatars' and name = public.ministry_avatar_object_name(new.photo_url)) then
    raise exception 'Envie a imagem antes de salvar a foto.' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger person_avatar_check before insert or update of photo_url on public.people
for each row execute function public.check_person_avatar();

-- Any signed-in account may set its own picture, including a pending account.
-- Role, approval, person link, name and every other profile remain untouched.
create function public.update_my_profile_photo(p_photo_url text) returns void
language plpgsql security definer set search_path = '' as $$
declare own_id uuid := auth.uid();
begin
  if own_id is null then raise exception 'Entre na sua conta para alterar a foto.' using errcode = '42501'; end if;
  if p_photo_url is null or not public.valid_ministry_avatar_url(p_photo_url)
    or (p_photo_url <> '' and split_part(public.ministry_avatar_object_name(p_photo_url), '/', 1) <> own_id::text) then
    raise exception 'Escolha uma imagem enviada pela própria conta.' using errcode = '23514';
  end if;
  perform 1 from public.profiles where id = own_id for update;
  if not found then raise exception 'Perfil não encontrado.' using errcode = 'P0002'; end if;
  if p_photo_url <> '' and not exists (select 1 from storage.objects where bucket_id = 'avatars' and name = public.ministry_avatar_object_name(p_photo_url)) then
    raise exception 'Envie a imagem antes de salvar a foto.' using errcode = '23514';
  end if;
  update public.profiles set photo_url = p_photo_url where id = own_id;
end;
$$;

create or replace function public.read_public_ministry() returns jsonb
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
      'id', p.id, 'name', p.name, 'email', '', 'functions', p.functions, 'photoUrl', p.photo_url
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

revoke all on function public.valid_ministry_avatar_url(text), public.ministry_avatar_object_name(text),
  public.can_delete_ministry_avatar(text), public.check_person_avatar(), public.update_my_profile_photo(text)
from public, anon, authenticated;
grant execute on function public.valid_ministry_avatar_url(text), public.ministry_avatar_object_name(text),
  public.can_delete_ministry_avatar(text), public.update_my_profile_photo(text) to authenticated;
-- CREATE OR REPLACE preserves public consultation's existing explicit grants.

commit;
