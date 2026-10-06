create role anon;
create role authenticated;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb, email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth, public to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
