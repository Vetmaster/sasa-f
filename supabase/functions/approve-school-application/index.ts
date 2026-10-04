import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeadersForRequest, handleCorsPreflight } from '../_shared/cors.ts';

const inviteRedirectUrl = 'https://sasa-f.com/';
function responseWithCors(body: unknown, status: number, corsHeaders: Record<string, string>) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
function normalizeEmail(value: unknown) { return String(value || '').trim().toLocaleLowerCase('en-US'); }
function authEmailErrorMessage(message: string | undefined, fallback: string) {
  if (/email rate limit exceeded|over_email_send_rate_limit|rate limit/i.test(message || '')) {
    return 'Davet şu anda gönderilemedi. Kısa süre içinde çok fazla davet gönderildiği için sistem geçici olarak beklemeye aldı. Lütfen birkaç dakika sonra tekrar deneyin.';
  }
  return message || fallback;
}
function slugify(value: string) {
  return value.toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 68) || 'futbol-okulu';
}
async function findUserByEmail(admin: ReturnType<typeof createClient>, email: string) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const user = data.users.find(item => normalizeEmail(item.email) === email);
    if (user) return user;
    if (data.users.length < 1000) return null;
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
  const response = (body: unknown, status = 200) => responseWithCors(body, status, corsHeaders);
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return response({ error: 'Onay hizmeti yapılandırılmamış.' }, 503);
  const accessToken = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!accessToken) return response({ error: 'Oturum doğrulanamadı.' }, 401);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: callerResult, error: callerError } = await admin.auth.getUser(accessToken);
  if (callerError || !callerResult.user) return response({ error: 'Oturum doğrulanamadı.' }, 401);
  const { data: callerProfile } = await admin.from('profiles').select('role').eq('id', callerResult.user.id).maybeSingle();
  if (callerProfile?.role !== 'super_admin') return response({ error: 'Süper Admin yetkisi gereklidir.' }, 403);
  const body = await request.json().catch(() => ({}));
  const applicationId = String(body.applicationId || '');
  if (!/^[0-9a-f-]{36}$/i.test(applicationId)) return response({ error: 'Geçerli bir başvuru seçin.' }, 400);
  const { data: application, error: applicationError } = await admin.from('school_applications').select('*').eq('id', applicationId).maybeSingle();
  if (applicationError || !application) return response({ error: 'Başvuru bulunamadı.' }, 404);
  if (application.status === 'APPROVED' && application.approved_school_id) return response({ schoolId: application.approved_school_id, status: 'already_approved' });
  if (!['PENDING', 'INFO_REQUESTED'].includes(application.status)) return response({ error: 'Bu başvuru onaylanamaz.' }, 409);
  let user;
  try { user = await findUserByEmail(admin, application.email); } catch (error) { return response({ error: error instanceof Error ? error.message : 'Kullanıcı kontrol edilemedi.' }, 500); }
  let invitationSent = false;
  if (!user) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(application.email, {
      redirectTo: inviteRedirectUrl,
      data: { full_name: application.applicant_name, role: 'admin', application_id: application.id }
    });
    if (error || !data.user) return response({ error: authEmailErrorMessage(error?.message, 'Şifre oluşturma daveti gönderilemedi.') }, 502);
    user = data.user;
    invitationSent = true;
    await logEmail(admin, {
      recipient_email: application.email,
      recipient_name: application.applicant_name,
      email_type: 'school_application_invite',
      subject: 'SASA-F hesabınıza davet edildiniz',
      status: 'sent',
      provider: 'supabase_auth',
      sent_by: callerResult.user.id,
      metadata: { application_id: application.id, school_name: application.school_name }
    });
  }
  const { data: existingProfile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (existingProfile?.role === 'super_admin') {
    return response({ error: 'Süper Admin hesabı müşteri okulunun ilk Admini olarak atanamaz.' }, 409);
  }
  let baseSlug = slugify(application.school_name);
  let slug = baseSlug;
  for (let suffix = 1; suffix <= 20; suffix += 1) {
    const { data: exists } = await admin.from('schools').select('id').eq('slug', slug).maybeSingle();
    if (!exists) break;
    slug = `${baseSlug.slice(0, 62)}-${suffix + 1}`;
  }
  const { data: result, error: approvalError } = await admin.rpc('approve_school_application_from_service', {
    target_application_id: application.id, applicant_user_id: user.id, school_slug: slug, actor_user_id: callerResult.user.id
  });
  if (approvalError) {
    console.error('approve-school-application failed', approvalError);
    return response({ error: `Başvuru onaylanamadı: ${approvalError.message}` }, 500);
  }
  const approval = Array.isArray(result) ? result[0] : result;
  return response({ status: 'approved', schoolId: approval?.school_id, userId: user.id, invitationSent });
});
