create table if not exists public.school_application_rate_limits (
  client_key text primary key,
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.school_application_rate_limits enable row level security;
revoke all on public.school_application_rate_limits from public, anon, authenticated;

create or replace function public.switch_user_school(target_school_id uuid)
returns table (school_id uuid, role text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_membership public.school_user_memberships%rowtype;
  target_school public.schools%rowtype;
begin
  select * into target_membership
  from public.school_user_memberships
  where user_id = auth.uid()
    and school_user_memberships.school_id = target_school_id;

  if target_membership.user_id is null then
    raise exception 'Bu okul için kullanıcı yetkiniz bulunmuyor';
  end if;

  select * into target_school
  from public.schools
  where id = target_school_id;

  if target_school.id is null or target_school.is_active is false then
    raise exception 'Seçilen okul aktif değil';
  end if;

  if target_school.subscription_status = 'stopped' then
    raise exception 'SUBSCRIPTION_STOPPED';
  end if;

  update public.profiles as profile
  set school_id = target_membership.school_id,
      role = target_membership.role,
      full_name = target_membership.full_name,
      updated_at = now()
  where profile.id = auth.uid()
    and profile.role <> 'super_admin';

  if not found then
    raise exception 'Aktif kullanıcı profili güncellenemedi';
  end if;

  return query select target_membership.school_id, target_membership.role;
end;
$$;

revoke all on function public.switch_user_school(uuid) from public;
grant execute on function public.switch_user_school(uuid) to authenticated;
