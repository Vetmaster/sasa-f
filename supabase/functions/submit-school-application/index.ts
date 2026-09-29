import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function clean(value: unknown, maxLength: number) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function formatNationalPhone(value: unknown) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!/^0\d{10}$/.test(digits)) return '';
  return `0 (${digits.slice(1, 4)}) ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9, 11)}`;
}

function normalizeSearchText(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function clientAddress(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for') || '';
  const firstForwarded = forwardedFor.split(',')[0]?.trim();
  return firstForwarded
    || request.headers.get('cf-connecting-ip')
    || request.headers.get('x-real-ip')
    || 'unknown';
}

async function sha256Hex(value: string) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return response({ error: 'Başvuru hizmeti yapılandırılmamış.' }, 503);

  const body = await request.json().catch(() => ({}));
  const schoolName = clean(body.schoolName, 120);
  const country = clean(body.country, 20);
  const city = clean(body.city, 80);
  const district = clean(body.district, 80);
  const address = clean(body.address, 500);
  const applicantName = clean(body.applicantName, 120);
  const phone = formatNationalPhone(body.phone);
  const email = clean(body.email, 254).toLocaleLowerCase('en-US');
  const note = clean(body.note, 1200) || null;
  if (!['Türkiye', 'KKTC'].includes(country) || !schoolName || !city || (country === 'Türkiye' && !district) || address.length < 5 || !applicantName || !phone || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response({ error: 'Lütfen zorunlu alanları ve e-posta adresini kontrol edin.' }, 400);
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const clientKey = await sha256Hex(`${clientAddress(request)}:${email}`);
  const windowStartedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: rateLimitRow, error: rateLimitReadError } = await admin
    .from('school_application_rate_limits')
    .select('attempt_count, window_started_at')
    .eq('client_key', clientKey)
    .maybeSingle();
  if (rateLimitReadError) {
    console.error('submit-school-application rate-limit read failed', rateLimitReadError);
    return response({ error: 'Başvuru şu anda kaydedilemedi. Lütfen daha sonra tekrar deneyin.' }, 500);
  }
  if (rateLimitRow && rateLimitRow.window_started_at >= windowStartedAt && Number(rateLimitRow.attempt_count || 0) >= 5) {
    return response({ error: 'Kısa süre içinde çok fazla başvuru denendi. Lütfen bir süre sonra tekrar deneyin.' }, 429);
  }
  const nextAttemptCount = rateLimitRow && rateLimitRow.window_started_at >= windowStartedAt
    ? Number(rateLimitRow.attempt_count || 0) + 1
    : 1;
  const { error: rateLimitWriteError } = await admin
    .from('school_application_rate_limits')
    .upsert({
      client_key: clientKey,
      window_started_at: nextAttemptCount === 1 ? new Date().toISOString() : rateLimitRow?.window_started_at,
      attempt_count: nextAttemptCount,
      updated_at: new Date().toISOString()
    }, { onConflict: 'client_key' });
  if (rateLimitWriteError) {
    console.error('submit-school-application rate-limit write failed', rateLimitWriteError);
    return response({ error: 'Başvuru şu anda kaydedilemedi. Lütfen daha sonra tekrar deneyin.' }, 500);
  }

  const { data: existingApplication, error: existingError } = await admin
    .from('school_applications')
    .select('id, status')
    .eq('email', email)
    .maybeSingle();
  if (existingError) {
    console.error('submit-school-application duplicate check failed', existingError);
    return response({ error: 'Başvuru şu anda kaydedilemedi. Lütfen daha sonra tekrar deneyin.' }, 500);
  }
  if (existingApplication) {
    if (['PENDING', 'INFO_REQUESTED'].includes(existingApplication.status)) {
      return response({ status: 'PENDING_REVIEW', duplicate: true, message: 'Başvurunuz henüz onay aşamasında. İnceleme tamamlandığında e-posta adresiniz üzerinden bilgilendirileceksiniz.' }, 202);
    }
    if (existingApplication.status === 'APPROVED') {
      return response({ status: 'REGISTERED_SCHOOL', duplicate: true, message: 'Bu e-posta adresiyle kayıtlı bir futbol okulu vardır. Lütfen farklı bir e-posta adresiyle başvuru yapın.' }, 202);
    }
    return response({ status: 'IGNORED', duplicate: true }, 202);
  }

  const normalizedSchoolName = normalizeSearchText(schoolName);
  const { data: existingNameApplication, error: existingNameApplicationError } = await admin
    .from('school_applications')
    .select('id, status')
    .ilike('school_name', normalizedSchoolName)
    .in('status', ['PENDING', 'INFO_REQUESTED'])
    .limit(1)
    .maybeSingle();
  if (existingNameApplicationError) {
    console.error('submit-school-application school name duplicate check failed', existingNameApplicationError);
    return response({ error: 'Başvuru şu anda kaydedilemedi. Lütfen daha sonra tekrar deneyin.' }, 500);
  }
  if (existingNameApplication) {
    return response({ status: 'REGISTERED_SCHOOL_NAME', duplicate: true, message: 'Bu isimle kayıtlı bir futbol okulu bulunmaktadır. Lütfen okul adını kontrol edin veya farklı bir okul adıyla başvuru yapın.' }, 202);
  }

  const { data: existingSchool, error: existingSchoolError } = await admin
    .from('schools')
    .select('id')
    .ilike('name', normalizedSchoolName)
    .limit(1)
    .maybeSingle();
  if (existingSchoolError) {
    console.error('submit-school-application school duplicate check failed', existingSchoolError);
    return response({ error: 'Başvuru şu anda kaydedilemedi. Lütfen daha sonra tekrar deneyin.' }, 500);
  }
  if (existingSchool) {
    return response({ status: 'REGISTERED_SCHOOL_NAME', duplicate: true, message: 'Bu isimle kayıtlı bir futbol okulu bulunmaktadır. Lütfen okul adını kontrol edin veya farklı bir okul adıyla başvuru yapın.' }, 202);
  }

  const { data, error } = await admin.from('school_applications').insert({
    school_name: schoolName, country, city, district: district || null, address, applicant_name: applicantName, phone, email, note
  }).select('id, created_at').single();
  if (error) {
    if (error.code === '23505') return response({ status: 'IGNORED', duplicate: true }, 202);
    console.error('submit-school-application failed', error);
    return response({ error: 'Başvuru şu anda kaydedilemedi. Lütfen daha sonra tekrar deneyin.' }, 500);
  }

  try {
    const { data: superAdmins, error: superAdminError } = await admin
      .from('profiles')
      .select('id, school_id')
      .eq('role', 'super_admin');
    if (superAdminError) throw superAdminError;
    const recipientIds = [...new Set((superAdmins || []).map(profile => String(profile.id || '')).filter(Boolean))];
    const notificationSchoolId = superAdmins?.find(profile => profile.school_id)?.school_id;
    if (recipientIds.length && notificationSchoolId) {
      const { data: notification, error: notificationError } = await admin
        .from('notifications')
        .insert({
          school_id: notificationSchoolId,
          audience: 'Süper Admin',
          title: 'Yeni futbol okulu başvurusu',
          body: `${schoolName} için yeni başvuru alındı.`,
          status: 'queued',
          recipient_count: recipientIds.length,
          delivered_count: 0,
          read_count: 0
        })
        .select('id')
        .single();
      if (notificationError || !notification) throw notificationError || new Error('Bildirim oluşturulamadı.');

      const { error: recipientError } = await admin.from('notification_recipients').insert(
        recipientIds.map(userId => ({ notification_id: notification.id, user_id: userId }))
      );
      if (recipientError) throw recipientError;

      const pushResponse = await fetch(`${url}/functions/v1/send-push-notification`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'send',
          internalService: true,
          schoolId: notificationSchoolId,
          recipientUserIds: recipientIds,
          notificationId: notification.id
        })
      });
      if (!pushResponse.ok) {
        console.error('submit-school-application push notification failed', await pushResponse.text());
      }
    }
  } catch (notificationError) {
    console.error('submit-school-application notification failed', notificationError);
  }

  return response({ id: data.id, createdAt: data.created_at, status: 'PENDING' }, 201);
});
