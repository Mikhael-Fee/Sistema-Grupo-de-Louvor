-- Member profiles: birthday (day and month only), WhatsApp, and the key each
-- person sings every song in. Members edit their own linked team record;
-- administrators still link accounts to team members in Administração.
-- Apply once in the Supabase SQL Editor (as postgres). Re-running is safe.
begin;

alter table public.people add column if not exists birth_month smallint;
alter table public.people add column if not exists birth_day smallint;
alter table public.people add column if not exists whatsapp text not null default '';

alter table public.people drop constraint if exists people_birthday_check;
alter table public.people add constraint people_birthday_check check (
  (birth_month is null) = (birth_day is null)
  and (birth_month is null or (
    birth_month between 1 and 12
    and birth_day between 1 and (array[31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31])[birth_month]
  ))
);
-- Digits only, with the country code (e.g. 5511987654321).
alter table public.people drop constraint if exists people_whatsapp_check;
alter table public.people add constraint people_whatsapp_check check (whatsapp = '' or whatsapp ~ '^[0-9]{10,15}$');

-- A member changes only the team record linked to their own account.
create or replace function public.update_my_person(p_person jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.profiles;
  v_name text;
  v_functions text[];
  v_month smallint;
  v_day smallint;
  v_whatsapp text;
begin
  select * into v_profile from public.profiles where id = auth.uid() and approved;
  if not found then raise exception 'Seu cadastro precisa estar aprovado.' using errcode = '42501'; end if;
  if v_profile.person_id is null then
    raise exception 'Peça a um administrador para vincular sua conta a uma pessoa da equipe.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_person) is distinct from 'object'
    or jsonb_typeof(p_person->'name') is distinct from 'string'
    or jsonb_typeof(p_person->'functions') is distinct from 'array'
    or exists (select 1 from jsonb_array_elements(p_person->'functions') f where jsonb_typeof(f) is distinct from 'string')
    or coalesce(jsonb_typeof(p_person->'birthMonth'), 'null') not in ('number', 'null')
    or coalesce(jsonb_typeof(p_person->'birthDay'), 'null') not in ('number', 'null')
    or coalesce(jsonb_typeof(p_person->'whatsapp'), 'null') not in ('string', 'null') then
    raise exception 'Revise os dados do perfil.' using errcode = '22023';
  end if;
  v_name := btrim(p_person->>'name');
  select coalesce(array_agg(f.value), '{}'::text[]) into v_functions from jsonb_array_elements_text(p_person->'functions') f(value);
  v_month := (p_person->>'birthMonth')::smallint;
  v_day := (p_person->>'birthDay')::smallint;
  v_whatsapp := coalesce(p_person->>'whatsapp', '');
  perform pg_advisory_xact_lock(hashtextextended('person:' || v_profile.person_id::text, 0));
  update public.people
     set name = v_name, functions = v_functions, birth_month = v_month, birth_day = v_day, whatsapp = v_whatsapp
   where id = v_profile.person_id;
  if not found then raise exception 'Pessoa da equipe não encontrada.' using errcode = 'P0002'; end if;
  update public.profiles set name = v_name where id = v_profile.id;
end;
$$;
revoke all on function public.update_my_person(jsonb) from public, anon, authenticated;
grant execute on function public.update_my_person(jsonb) to authenticated;

create table if not exists public.person_song_keys (
  person_id uuid not null references public.people(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  key text not null check (key ~ '^[A-G](#|b)?m?$'),
  updated_at timestamptz not null default now(),
  primary key (person_id, song_id)
);
alter table public.person_song_keys enable row level security;
drop policy if exists person_song_keys_read on public.person_song_keys;
create policy person_song_keys_read on public.person_song_keys for select to authenticated
  using (public.current_ministry_role() is not null);
-- No direct writes: only set_song_key below changes this table.
revoke all on public.person_song_keys from public, anon, authenticated;
grant select on public.person_song_keys to authenticated;

-- Members set their own keys; leaders and administrators may set anyone's.
-- An empty key removes it.
create or replace function public.set_song_key(p_person_id uuid, p_song_id uuid, p_key text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = auth.uid() and approved;
  if not found then raise exception 'Seu cadastro precisa estar aprovado.' using errcode = '42501'; end if;
  if v_profile.role not in ('admin', 'leader') and v_profile.person_id is distinct from p_person_id then
    raise exception 'Você só pode salvar os seus próprios tons.' using errcode = '42501';
  end if;
  if p_person_id is null or p_song_id is null then
    raise exception 'Informe a pessoa e a música.' using errcode = '22023';
  end if;
  if coalesce(p_key, '') = '' then
    delete from public.person_song_keys where person_id = p_person_id and song_id = p_song_id;
  elsif p_key !~ '^[A-G](#|b)?m?$' then
    raise exception 'Escolha um tom válido.' using errcode = '22023';
  else
    insert into public.person_song_keys(person_id, song_id, key) values (p_person_id, p_song_id, p_key)
    on conflict (person_id, song_id) do update set key = excluded.key, updated_at = now();
  end if;
end;
$$;
revoke all on function public.set_song_key(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.set_song_key(uuid, uuid, text) to authenticated;

commit;
