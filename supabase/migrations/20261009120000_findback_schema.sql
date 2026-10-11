-- Supabase CLI migration (applied by: npx supabase db push).
-- Identical to supabase/schema.sql, which you can also paste into the SQL Editor.
-- Keep both in sync: npm test fails if they differ.

-- =====================================================================
--  FindBack — complete Supabase database schema (PostgreSQL)
--  ---------------------------------------------------------------------
--  HOW TO USE: Supabase dashboard -> SQL Editor -> New query -> paste this
--  whole file -> Run.  It is idempotent: running it again is safe and also
--  upgrades a database created from an older version of this file.
--
--  Tables (all with Row Level Security):
--    items          lost & found reports (public listing, owner-only writes)
--    claims         ownership claims (private: claimant + item owner only)
--    matches        AI-suggested POTENTIAL matches (scores, reasons) —
--                   never proof of ownership; ownership is only verified by
--                   an approved claim
--    notifications  per-user inbox, written only by database triggers
--  Storage:
--    bucket "item-images" (public read, 2 MB max, JPEG/PNG/WEBP only),
--    users may only write/delete inside their own folder  <user-id>/...
--  Functions (RPC):
--    save_matches(item, matches)       store/refresh matches for own report
--    decide_claim(claim, decision, note)  atomic approve/reject by item owner
--
--  Passwords are handled by Supabase Auth (bcrypt-hashed in auth.users);
--  this schema never stores passwords.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. ITEMS — lost and found reports
-- ---------------------------------------------------------------------
create table if not exists public.items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reporter_name text not null default 'Anonymous',   -- short public name, e.g. "Priya S."
  type          text not null,
  title         text not null,
  description   text not null default '',
  category      text not null,
  color         text not null default '',
  brand         text not null default '',
  location      text not null,                       -- approximate location
  date          date not null,                       -- date lost / found
  image_url     text not null default '',            -- public URL of the photo in Storage
  image_path    text not null default '',            -- object path in bucket item-images
  status        text not null default 'open',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- upgrade older installs
alter table public.items add column if not exists image_path text not null default '';
alter table public.items add column if not exists updated_at timestamptz not null default now();

alter table public.items drop constraint if exists items_type_check;
alter table public.items add  constraint items_type_check check (type in ('lost', 'found'));
alter table public.items drop constraint if exists items_status_check;
alter table public.items add  constraint items_status_check check (status in ('open', 'resolved'));
alter table public.items drop constraint if exists items_title_check;
alter table public.items add  constraint items_title_check check (char_length(title) between 3 and 120);
alter table public.items drop constraint if exists items_description_check;
alter table public.items add  constraint items_description_check check (char_length(description) <= 1000);
alter table public.items drop constraint if exists items_category_check;
alter table public.items add  constraint items_category_check check (category in (
  'Electronics', 'Wallets & Purses', 'Bags', 'Keys', 'ID & Cards', 'Documents', 'Clothing',
  'Accessories', 'Jewelry', 'Water Bottles', 'Books & Stationery', 'Other'));
alter table public.items drop constraint if exists items_color_check;
alter table public.items add  constraint items_color_check check (char_length(color) <= 30);
alter table public.items drop constraint if exists items_brand_check;
alter table public.items add  constraint items_brand_check check (char_length(brand) <= 60);
alter table public.items drop constraint if exists items_location_check;
alter table public.items add  constraint items_location_check check (char_length(location) between 2 and 200);
alter table public.items drop constraint if exists items_reporter_name_check;
alter table public.items add  constraint items_reporter_name_check check (char_length(reporter_name) between 1 and 60);
-- older versions stored photos inline as data: URLs; those move to Storage now
update public.items set image_url = '' where image_url is null or image_url like 'data:%';
update public.items set color = coalesce(color, ''), brand = coalesce(brand, '') where color is null or brand is null;
alter table public.items drop constraint if exists items_image_url_check;
alter table public.items add  constraint items_image_url_check
  check (image_url = '' or (image_url ~ '^https?://' and char_length(image_url) <= 1000));
alter table public.items drop constraint if exists items_image_path_check;
alter table public.items add  constraint items_image_path_check check (char_length(image_path) <= 300);

create index if not exists items_type_status_idx on public.items (type, status);
create index if not exists items_user_idx        on public.items (user_id);
create index if not exists items_created_idx     on public.items (created_at desc);

-- Server-side validation that CHECK constraints cannot express.
create or replace function public.items_before_write()
returns trigger language plpgsql set search_path = public as $$
begin
  new.title       := btrim(new.title);
  new.description := btrim(coalesce(new.description, ''));
  new.location    := btrim(new.location);
  new.color       := btrim(coalesce(new.color, ''));
  new.brand       := btrim(coalesce(new.brand, ''));
  if new.date > current_date + 1 then
    raise exception 'The date cannot be in the future' using errcode = '23514';
  end if;
  if new.date < date '2000-01-01' then
    raise exception 'The date is too far in the past' using errcode = '23514';
  end if;
  -- a photo must live in the reporter's own storage folder
  if new.image_path <> '' and split_part(new.image_path, '/', 1) <> new.user_id::text then
    raise exception 'Image must be uploaded to your own folder' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end $$;

drop trigger if exists items_before_write on public.items;
create trigger items_before_write before insert or update on public.items
  for each row execute function public.items_before_write();

-- ---------------------------------------------------------------------
-- 2. CLAIMS — ownership claim workflow
-- ---------------------------------------------------------------------
create table if not exists public.claims (
  id               uuid primary key default gen_random_uuid(),
  item_id          uuid not null references public.items (id) on delete cascade,
  owner_id         uuid not null references auth.users (id) on delete cascade,   -- reporter of the item
  claimant_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  claimant_name    text not null,
  claimant_contact text not null,                 -- PRIVATE
  message          text not null,                 -- PRIVATE proof of ownership
  status           text not null default 'pending',
  response_note    text not null default '',      -- pickup details / reason
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.claims add column if not exists updated_at timestamptz not null default now();
-- upgrade older installs (response_note used to allow NULL)
update public.claims set response_note = '' where response_note is null;

alter table public.claims drop constraint if exists claims_status_check;
alter table public.claims add  constraint claims_status_check check (status in ('pending', 'approved', 'rejected'));
alter table public.claims drop constraint if exists claims_claimant_contact_check;
alter table public.claims add  constraint claims_claimant_contact_check check (char_length(claimant_contact) between 5 and 200);
alter table public.claims drop constraint if exists claims_message_check;
alter table public.claims add  constraint claims_message_check check (char_length(message) between 10 and 2000);
alter table public.claims drop constraint if exists claims_claimant_name_check;
alter table public.claims add  constraint claims_claimant_name_check check (char_length(claimant_name) between 1 and 80);
alter table public.claims drop constraint if exists claims_response_note_check;
alter table public.claims add  constraint claims_response_note_check check (char_length(response_note) <= 1000);

create index if not exists claims_owner_idx    on public.claims (owner_id);
create index if not exists claims_claimant_idx on public.claims (claimant_id);
create index if not exists claims_item_idx     on public.claims (item_id);
-- One active (pending/approved) claim per person per item.
create unique index if not exists claims_one_active_per_user
  on public.claims (item_id, claimant_id) where status <> 'rejected';

-- ---------------------------------------------------------------------
-- 3. MATCHES — AI-suggested potential matches (lost <-> found)
-- ---------------------------------------------------------------------
create table if not exists public.matches (
  id            uuid primary key default gen_random_uuid(),
  lost_item_id  uuid not null references public.items (id) on delete cascade,
  found_item_id uuid not null references public.items (id) on delete cascade,
  score         smallint not null,
  reasons       jsonb not null default '[]'::jsonb,   -- e.g. ["Same brand: Apple", ...]
  breakdown     jsonb not null default '[]'::jsonb,   -- per-signal scores
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint matches_unique_pair unique (lost_item_id, found_item_id)   -- no duplicate matches
);

alter table public.matches drop constraint if exists matches_score_check;
alter table public.matches add  constraint matches_score_check check (score between 0 and 99);
alter table public.matches drop constraint if exists matches_distinct_check;
alter table public.matches add  constraint matches_distinct_check check (lost_item_id <> found_item_id);
alter table public.matches drop constraint if exists matches_json_check;
alter table public.matches add  constraint matches_json_check check (
  jsonb_typeof(reasons) = 'array' and jsonb_array_length(reasons) <= 10 and
  jsonb_typeof(breakdown) = 'array' and jsonb_array_length(breakdown) <= 10);

create index if not exists matches_found_idx on public.matches (found_item_id);

-- ---------------------------------------------------------------------
-- 4. NOTIFICATIONS — written only by triggers below
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text not null default '',
  link       text not null default '',
  ref_id     uuid,                       -- claim id or the other item's id
  read_at    timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_unique unique (user_id, kind, ref_id)   -- no duplicate notifications
);

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add  constraint notifications_kind_check
  check (kind in ('claim_received', 'claim_approved', 'claim_rejected', 'match_found'));

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- 5. FUNCTIONS (RPC) — run with elevated rights but check auth.uid() first
-- ---------------------------------------------------------------------

-- Store the matches the app computed for one of the caller's OWN reports.
-- Replaces that report's previous match set (stale pairs are removed),
-- re-validates every pair, and upserts so a pair is never duplicated.
create or replace function public.save_matches(p_item_id uuid, p_matches jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_item  public.items;
  v_other public.items;
  m       jsonb;
  v_score integer;
  v_keep  uuid[] := '{}';
  v_count integer := 0;
begin
  select * into v_item from public.items where id = p_item_id;
  if v_item.id is null then
    raise exception 'Report not found' using errcode = 'P0002';
  end if;
  if v_item.user_id is distinct from auth.uid() then
    raise exception 'Only the reporter can refresh matches for this report' using errcode = '42501';
  end if;
  if p_matches is null or jsonb_typeof(p_matches) <> 'array' or jsonb_array_length(p_matches) > 50 then
    raise exception 'Invalid matches payload' using errcode = '22023';
  end if;

  if v_item.status = 'open' then
    for m in select value from jsonb_array_elements(p_matches) loop
      v_other := null;
      select * into v_other from public.items where id = (m ->> 'item_id')::uuid;
      v_score := (m ->> 'score')::integer;
      if v_other.id is null or v_other.type = v_item.type or v_other.status <> 'open'
         or v_other.user_id = v_item.user_id or v_score is null or v_score < 35 or v_score > 99 then
        continue;  -- silently skip anything that is not a valid candidate
      end if;
      insert into public.matches (lost_item_id, found_item_id, score, reasons, breakdown)
      values (
        case when v_item.type = 'lost' then v_item.id else v_other.id end,
        case when v_item.type = 'found' then v_item.id else v_other.id end,
        v_score,
        case when jsonb_typeof(m -> 'reasons') = 'array' and jsonb_array_length(m -> 'reasons') <= 10
             then m -> 'reasons' else '[]'::jsonb end,
        case when jsonb_typeof(m -> 'breakdown') = 'array' and jsonb_array_length(m -> 'breakdown') <= 10
             then m -> 'breakdown' else '[]'::jsonb end)
      on conflict (lost_item_id, found_item_id) do update
        set score = excluded.score, reasons = excluded.reasons,
            breakdown = excluded.breakdown, updated_at = now();
      v_keep := v_keep || v_other.id;
      v_count := v_count + 1;
    end loop;
  end if;

  delete from public.matches
   where (lost_item_id = p_item_id and not (found_item_id = any (v_keep)))
      or (found_item_id = p_item_id and not (lost_item_id = any (v_keep)));
  return v_count;
end $$;

-- Item owner approves or rejects a claim — atomically.
-- Approving: marks the item returned and rejects the other pending claims.
create or replace function public.decide_claim(p_claim_id uuid, p_decision text, p_note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  v_claim public.claims;
  v_note  text := left(btrim(coalesce(p_note, '')), 1000);
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Invalid decision' using errcode = '22023';
  end if;
  select * into v_claim from public.claims where id = p_claim_id for update;
  if v_claim.id is null or v_claim.owner_id is distinct from auth.uid() then
    raise exception 'Only the person who posted this report can respond to claims' using errcode = '42501';
  end if;
  if v_claim.status <> 'pending' then
    raise exception 'This claim has already been answered' using errcode = '55000';
  end if;
  if p_decision = 'approved' and char_length(v_note) < 5 then
    raise exception 'Add pickup details (at least 5 characters)' using errcode = '22023';
  end if;

  update public.claims set status = p_decision, response_note = v_note, updated_at = now()
   where id = p_claim_id;

  if p_decision = 'approved' then
    update public.claims
       set status = 'rejected', response_note = 'Another claim was approved for this item.', updated_at = now()
     where item_id = v_claim.item_id and status = 'pending' and id <> p_claim_id;
    update public.items set status = 'resolved' where id = v_claim.item_id;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 6. TRIGGERS — keep matches fresh and create notifications
-- ---------------------------------------------------------------------

-- When a report's details change or it is resolved, its old match scores are
-- stale: remove them (the app recalculates and saves new ones right after).
create or replace function public.items_after_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'open'
     or (new.title, new.description, new.category, new.color, new.brand, new.location, new.date)
        is distinct from
        (old.title, old.description, old.category, old.color, old.brand, old.location, old.date) then
    delete from public.matches where lost_item_id = new.id or found_item_id = new.id;
  end if;
  return null;
end $$;

drop trigger if exists items_after_update on public.items;
create trigger items_after_update after update on public.items
  for each row execute function public.items_after_update();

create or replace function public.notify_claim_created()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_title text;
begin
  select title into v_title from public.items where id = new.item_id;
  insert into public.notifications (user_id, kind, title, body, link, ref_id)
  values (new.owner_id, 'claim_received', 'New ownership claim',
          format('%s submitted a claim for "%s". Review it to approve or reject.', new.claimant_name, v_title),
          '/items/' || new.item_id, new.id)
  on conflict (user_id, kind, ref_id) do nothing;
  return null;
end $$;

drop trigger if exists claims_after_insert on public.claims;
create trigger claims_after_insert after insert on public.claims
  for each row execute function public.notify_claim_created();

create or replace function public.notify_claim_decided()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_title text;
begin
  if old.status = 'pending' and new.status in ('approved', 'rejected') then
    select title into v_title from public.items where id = new.item_id;
    insert into public.notifications (user_id, kind, title, body, link, ref_id)
    values (new.claimant_id,
            case when new.status = 'approved' then 'claim_approved' else 'claim_rejected' end,
            case when new.status = 'approved' then 'Claim approved' else 'Claim not approved' end,
            format('Your claim for "%s" was %s.', v_title, new.status),
            '/claims', new.id)
    on conflict (user_id, kind, ref_id) do nothing;
  end if;
  return null;
end $$;

drop trigger if exists claims_after_update on public.claims;
create trigger claims_after_update after update of status on public.claims
  for each row execute function public.notify_claim_decided();

create or replace function public.notify_match_created()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_lost public.items; v_found public.items;
begin
  if new.score < 60 then return null; end if;
  select * into v_lost  from public.items where id = new.lost_item_id;
  select * into v_found from public.items where id = new.found_item_id;
  insert into public.notifications (user_id, kind, title, body, link, ref_id)
  values (v_lost.user_id, 'match_found', 'Potential match for your lost item',
          format('"%s" looks like your "%s" (%s%% match). Not verified yet — open it to check.', v_found.title, v_lost.title, new.score),
          '/items/' || v_found.id, v_found.id),
         (v_found.user_id, 'match_found', 'Potential owner for an item you found',
          format('"%s" may be the item you found (%s%% match).', v_lost.title, new.score),
          '/items/' || v_lost.id, v_lost.id)
  on conflict (user_id, kind, ref_id) do nothing;
  return null;
end $$;

drop trigger if exists matches_after_insert on public.matches;
create trigger matches_after_insert after insert on public.matches
  for each row execute function public.notify_match_created();

-- ---------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY POLICIES
-- ---------------------------------------------------------------------
alter table public.items         enable row level security;
alter table public.claims        enable row level security;
alter table public.matches       enable row level security;
alter table public.notifications enable row level security;

-- items: public read; authors write their own
drop policy if exists "items are public"       on public.items;
drop policy if exists "users insert own items" on public.items;
drop policy if exists "users update own items" on public.items;
drop policy if exists "users delete own items" on public.items;
create policy "items are public"       on public.items for select using (true);
create policy "users insert own items" on public.items for insert to authenticated
  with check (auth.uid() = user_id and status = 'open');
create policy "users update own items" on public.items for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users delete own items" on public.items for delete to authenticated
  using (auth.uid() = user_id);

-- claims: only the two parties can read; decisions only via decide_claim()
drop policy if exists "claim parties can read"       on public.claims;
drop policy if exists "users create claims"          on public.claims;
drop policy if exists "item owner responds to claim" on public.claims;
create policy "claim parties can read" on public.claims for select to authenticated
  using (auth.uid() = claimant_id or auth.uid() = owner_id);
create policy "users create claims" on public.claims for insert to authenticated
  with check (
    auth.uid() = claimant_id
    and claimant_id <> owner_id
    and status = 'pending'
    and response_note = ''
    and exists (
      select 1 from public.items i
      where i.id = item_id and i.user_id = owner_id and i.status = 'open'
    )
  );

-- matches: readable by everyone (derived only from public report data);
-- written only through save_matches() and triggers
drop policy if exists "matches are public" on public.matches;
create policy "matches are public" on public.matches for select using (true);

-- notifications: each user sees / marks read / deletes only their own
drop policy if exists "users read own notifications"   on public.notifications;
drop policy if exists "users update own notifications" on public.notifications;
drop policy if exists "users delete own notifications" on public.notifications;
create policy "users read own notifications"   on public.notifications for select to authenticated
  using (auth.uid() = user_id);
create policy "users update own notifications" on public.notifications for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users delete own notifications" on public.notifications for delete to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 8. TABLE & COLUMN PRIVILEGES (defence in depth on top of RLS)
--    Supabase grants ALL on new tables to anon/authenticated by default,
--    so we explicitly take back everything that is not needed.
-- ---------------------------------------------------------------------
revoke all on public.items, public.claims, public.matches, public.notifications from anon, authenticated;

grant select on public.items   to anon, authenticated;
grant select on public.matches to anon, authenticated;

grant insert, delete on public.items to authenticated;
grant update (title, description, category, color, brand, location, date, image_url, image_path, status)
  on public.items to authenticated;          -- never user_id, type, reporter_name or created_at

grant select, insert on public.claims to authenticated;   -- no direct update/delete: use decide_claim()

grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

revoke all on function public.save_matches(uuid, jsonb)        from public, anon;
revoke all on function public.decide_claim(uuid, text, text)   from public, anon;
grant execute on function public.save_matches(uuid, jsonb)      to authenticated;
grant execute on function public.decide_claim(uuid, text, text) to authenticated;
revoke all on function public.items_before_write()   from public, anon, authenticated;
revoke all on function public.items_after_update()   from public, anon, authenticated;
revoke all on function public.notify_claim_created() from public, anon, authenticated;
revoke all on function public.notify_claim_decided() from public, anon, authenticated;
revoke all on function public.notify_match_created() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 9. STORAGE — item photos
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('item-images', 'item-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Anyone can VIEW photos through their public URL (bucket is public).
-- Signed-in users can upload / see / delete objects ONLY inside "<their user id>/".
-- Wrapped so that, if this project does not allow the SQL Editor to manage storage
-- policies, everything above still succeeds and a clear message is shown instead.
do $storage$
begin
  drop policy if exists "findback: upload own item images" on storage.objects;
  drop policy if exists "findback: read own item images"   on storage.objects;
  drop policy if exists "findback: delete own item images" on storage.objects;

  create policy "findback: upload own item images" on storage.objects for insert to authenticated
    with check (
      bucket_id = 'item-images'
      and (storage.foldername(name))[1] = auth.uid()::text
      and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
    );
  create policy "findback: read own item images" on storage.objects for select to authenticated
    using (bucket_id = 'item-images' and (storage.foldername(name))[1] = auth.uid()::text);
  create policy "findback: delete own item images" on storage.objects for delete to authenticated
    using (bucket_id = 'item-images' and (storage.foldername(name))[1] = auth.uid()::text);
  raise notice 'FindBack: storage policies created.';
exception when insufficient_privilege then
  raise warning 'FindBack: could not create storage policies (%). Create them in Storage -> Policies (see README section 3).', sqlerrm;
end
$storage$;

-- Done. Expected result in the SQL Editor: "Success. No rows returned".
