-- Phone notification to whoever suggested a song when a leader approves it.
-- Apply once in the Supabase SQL Editor (as postgres), after 009 and 011. Existing data is kept;
-- suggestions approved before this file count as already notified, so nobody gets old news.

alter table public.song_suggestions add column if not exists approval_notified_at timestamptz;
update public.song_suggestions set approval_notified_at = now() where status = 'approved' and approval_notified_at is null;

-- Leaders and administrators take the notice of one approved suggestion. Taking it marks it
-- as sent, so a second call (another tab, a retry) sends nothing twice. Someone approving
-- their own suggestion gets no notice.
create or replace function public.claim_suggestion_approval_notification(p_suggestion_id uuid)
returns table(suggestion_id uuid, title text, author_name text, song_id uuid, subscriptions jsonb)
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and approved and role in ('admin', 'leader')) then
    raise exception 'Apenas líderes e administradores enviam este aviso.' using errcode = '42501';
  end if;
  return query
  with claimed as (
    update public.song_suggestions s set approval_notified_at = now()
    where s.id = p_suggestion_id and s.status = 'approved' and s.approval_notified_at is null
      and s.created_by is not null and s.created_by <> auth.uid()
    returning s.id, s.title, s.author_name, s.song_id, s.created_by
  )
  select c.id, c.title, c.author_name, c.song_id,
    coalesce((select jsonb_agg(jsonb_build_object('endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth))
      from public.push_subscriptions ps join public.profiles pr on pr.id = ps.user_id
      where ps.user_id = c.created_by and pr.approved), '[]'::jsonb)
  from claimed c;
end;
$$;

revoke all on function public.claim_suggestion_approval_notification(uuid) from public, anon, authenticated;
grant execute on function public.claim_suggestion_approval_notification(uuid) to authenticated;
