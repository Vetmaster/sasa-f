import { createClient } from '@supabase/supabase-js';
import { corsHeadersForRequest, handleCorsPreflight } from '../_shared/cors.ts';

const inviteRedirectUrl = 'https://sasa-f.com/';

function jsonWithCors(body: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function normalizedEmail(value: unknown) {
  return String(value || '').trim().toLocaleLowerCase('en-US');
}

function authEmailErrorMessage(message: string | undefined, fallback: string) {
  if (/email rate limit exceeded|over_email_send_rate_limit|rate limit/i.test(message || '')) {
    return 'Davet şu anda gönderilemedi. Kısa süre içinde çok fazla davet gönderildiği için sistem geçici olarak beklemeye aldı. Lütfen birkaç dakika sonra tekrar deneyin.';
  }
  return message || fallback;
}

async function findUserByEmail(admin: ReturnType<typeof createClient>, email: string) {
  const perPage = 1000;
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find(user => normalizedEmail(user.email) === email);
    if (match) return match;
    if (data.users.length < perPage) return null;
  }
  throw new Error('Kullanıcı listesi güvenli biçimde taranamadı.');
}
async function logEmail(admin: ReturnType<typeof createClient>, entry: Record<string, unknown>) {
  const { error } = await admin.from('system_email_logs').insert(entry);
  if (error) console.error('system email log failed', error);
}

Deno.serve(async request => {
  const preflightResponse = handleCorsPreflight(request);
  if (preflightResponse) return preflightResponse;
  const corsHeaders = corsHeadersForRequest(request);
  const json = (body: unknown, status = 200) => jsonWithCors(body, status, corsHeaders);
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Davet hizmeti yapılandırılmamış.' }, 503);

  const authorization = request.headers.get('Authorization') || '';
  const accessToken = authorization.replace(/^Bearer\s+/i, '');
  if (!accessToken) return json({ error: 'Oturum doğrulanamadı.' }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const { data: callerResult, error: callerError } = await admin.auth.getUser(accessToken);
  if (callerError || !callerResult.user) return json({ error: 'Oturum doğrulanamadı.' }, 401);

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', callerResult.user.id)
    .maybeSingle();
  const body = await request.json().catch(() => ({}));
  const schoolId = String(body.schoolId || '');
  const email = normalizedEmail(body.email);
  const fullName = String(body.fullName || '').trim();
  const role = String(body.role || 'admin');
  const confirmMultipleSchool = body.confirmMultipleSchool === true;
  if (!schoolId || !fullName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !['admin', 'coach'].includes(role)) {
    return json({ error: 'Kullanıcı adı, e-posta adresi ve rolü kontrol edin.' }, 400);
  }

  const callerIsSuperAdmin = callerProfile?.role === 'super_admin';
  let callerCanInvite = callerIsSuperAdmin;
  if (!callerCanInvite && role === 'coach') {
    const { data: callerMembership, error: callerMembershipError } = await admin
      .from('school_user_memberships')
      .select('role')
      .eq('user_id', callerResult.user.id)
      .eq('school_id', schoolId)
      .maybeSingle();
    if (callerMembershipError) return json({ error: 'Kullanıcı yetkisi kontrol edilemedi.' }, 500);
    callerCanInvite = callerMembership?.role === 'admin';
  }
  if (!callerCanInvite) return json({ error: role === 'coach' ? 'Antrenör daveti için okul Admin yetkisi gereklidir.' : 'Süper Admin yetkisi gereklidir.' }, 403);

  const { data: school } = await admin
    .from('schools')
    .select('id, name, is_active')
    .eq('id', schoolId)
    .maybeSingle();
  if (!school) return json({ error: 'Okul bulunamadı.' }, 404);
  if (school.is_active === false) return json({ error: 'Pasif okula kullanıcı daveti gönderilemez.' }, 409);

  let invitedUser;
  try {
    invitedUser = await findUserByEmail(admin, email);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Kullanıcı kontrol edilemedi.' }, 500);
  }

  let invited = false;
  if (!invitedUser) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: inviteRedirectUrl,
      data: { full_name: fullName, role, school_id: schoolId, access_request: false }
    });
    if (error || !data.user) return json({ error: authEmailErrorMessage(error?.message, 'Kullanıcı daveti gönderilemedi.') }, 502);
    invitedUser = data.user;
    invited = true;
    await logEmail(admin, {
      school_id: schoolId,
      recipient_email: email,
      recipient_name: fullName,
      email_type: role === 'coach' ? 'coach_invite' : 'school_admin_invite',
      subject: 'SASA-F hesabınıza davet edildiniz',
      status: 'sent',
      provider: 'supabase_auth',
      sent_by: callerResult.user.id,
      metadata: { role, school_name: school.name }
    });
  }

  const { data: existingProfile, error: existingProfileError } = await admin
    .from('profiles')
    .select('school_id, role')
    .eq('id', invitedUser.id)
    .maybeSingle();
  if (existingProfileError) return json({ error: 'Mevcut kullanıcı profili kontrol edilemedi.' }, 500);
  if (existingProfile?.role === 'super_admin') {
    return json({ error: 'Süper Admin hesabına okul kullanıcı rolü eklenemez.' }, 409);
  }

  const { data: memberships, error: membershipsError } = await admin
    .from('school_user_memberships')
    .select('school_id, role, schools(name)')
    .eq('user_id', invitedUser.id);
  if (membershipsError) return json({ error: 'Kullanıcının okul yetkileri kontrol edilemedi.' }, 500);

  const targetMembership = memberships?.find(membership => membership.school_id === schoolId);
  if (targetMembership) {
    return json({ error: `Bu kullanıcı ${school.name} okulunda zaten yetkili.` }, 409);
  }

  const existingSchools = (memberships || []).map(membership => ({
    schoolId: membership.school_id,
    schoolName: Array.isArray(membership.schools) ? membership.schools[0]?.name : membership.schools?.name,
    role: membership.role
  }));
  if (existingSchools.length && !confirmMultipleSchool) {
    return json({
      status: 'confirmation_required',
      email,
      existingSchools
    });
  }

  if (role !== 'parent') {
    const { error: unlinkError } = await admin
      .from('students')
      .update({ guardian_user_id: null })
      .eq('school_id', schoolId)
      .eq('guardian_user_id', invitedUser.id);
    if (unlinkError) return json({ error: 'Eski veli bağlantıları kaldırılamadı.' }, 500);
  }

  const { error: membershipError } = await admin.from('school_user_memberships').insert({
    user_id: invitedUser.id,
    school_id: schoolId,
    full_name: fullName,
    role
  });
  if (membershipError) {
    console.error('invite-school-admin membership insert failed', membershipError);
    return json({ error: `Okul kullanıcı yetkisi oluşturulamadı: ${membershipError.message}` }, 500);
  }

  if (!existingProfile) {
    const { error: profileError } = await admin.from('profiles').insert({
      id: invitedUser.id,
      school_id: schoolId,
      full_name: fullName,
      role
    });
    if (profileError) {
      await admin.from('school_user_memberships').delete().eq('user_id', invitedUser.id).eq('school_id', schoolId);
      console.error('invite-school-admin profile insert failed', profileError);
      return json({ error: `Kullanıcı profili oluşturulamadı: ${profileError.message}` }, 500);
    }
  }

  const { error: requestError } = await admin.from('access_requests').upsert({
    user_id: invitedUser.id,
    school_id: schoolId,
    email,
    full_name: fullName,
    requested_role: role,
    status: 'approved',
    email_verified_at: invitedUser.email_confirmed_at,
    reviewed_by: callerResult.user.id,
    reviewed_at: new Date().toISOString()
  }, { onConflict: 'user_id,school_id' });
  if (requestError) {
    await admin.from('school_user_memberships').delete().eq('user_id', invitedUser.id).eq('school_id', schoolId);
    console.error('invite-school-admin access request upsert failed', requestError);
    return json({ error: `Kullanıcı erişim kaydı oluşturulamadı: ${requestError.message}` }, 500);
  }

  let notificationStatus = 'failed';
  try {
    const roleLabel = role === 'admin' ? 'Admin' : 'Antrenör';
    const { data: createdNotification, error: notificationError } = await admin
      .from('notifications')
      .insert({
        school_id: schoolId,
        audience: 'Kişisel bildirim',
        title: 'Yeni okul yetkisi',
        body: `${school.name} okulunda ${roleLabel} olarak yetkilendirildiniz.`,
        status: 'queued',
        sent_by: callerResult.user.id,
        recipient_count: 1,
        delivered_count: 0,
        read_count: 0
      })
      .select('id')
      .single();
    if (notificationError || !createdNotification) throw notificationError || new Error('Bildirim oluşturulamadı.');

    const { error: recipientError } = await admin.from('notification_recipients').insert({
      notification_id: createdNotification.id,
      user_id: invitedUser.id
    });
    if (recipientError) {
      await admin.from('notifications').delete().eq('id', createdNotification.id);
      throw recipientError;
    }
    notificationStatus = 'in_app';

    const notificationResponse = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        apikey: serviceRoleKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'send',
        schoolId,
        recipientUserIds: [invitedUser.id],
        notificationId: createdNotification.id
      })
    });
    notificationStatus = notificationResponse.ok ? 'sent' : 'in_app';
    if (!notificationResponse.ok) {
      console.error('invite-school-admin notification failed', await notificationResponse.text());
    }
  } catch (notificationError) {
    console.error('invite-school-admin notification failed', notificationError);
  }

  return json({
    status: invited ? 'invited' : 'linked',
    schoolId,
    schoolName: school.name,
    email,
    role,
    userId: invitedUser.id,
    notificationStatus
  });
});
