alter table public.notifications
  add column if not exists sender_label text;

update public.notifications as notification
set sender_label = case
  when profile.role = 'super_admin' then 'SASA-F'
  else coalesce(nullif(btrim(school.name), ''), 'Okul')
end
from public.profiles as profile,
     public.schools as school
where notification.sent_by = profile.id
  and notification.school_id = school.id
  and nullif(btrim(notification.sender_label), '') is null;

update public.notifications
set sender_label = 'SASA-F'
where sent_by is null
  and nullif(btrim(sender_label), '') is null;
