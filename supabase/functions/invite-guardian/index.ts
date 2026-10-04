import { createClient, type User } from '@supabase/supabase-js';
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

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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

  const { data: callerProfile, error: callerProfileError } = await admin
    .from('profiles')
    .select('school_id, role')
    .eq('id', callerResult.user.id)
    .maybeSingle();
  if (callerProfileError || !callerProfile) return json({ error: 'Yetkili kullanıcı profili bulunamadı.' }, 403);
  if (!['super_admin', 'admin'].includes(callerProfile.role)) {
    return json({ error: 'Veli daveti göndermek için yetkiniz bulunmuyor.' }, 403);
  }
  const body = await request.json().catch(() => ({}));
  const requestedSchoolId = String(body.schoolId || callerProfile.school_id || '');
  const targetSchoolId = callerProfile.role === 'super_admin' ? requestedSchoolId : callerProfile.school_id;
  if (!targetSchoolId || (callerProfile.role !== 'super_admin' && requestedSchoolId !== callerProfile.school_id)) {
    return json({ error: 'Bu okul için işlem yetkiniz bulunmuyor.' }, 403);
  }
  const studentId = Number(body.studentId);
  const previousEmail = normalizedEmail(body.previousEmail);
  if (!Number.isInteger(studentId) || studentId <= 0) return json({ error: 'Geçersiz öğrenci kaydı.' }, 400);

  const { data: student, error: studentError } = await admin
    .from('students')
    .select('id, school_id, full_name, guardian_name, email, guardian_user_id')
    .eq('id', studentId)
    .eq('school_id', targetSchoolId)
    .maybeSingle();
  if (studentError || !student) return json({ error: 'Öğrenci kaydı bulunamadı.' }, 404);

  const email = normalizedEmail(student.email);
  if (!validEmail(email)) return json({ error: 'Geçerli bir veli e-posta adresi bulunamadı.' }, 400);
  if (student.guardian_user_id) {
    const { data: linkedUser, error: linkedUserError } = await admin.auth.admin.getUserById(student.guardian_user_id);
    if (linkedUserError || !linkedUser.user) return json({ error: 'Bağlı veli hesabı kontrol edilemedi.' }, 500);
    if (normalizedEmail(linkedUser.user.email) !== email) {
      return json({ error: 'Onaylanmış veli hesabının giriş e-postası bu ekrandan değiştirilemez.' }, 409);
    }
    return json({ status: 'already_linked', email, userId: student.guardian_user_id, verified: true });
  }

  if (previousEmail && previousEmail !== email) {
    const { error: oldRequestError } = await admin
      .from('access_requests')
      .delete()
      .eq('school_id', targetSchoolId)
      .eq('requested_role', 'parent')
      .eq('status', 'pending')
      .ilike('email', previousEmail);
    if (oldRequestError) return json({ error: 'Eski veli daveti geçersizleştirilemedi.' }, 500);
  }

  let guardianUser: User | null = null;
  let invited = false;
  try {
    guardianUser = await findUserByEmail(admin, email);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Kullanıcı hesabı kontrol edilemedi.' }, 500);
  }

  if (!guardianUser) {
    const { data: inviteResult, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: inviteRedirectUrl,
      data: {
        full_name: student.guardian_name || student.full_name,
        role: 'parent',
        access_request: false,
        invited_student_id: String(student.id)
      }
    });
    if (inviteError || !inviteResult.user) {
      return json({ error: authEmailErrorMessage(inviteError?.message, 'Veli davet e-postası gönderilemedi.') }, 502);
    }
    guardianUser = inviteResult.user;
    invited = true;
    await logEmail(admin, {
      school_id: targetSchoolId,
      recipient_email: email,
      recipient_name: student.guardian_name || student.full_name,
      email_type: 'guardian_invite',
      subject: 'SASA-F hesabınıza davet edildiniz',
      status: 'sent',
      provider: 'supabase_auth',
      sent_by: callerResult.user.id,
      metadata: { student_id: student.id, student_name: student.full_name }
    });
  }

  const { data: existingProfile, error: existingProfileError } = await admin
    .from('profiles')
    .select('school_id, role')
    .eq('id', guardianUser.id)
    .maybeSingle();
  if (existingProfileError) return json({ error: 'Mevcut kullanıcı profili kontrol edilemedi.' }, 500);
  if (existingProfile && (
    existingProfile.school_id !== targetSchoolId ||
    existingProfile.role !== 'parent'
  )) {
    return json({ error: 'Bu e-posta adresi farklı okul veya kullanıcı rolüne ait.' }, 409);
  }

  if (existingProfile?.role === 'parent') {
    const { error: linkExistingError } = await admin
      .from('students')
      .update({ guardian_user_id: guardianUser.id })
      .eq('id', student.id)
      .eq('school_id', targetSchoolId);
    if (linkExistingError) return json({ error: 'Öğrenci mevcut veli hesabına bağlanamadı.' }, 500);
    return json({ status: 'linked', email, userId: guardianUser.id, verified: true });
  }

  const fullName = String(student.guardian_name || '').trim() || email.split('@')[0];
  const { error: accessRequestError } = await admin
    .from('access_requests')
    .upsert({
      user_id: guardianUser.id,
      school_id: targetSchoolId,
      email,
      full_name: fullName,
      requested_role: 'parent',
      status: 'pending',
      email_verified_at: guardianUser.email_confirmed_at,
      reviewed_by: null,
      reviewed_at: null
    }, { onConflict: 'user_id,school_id' });
  if (accessRequestError) return json({ error: 'Veli erişim kaydı oluşturulamadı.' }, 500);

  return json({
    status: invited ? 'invited' : 'pending_approval',
    email,
    userId: guardianUser.id,
    verified: Boolean(guardianUser.email_confirmed_at)
  });
});
