-- Flohmarkt am Ebertplatz booking schema
create extension if not exists pgcrypto;

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  event_date date not null,
  starts_at time,
  ends_at time,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists stands (
  id text primary key,
  section text not null check (section in ('A','B','C')),
  meters int not null check (meters in (2,3)),
  price_cents int not null check (price_cents >= 0),
  deposit_cents int not null default 1000 check (deposit_cents >= 0)
);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id),
  stand_id text not null references stands(id),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  street text not null,
  postal_code text not null,
  city text not null,
  stand_price_cents int not null,
  deposit_cents int not null,
  total_cents int not null,
  status text not null default 'held' check (status in ('held','paid','cancelled','expired','refunded')),
  held_until timestamptz not null,
  paypal_order_id text unique,
  paypal_capture_id text unique,
  deposit_refunded_at timestamptz,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create table if not exists event_stands (
  event_id uuid not null references events(id) on delete cascade,
  stand_id text not null references stands(id) on delete cascade,
  status text not null default 'free' check (status in ('free','held','booked','blocked')),
  held_until timestamptz,
  booking_id uuid references bookings(id) on delete set null,
  primary key (event_id, stand_id)
);

create index if not exists bookings_email_idx on bookings (lower(email));
create index if not exists bookings_status_idx on bookings (status);
create index if not exists event_stands_status_idx on event_stands (event_id, status);

alter table events enable row level security;
alter table stands enable row level security;
alter table bookings enable row level security;
alter table event_stands enable row level security;

create or replace function create_booking_hold(
  p_stand_id text, p_first_name text, p_last_name text, p_email text, p_phone text,
  p_street text, p_postal_code text, p_city text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_event_id uuid; v_stand stands%rowtype; v_row event_stands%rowtype;
  v_booking_id uuid := gen_random_uuid();
  v_held_until timestamptz := now() + interval '10 minutes';
begin
  select id into v_event_id from events
  where active=true and event_date>=current_date order by event_date limit 1;
  if v_event_id is null then raise exception 'NO_ACTIVE_EVENT'; end if;

  select * into v_stand from stands where id=p_stand_id;
  if not found then raise exception 'UNKNOWN_STAND'; end if;

  select * into v_row from event_stands
  where event_id=v_event_id and stand_id=p_stand_id for update;
  if not found then raise exception 'UNKNOWN_EVENT_STAND'; end if;

  if v_row.status='held' and v_row.held_until<=now() then
    if v_row.booking_id is not null then
      update bookings set status='expired' where id=v_row.booking_id and status='held';
    end if;
    update event_stands set status='free', held_until=null, booking_id=null
    where event_id=v_event_id and stand_id=p_stand_id;
    v_row.status := 'free';
  end if;
  if v_row.status<>'free' then raise exception 'STAND_NOT_AVAILABLE'; end if;

  insert into bookings (
    id,event_id,stand_id,first_name,last_name,email,phone,street,postal_code,city,
    stand_price_cents,deposit_cents,total_cents,held_until
  ) values (
    v_booking_id,v_event_id,v_stand.id,p_first_name,p_last_name,lower(p_email),p_phone,p_street,p_postal_code,p_city,
    v_stand.price_cents,v_stand.deposit_cents,v_stand.price_cents+v_stand.deposit_cents,v_held_until
  );

  update event_stands set status='held',held_until=v_held_until,booking_id=v_booking_id
  where event_id=v_event_id and stand_id=p_stand_id;
  return v_booking_id;
end; $$;

create or replace function prepare_booking_capture(p_booking_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_booking bookings%rowtype; v_slot event_stands%rowtype;
begin
  select * into v_booking from bookings where id=p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.status='paid' then return; end if;
  if v_booking.status<>'held' then raise exception 'BOOKING_NOT_HELD'; end if;

  select * into v_slot from event_stands
  where event_id=v_booking.event_id and stand_id=v_booking.stand_id for update;
  if not found or v_slot.booking_id is distinct from p_booking_id or v_slot.status<>'held' then
    raise exception 'STAND_NOT_HELD_FOR_BOOKING';
  end if;

  update bookings set held_until=now()+interval '5 minutes' where id=p_booking_id;
  update event_stands set held_until=now()+interval '5 minutes'
  where event_id=v_booking.event_id and stand_id=v_booking.stand_id;
end; $$;

create or replace function confirm_paid_booking(p_booking_id uuid,p_paypal_capture_id text) returns void
language plpgsql security definer set search_path = public as $$
declare v_booking bookings%rowtype;
begin
  select * into v_booking from bookings where id=p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.status='paid' then return; end if;
  if v_booking.status<>'held' then raise exception 'BOOKING_NOT_HELD'; end if;

  update bookings set status='paid',paid_at=now(),paypal_capture_id=p_paypal_capture_id where id=p_booking_id;
  update event_stands set status='booked',held_until=null
  where event_id=v_booking.event_id and stand_id=v_booking.stand_id and booking_id=p_booking_id;
  if not found then raise exception 'STAND_NOT_HELD_FOR_BOOKING'; end if;
end; $$;

revoke all on function create_booking_hold(text,text,text,text,text,text,text,text) from public;
revoke all on function prepare_booking_capture(uuid) from public;
revoke all on function confirm_paid_booking(uuid,text) from public;
grant execute on function create_booking_hold(text,text,text,text,text,text,text,text) to service_role;
grant execute on function prepare_booking_capture(uuid) to service_role;
grant execute on function confirm_paid_booking(uuid,text) to service_role;

insert into events (slug,name,event_date,starts_at,ends_at,active)
values ('2026-09-19','Flohmarkt am Ebertplatz','2026-09-19','11:00','16:00',true)
on conflict (slug) do update set name=excluded.name,event_date=excluded.event_date,starts_at=excluded.starts_at,ends_at=excluded.ends_at,active=excluded.active;

insert into stands (id,section,meters,price_cents,deposit_cents) values
  ('A1','A',2,1500,1000),('A2','A',2,1500,1000),('A3','A',2,1500,1000),('A4','A',2,1500,1000),('A5','A',2,1500,1000),('A6','A',2,1500,1000),('A7','A',2,1500,1000),('A8','A',2,1500,1000),('A9','A',2,1500,1000),
  ('A10','A',3,2250,1000),('A11','A',3,2250,1000),('A12','A',3,2250,1000),('A13','A',3,2250,1000),('A14','A',3,2250,1000),('A15','A',3,2250,1000),('A16','A',2,1500,1000),('A17','A',2,1500,1000),('A18','A',2,1500,1000),('A19','A',3,2250,1000),('A20','A',3,2250,1000),('A21','A',3,2250,1000),('A22','A',3,2250,1000),('A23','A',3,2250,1000),('A24','A',3,2250,1000),('A25','A',2,1500,1000),('A26','A',3,2250,1000),('A27','A',3,2250,1000),('A28','A',2,1500,1000),('A29','A',3,2250,1000),('A30','A',3,2250,1000),
  ('B1','B',3,2250,1000),('B2','B',3,2250,1000),('B3','B',3,2250,1000),('B4','B',3,2250,1000),('B5','B',3,2250,1000),('B6','B',3,2250,1000),('B7','B',3,2250,1000),('B8','B',3,2250,1000),('B9','B',3,2250,1000),('B10','B',3,2250,1000),('B11','B',3,2250,1000),('B13','B',3,2250,1000),('B14','B',3,2250,1000),('B15','B',3,2250,1000),('B16','B',2,1500,1000),('B17','B',2,1500,1000),('B18','B',2,1500,1000),('B19','B',2,1500,1000),('B20','B',2,1500,1000),('B21','B',2,1500,1000),('B22','B',3,2250,1000),('B23','B',2,1500,1000),('B24','B',2,1500,1000),('B25','B',2,1500,1000),('B26','B',2,1500,1000),('B27','B',2,1500,1000),('B28','B',2,1500,1000),('B29','B',2,1500,1000),('B30','B',3,2250,1000),('B31','B',3,2250,1000),('B32','B',3,2250,1000),('B33','B',3,2250,1000),('B34','B',3,2250,1000),
  ('C1','C',3,2250,1000),('C2','C',2,1500,1000),('C3','C',2,1500,1000),('C4','C',2,1500,1000),('C5','C',3,2250,1000),('C6','C',3,2250,1000),('C7','C',3,2250,1000),('C8','C',3,2250,1000),('C9','C',3,2250,1000),('C10','C',3,2250,1000),('C11','C',2,1500,1000),('C12','C',2,1500,1000),('C13','C',2,1500,1000),('C14','C',2,1500,1000),('C15','C',2,1500,1000),('C16','C',2,1500,1000),('C17','C',3,2250,1000),('C18','C',3,2250,1000),('C19','C',3,2250,1000),('C20','C',2,1500,1000),('C21','C',2,1500,1000),('C22','C',2,1500,1000),('C23','C',2,1500,1000),('C24','C',2,1500,1000),('C25','C',2,1500,1000),('C26','C',3,2250,1000),('C27','C',3,2250,1000),('C28','C',3,2250,1000),('C29','C',3,2250,1000),('C30','C',3,2250,1000),('C31','C',2,1500,1000),('C32','C',3,2250,1000),('C33','C',3,2250,1000),('C34','C',3,2250,1000),('C35','C',3,2250,1000),('C36','C',3,2250,1000),('C37','C',3,2250,1000),('C38','C',3,2250,1000),('C39','C',3,2250,1000),('C40','C',3,2250,1000),('C41','C',3,2250,1000),('C42','C',3,2250,1000),('C43','C',3,2250,1000),('C44','C',3,2250,1000),('C45','C',3,2250,1000),('C46','C',3,2250,1000),('C47','C',3,2250,1000),('C48','C',3,2250,1000),('C49','C',3,2250,1000),('C50','C',3,2250,1000),('C51','C',3,2250,1000),('C52','C',3,2250,1000)
on conflict (id) do update set section=excluded.section,meters=excluded.meters,price_cents=excluded.price_cents,deposit_cents=excluded.deposit_cents;

insert into event_stands (event_id,stand_id,status)
select e.id,s.id,'free' from events e cross join stands s where e.slug='2026-09-19'
on conflict (event_id,stand_id) do nothing;
