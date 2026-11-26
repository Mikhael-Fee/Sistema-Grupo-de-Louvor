-- Sugestões de louvores: a equipe sugere músicas a partir de um vídeo do YouTube,
-- curte, comenta e o líder decide. Aprovar cria a música na Biblioteca (cifra pendente).
-- Apply once in the Supabase SQL Editor (as postgres), after 010. Re-running is safe.
-- Every read and write goes through the functions below; the tables have no direct grants.
begin;

create table if not exists public.song_suggestions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 160 and title ~ '[^[:space:]]'),
  artist text not null check (char_length(btrim(artist)) between 1 and 160 and artist ~ '[^[:space:]]'),
  video_id text not null check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  video_title text not null default '' check (char_length(video_title) <= 200),
  channel text not null default '' check (char_length(channel) <= 200),
  status text not null default 'suggested' check (status in ('suggested', 'reviewing', 'approved', 'declined')),
  status_note text not null default '' check (char_length(status_note) <= 300),
  song_id uuid references public.songs(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  author_person_id uuid references public.people(id) on delete set null,
  author_name text not null check (char_length(author_name) between 1 and 160),
  created_at timestamptz not null default now(),
  status_changed_at timestamptz not null default now()
);
create index if not exists song_suggestions_video_idx on public.song_suggestions(video_id);

create table if not exists public.song_suggestion_tags (
  suggestion_id uuid not null references public.song_suggestions(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (suggestion_id, tag_id)
);

create table if not exists public.song_suggestion_votes (
  suggestion_id uuid not null references public.song_suggestions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (suggestion_id, user_id)
);

create table if not exists public.song_suggestion_comments (
  id uuid primary key default gen_random_uuid(),
  suggestion_id uuid not null references public.song_suggestions(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  author_person_id uuid references public.people(id) on delete set null,
  author_name text not null check (char_length(author_name) between 1 and 160),
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists song_suggestion_comments_idx on public.song_suggestion_comments(suggestion_id, created_at);

alter table public.song_suggestions enable row level security;
alter table public.song_suggestion_tags enable row level security;
alter table public.song_suggestion_votes enable row level security;
alter table public.song_suggestion_comments enable row level security;
revoke all on public.song_suggestions, public.song_suggestion_tags, public.song_suggestion_votes,
  public.song_suggestion_comments from public, anon, authenticated;

-- The approved caller, or an error. Used by every function below.
create or replace function public.suggestion_actor() returns public.profiles
language plpgsql stable security definer set search_path = '' as $$
declare
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = auth.uid() and approved;
  if not found then raise exception 'Seu cadastro precisa estar aprovado.' using errcode = '42501'; end if;
  return v_profile;
end;
$$;

-- Everything the Sugestões page shows, in one call. Voters stay anonymous: only the
-- count and whether the caller liked it.
create or replace function public.read_song_suggestions() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_profile public.profiles;
begin
  v_profile := public.suggestion_actor();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'title', s.title, 'artist', s.artist, 'videoId', s.video_id, 'videoTitle', s.video_title,
      'channel', s.channel, 'status', s.status, 'statusNote', s.status_note, 'songId', s.song_id,
      'mine', s.created_by is not distinct from v_profile.id, 'authorPersonId', s.author_person_id,
      'authorName', s.author_name, 'createdAt', s.created_at, 'statusChangedAt', s.status_changed_at,
      'tagIds', coalesce((select jsonb_agg(t.tag_id) from public.song_suggestion_tags t where t.suggestion_id = s.id), '[]'::jsonb),
      'votes', (select count(*) from public.song_suggestion_votes v where v.suggestion_id = s.id),
      'votedByMe', exists (select 1 from public.song_suggestion_votes v where v.suggestion_id = s.id and v.user_id = v_profile.id),
      'lastActivityAt', greatest(s.created_at, s.status_changed_at,
        (select max(v.created_at) from public.song_suggestion_votes v where v.suggestion_id = s.id),
        (select max(c.created_at) from public.song_suggestion_comments c where c.suggestion_id = s.id)),
      'comments', coalesce((select jsonb_agg(jsonb_build_object(
          'id', c.id, 'authorPersonId', c.author_person_id, 'authorName', c.author_name, 'body', c.body,
          'createdAt', c.created_at, 'mine', c.user_id is not distinct from v_profile.id) order by c.created_at)
        from public.song_suggestion_comments c where c.suggestion_id = s.id), '[]'::jsonb)
    ) order by s.created_at desc)
    from public.song_suggestions s
  ), '[]'::jsonb);
end;
$$;

-- Any approved member suggests a song. The same video cannot be open twice.
create or replace function public.create_song_suggestion(p_suggestion jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.profiles;
  v_id uuid := gen_random_uuid();
  v_video text;
  tag jsonb;
begin
  v_profile := public.suggestion_actor();
  if jsonb_typeof(p_suggestion) is distinct from 'object'
    or jsonb_typeof(p_suggestion->'title') is distinct from 'string'
    or jsonb_typeof(p_suggestion->'artist') is distinct from 'string'
    or jsonb_typeof(p_suggestion->'videoId') is distinct from 'string'
    or jsonb_typeof(p_suggestion->'tagIds') is distinct from 'array'
    or jsonb_array_length(p_suggestion->'tagIds') > 10 then
    raise exception 'Revise os dados da sugestão.' using errcode = '22023';
  end if;
  v_video := p_suggestion->>'videoId';
  perform pg_advisory_xact_lock(hashtextextended('suggestion-video:' || v_video, 0));
  if exists (select 1 from public.song_suggestions where video_id = v_video and status in ('suggested', 'reviewing')) then
    raise exception 'Este vídeo já foi sugerido. Curta a sugestão que já existe.' using errcode = '23505';
  end if;
  insert into public.song_suggestions(id, title, artist, video_id, video_title, channel, created_by, author_person_id, author_name)
  values (v_id, btrim(p_suggestion->>'title'), btrim(p_suggestion->>'artist'), v_video,
    left(coalesce(p_suggestion->>'videoTitle', ''), 200), left(coalesce(p_suggestion->>'channel', ''), 200),
    v_profile.id, v_profile.person_id, v_profile.name);
  for tag in select value from jsonb_array_elements(p_suggestion->'tagIds') loop
    if jsonb_typeof(tag) is distinct from 'string' then raise exception 'Etiqueta inválida.' using errcode = '22023'; end if;
    insert into public.song_suggestion_tags(suggestion_id, tag_id) values (v_id, (tag #>> '{}')::uuid) on conflict do nothing;
  end loop;
  return v_id;
end;
$$;

create or replace function public.set_song_suggestion_vote(p_suggestion_id uuid, p_vote boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.profiles;
begin
  v_profile := public.suggestion_actor();
  if not exists (select 1 from public.song_suggestions where id = p_suggestion_id) then
    raise exception 'Sugestão não encontrada.' using errcode = 'P0002';
  end if;
  if p_vote then
    insert into public.song_suggestion_votes(suggestion_id, user_id) values (p_suggestion_id, v_profile.id) on conflict do nothing;
  else
    delete from public.song_suggestion_votes where suggestion_id = p_suggestion_id and user_id = v_profile.id;
  end if;
end;
$$;

create or replace function public.add_song_suggestion_comment(p_suggestion_id uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.profiles;
begin
  v_profile := public.suggestion_actor();
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 500 then
    raise exception 'Escreva um comentário de até 500 caracteres.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.song_suggestions where id = p_suggestion_id) then
    raise exception 'Sugestão não encontrada.' using errcode = 'P0002';
  end if;
  insert into public.song_suggestion_comments(suggestion_id, user_id, author_person_id, author_name, body)
  values (p_suggestion_id, v_profile.id, v_profile.person_id, v_profile.name, btrim(p_body));
end;
$$;

-- Authors remove their own comments; leaders and administrators remove any.
create or replace function public.delete_song_suggestion_comment(p_comment_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.profiles;
begin
  v_profile := public.suggestion_actor();
  delete from public.song_suggestion_comments
   where id = p_comment_id and (user_id = v_profile.id or v_profile.role in ('admin', 'leader'));
  if not found then raise exception 'Comentário não encontrado ou sem permissão.' using errcode = '42501'; end if;
end;
$$;

-- Leaders and administrators move a suggestion between Sugerida, Em avaliação and Recusada.
-- Approval has its own function, and an approved suggestion stays approved.
create or replace function public.set_song_suggestion_status(p_suggestion_id uuid, p_status text, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.profiles;
begin
  v_profile := public.suggestion_actor();
  if v_profile.role not in ('admin', 'leader') then
    raise exception 'Apenas líderes e administradores decidem as sugestões.' using errcode = '42501';
  end if;
  if p_status not in ('suggested', 'reviewing', 'declined') or char_length(coalesce(p_note, '')) > 300 then
    raise exception 'Revise o status da sugestão.' using errcode = '22023';
  end if;
  update public.song_suggestions
     set status = p_status, status_note = btrim(coalesce(p_note, '')), status_changed_at = now()
   where id = p_suggestion_id and status <> 'approved';
  if not found then raise exception 'Sugestão não encontrada ou já aprovada.' using errcode = 'P0002'; end if;
end;
$$;

-- Approving adds the song to the Biblioteca with the video and tags, waiting for lyrics
-- and chords. With p_song_id the suggestion is linked to a song that already exists.
create or replace function public.approve_song_suggestion(p_suggestion_id uuid, p_key text, p_song_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.profiles;
  v_suggestion public.song_suggestions;
  v_song_id uuid;
begin
  v_profile := public.suggestion_actor();
  if v_profile.role not in ('admin', 'leader') then
    raise exception 'Apenas líderes e administradores aprovam sugestões.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('suggestion:' || p_suggestion_id::text, 0));
  select * into v_suggestion from public.song_suggestions where id = p_suggestion_id;
  if not found then raise exception 'Sugestão não encontrada.' using errcode = 'P0002'; end if;
  if v_suggestion.status = 'approved' then raise exception 'Esta sugestão já foi aprovada.' using errcode = '23505'; end if;
  if p_song_id is not null then
    if not exists (select 1 from public.songs where id = p_song_id) then
      raise exception 'Música da Biblioteca não encontrada.' using errcode = 'P0002';
    end if;
    v_song_id := p_song_id;
  else
    if coalesce(p_key, '') !~ '^[A-G](#|b)?$' then raise exception 'Escolha o tom da música.' using errcode = '22023'; end if;
    v_song_id := gen_random_uuid();
    insert into public.songs(id, title, artist, original_key, church_key, content, youtube_url, notes)
    values (v_song_id, v_suggestion.title, v_suggestion.artist, p_key, p_key,
      'Cifra pendente. Edite esta música para adicionar a letra e os acordes.',
      'https://www.youtube.com/watch?v=' || v_suggestion.video_id,
      'Sugerida por ' || v_suggestion.author_name || '.');
    insert into public.song_tags(song_id, tag_id)
      select v_song_id, t.tag_id from public.song_suggestion_tags t where t.suggestion_id = p_suggestion_id;
  end if;
  update public.song_suggestions
     set status = 'approved', song_id = v_song_id, status_note = '', status_changed_at = now()
   where id = p_suggestion_id;
  return v_song_id;
end;
$$;

-- Authors delete their own suggestion while nobody has looked at it yet;
-- leaders and administrators delete any.
create or replace function public.delete_song_suggestion(p_suggestion_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.profiles;
begin
  v_profile := public.suggestion_actor();
  delete from public.song_suggestions
   where id = p_suggestion_id
     and (v_profile.role in ('admin', 'leader') or (created_by = v_profile.id and status = 'suggested'));
  if not found then raise exception 'Sugestão não encontrada ou sem permissão.' using errcode = '42501'; end if;
end;
$$;

revoke all on function public.suggestion_actor(), public.read_song_suggestions(), public.create_song_suggestion(jsonb),
  public.set_song_suggestion_vote(uuid, boolean), public.add_song_suggestion_comment(uuid, text),
  public.delete_song_suggestion_comment(uuid), public.set_song_suggestion_status(uuid, text, text),
  public.approve_song_suggestion(uuid, text, uuid), public.delete_song_suggestion(uuid) from public, anon, authenticated;
grant execute on function public.read_song_suggestions(), public.create_song_suggestion(jsonb),
  public.set_song_suggestion_vote(uuid, boolean), public.add_song_suggestion_comment(uuid, text),
  public.delete_song_suggestion_comment(uuid), public.set_song_suggestion_status(uuid, text, text),
  public.approve_song_suggestion(uuid, text, uuid), public.delete_song_suggestion(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
