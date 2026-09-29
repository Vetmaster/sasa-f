-- Publish application data changes so connected clients can update only the
-- affected visible section without reloading the whole page.
do $$
declare
  target_table text;
  realtime_tables text[] := array[
    'profiles',
    'schools',
    'training_groups',
    'training_types',
    'training_coaches',
    'training_fields',
    'students',
    'fee_periods',
    'trainings',
    'accounting_entries',
    'notifications',
    'notification_recipients',
    'notification_reads',
    'attendance_sessions',
    'attendance_records',
    'access_requests',
    'school_user_memberships',
    'school_applications',
    'subscription_payment_reports'
  ];
begin
  foreach target_table in array realtime_tables loop
    if to_regclass(format('public.%I', target_table)) is not null
      and not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = target_table
      ) then
      execute format('alter publication supabase_realtime add table public.%I', target_table);
    end if;
  end loop;
end;
$$;
