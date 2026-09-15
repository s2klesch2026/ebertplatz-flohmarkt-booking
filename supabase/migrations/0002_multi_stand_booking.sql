-- Support one or two stands per booking, while preserving existing single-stand bookings.

alter table public.bookings
  add column if not exists stand_ids text[];

update public.bookings
   set stand_ids = array[stand_id]
 where stand_ids is null or cardinality(stand_ids) = 0;

alter table public.bookings
  alter column stand_ids set not null;

create index if not exists bookings_stand_ids_gin_idx
  on public.bookings using gin (stand_ids);

create or replace function public.create_booking_hold_multi(
  p_stand_ids text[],
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_street text,
  p_postal_code text,
  p_city text,
  p_subtotal_cents integer,
  p_deposit_cents integer default 1000,
  p_event_slug text default '2026-09-19'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_stand_id text;
  v_normalized text[];
begin
  if p_subtotal_cents < 0 or p_deposit_cents < 0 then
    raise exception 'INVALID_PRICE';
  end if;

  select array_agg(value order by value)
    into v_normalized
    from (
      select distinct btrim(value) as value
      from unnest(p_stand_ids) value
      where btrim(value) <> ''
    ) s;

  if v_normalized is null or cardinality(v_normalized) < 1 or cardinality(v_normalized) > 2 then
    raise exception 'INVALID_STAND_COUNT';
  end if;

  if cardinality(v_normalized) <> cardinality(p_stand_ids) then
    raise exception 'DUPLICATE_STAND';
  end if;

  foreach v_stand_id in array v_normalized loop
    perform pg_advisory_xact_lock(hashtext(p_event_slug || ':' || v_stand_id));
  end loop;

  update public.bookings
     set status = 'expired', updated_at = now()
   where event_slug = p_event_slug
     and status = 'held'
     and held_until <= now()
     and stand_ids && v_normalized;

  if exists (
    select 1
      from public.bookings
     where event_slug = p_event_slug
       and status in ('held','paid')
       and stand_ids && v_normalized
  ) then
    raise exception 'STAND_NOT_AVAILABLE';
  end if;

  insert into public.bookings (
    event_slug, stand_id, stand_ids,
    first_name, last_name, email, phone,
    street, postal_code, city,
    subtotal_cents, deposit_cents, total_cents,
    status, held_until
  ) values (
    p_event_slug, v_normalized[1], v_normalized,
    p_first_name, p_last_name, p_email, p_phone,
    p_street, p_postal_code, p_city,
    p_subtotal_cents, p_deposit_cents, p_subtotal_cents + p_deposit_cents,
    'held', now() + interval '10 minutes'
  ) returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.create_booking_hold(
  p_stand_id text,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_street text,
  p_postal_code text,
  p_city text,
  p_subtotal_cents integer,
  p_deposit_cents integer default 1000,
  p_event_slug text default '2026-09-19'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.create_booking_hold_multi(
    array[p_stand_id],
    p_first_name,
    p_last_name,
    p_email,
    p_phone,
    p_street,
    p_postal_code,
    p_city,
    p_subtotal_cents,
    p_deposit_cents,
    p_event_slug
  );
end;
$$;

create or replace function public.prepare_booking_capture(
  p_booking_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_stand_id text;
begin
  select * into v_booking
    from public.bookings
   where id = p_booking_id
   for update;

  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.status = 'paid' then return; end if;
  if v_booking.status <> 'held' then raise exception 'BOOKING_NOT_PAYABLE'; end if;

  foreach v_stand_id in array v_booking.stand_ids loop
    perform pg_advisory_xact_lock(hashtext(v_booking.event_slug || ':' || v_stand_id));
  end loop;

  update public.bookings
     set status = 'expired', updated_at = now()
   where event_slug = v_booking.event_slug
     and id <> v_booking.id
     and status = 'held'
     and held_until <= now()
     and stand_ids && v_booking.stand_ids;

  if exists (
    select 1 from public.bookings b
     where b.event_slug = v_booking.event_slug
       and b.id <> v_booking.id
       and b.status in ('held','paid')
       and b.stand_ids && v_booking.stand_ids
  ) then
    raise exception 'STAND_TAKEN_AFTER_HOLD';
  end if;

  update public.bookings
     set held_until = greatest(held_until, now() + interval '5 minutes'),
         updated_at = now()
   where id = p_booking_id;
end;
$$;

create or replace function public.confirm_paid_booking(
  p_booking_id uuid,
  p_paypal_capture_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_stand_id text;
begin
  select * into v_booking
    from public.bookings
   where id = p_booking_id
   for update;

  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.status = 'paid' then return; end if;
  if v_booking.status <> 'held' then raise exception 'BOOKING_NOT_PAYABLE'; end if;

  foreach v_stand_id in array v_booking.stand_ids loop
    perform pg_advisory_xact_lock(hashtext(v_booking.event_slug || ':' || v_stand_id));
  end loop;

  if exists (
    select 1 from public.bookings b
     where b.event_slug = v_booking.event_slug
       and b.id <> v_booking.id
       and b.status in ('held','paid')
       and b.stand_ids && v_booking.stand_ids
  ) then
    raise exception 'STAND_TAKEN_AFTER_HOLD';
  end if;

  update public.bookings
     set status = 'paid',
         paypal_capture_id = p_paypal_capture_id,
         paid_at = now(),
         updated_at = now()
   where id = p_booking_id;
end;
$$;

revoke all on function public.create_booking_hold_multi(text[],text,text,text,text,text,text,text,integer,integer,text) from public;
revoke all on function public.prepare_booking_capture(uuid) from public;
grant execute on function public.create_booking_hold_multi(text[],text,text,text,text,text,text,text,integer,integer,text) to service_role;
grant execute on function public.prepare_booking_capture(uuid) to service_role;
