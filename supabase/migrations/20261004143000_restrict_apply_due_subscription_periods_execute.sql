-- This SECURITY DEFINER maintenance routine mutates subscription periods and
-- schools. Keep it callable only by trusted backend/service-role processes.
revoke execute on function public.apply_due_subscription_periods() from public;
revoke execute on function public.apply_due_subscription_periods() from anon;
revoke execute on function public.apply_due_subscription_periods() from authenticated;

grant execute on function public.apply_due_subscription_periods() to service_role;
