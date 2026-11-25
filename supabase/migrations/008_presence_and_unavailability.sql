-- Presence confirmation per assignment and dates when a team member cannot serve.
-- Apply once in the Supabase SQL Editor (as postgres). Existing data is kept;
-- every existing assignment starts as "pending".
begin;

alter table public.assignments add column status text not null default 'pending'
  check (status in ('pending', 'confirmed', 'declined'));
alter table public.assignments add column status_note text not null default ''
  check (char_length(status_note) <= 300);

-- The scale check (only planners, functions registered, active people) now runs only
-- when the scale itself changes, so a member's answer does not count as editing it.
drop trigger assignment_function_check on public.assignments;
create trigger assignment_function_check before insert or update of service_id, person_id, function, position
on public.assignments for each row execute function public.check_assignment_function();

-- A changed person or function is a new invitation: the answer starts over.
-- save_service keeps unchanged rows by id, so their answers survive other edits.
create function public.reset_assignment_status() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.person_id is distinct from old.person_id or new.function is distinct from old.function then
    new.status := 'pending'; new.status_note := '';
  end if;
  return new;
end;
$$;
create trigger assignments_reset_status before update on public.assignments
for each row execute function public.reset_assignment_status();
revoke all on function public.reset_assignment_status() from public, anon, authenticated;

-- Members answer only for themselves (profile linked to the person);
-- leaders and administrators may record an answer for anyone.
create function public.respond_assignment(p_assignment_id uuid, p_status text, p_note text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.profiles;
  v_person uuid;
begin
  select * into v_profile from public.profiles where id = auth.uid() and approved;
  if not found then raise exception 'Seu cadastro precisa estar aprovado.' using errcode = '42501'; end if;
  if p_status is null or p_status not in ('pending', 'confirmed', 'declined') then
    raise exception 'Escolha confirmar ou recusar a escala.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_note, '')) > 300 then
    raise exception 'A observação pode ter até 300 caracteres.' using errcode = '22023';
  end if;
  select person_id into v_person from public.assignments where id = p_assignment_id;
  if not found then raise exception 'Escala não encontrada.' using errcode = 'P0002'; end if;
  if v_profile.role not in ('admin', 'leader') and v_profile.person_id is distinct from v_person then
    raise exception 'Você só pode responder às suas próprias escalas.' using errcode = '42501';
  end if;
  update public.assignments set status = p_status, status_note = btrim(coalesce(p_note, ''))
    where id = p_assignment_id;
end;
$$;
revoke all on function public.respond_assignment(uuid, text, text) from public, anon, authenticated;
grant execute on function public.respond_assignment(uuid, text, text) to authenticated;

create table public.unavailability (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  date date not null,
  note text not null default '' check (char_length(note) <= 200),
  unique(person_id, date)
);
create index unavailability_date_idx on public.unavailability(date);
alter table public.unavailability enable row level security;
create policy unavailability_read on public.unavailability for select to authenticated
  using (public.current_ministry_role() is not null);
-- No direct writes: only set_unavailability below changes this table.
revoke all on public.unavailability from public, anon, authenticated;
grant select on public.unavailability to authenticated;

create function public.set_unavailability(p_person_id uuid, p_date date, p_unavailable boolean, p_note text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = auth.uid() and approved;
  if not found then raise exception 'Seu cadastro precisa estar aprovado.' using errcode = '42501'; end if;
  if v_profile.role not in ('admin', 'leader') and v_profile.person_id is distinct from p_person_id then
    raise exception 'Você só pode marcar as suas próprias datas.' using errcode = '42501';
  end if;
  if p_person_id is null or p_date is null or p_unavailable is null then
    raise exception 'Informe a pessoa e a data.' using errcode = '22023';
  end if;
  if p_date < current_date - 1 or p_date > current_date + 730 then
    raise exception 'Escolha uma data entre hoje e os próximos dois anos.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_note, '')) > 200 then
    raise exception 'A observação pode ter até 200 caracteres.' using errcode = '22023';
  end if;
  if p_unavailable then
    insert into public.unavailability(person_id, date, note) values (p_person_id, p_date, btrim(coalesce(p_note, '')))
    on conflict (person_id, date) do update set note = excluded.note;
  else
    delete from public.unavailability where person_id = p_person_id and date = p_date;
  end if;
end;
$$;
revoke all on function public.set_unavailability(uuid, date, boolean, text) from public, anon, authenticated;
grant execute on function public.set_unavailability(uuid, date, boolean, text) to authenticated;

commit;
