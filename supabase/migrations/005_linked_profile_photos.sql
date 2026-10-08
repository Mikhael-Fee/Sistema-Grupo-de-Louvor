-- Display-only association of an approved account picture with its team person.
-- No URL is copied into people/profiles, and no roles, contacts or records change.
-- An explicit team-person picture keeps priority in the UI. This migration is
-- idempotent and can be re-run without resetting photos, links or public access.
begin;

create or replace function public.read_team_profile_photos() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.current_ministry_role() is null then
    raise exception 'Seu cadastro precisa estar aprovado para consultar as fotos da equipe.' using errcode = '42501';
  end if;
  -- Only team-person IDs and already-public avatar URLs leave this function.
  -- No Auth-ID, account-name, email, role or approval fields are returned.
  -- The public avatar URL already includes its uploader UUID in the path.
  return coalesce((select jsonb_agg(jsonb_build_object(
    'personId', p.person_id, 'photoUrl', p.photo_url
  ) order by p.person_id) from public.profiles p
    where p.approved and p.person_id is not null and p.photo_url <> ''), '[]'::jsonb);
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
      'id', p.id, 'name', p.name, 'email', '', 'functions', p.functions, 'photoUrl', p.photo_url,
      'accountPhotoUrl', coalesce((select pr.photo_url from public.profiles pr
        where pr.person_id = p.id and pr.approved), '')
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

revoke all on function public.read_team_profile_photos() from public, anon, authenticated;
grant execute on function public.read_team_profile_photos() to authenticated;
-- Re-establish the exact public-read grants without changing table privileges.
revoke all on function public.read_public_ministry() from public, anon, authenticated;
grant execute on function public.read_public_ministry() to anon, authenticated;

commit;
