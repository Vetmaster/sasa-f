-- New school trials last three calendar months from their start date.
create or replace function public.start_school_trial()
returns public.school_onboardings
language plpgsql
security definer
set search_path = public
as $$
declare
  onboarding public.school_onboardings%rowtype;
  trial_start date := current_date;
  trial_end date := (current_date + interval '3 months')::date;
begin
  select * into onboarding from public.school_onboardings
  where applicant_user_id = auth.uid() and status = 'PENDING_CHOICE'
  order by created_at desc limit 1
  for update;

  if onboarding.school_id is null then raise exception 'Başlatılabilecek deneme hesabı bulunamadı'; end if;

  insert into public.school_subscription_periods (school_id, plan_code, billing_period, amount, starts_on, ends_on, status, source, created_by, activated_at)
  values (onboarding.school_id, 'standard', 'trial', 0, trial_start, trial_end, 'TRIAL', 'trial', auth.uid(), now());

  update public.schools
  set subscription_plan = 'standard',
      subscription_status = 'trial',
      subscription_trial_mode = 'time_limited',
      subscription_billing_period = 'monthly',
      subscription_starts_on = trial_start,
      subscription_ends_on = trial_end
  where id = onboarding.school_id;

  update public.school_onboardings
  set status = 'TRIAL_STARTED'
  where school_id = onboarding.school_id
  returning * into onboarding;

  return onboarding;
end;
$$;

revoke all on function public.start_school_trial() from public;
grant execute on function public.start_school_trial() to authenticated;

-- Give ongoing two-month trials the new three-month duration as well.
update public.school_subscription_periods
set ends_on = (starts_on + interval '3 months')::date
where billing_period = 'trial'
  and status = 'TRIAL'
  and ends_on >= current_date
  and ends_on = (starts_on + interval '2 months')::date;

update public.schools
set subscription_ends_on = (subscription_starts_on + interval '3 months')::date
where subscription_status = 'trial'
  and subscription_starts_on is not null
  and subscription_ends_on >= current_date
  and subscription_ends_on = (subscription_starts_on + interval '2 months')::date;
