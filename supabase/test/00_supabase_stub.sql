-- Minimal stand-in for Supabase's built-in `auth` schema & roles, just enough
-- to validate our migrations' RLS/grants logic on a plain local Postgres.

do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

grant usage on schema public to anon, authenticated;
-- Supabase's default posture: broad table grants, RLS is the real gate.
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;

create schema if not exists auth;
create or replace function auth.role() returns text as $$
  select current_setting('request.jwt.claim.role', true);
$$ language sql stable;

create or replace function auth.uid() returns uuid as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$ language sql stable;
