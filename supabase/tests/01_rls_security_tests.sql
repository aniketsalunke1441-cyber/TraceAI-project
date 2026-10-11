-- FindBack database security & behaviour tests.
-- Run on a LOCAL PostgreSQL (never on your live Supabase project):
--   createdb findback_test
--   psql -d findback_test -f 00_mock_supabase_env.sql -f ../schema.sql -f 01_rls_security_tests.sql
-- Every result line printed should start with PASS.
\set ON_ERROR_STOP 0
\set QUIET 1
set client_min_messages = notice;

create or replace function t(name text, ok boolean) returns void language plpgsql as $$
begin raise notice '% %', case when ok then 'PASS' else 'FAIL' end, name; end $$;
-- run a statement as the current role; true if it raised an error
create or replace function fails(sql text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return true; end $$;
create or replace function as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(u::text, ''), false) $$;
grant execute on function t(text, boolean), fails(text), as_user(uuid) to anon, authenticated;

\set alice '''11111111-1111-1111-1111-111111111111'''
\set bob   '''22222222-2222-2222-2222-222222222222'''
\set eve   '''33333333-3333-3333-3333-333333333333'''

-- =============================== ITEMS ===============================
set role authenticated;
select as_user(:alice);
insert into items (id, reporter_name, type, title, description, category, color, brand, location, date)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'Alice R.', 'found', '  Black Apple smartphone  ', 'Black phone with blue cover, cracked corner',
        'Electronics', 'Black', 'Apple', 'Library 2nd floor', current_date - 1);
select t('I01 user can create own report', (select count(*) from items) = 1);
select t('I02 text fields are trimmed by the server', (select title from items) = 'Black Apple smartphone');
select t('I03 cannot create report as another user',
  fails($$insert into items (user_id, type, title, category, location, date) values ('22222222-2222-2222-2222-222222222222','lost','Fake one','Keys','Gate', current_date)$$));
select t('I04 future date rejected',
  fails($$insert into items (type, title, category, location, date) values ('lost','Future thing','Keys','Gate', current_date + 5)$$));
select t('I05 unknown category rejected',
  fails($$insert into items (type, title, category, location, date) values ('lost','Some thing','Spaceships','Gate', current_date)$$));
select t('I06 too-short title rejected',
  fails($$insert into items (type, title, category, location, date) values ('lost','ab','Keys','Gate', current_date)$$));
select t('I07 non-http image URL rejected (e.g. javascript:)',
  fails($$insert into items (type, title, category, location, date, image_url) values ('lost','Bad image','Keys','Gate', current_date, 'javascript:alert(1)')$$));
select t('I08 image path in another user''s folder rejected',
  fails($$insert into items (type, title, category, location, date, image_path) values ('lost','Bad path','Keys','Gate', current_date, '22222222-2222-2222-2222-222222222222/x.jpg')$$));
select t('I09 new report cannot start as resolved',
  fails($$insert into items (type, title, category, location, date, status) values ('lost','Sneaky','Keys','Gate', current_date, 'resolved')$$));

select as_user(:bob);
insert into items (id, reporter_name, type, title, description, category, color, brand, location, date)
values ('bbbbbbbb-0000-0000-0000-000000000002', 'Bob S.', 'lost', 'Black iPhone 13', 'Black iPhone in a blue case',
        'Electronics', 'Black', 'Apple', 'Central Library', current_date - 2),
       ('bbbbbbbb-0000-0000-0000-000000000003', 'Bob S.', 'lost', 'Blue water bottle', 'Steel bottle',
        'Water Bottles', 'Blue', 'Milton', 'Gym', current_date - 2);
with u as (update items set title = 'hacked' where id = 'aaaaaaaa-0000-0000-0000-000000000001' returning 1)
  select t('I10 cannot edit another user''s report', (select count(*) from u) = 0);
with d as (delete from items where id = 'aaaaaaaa-0000-0000-0000-000000000001' returning 1)
  select t('I11 cannot delete another user''s report', (select count(*) from d) = 0);
with u as (update items set status = 'resolved' where id = 'aaaaaaaa-0000-0000-0000-000000000001' returning 1)
  select t('I12 cannot resolve another user''s report', (select count(*) from u) = 0);
select t('I13 cannot transfer ownership (user_id not updatable)',
  fails($$update items set user_id = '11111111-1111-1111-1111-111111111111' where id = 'bbbbbbbb-0000-0000-0000-000000000002'$$));
select t('I14 cannot flip lost -> found', fails($$update items set type = 'found' where id = 'bbbbbbbb-0000-0000-0000-000000000002'$$));
select t('I15 cannot rename public reporter name', fails($$update items set reporter_name = 'Admin' where id = 'bbbbbbbb-0000-0000-0000-000000000002'$$));
with u as (update items set description = 'Black iPhone 13 in a blue silicone case' where id = 'bbbbbbbb-0000-0000-0000-000000000002' returning updated_at)
  select t('I16 owner CAN edit own report (updated_at maintained)', (select count(*) from u) = 1);

-- =============================== MATCHES ===============================
select t('M01 user cannot insert matches directly',
  fails($$insert into matches (lost_item_id, found_item_id, score) values ('bbbbbbbb-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001',99)$$));
select save_matches('bbbbbbbb-0000-0000-0000-000000000002',
  '[{"item_id":"aaaaaaaa-0000-0000-0000-000000000001","score":91,"reasons":["Same brand: Apple"],"breakdown":[{"key":"text","value":80}]}]');
select t('M02 owner saves match for own report via save_matches()', (select count(*) from matches) = 1);
select save_matches('bbbbbbbb-0000-0000-0000-000000000002',
  '[{"item_id":"aaaaaaaa-0000-0000-0000-000000000001","score":88,"reasons":[],"breakdown":[]}]');
select t('M03 re-saving updates the score instead of duplicating', (select count(*) = 1 and min(score) = 88 from matches));
select t('M04 lost/found sides stored correctly',
  (select lost_item_id = 'bbbbbbbb-0000-0000-0000-000000000002' and found_item_id = 'aaaaaaaa-0000-0000-0000-000000000001' from matches));
select save_matches('bbbbbbbb-0000-0000-0000-000000000003',
  '[{"item_id":"bbbbbbbb-0000-0000-0000-000000000002","score":90},{"item_id":"aaaaaaaa-0000-0000-0000-000000000001","score":10}]');
select t('M05 invalid candidates skipped (same type / own report / score below threshold)',
  (select count(*) from matches where lost_item_id = 'bbbbbbbb-0000-0000-0000-000000000003') = 0);
select t('M06 forged score above 99 is rejected', (select save_matches('bbbbbbbb-0000-0000-0000-000000000003',
  '[{"item_id":"aaaaaaaa-0000-0000-0000-000000000001","score":500}]')) = 0);
select as_user(:eve);
select t('M07 another user cannot save matches for someone else''s report',
  fails($$select save_matches('bbbbbbbb-0000-0000-0000-000000000002', '[]')$$));
select t('M08 any signed-in user can read potential matches', (select count(*) from matches) = 1);
select t('M09 user cannot edit match scores directly', fails($$update matches set score = 99$$));
reset role; set role anon; select as_user(null);
select t('M10 logged-out visitor can read matches', (select count(*) from matches) = 1);
select t('M11 logged-out visitor cannot call save_matches', fails($$select save_matches('bbbbbbbb-0000-0000-0000-000000000002','[]')$$));
reset role; set role authenticated;

-- =============================== NOTIFICATIONS ===============================
select as_user(:bob);
select t('N01 strong match notified the lost-item owner', (select count(*) from notifications where kind = 'match_found') = 1);
select t('N02 no duplicate notification after the match was re-saved', (select count(*) from notifications) = 1);
with u as (update notifications set read_at = now() returning 1)
  select t('N03 user can mark own notification read', (select count(*) from u) = 1);
select t('N04 user cannot rewrite notification text', fails($$update notifications set title = 'x'$$));
select t('N05 user cannot create notifications', fails($$insert into notifications (user_id, kind, title) values ('22222222-2222-2222-2222-222222222222','match_found','fake')$$));
select as_user(:alice);
select t('N06 finder was notified too', (select count(*) from notifications where kind = 'match_found') = 1);
select as_user(:eve);
select t('N07 outsider sees none of their notifications', (select count(*) from notifications) = 0);

-- matches are cleared when a report changes or is resolved
select as_user(:bob);
update items set location = 'Central Library, 2nd floor' where id = 'bbbbbbbb-0000-0000-0000-000000000002';
select t('M12 editing a report removes its stale matches', (select count(*) from matches) = 0);
select save_matches('bbbbbbbb-0000-0000-0000-000000000002', '[{"item_id":"aaaaaaaa-0000-0000-0000-000000000001","score":93}]');
select t('M13 recalculated match saved again', (select count(*) from matches) = 1);
select t('N08 recalculation did not duplicate notifications', (select count(*) from notifications) = 1);
select save_matches('bbbbbbbb-0000-0000-0000-000000000002', '[]');
select t('M14 stale pairs removed when a recalculation no longer includes them', (select count(*) from matches) = 0);
select save_matches('bbbbbbbb-0000-0000-0000-000000000002', '[{"item_id":"aaaaaaaa-0000-0000-0000-000000000001","score":93}]');

-- =============================== CLAIMS ===============================
select t('C01 cannot self-approve a claim on insert',
  fails($$insert into claims (item_id, owner_id, claimant_name, claimant_contact, message, status) values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Bob','bob@x.com','It is mine, cracked corner','approved')$$));
select t('C02 cannot fake owner_id on a claim',
  fails($$insert into claims (item_id, owner_id, claimant_name, claimant_contact, message) values ('aaaaaaaa-0000-0000-0000-000000000001','33333333-3333-3333-3333-333333333333','Bob','bob@x.com','It is mine, cracked corner')$$));
select t('C03 too-short proof message rejected',
  fails($$insert into claims (item_id, owner_id, claimant_name, claimant_contact, message) values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Bob','bob@x.com','mine')$$));
insert into claims (id, item_id, owner_id, claimant_name, claimant_contact, message)
values ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'Bob Shah', '+91 98765 43210', 'Mountain wallpaper and a cracked bottom-left corner');
select t('C04 claimant can submit a valid claim', (select count(*) from claims) = 1);
select t('C05 no duplicate active claim',
  fails($$insert into claims (item_id, owner_id, claimant_name, claimant_contact, message) values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Bob','bob@x.com','Again: it is my phone')$$));
select t('C06 claimant cannot approve own claim (no direct update)', fails($$update claims set status = 'approved'$$));
select t('C07 claimant cannot approve own claim via decide_claim()',
  fails($$select decide_claim('cccccccc-0000-0000-0000-000000000001','approved','pickup at gate')$$));
select t('C08 cannot claim own report',
  fails($$insert into claims (item_id, owner_id, claimant_name, claimant_contact, message) values ('bbbbbbbb-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','Bob','bob@x.com','This is my own report')$$));
select t('C09 claimant cannot delete claims', fails($$delete from claims$$) or (select count(*) from claims) = 1);

select as_user(:eve);
insert into claims (id, item_id, owner_id, claimant_name, claimant_contact, message)
values ('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'Eve Das', 'eve@x.com', 'I also lost a black phone near the library');
select t('C10 outsider sees only their own claim, not Bob''s contact or proof',
  (select count(*) = 1 and bool_and(claimant_id = '33333333-3333-3333-3333-333333333333') from claims));
select t('C11 outsider cannot decide claims', fails($$select decide_claim('cccccccc-0000-0000-0000-000000000001','rejected','')$$));
select t('C12 public item listing contains no claim contact data',
  (select count(*) from items where description like '%98765%' or reporter_name like '%@%') = 0);

select as_user(:alice);
select t('C13 item owner sees all claims on their item', (select count(*) from claims) = 2);
select t('N09 owner was notified of both new claims', (select count(*) from notifications where kind = 'claim_received') = 2);
select t('C14 approving requires pickup details',
  fails($$select decide_claim('cccccccc-0000-0000-0000-000000000001','approved','ok')$$));
select t('C15 invalid decision value rejected',
  fails($$select decide_claim('cccccccc-0000-0000-0000-000000000001','maybe','whatever text')$$));
select decide_claim('cccccccc-0000-0000-0000-000000000001', 'approved', 'Collect from security office, Gate 1');
select t('C16 owner approves claim atomically',
  (select status = 'approved' and response_note like 'Collect%' from claims where id = 'cccccccc-0000-0000-0000-000000000001'));
select t('C17 approval marks the item returned', (select status from items where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'resolved');
select t('C18 other pending claims auto-rejected',
  (select status from claims where id = 'cccccccc-0000-0000-0000-000000000002') = 'rejected');
select t('C19 a decided claim cannot be decided again',
  fails($$select decide_claim('cccccccc-0000-0000-0000-000000000001','rejected','changed my mind')$$));
select t('M15 resolving the item removed its potential matches', (select count(*) from matches) = 0);
select as_user(:bob);
select t('N10 claimant notified of approval', (select count(*) from notifications where kind = 'claim_approved') = 1);
select t('C20 claimant sees pickup details', (select response_note from claims) like 'Collect%');
select as_user(:eve);
select t('N11 other claimant notified of rejection', (select count(*) from notifications where kind = 'claim_rejected') = 1);
select t('C21 cannot claim an already-returned item',
  fails($$insert into claims (item_id, owner_id, claimant_name, claimant_contact, message) values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Eve','eve@x.com','Trying again on returned item')$$));

-- =============================== STORAGE ===============================
select as_user(:bob);
insert into storage.objects (bucket_id, name) values ('item-images', '22222222-2222-2222-2222-222222222222/phone.jpg');
select t('S01 user can upload a photo to own folder', (select count(*) from storage.objects) = 1);
select t('S02 cannot upload into another user''s folder',
  fails($$insert into storage.objects (bucket_id, name) values ('item-images', '11111111-1111-1111-1111-111111111111/x.jpg')$$));
select t('S03 non-image file extension rejected',
  fails($$insert into storage.objects (bucket_id, name) values ('item-images', '22222222-2222-2222-2222-222222222222/virus.exe')$$));
select t('S04 cannot write to other buckets',
  fails($$insert into storage.objects (bucket_id, name) values ('avatars', '22222222-2222-2222-2222-222222222222/a.jpg')$$));
select t('S05 bucket limits: public, 2 MB, JPEG/PNG/WEBP only',
  (select public and file_size_limit = 2097152 and allowed_mime_types = array['image/jpeg','image/png','image/webp'] from storage.buckets where id = 'item-images'));
select as_user(:eve);
with d as (delete from storage.objects returning 1) select t('S06 cannot delete another user''s photo', (select count(*) from d) = 0);
select as_user(:bob);
with d as (delete from storage.objects returning 1) select t('S07 owner can delete own photo', (select count(*) from d) = 1);
reset role; set role anon; select as_user(null);
select t('S08 logged-out visitor cannot upload', fails($$insert into storage.objects (bucket_id, name) values ('item-images', 'anon/x.jpg')$$));

-- =============================== ANONYMOUS ===============================
select t('A01 logged-out visitor can browse reports', (select count(*) from items) = 3);
select t('A02 logged-out visitor cannot read claims', fails($$select count(*) from claims$$));
select t('A03 logged-out visitor cannot read notifications', fails($$select count(*) from notifications$$));
select t('A04 logged-out visitor cannot post reports',
  fails($$insert into items (type, title, category, location, date) values ('lost','Anon post','Keys','Gate', current_date)$$));
reset role;

-- =============================== PASSWORDS ===============================
select t('P01 auth passwords are stored as bcrypt hashes, never plain text',
  (select bool_and(encrypted_password like '$2%' and encrypted_password not like '%pw-%') from auth.users));
