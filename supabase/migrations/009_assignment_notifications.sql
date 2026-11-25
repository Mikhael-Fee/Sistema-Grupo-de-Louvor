-- E-mail and phone notifications when someone is added to a scale.
-- Apply once in the Supabase SQL Editor (as postgres), after 008. Existing data is kept;
-- every assignment that already exists counts as already notified, so nobody gets old news.

alter table public.assignments add column notified_at timestamptz;
update public.assignments set notified_at = now();

-- A changed person or function is a new invitation: answer and notice start over.
create or replace function public.reset_assignment_status() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.person_id is distinct from old.person_id or new.function is distinct from old.function then
    new.status := 'pending'; new.status_note := ''; new.notified_at := null;
  end if;
  return new;
end;
$$;
revoke all on function public.reset_assignment_status() from public, anon, authenticated;

-- One row per device that accepted notifications. Only the functions below touch it.
create table public.push_subscriptions (
  endpoint text primary key check (char_length(endpoint) between 20 and 1000 and endpoint ~ '^https://'),
  user_id uuid not null references public.profiles(id) on delete cascade,
  p256dh text not null check (char_length(p256dh) between 20 and 200),
  auth text not null check (char_length(auth) between 8 and 100),
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public, anon, authenticated;

create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and approved) then
    raise exception 'Seu cadastro precisa estar aprovado.' using errcode = '42501';
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or char_length(p_endpoint) not between 20 and 1000
    or char_length(coalesce(p_p256dh, '')) not between 20 and 200 or char_length(coalesce(p_auth, '')) not between 8 and 100 then
    raise exception 'Este aparelho não enviou uma inscrição válida.' using errcode = '22023';
  end if;
  -- A device shared by another account now belongs to whoever signed in last.
  insert into public.push_subscriptions(endpoint, user_id, p256dh, auth) values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
  -- At most 10 devices per account: the oldest ones stop receiving.
  delete from public.push_subscriptions where user_id = auth.uid() and endpoint in (
    select endpoint from public.push_subscriptions where user_id = auth.uid() order by created_at desc offset 10);
end;
$$;

create function public.delete_push_subscription(p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

-- Leaders and administrators take the not-yet-notified invitations of one upcoming
-- service, one row per person. Taking them marks them as notified, so a second call
-- (another tab, a retry) sends nothing twice.
create function public.claim_assignment_notifications(p_service_id uuid)
returns table(person_id uuid, person_name text, functions text[], email text, subscriptions jsonb,
  service_id uuid, service_date date, service_time time, service_type text)
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and approved and role in ('admin', 'leader')) then
    raise exception 'Apenas líderes e administradores enviam avisos de escala.' using errcode = '42501';
  end if;
  return query
  with claimed as (
    update public.assignments a set notified_at = now()
    from public.services s
    where a.service_id = p_service_id and s.id = a.service_id and a.notified_at is null and a.status = 'pending'
      and s.date >= (now() at time zone 'America/Sao_Paulo')::date
    returning a.person_id, a.function, a.position
  )
  select p.id, p.name, array_agg(c.function order by c.position),
    coalesce(nullif(p.email, ''), (select u.email from public.profiles pr join auth.users u on u.id = pr.id
      where pr.person_id = p.id and pr.approved limit 1), '')::text,
    coalesce((select jsonb_agg(jsonb_build_object('endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth))
      from public.push_subscriptions ps join public.profiles pr on pr.id = ps.user_id
      where pr.person_id = p.id and pr.approved), '[]'::jsonb),
    s.id, s.date, s.time, s.type
  from claimed c join public.people p on p.id = c.person_id join public.services s on s.id = p_service_id
  group by p.id, p.name, p.email, s.id, s.date, s.time, s.type;
end;
$$;

-- Devices the push service reports as gone (uninstalled app, blocked notifications).
create function public.forget_push_subscriptions(p_endpoints text[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and approved and role in ('admin', 'leader')) then
    raise exception 'Apenas líderes e administradores removem aparelhos.' using errcode = '42501';
  end if;
  delete from public.push_subscriptions where endpoint = any(coalesce(p_endpoints, '{}'));
end;
$$;

revoke all on function public.save_push_subscription(text, text, text) from public, anon, authenticated;
revoke all on function public.delete_push_subscription(text) from public, anon, authenticated;
revoke all on function public.claim_assignment_notifications(uuid) from public, anon, authenticated;
revoke all on function public.forget_push_subscriptions(text[]) from public, anon, authenticated;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;
grant execute on function public.claim_assignment_notifications(uuid) to authenticated;
grant execute on function public.forget_push_subscriptions(text[]) to authenticated;
