-- Keep existing services and planning permissions while allowing ministry themes.
begin;

alter table public.services drop constraint if exists services_type_check;
alter table public.services add constraint services_type_check
  check (char_length(type) <= 100 and type ~ '[^[:space:]]');

commit;
