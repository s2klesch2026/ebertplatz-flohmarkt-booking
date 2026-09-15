grant execute on function public.create_booking_hold_multi(text[], text, text, text, text, text, text, text, integer, integer, text) to service_role;
grant execute on function public.prepare_booking_capture(uuid) to service_role;
grant execute on function public.confirm_paid_booking(uuid, text) to service_role;
grant execute on function public.set_paypal_order(uuid, text) to service_role;
