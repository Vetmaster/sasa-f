import { createClient } from '@supabase/supabase-js';
import { GoogleAuth } from 'npm:google-auth-library@9.15.1';
import webpush from 'web-push';

const PUSH_TIMEOUT_MS = 12000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const body = await request.json().catch(() => ({}));
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  if (body.action === 'public-key') {
    return vapidPublicKey
      ? json({ publicKey: vapidPublicKey })
      : json({ error: 'Push service is not configured' }, 503);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const firebaseServiceAccountJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');
  if (!supabaseUrl || !serviceRoleKey
    || (!firebaseServiceAccountJson && (!vapidPublicKey || !vapidPrivateKey))) {
    return json({ error: 'Push service is not configured' }, 503);
  }

  const authorization = request.headers.get('Authorization') || '';
  const accessToken = authorization.replace(/^Bearer\s+/i, '');
  if (!accessToken) return json({ error: 'Unauthorized' }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const isInternalServiceCall = accessToken === serviceRoleKey && body.internalService === true;
  let callerUserId = '';
  let callerSchoolId = '';
  let isPlatformSuperAdmin = isInternalServiceCall;
  if (!isInternalServiceCall) {
    const { data: userResult, error: userError } = await admin.auth.getUser(accessToken);
    if (userError || !userResult.user) return json({ error: 'Unauthorized' }, 401);
    callerUserId = userResult.user.id;

    const { data: callerProfile, error: profileError } = await admin
      .from('profiles')
      .select('school_id, role')
      .eq('id', callerUserId)
      .maybeSingle();
    if (profileError || !callerProfile) return json({ error: 'Profile not found' }, 403);
    callerSchoolId = callerProfile.school_id;
    isPlatformSuperAdmin = callerProfile.role === 'super_admin';
  }

  const requestedSchoolId = String(body.schoolId || callerSchoolId || '');
  if (!requestedSchoolId) {
    return json({ error: 'Forbidden school context' }, 403);
  }
  const requestedAction = String(body.action || '');
  if (!isPlatformSuperAdmin) {
    const { data: callerMembership, error: membershipError } = await admin
      .from('school_user_memberships')
      .select('role')
      .eq('user_id', callerUserId)
      .eq('school_id', requestedSchoolId)
      .maybeSingle();
    const canCreateTrainingAsCoach = requestedAction === 'create-training-and-send' && callerMembership?.role === 'coach';
    if (membershipError || (callerMembership?.role !== 'admin' && !canCreateTrainingAsCoach)) {
      return json({ error: 'Forbidden school context' }, 403);
    }
  }
  const targetSchoolId = requestedSchoolId;
  const { data: targetSchool } = await admin
    .from('schools')
    .select('id, is_active')
    .eq('id', targetSchoolId)
    .maybeSingle();
  if (!targetSchool) return json({ error: 'School not found' }, 404);
  if (targetSchool.is_active === false) return json({ error: 'School is inactive' }, 409);
  const requestedRecipientIds = Array.isArray(body.recipientUserIds)
    ? [...new Set(body.recipientUserIds.map((value: unknown) => String(value || '').trim()).filter(Boolean))].slice(0, 50)
    : [];
  const requestedStudentId = Number(body.studentId || 0);
  if (requestedRecipientIds.length && !isPlatformSuperAdmin) {
    return json({ error: 'Direct recipients require Super Admin permission' }, 403);
  }

  let notificationId = Number(body.notificationId || 0);
  let trainingId: number | null = null;
  if (body.action === 'create-training-and-send') {
    const training = body.training || {};
    const groupName = String(training.group || '').trim();
    const trainingDate = String(training.date || '').trim();
    const startTime = String(training.time || '').trim();
    const duration = Number(training.duration || 0);
    const title = String(training.title || '').trim();
    const coach = String(training.coach || '').trim();
    const field = String(training.field || '').trim();
    if (!groupName || !trainingDate || !startTime || !duration || !title || !coach || !field) {
      return json({ error: 'Invalid training' }, 400);
    }

    const { data: group, error: groupError } = await admin
      .from('training_groups')
      .select('id, name')
      .eq('school_id', targetSchoolId)
      .eq('name', groupName)
      .maybeSingle();
    if (groupError || !group) return json({ error: 'Training group not found' }, 404);

    const { data: createdTraining, error: trainingError } = await admin
      .from('trainings')
      .insert({
        school_id: targetSchoolId,
        group_id: group.id,
        training_date: trainingDate,
        start_time: startTime,
        duration_minutes: duration,
        title,
        coach,
        field
      })
      .select('id')
      .single();
    if (trainingError || !createdTraining) {
      return json({ error: trainingError?.message || 'Training could not be created' }, 500);
    }
    trainingId = Number(createdTraining.id);

    const formattedDate = new Intl.DateTimeFormat('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Europe/Istanbul'
    }).format(new Date(`${trainingDate}T12:00:00+03:00`));
    const { data: createdNotification, error: createError } = await admin
      .from('notifications')
      .insert({
        school_id: targetSchoolId,
        audience: `${group.name} velileri`,
        title: `${group.name} grubu · Yeni antrenman`,
        body: `${formattedDate} saat ${startTime.slice(0, 5)}’de ${title} antrenmanı yapılacaktır.`,
        status: 'queued',
        sent_by: callerUserId
      })
      .select('id')
      .single();
    if (createError || !createdNotification) {
      await admin.from('trainings').delete().eq('id', trainingId);
      return json({ error: createError?.message || 'Notification could not be created' }, 500);
    }
    notificationId = Number(createdNotification.id);
  } else if (body.action === 'create-and-send') {
    const notificationInput = body.notification && typeof body.notification === 'object'
      ? body.notification
      : body;
    const audience = String(notificationInput.audience || body.audience || '').trim();
    const title = String(notificationInput.title || body.title || '').trim();
    const notificationBody = String(
      notificationInput.body || notificationInput.message || body.message || ''
    ).trim();
    if (!audience || !title || !notificationBody) {
      const missing = [
        !audience ? 'audience' : '',
        !title ? 'title' : '',
        !notificationBody ? 'message' : ''
      ].filter(Boolean);
      console.warn('Invalid notification fields:', missing.join(','));
      return json({ error: 'Invalid notification', missing }, 400);
    }

    const { data: createdNotification, error: createError } = await admin
      .from('notifications')
      .insert({
        school_id: targetSchoolId,
        audience,
        title,
        body: notificationBody,
        status: 'queued',
        sent_by: callerUserId
      })
      .select('id')
      .single();
    if (createError || !createdNotification) {
      return json({ error: createError?.message || 'Notification could not be created' }, 500);
    }
    notificationId = Number(createdNotification.id);
  } else if (body.action !== 'send' || !notificationId) {
    return json({ error: 'Invalid request' }, 400);
  }

  const { data: notification, error: notificationError } = await admin
    .from('notifications')
    .select('id, school_id, audience, title, body')
    .eq('id', notificationId)
    .eq('school_id', targetSchoolId)
    .maybeSingle();
  if (notificationError || !notification) return json({ error: 'Notification not found' }, 404);
  const notificationUrl = notification.title === 'Yeni futbol okulu başvurusu'
    ? 'https://sasa-f.com/?open=applications'
    : 'https://sasa-f.com/?open=notifications';

  await admin.from('notifications').update({ status: 'queued' }).eq('id', notification.id);

  let recipientIds: string[] = [];
  if (requestedStudentId) {
    const { data: student, error: studentError } = await admin
      .from('students')
      .select('guardian_user_id')
      .eq('id', requestedStudentId)
      .eq('school_id', notification.school_id)
      .maybeSingle();
    if (studentError || !student) return json({ error: 'Student not found' }, 404);
    recipientIds = student.guardian_user_id ? [student.guardian_user_id] : [];
  } else if (notification.audience === 'Süper Admin') {
    const { data: superAdmins, error: superAdminsError } = await admin
      .from('profiles')
      .select('id')
      .eq('role', 'super_admin');
    if (superAdminsError) return json({ error: 'Super Admin recipients could not be loaded' }, 500);
    recipientIds = (superAdmins || []).map(profile => profile.id);
  } else if (requestedRecipientIds.length) {
    const { data: memberships, error: membershipsError } = await admin
      .from('school_user_memberships')
      .select('user_id')
      .eq('school_id', notification.school_id)
      .in('user_id', requestedRecipientIds);
    if (membershipsError) return json({ error: 'Direct recipients could not be verified' }, 500);
    recipientIds = (memberships || []).map(membership => membership.user_id);
  } else if (['Aidat borcu olanlar', 'Aidat borcu olmayanlar'].includes(notification.audience)) {
    const { data: students, error: studentsError } = await admin
      .from('students')
      .select('id, guardian_user_id')
      .eq('school_id', notification.school_id)
      .not('guardian_user_id', 'is', null);
    if (studentsError) return json({ error: 'Students could not be loaded' }, 500);

    const studentIds = (students || []).map(student => student.id);
    const { data: unpaidFees, error: feeError } = studentIds.length
      ? await admin
        .from('fee_periods')
        .select('student_id')
        .eq('school_id', notification.school_id)
        .eq('status', 'late')
        .in('student_id', studentIds)
      : { data: [], error: null };
    if (feeError) return json({ error: 'Fee periods could not be loaded' }, 500);

    const debtorStudentIds = new Set((unpaidFees || []).map(fee => Number(fee.student_id)));
    const allGuardianIds = new Set((students || []).map(student => student.guardian_user_id));
    const debtorGuardianIds = new Set(
      (students || [])
        .filter(student => debtorStudentIds.has(Number(student.id)))
        .map(student => student.guardian_user_id)
    );
    recipientIds = notification.audience === 'Aidat borcu olanlar'
      ? [...debtorGuardianIds]
      : [...allGuardianIds].filter(guardianId => !debtorGuardianIds.has(guardianId));
  } else if (notification.audience.endsWith(' velileri') && notification.audience !== 'Tüm veliler') {
    const groupName = notification.audience.slice(0, -' velileri'.length);
    const { data: group } = await admin
      .from('training_groups')
      .select('id')
      .eq('school_id', notification.school_id)
      .eq('name', groupName)
      .maybeSingle();
    if (group) {
      const { data: students } = await admin
        .from('students')
        .select('guardian_user_id')
        .eq('school_id', notification.school_id)
        .eq('group_id', group.id)
        .not('guardian_user_id', 'is', null);
      recipientIds = (students || []).map(row => row.guardian_user_id);
    }
  } else {
    let membershipsQuery = admin
      .from('school_user_memberships')
      .select('user_id')
      .eq('school_id', notification.school_id);
    if (notification.audience === 'Tüm veliler') membershipsQuery = membershipsQuery.eq('role', 'parent');
    const { data: memberships, error: membershipsError } = await membershipsQuery;
    if (membershipsError) return json({ error: 'Recipients could not be loaded' }, 500);
    recipientIds = (memberships || []).map(membership => membership.user_id);
  }

  if (notification.audience === 'Tüm kullanıcılar') {
    recipientIds.push(callerUserId);
  }
  recipientIds = [...new Set(recipientIds.filter(Boolean))];
  const { error: clearRecipientsError } = await admin
    .from('notification_recipients')
    .delete()
    .eq('notification_id', notification.id);
  if (clearRecipientsError) return json({ error: clearRecipientsError.message }, 500);

  if (recipientIds.length) {
    const { error: recipientsError } = await admin
      .from('notification_recipients')
      .upsert(
        recipientIds.map(userId => ({ notification_id: notification.id, user_id: userId })),
        { onConflict: 'notification_id,user_id' }
      );
    if (recipientsError) return json({ error: recipientsError.message }, 500);
  }

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

  const deliveredRecipientIds = new Set<string>();
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
                  title: notification.title,
                  body: notification.body,
                  message: notification.body,
                  notificationId: String(notification.id),
                  url: notificationUrl,
                  icon: 'https://sasa-f.com/sasa-f-icon-v3.svg',
                  badge: 'https://sasa-f.com/sasa-f-notification-badge.png',
                  tag: `sasa-f-${notification.id}`
                },
                ...(device.platform === 'web'
                  ? {
                    webpush: {
                      headers: { TTL: '3600', Urgency: 'high' },
                      fcm_options: { link: notificationUrl }
                    }
                  }
                  : {
                    android: {
                      priority: 'HIGH'
                    }
                  })
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
      console.error('Firebase push delivery could not be initialized:', error);
    }
  }

  const payload = JSON.stringify({
    title: notification.title,
    body: notification.body,
    tag: `sasa-f-${notification.id}`,
    url: notificationUrl
  });

  // Aynı tarayıcı hem eski VAPID hem web FCM ile kayıtlıysa çift bildirim
  // göndermemek için web FCM tokenı bulunan kullanıcıda yalnızca FCM tercih edilir.
  const webFallbackSubscriptions = vapidPublicKey && vapidPrivateKey
    ? subscriptions.filter(subscription => !webFcmRecipientIds.has(subscription.user_id))
    : [];
  if (vapidPublicKey && vapidPrivateKey) {
    webpush.setVapidDetails('mailto:00vetmaster00@gmail.com', vapidPublicKey, vapidPrivateKey);
  }
  const results = await Promise.allSettled(webFallbackSubscriptions.map(async subscription => {
    try {
      await Promise.race([
        webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth_secret }
        }, payload, { TTL: 3600, urgency: 'high', topic: `sasa-f-${notification.id}` }),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Push delivery request timed out')), PUSH_TIMEOUT_MS);
        })
      ]);
      return { id: subscription.id, userId: subscription.user_id, sent: true };
    } catch (error) {
      const statusCode = Number((error as { statusCode?: number }).statusCode || 0);
      if (statusCode === 404 || statusCode === 410) {
        await admin.from('push_subscriptions').delete().eq('id', subscription.id);
      }
      throw error;
    }
  }));

  results.forEach(result => {
    if (result.status === 'fulfilled') deliveredRecipientIds.add(result.value.userId);
  });
  const sent = deliveredRecipientIds.size;
  const failed = Math.max(0, recipientIds.length - sent);
  const { error: clearDeliveriesError } = await admin
    .from('notification_deliveries')
    .delete()
    .eq('notification_id', notification.id);
  if (clearDeliveriesError) return json({ error: clearDeliveriesError.message }, 500);

  if (deliveredRecipientIds.size) {
    const { error: deliveriesError } = await admin
      .from('notification_deliveries')
      .upsert(
        [...deliveredRecipientIds].map(userId => ({
          notification_id: notification.id,
          user_id: userId
        })),
        { onConflict: 'notification_id,user_id' }
      );
    if (deliveriesError) return json({ error: deliveriesError.message }, 500);
  }

  await admin.from('notifications').update({
    status: sent > 0 ? 'sent' : 'failed',
    sent_at: new Date().toISOString(),
    recipient_count: recipientIds.length,
    delivered_count: sent
  }).eq('id', notification.id);

  return json({ trainingId, notificationId: notification.id, sent, failed, recipients: recipientIds.length });
});
