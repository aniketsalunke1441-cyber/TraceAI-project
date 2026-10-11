-- Recreates the parts of Supabase that schema.sql relies on, so the schema and
-- its security rules can be tested on a plain local PostgreSQL (14+).
-- Do NOT run this on your real Supabase project (those objects already exist there).

-- roles are cluster-wide, so create them only if missing
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
grant anon, authenticated to current_user;

-- auth schema: users + auth.uid() reading the JWT "sub" claim, like Supabase
create schema auth;
create table auth.users (
  id uuid primary key,
  email text unique,
  encrypted_password text,                       -- bcrypt hash (Supabase Auth never stores plain text)
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

-- storage schema: buckets + objects with RLS, and the helper functions Supabase provides
create schema storage;
create table storage.buckets (
  id text primary key,
  name text not null,
  owner uuid,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now()
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid default auth.uid(),
  owner_id text default auth.uid()::text,
  metadata jsonb,
  created_at timestamptz default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
create function storage.extension(name text) returns text language sql immutable as $$
  select reverse(split_part(reverse(split_part(name, '/', -1)), '.', 1))
$$;
grant usage on schema storage to anon, authenticated;
grant all on storage.objects to anon, authenticated;
grant select on storage.buckets to anon, authenticated;

grant usage on schema public to anon, authenticated;
-- Supabase grants ALL on new public tables to anon/authenticated by default (RLS does the work)
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;

create extension if not exists pgcrypto;
insert into auth.users (id, email, encrypted_password, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'alice@x.com', crypt('pw-alice', gen_salt('bf')), '{"full_name":"Alice Rao"}'),
  ('22222222-2222-2222-2222-222222222222', 'bob@x.com',   crypt('pw-bob',   gen_salt('bf')), '{"full_name":"Bob Shah"}'),
  ('33333333-3333-3333-3333-333333333333', 'eve@x.com',   crypt('pw-eve',   gen_salt('bf')), '{"full_name":"Eve Das"}');
