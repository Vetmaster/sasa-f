import { createClient } from '@supabase/supabase-js';
import { GoogleAuth } from 'google-auth-library';
import nodemailer from 'nodemailer';
import webpush from 'web-push';
import { corsHeadersForRequest, handleCorsPreflight } from '../_shared/cors.ts';

const CRON_ALLOWED_HEADERS = 'authorization, apikey, content-type, x-client-info, x-cron-secret';

const PUSH_TIMEOUT_MS = 12000;
const SITE_URL = 'https://sasa-f.com/';
const NOTIFICATION_URL = `${SITE_URL}?open=onboarding`;

type BillingPeriod = 'monthly' | 'quarterly' | 'yearly';

type SchoolRow = {
  id: string;
  name: string;
  subscription_billing_period: BillingPeriod | null;
  subscription_ends_on: string | null;
};

type Recipient = {
  user_id: string;
  full_name: string | null;
  role: string;
};

type AuthUser = {
  id: string;
  email?: string;
  user_metadata?: { full_name?: string };
};

function jsonWithCors(body: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function todayInIstanbul() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(new Date());
}

function dateFromIso(value: string) {
  return new Date(`${value}T12:00:00+03:00`);
}

function daysBetween(startIso: string, endIso: string) {
  const start = dateFromIso(startIso).getTime();
  const end = dateFromIso(endIso).getTime();
  return Math.round((end - start) / 86400000);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Istanbul'
  }).format(dateFromIso(value));
}

function periodLabel(period: BillingPeriod) {
  if (period === 'quarterly') return '3 aylık';
  if (period === 'yearly') return 'yıllık';
  return '1 aylık';
}

function reminderIsDue(period: BillingPeriod, daysUntilEnd: number) {
  if (daysUntilEnd < 0) return false;
  if (period === 'monthly') return daysUntilEnd <= 7 && daysUntilEnd % 3 === 1;
  if (period === 'quarterly') return daysUntilEnd <= 30 && daysUntilEnd % 7 === 2;
  return daysUntilEnd <= 60 && daysUntilEnd % 15 === 0;
}

function reminderWindow(period: BillingPeriod) {
  if (period === 'monthly') return 7;
  if (period === 'quarterly') return 30;
  return 60;
}

function cleanEmail(value: unknown) {
  const email = String(value || '').trim().toLocaleLowerCase('en-US');
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

async function getUserEmails(admin: ReturnType<typeof createClient>, userIds: string[]) {
  const emails = new Map<string, string>();
  const names = new Map<string, string>();
  const perPage = 1000;
  const wanted = new Set(userIds);
  for (let page = 1; page <= 20 && emails.size < wanted.size; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    for (const user of data.users as AuthUser[]) {
      if (!wanted.has(user.id)) continue;
      const email = cleanEmail(user.email);
      if (email) emails.set(user.id, email);
      if (user.user_metadata?.full_name) names.set(user.id, user.user_metadata.full_name);
    }
    if (data.users.length < perPage) break;
  }
  return { emails, names };
}

async function findUserByEmail(admin: ReturnType<typeof createClient>, targetEmail: string) {
  const perPage = 1000;
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = (data.users as AuthUser[]).find(user => cleanEmail(user.email) === targetEmail);
    if (match) return match;
    if (data.users.length < perPage) break;
  }
  return null;
}

async function sendEmails(messages: Array<{ email: string; name: string; subject: string; text: string; html: string }>) {
  const smtpHost = Deno.env.get('SMTP_HOST') || 'smtp.gmail.com';
  const smtpPort = Number(Deno.env.get('SMTP_PORT') || 587);
  const smtpUser = Deno.env.get('SMTP_USER') || Deno.env.get('SASA_FUTBOL_SMTP_USER') || '00vetmaster00@gmail.com';
  const smtpPass = Deno.env.get('SMTP_PASS') || Deno.env.get('SASA_FUTBOL_SMTP_PASS');
  const senderName = Deno.env.get('SMTP_SENDER_NAME') || 'SASA-F';
  const senderEmail = Deno.env.get('SMTP_SENDER_EMAIL') || smtpUser;
  if (!smtpUser || !smtpPass || !senderEmail) {
    console.warn('Subscription reminder email SMTP settings are missing.');
    return 0;
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass }
  });

  const results = await Promise.allSettled(messages.map(message => transporter.sendMail({
    from: `"${senderName}" <${senderEmail}>`,
    to: message.email,
    subject: message.subject,
    text: message.text,
    html: message.html
  })));
  return results.filter(result => result.status === 'fulfilled').length;
}
async function logEmails(
  admin: ReturnType<typeof createClient>,
  entries: Array<Record<string, unknown>>
) {
  if (!entries.length) return;
  const { error } = await admin.from('system_email_logs').insert(entries);
  if (error) console.error('system email log failed', error);
}

async function sendPushes(
  admin: ReturnType<typeof createClient>,
  recipientIds: string[],
  notificationId: number,
  title: string,
  body: string
) {
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const firebaseServiceAccountJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');
  const deliveredRecipientIds = new Set<string>();

  let fcmTokens: Array<{ id: number; user_id: string; token: string; platform: 'android' | 'web' }> = [];
  let subscriptions: Array<{ id: number; user_id: string; endpoint: string; p256dh: string; auth_secret: string }> = [];
  if (recipientIds.length) {
    const { data: tokenData } = await admin
      .from('fcm_tokens')
      .select('id, user_id, token, platform')
      .in('user_id', recipientIds);
    fcmTokens = tokenData || [];

    const { data: subscriptionData } = await admin
      .from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth_secret')
      .in('user_id', recipientIds);
    subscriptions = subscriptionData || [];
  }

  const webFcmRecipientIds = new Set(
    fcmTokens.filter(token => token.platform === 'web').map(token => token.user_id)
  );

  if (firebaseServiceAccountJson && fcmTokens.length) {
    try {
      const firebaseCredentials = JSON.parse(firebaseServiceAccountJson);
      const firebaseProjectId = String(firebaseCredentials.project_id || '');
      if (!firebaseProjectId) throw new Error('Firebase project_id is missing');
      const firebaseAuth = new GoogleAuth({
        credentials: firebaseCredentials,
        scopes: ['https://www.googleapis.com/auth/firebase.messaging']
      });
      const firebaseAccessToken = await firebaseAuth.getAccessToken();
      if (!firebaseAccessToken) throw new Error('Firebase access token could not be created');

      const fcmResults = await Promise.allSettled(fcmTokens.map(async device => {
        const response = await Promise.race([
          fetch(`https://fcm.googleapis.com/v1/projects/${firebaseProjectId}/messages:send`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${firebaseAccessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              message: {
                token: device.token,
                data: {
                  title,
                  body,
                  message: body,
                  notificationId: String(notificationId),
                  url: NOTIFICATION_URL,
                  icon: `${SITE_URL}sasa-f-icon-v3.svg`,
                  badge: `${SITE_URL}sasa-f-notification-badge.png`,
                  tag: `sasa-f-subscription-${notificationId}`
                },
                ...(device.platform === 'web'
                  ? { webpush: { headers: { TTL: '3600', Urgency: 'high' }, fcm_options: { link: NOTIFICATION_URL } } }
                  : { android: { priority: 'HIGH' } })
              }
            })
          }),
          new Promise<Response>((_, reject) => {
            setTimeout(() => reject(new Error('FCM delivery request timed out')), PUSH_TIMEOUT_MS);
          })
        ]);
        if (!response.ok) {
          const responseBody = await response.text();
          if (response.status === 404 || responseBody.includes('UNREGISTERED')) {
            await admin.from('fcm_tokens').delete().eq('id', device.id);
          }
          throw new Error(`FCM ${response.status}: ${responseBody.slice(0, 500)}`);
        }
        return { userId: device.user_id };
      }));
      fcmResults.forEach(result => {
        if (result.status === 'fulfilled') deliveredRecipientIds.add(result.value.userId);
      });
    } catch (error) {
      console.error('Subscription reminder FCM failed:', error);
    }
  }

  const webFallbackSubscriptions = vapidPublicKey && vapidPrivateKey
    ? subscriptions.filter(subscription => !webFcmRecipientIds.has(subscription.user_id))
    : [];
  if (vapidPublicKey && vapidPrivateKey) {
    webpush.setVapidDetails('mailto:00vetmaster00@gmail.com', vapidPublicKey, vapidPrivateKey);
  }
  const payload = JSON.stringify({
    title,
    body,
    tag: `sasa-f-subscription-${notificationId}`,
    url: NOTIFICATION_URL
  });
  const pushResults = await Promise.allSettled(webFallbackSubscriptions.map(async subscription => {
    try {
      await Promise.race([
        webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth_secret }
        }, payload, { TTL: 3600, urgency: 'high', topic: `sasa-f-subscription-${notificationId}` }),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Push delivery request timed out')), PUSH_TIMEOUT_MS);
        })
      ]);
      return { id: subscription.id, userId: subscription.user_id };
    } catch (error) {
      const statusCode = Number((error as { statusCode?: number }).statusCode || 0);
      if (statusCode === 404 || statusCode === 410) {
        await admin.from('push_subscriptions').delete().eq('id', subscription.id);
      }
      throw error;
    }
  }));
  pushResults.forEach(result => {
    if (result.status === 'fulfilled') deliveredRecipientIds.add(result.value.userId);
  });

  if (deliveredRecipientIds.size) {
    await admin
      .from('notification_deliveries')
      .upsert(
        [...deliveredRecipientIds].map(userId => ({ notification_id: notificationId, user_id: userId })),
        { onConflict: 'notification_id,user_id' }
      );
  }
  return deliveredRecipientIds.size;
}

Deno.serve(async request => {
  const preflightResponse = handleCorsPreflight(request, CRON_ALLOWED_HEADERS);
  if (preflightResponse) return preflightResponse;
  const corsHeaders = corsHeadersForRequest(request, CRON_ALLOWED_HEADERS);
  const json = (body: unknown, status = 200) => jsonWithCors(body, status, corsHeaders);
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const body = await request.json().catch(() => ({}));

  const expectedSecret = Deno.env.get('SUBSCRIPTION_REMINDER_SECRET');
  if (expectedSecret && request.headers.get('x-cron-secret') !== expectedSecret) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Subscription reminder service is not configured' }, 503);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });

  if (body.action === 'send-test-email') {
    const authorization = request.headers.get('Authorization') || '';
    const accessToken = authorization.replace(/^Bearer\s+/i, '');
    if (!accessToken) return json({ error: 'Unauthorized' }, 401);

    const { data: userResult, error: userError } = await admin.auth.getUser(accessToken);
    if (userError || !userResult.user) return json({ error: 'Unauthorized' }, 401);

    const { data: callerProfile, error: profileError } = await admin
      .from('profiles')
      .select('role')
      .eq('id', userResult.user.id)
      .maybeSingle();
    if (profileError || callerProfile?.role !== 'super_admin') {
      return json({ error: 'Süper Admin yetkisi gereklidir.' }, 403);
    }

    const testEmail = cleanEmail(body.testEmail || '00vetmaster00+iskelefb@gmail.com');
    if (!testEmail) return json({ error: 'Test e-posta adresi geçersiz.' }, 400);

    const testEndDate = new Date(dateFromIso(todayInIstanbul()).getTime() + 7 * 86400000).toISOString().slice(0, 10);
    const title = 'Abonelik yenileme hatırlatması';
    const message = `İskele FB Futbol Okulu okulunun 1 aylık aboneliği ${formatDate(testEndDate)} tarihinde sona erecek. Kesinti olmaması için aboneliğinizi yenileyebilirsiniz.`;
    const sent = await sendEmails([{
      email: testEmail,
      name: 'İskele FB Futbol Okulu',
      subject: `[Test] ${title}`,
      text: `Merhaba,\n\n${message}\n\nAbonelik ekranı: ${NOTIFICATION_URL}\n\nSASA-F`,
      html: `<p>Merhaba,</p><p>${message}</p><p><a href="${NOTIFICATION_URL}">Abonelik ekranını aç</a></p><p>SASA-F</p>`
    }]);
    await logEmails(admin, [{
      recipient_email: testEmail,
      recipient_name: 'İskele FB Futbol Okulu',
      email_type: 'subscription_renewal_test',
      subject: `[Test] ${title}`,
      status: sent ? 'sent' : 'failed',
      provider: 'smtp',
      sent_by: userResult.user.id,
      metadata: { test: true }
    }]);

    let pushCount = 0;
    let notificationId: number | null = null;
    const testUser = await findUserByEmail(admin, testEmail);
    if (testUser) {
      const { data: membership } = await admin
        .from('school_user_memberships')
        .select('school_id')
        .eq('user_id', testUser.id)
        .limit(1)
        .maybeSingle();
      const { data: fallbackSchool } = membership?.school_id
        ? { data: null }
        : await admin.from('schools').select('id').limit(1).maybeSingle();
      const notificationSchoolId = membership?.school_id || fallbackSchool?.id;
      if (notificationSchoolId) {
        const { data: notification } = await admin
          .from('notifications')
          .insert({
            school_id: notificationSchoolId,
            audience: 'Kişisel test bildirimi',
            title: `[Test] ${title}`,
            body: message,
            status: 'queued',
            sent_by: userResult.user.id,
            recipient_count: 1,
            delivered_count: 0,
            read_count: 0
          })
          .select('id')
          .single();
        if (notification?.id) {
          notificationId = Number(notification.id);
          await admin.from('notification_recipients').upsert({
            notification_id: notificationId,
            user_id: testUser.id
          }, { onConflict: 'notification_id,user_id' });
          pushCount = await sendPushes(admin, [testUser.id], notificationId, `[Test] ${title}`, message);
          await admin.from('notifications').update({
            status: pushCount > 0 ? 'sent' : 'queued',
            sent_at: pushCount > 0 ? new Date().toISOString() : null,
            delivered_count: pushCount
          }).eq('id', notificationId);
        }
      }
    }

    return json({
      status: sent || pushCount ? 'sent' : 'failed',
      email: testEmail,
      emailCount: sent,
      pushCount,
      notificationId,
      notificationRecipientFound: Boolean(testUser)
    });
  }

  const today = todayInIstanbul();
  const maxWindowDays = 60;
  const windowEnd = new Date(dateFromIso(today).getTime() + maxWindowDays * 86400000).toISOString().slice(0, 10);
  const { data: schools, error: schoolsError } = await admin
    .from('schools')
    .select('id, name, subscription_billing_period, subscription_ends_on')
    .eq('is_active', true)
    .eq('subscription_status', 'active')
    .not('subscription_ends_on', 'is', null)
    .gte('subscription_ends_on', today)
    .lte('subscription_ends_on', windowEnd);
  if (schoolsError) return json({ error: schoolsError.message }, 500);

  const dueSchools = ((schools || []) as SchoolRow[]).filter(school => {
    const period = school.subscription_billing_period || 'monthly';
    const daysUntilEnd = daysBetween(today, String(school.subscription_ends_on));
    return daysUntilEnd <= reminderWindow(period) && reminderIsDue(period, daysUntilEnd);
  });

  const results = [];
  for (const school of dueSchools) {
    const period = school.subscription_billing_period || 'monthly';
    const endsOn = String(school.subscription_ends_on);
    const daysUntilEnd = daysBetween(today, endsOn);
    const { data: reminder, error: reminderError } = await admin
      .from('subscription_renewal_reminder_deliveries')
      .insert({
        school_id: school.id,
        billing_period: period,
        subscription_ends_on: endsOn,
        reminder_day: today,
        days_until_end: daysUntilEnd
      })
      .select('id')
      .single();
    if (reminderError) {
      if (String(reminderError.code) === '23505') {
        results.push({ schoolId: school.id, status: 'skipped_duplicate' });
        continue;
      }
      results.push({ schoolId: school.id, status: 'failed', error: reminderError.message });
      continue;
    }

    const { data: recipients, error: recipientError } = await admin
      .from('school_user_memberships')
      .select('user_id, full_name, role')
      .eq('school_id', school.id)
      .eq('role', 'admin');
    if (recipientError) {
      await admin.from('subscription_renewal_reminder_deliveries')
        .update({ status: 'failed', error_message: recipientError.message })
        .eq('id', reminder.id);
      results.push({ schoolId: school.id, status: 'failed', error: recipientError.message });
      continue;
    }

    const uniqueRecipients = [...new Map(((recipients || []) as Recipient[]).map(row => [row.user_id, row])).values()];
    const recipientIds = uniqueRecipients.map(row => row.user_id);
    const { emails, names } = await getUserEmails(admin, recipientIds);
    const title = 'Abonelik yenileme hatırlatması';
    const body = `${school.name} okulunun ${periodLabel(period)} aboneliği ${formatDate(endsOn)} tarihinde sona erecek. Kesinti olmaması için aboneliğinizi yenileyebilirsiniz.`;

    const { data: notification, error: notificationError } = await admin
      .from('notifications')
      .insert({
        school_id: school.id,
        audience: 'Okul adminleri',
        title,
        body,
        status: 'queued',
        sent_by: null,
        recipient_count: recipientIds.length,
        delivered_count: 0,
        read_count: 0
      })
      .select('id')
      .single();
    if (notificationError || !notification) {
      await admin.from('subscription_renewal_reminder_deliveries')
        .update({ status: 'failed', error_message: notificationError?.message || 'Notification could not be created' })
        .eq('id', reminder.id);
      results.push({ schoolId: school.id, status: 'failed', error: notificationError?.message || 'Notification could not be created' });
      continue;
    }

    if (recipientIds.length) {
      await admin
        .from('notification_recipients')
        .upsert(recipientIds.map(userId => ({ notification_id: notification.id, user_id: userId })), {
          onConflict: 'notification_id,user_id'
        });
    }

    const emailMessages = uniqueRecipients
      .map(recipient => {
        const email = emails.get(recipient.user_id);
        if (!email) return null;
        const name = recipient.full_name || names.get(recipient.user_id) || 'SASA-F kullanıcısı';
        return {
          email,
          name,
          subject: title,
          text: `Merhaba ${name},\n\n${body}\n\nAbonelik ekranı: ${NOTIFICATION_URL}\n\nSASA-F`,
          html: `<p>Merhaba ${name},</p><p>${body}</p><p><a href="${NOTIFICATION_URL}">Abonelik ekranını aç</a></p><p>SASA-F</p>`
        };
      })
      .filter(Boolean) as Array<{ email: string; name: string; subject: string; text: string; html: string }>;

    const [emailCount, pushCount] = await Promise.all([
      sendEmails(emailMessages),
      sendPushes(admin, recipientIds, Number(notification.id), title, body)
    ]);
    await logEmails(admin, emailMessages.map(message => ({
      school_id: school.id,
      recipient_email: message.email,
      recipient_name: message.name,
      email_type: 'subscription_renewal_reminder',
      subject: message.subject,
      status: 'sent',
      provider: 'custom_smtp',
      metadata: { school_name: school.name, billing_period: period, ends_on: endsOn }
    })));

    const status = emailCount + pushCount > 0 ? (emailCount < emailMessages.length || pushCount < recipientIds.length ? 'partial' : 'sent') : 'failed';
    await admin.from('notifications').update({
      status: pushCount > 0 ? 'sent' : 'queued',
      sent_at: pushCount > 0 ? new Date().toISOString() : null,
      delivered_count: pushCount,
      recipient_count: recipientIds.length
    }).eq('id', notification.id);
    await admin.from('subscription_renewal_reminder_deliveries')
      .update({
        notification_id: notification.id,
        recipient_count: recipientIds.length,
        email_count: emailCount,
        push_count: pushCount,
        status,
        error_message: status === 'failed' ? 'E-posta ve push bildirimi gönderilemedi.' : null
      })
      .eq('id', reminder.id);

    results.push({ schoolId: school.id, schoolName: school.name, daysUntilEnd, status, emailCount, pushCount, recipientCount: recipientIds.length });
  }

  return json({ today, scanned: schools?.length || 0, due: dueSchools.length, results });
});
