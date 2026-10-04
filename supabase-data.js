(function () {
  const PAGE_SIZE = 1000;
  const DEFAULT_TRAINING_TYPES = ['Teknik Antrenman', 'Taktik Çalışma', 'Kondisyon', 'Kaleci Çalışması', 'Maç Hazırlığı'];

  function monthKey(value) {
    return String(value || '').slice(0, 7);
  }

  function normalizeSubscriptionPlan() {
    return 'standard';
  }

  function normalizeSubscriptionStatus(value) {
    if (!value) return 'trial';
    return ['trial', 'active'].includes(value) ? value : 'stopped';
  }

  function normalizeSubscriptionTrialMode(value) {
    return value === 'time_limited' ? value : null;
  }

  async function edgeFunctionErrorMessage(error, data, fallback) {
    const friendlyEdgeMessage = message => {
      if (/email rate limit exceeded|over_email_send_rate_limit|rate limit/i.test(message)) {
        return 'Davet şu anda gönderilemedi. Kısa süre içinde çok fazla davet gönderildiği için sistem geçici olarak beklemeye aldı. Lütfen birkaç dakika sonra tekrar deneyin.';
      }
      return message;
    };
    if (data?.error) return friendlyEdgeMessage(String(data.error));
    const context = error?.context;
    if (context) {
      try {
        const response = typeof context.clone === 'function' ? context.clone() : context;
        const responseBody = await response.json();
        if (responseBody?.error) return friendlyEdgeMessage(String(responseBody.error));
        if (responseBody?.message) return friendlyEdgeMessage(String(responseBody.message));
      } catch {
        try {
          const response = typeof context.clone === 'function' ? context.clone() : context;
          const responseText = await response.text();
          if (responseText) return friendlyEdgeMessage(responseText);
        } catch {
          // Use the Supabase client error below when the response body cannot be read.
        }
      }
    }
    return friendlyEdgeMessage(error?.message || fallback);
  }

  function isValidTurkishIban(value) {
    const iban = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!/^TR\d{24}$/.test(iban)) return false;
    const checksumValue = `${iban.slice(4)}2927${iban.slice(2, 4)}`;
    let remainder = 0;
    for (const digit of checksumValue) remainder = (remainder * 10 + Number(digit)) % 97;
    return remainder === 1;
  }

  function subscriptionPlanPrice(_value, billingPeriod = 'monthly') {
    const prices = {
      monthly: 2990,
      quarterly: 8370,
      yearly: 29900
    };
    return prices[billingPeriod] || prices.monthly;
  }

  function notificationDate(value) {
    if (!value) return '';
    const date = new Date(value);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const sameDay = candidate => candidate.toDateString() === date.toDateString();
    if (sameDay(today)) return 'Bugün';
    if (sameDay(yesterday)) return 'Dün';
    return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' }).format(date);
  }

  async function fetchAll(client, table, columns, order = 'id', filters = {}) {
    const rows = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      let query = client
        .from(table)
        .select(columns)
        .order(order, { ascending: true });
      Object.entries(filters).forEach(([column, value]) => {
        query = query.eq(column, value);
      });
      const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < PAGE_SIZE) return rows;
    }
  }

  async function fetchAccessRequests(client, schoolId) {
    async function fetchAccessRequestsDirect() {
      try {
        return await fetchAll(client, 'access_requests', 'id, user_id, school_id, email, full_name, requested_role, status, email_verified_at, reviewed_at, created_at', 'created_at', { school_id: schoolId });
      } catch (error) {
        if (!String(error?.message || '').includes('email_verified_at')) throw error;
        return fetchAll(client, 'access_requests', 'id, user_id, school_id, email, full_name, requested_role, status, reviewed_at, created_at', 'created_at', { school_id: schoolId });
      }
    }

    const { data: rpcRows, error: rpcError } = await client
      .rpc('list_school_access_requests', { target_school_id: schoolId });
    if (!rpcError) {
      const rows = rpcRows || [];
      if (rows.length) return rows;
      try {
        const fallbackRows = await fetchAccessRequestsDirect();
        return fallbackRows.length ? fallbackRows : rows;
      } catch {
        return rows;
      }
    }
    if (!String(rpcError?.message || '').includes('list_school_access_requests')) throw rpcError;
    return fetchAccessRequestsDirect();
  }

  async function fetchTrainingTypes(client, schoolId) {
    const result = await client
      .from('training_types')
      .select('id, name, sort_order')
      .eq('school_id', schoolId)
      .order('sort_order');
    if (!result.error) return result;
    const missingTable = ['42P01', 'PGRST205'].includes(result.error.code)
      || /training_types.*(?:does not exist|schema cache)/i.test(String(result.error.message || ''));
    if (!missingTable) return result;
    return {
      data: DEFAULT_TRAINING_TYPES.map((name, index) => ({ id: null, name, sort_order: index + 1 })),
      error: null
    };
  }

  async function fetchTrainingCoaches(client, schoolId) {
    const result = await client
      .from('training_coaches')
      .select('id, name, sort_order')
      .eq('school_id', schoolId)
      .order('sort_order');
    if (!result.error) return result;
    const missingTable = ['42P01', 'PGRST205'].includes(result.error.code)
      || /training_coaches.*(?:does not exist|schema cache)/i.test(String(result.error.message || ''));
    if (!missingTable) return result;
    return { data: [], error: null };
  }

  async function fetchTrainingFields(client, schoolId) {
    const result = await client
      .from('training_fields')
      .select('id, name, sort_order')
      .eq('school_id', schoolId)
      .order('sort_order');
    if (!result.error) return result;
    const missingTable = ['42P01', 'PGRST205'].includes(result.error.code)
      || /training_fields.*(?:does not exist|schema cache)/i.test(String(result.error.message || ''));
    if (!missingTable) return result;
    return { data: [], error: null };
  }

  async function fetchSchoolSettings(client, schoolId, role) {
    const columns = role === 'coach' ? 'name, slug, is_active, subscription_plan, subscription_status, subscription_trial_mode, subscription_billing_period, subscription_starts_on, subscription_ends_on' : 'name, slug, monthly_fee_amount, bank_name, bank_account_holder, bank_iban, bank_accounts, is_active, subscription_plan, subscription_status, subscription_trial_mode, subscription_billing_period, subscription_starts_on, subscription_ends_on';
    let result = await client.from('schools').select(columns).eq('id', schoolId).single();
    if (result.error && /bank_name|bank_account_holder|bank_iban|bank_accounts|subscription_trial_mode/i.test(String(result.error.message || ''))) {
      const compatibilityColumns = role === 'coach' ? 'name, slug, is_active, subscription_plan, subscription_status, subscription_ends_on' : 'name, slug, monthly_fee_amount, bank_name, bank_account_holder, bank_iban, is_active, subscription_plan, subscription_status, subscription_ends_on';
      result = await client.from('schools').select(compatibilityColumns).eq('id', schoolId).single();
    }
    if (result.error && String(result.error.message || '').includes('is_active')) {
      const fallbackColumns = role === 'coach' ? 'name, slug' : 'name, slug, monthly_fee_amount';
      result = await client.from('schools').select(fallbackColumns).eq('id', schoolId).single();
    }
    return result;
  }

  function create(client) {
    let schoolId = null;
    let userId = null;
    let profileRole = null;
    let groupsByName = new Map();

    function requireContext() {
      if (!schoolId) throw new Error('Okul bağlantısı kurulamadı.');
    }

    function groupId(name) {
      const id = groupsByName.get(name);
      if (!id) throw new Error(`“${name}” antrenman grubu Supabase’de bulunamadı.`);
      return id;
    }

    async function load(profile) {
      schoolId = profile.school_id;
      userId = profile.user_id;
      const role = profile.role;
      profileRole = role;
      const isCoach = role === 'coach';
      requireContext();

      // Açılışta yalnızca genel bakışın ihtiyaç duyduğu güncel veriyi alırız.
      // Geçmiş aidat, muhasebe, yoklama ve bildirim verileri ilgili ekran
      // açıldığında load* yardımcılarıyla ayrıca yüklenir.
      const currentMonth = new Date().toISOString().slice(0, 7);
      const today = new Date().toISOString().slice(0, 10);
      const [
        schoolSettingsResult,
        groupsResult,
        trainingTypesResult,
        trainingCoachesResult,
        trainingFieldsResult,
        studentsRows,
        feeRows,
        trainingRows
      ] = await Promise.all([
        fetchSchoolSettings(client, schoolId, role),
        client.from('training_groups').select('id, name, sort_order').eq('school_id', schoolId).order('sort_order'),
        fetchTrainingTypes(client, schoolId),
        fetchTrainingCoaches(client, schoolId),
        fetchTrainingFields(client, schoolId),
        isCoach
          ? client.rpc('coach_student_directory', { target_school_id: schoolId }).then(({ data, error }) => { if (error) throw error; return data || []; })
          : fetchAll(client, 'students', 'id, full_name, birth_date, birth_year, position, guardian_name, phone, email, address, notes, enrollment_date, fee_tracking_start_date, monthly_fee_amount, attendance_rate, is_active, profile_photo_path, player_card, training_groups(name)', 'id', { school_id: schoolId }),
        isCoach
          ? Promise.resolve([])
          : client.from('fee_periods').select('id, student_id, fee_month, status, amount, due_date, paid_at, payment_method, note, source, created_at').eq('school_id', schoolId).eq('fee_month', `${currentMonth}-01`),
        client.from('trainings').select('id, training_date, start_time, duration_minutes, title, coach, field, training_groups(name)').eq('school_id', schoolId).gte('training_date', today).order('training_date').order('start_time')
      ]);

      const accountingRows = [];
      const notificationRows = [];
      const notificationReadRows = [];
      const attendanceRows = [];
      const accessRequestRows = [];

      if (schoolSettingsResult.error) throw schoolSettingsResult.error;
      if (groupsResult.error) throw groupsResult.error;
      if (trainingTypesResult.error) throw trainingTypesResult.error;
      if (trainingCoachesResult.error) throw trainingCoachesResult.error;
      if (trainingFieldsResult.error) throw trainingFieldsResult.error;
      if (feeRows.error) throw feeRows.error;
      if (trainingRows.error) throw trainingRows.error;
      const groups = groupsResult.data || [];
      groupsByName = new Map(groups.map(group => [group.name, group.id]));
      const currentFeeRows = feeRows.data || feeRows;
      const currentTrainingRows = trainingRows.data || trainingRows;

      const feesByStudent = new Map();
      currentFeeRows.forEach(row => {
        if (!feesByStudent.has(Number(row.student_id))) feesByStudent.set(Number(row.student_id), []);
        feesByStudent.get(Number(row.student_id)).push(row);
      });
      const studentPhotoUrls = new Map();

      const students = studentsRows.map(row => {
        const fees = feesByStudent.get(Number(row.id)) || [];
        const feePayments = Object.fromEntries(fees.map(fee => [monthKey(fee.fee_month), fee.status]));
        const feeHistory = Object.fromEntries(fees.map(fee => [monthKey(fee.fee_month), {
          status: fee.status,
          amount: fee.amount === null ? null : Number(fee.amount),
          note: fee.note,
          source: fee.source,
          paymentMethod: fee.payment_method,
          paidAt: fee.paid_at,
          createdAt: fee.created_at
        }]));
        return {
          id: Number(row.id),
          name: row.full_name,
          birth: row.birth_date || row.birth_year || '',
          group: (isCoach ? row.group_name : row.training_groups?.name) || 'Atanmamış',
          position: (isCoach ? row.player_position : row.position) || '',
          parent: isCoach ? '' : row.guardian_name || '',
          phone: isCoach ? '' : row.phone || '',
          email: isCoach ? '' : row.email || '',
          address: isCoach ? '' : row.address || '',
          notes: row.notes || '',
          photoPath: row.profile_photo_path || '',
          photoUrl: studentPhotoUrls.get(row.profile_photo_path) || '',
          playerCard: row.player_card && typeof row.player_card === 'object' ? row.player_card : null,
          enrollmentDate: row.enrollment_date,
          feeTrackingStartDate: isCoach ? null : row.fee_tracking_start_date,
          monthlyFeeAmount: isCoach ? 0 : Number(row.monthly_fee_amount) || 0,
          feePayments: isCoach ? {} : feePayments,
          feeHistory: isCoach ? {} : feeHistory,
          fee: isCoach ? 'none' : feePayments[currentMonth] || 'none',
          attendance: Number(row.attendance_rate || 0),
          active: row.is_active !== false
        };
      });

      const trainings = currentTrainingRows.map(row => ({
        id: Number(row.id),
        date: row.training_date,
        time: String(row.start_time || '').slice(0, 5),
        duration: Number(row.duration_minutes),
        group: row.training_groups?.name || 'Atanmamış',
        title: row.title,
        coach: row.coach,
        field: row.field
      }));

      const accountingEntries = accountingRows.map(row => ({
        id: Number(row.id),
        date: row.occurred_on,
        title: row.title,
        type: row.kind === 'income' ? 'Gelir' : 'Gider',
        amount: Number(row.amount),
        kind: row.kind,
        paymentMethod: row.payment_method,
        source: row.source,
        reference: row.reference,
        studentId: row.student_id ? Number(row.student_id) : null,
        feePeriodId: row.fee_period_id ? Number(row.fee_period_id) : null
      }));

      const readNotificationIds = new Set(notificationReadRows.map(row => Number(row.notification_id)));
      const notifications = notificationRows
        .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
        .map(row => {
          const timestamp = row.sent_at || row.created_at;
          return {
            id: Number(row.id),
            date: notificationDate(timestamp),
            title: row.title,
            body: row.body,
            audience: row.audience,
            sentBy: row.sent_by,
            time: new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp)),
            status: row.status === 'sent'
              ? 'Teslim edildi'
              : row.status === 'failed' || (row.status === 'queued' && Date.now() - new Date(timestamp).getTime() > 120000)
                ? 'Başarısız'
                : row.status === 'queued'
                  ? 'Sırada'
                  : 'Taslak',
            recipientCount: row.recipient_count === null ? null : Number(row.recipient_count),
            deliveredCount: row.delivered_count === null ? null : Number(row.delivered_count),
            readCount: Number(row.read_count || 0),
            read: readNotificationIds.has(Number(row.id))
          };
        });

      const attendanceRecords = attendanceRows.map(row => ({
        id: Number(row.id),
        trainingId: Number(row.training_id),
        date: row.taken_at,
        presentStudentIds: (row.attendance_records || []).filter(record => record.present).map(record => Number(record.student_id))
      }));

      const accessRequests = accessRequestRows
        .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
        .map(row => ({
          id: Number(row.id),
          userId: row.user_id,
          email: row.email,
          fullName: row.full_name,
          requestedRole: row.requested_role,
          status: row.status,
          emailVerifiedAt: row.email_verified_at,
          reviewedAt: row.reviewed_at,
          createdAt: row.created_at,
          contextSchoolName: row.context_school_name || row.schools?.name || '',
          contextStudentName: row.context_student_name || ''
        }));

      return {
        schoolId,
        schoolName: schoolSettingsResult.data?.name || '',
        schoolSlug: schoolSettingsResult.data?.slug || '',
        schoolActive: schoolSettingsResult.data?.is_active !== false,
        subscriptionPlan: normalizeSubscriptionPlan(schoolSettingsResult.data?.subscription_plan),
        subscriptionStatus: normalizeSubscriptionStatus(schoolSettingsResult.data?.subscription_status),
        subscriptionTrialMode: normalizeSubscriptionTrialMode(schoolSettingsResult.data?.subscription_trial_mode),
        subscriptionBillingPeriod: schoolSettingsResult.data?.subscription_billing_period || 'monthly',
        subscriptionStartsOn: schoolSettingsResult.data?.subscription_starts_on || '',
        subscriptionEndsOn: schoolSettingsResult.data?.subscription_ends_on || '',
        monthlyFeeAmount: Number(schoolSettingsResult.data?.monthly_fee_amount) || 1500,
        bankAccounts: Array.isArray(schoolSettingsResult.data?.bank_accounts) && schoolSettingsResult.data.bank_accounts.length
          ? schoolSettingsResult.data.bank_accounts.slice(0, 4)
          : schoolSettingsResult.data?.bank_iban
            ? [{
                bankName: schoolSettingsResult.data.bank_name || '',
                accountHolder: schoolSettingsResult.data.bank_account_holder || '',
                iban: schoolSettingsResult.data.bank_iban || ''
              }]
            : [],
        groups,
        trainingTypes: (trainingTypesResult.data || []).map(item => item.name),
        trainingCoaches: (trainingCoachesResult.data || []).map(item => item.name),
        trainingFields: (trainingFieldsResult.data || []).map(item => item.name),
        students,
        trainings,
        accountingEntries,
        notifications,
        attendanceRecords,
        accessRequests
      };
    }

    function applyDateRange(query, column, { from = '', to = '' } = {}) {
      if (from) query = query.gte(column, from);
      if (to) query = query.lte(column, to);
      return query;
    }

    async function loadFeePeriods({ from = '', to = '', studentId = null } = {}) {
      requireContext();
      let query = client
        .from('fee_periods')
        .select('id, student_id, fee_month, status, amount, due_date, paid_at, payment_method, note, source, created_at')
        .eq('school_id', schoolId)
        .order('fee_month', { ascending: false });
      if (studentId) query = query.eq('student_id', studentId);
      query = applyDateRange(query, 'fee_month', { from: from ? `${monthKey(from)}-01` : '', to: to ? `${monthKey(to)}-01` : '' });
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    }

    async function loadAccountingEntries({ from = '', to = '' } = {}) {
      requireContext();
      let query = client
        .from('accounting_entries')
        .select('id, student_id, fee_period_id, occurred_on, title, kind, amount, payment_method, source, reference')
        .eq('school_id', schoolId)
        .order('occurred_on', { ascending: false });
      query = applyDateRange(query, 'occurred_on', { from, to });
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    }

    async function loadAttendanceSessions({ from = '', toExclusive = '' } = {}) {
      requireContext();
      let query = client
        .from('attendance_sessions')
        .select('id, training_id, taken_at, attendance_records(student_id, present)')
        .eq('school_id', schoolId)
        .order('taken_at', { ascending: false });
      if (from) query = query.gte('taken_at', from);
      if (toExclusive) query = query.lt('taken_at', toExclusive);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    }

    async function loadAttendanceForTraining(trainingId) {
      requireContext();
      const { data, error } = await client
        .from('attendance_sessions')
        .select('id, training_id, taken_at, attendance_records(student_id, present)')
        .eq('school_id', schoolId)
        .eq('training_id', trainingId)
        .maybeSingle();
      if (error) throw error;
      return data;
    }

    async function loadAttendanceForTrainings(trainingIds = []) {
      requireContext();
      const ids = [...new Set(trainingIds.map(id => Number(id)).filter(Number.isFinite))];
      if (!ids.length) return [];
      const { data, error } = await client
        .from('attendance_sessions')
        .select('id, training_id, taken_at, attendance_records(student_id, present)')
        .eq('school_id', schoolId)
        .in('training_id', ids)
        .order('taken_at', { ascending: false });
      if (error) throw error;
      return data || [];
    }

    async function loadTrainings({ from = '', to = '' } = {}) {
      requireContext();
      let query = client
        .from('trainings')
        .select('id, training_date, start_time, duration_minutes, title, coach, field, training_groups(name)')
        .eq('school_id', schoolId)
        .order('training_date', { ascending: true })
        .order('start_time', { ascending: true });
      query = applyDateRange(query, 'training_date', { from, to });
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    }

    async function loadNotifications() {
      requireContext();
      const [notificationsResult, readsResult] = await Promise.all([
        client.from('notifications').select('id, audience, title, body, status, sent_by, sender_label, sent_at, created_at, recipient_count, delivered_count, read_count').eq('school_id', schoolId).order('created_at', { ascending: false }).limit(100),
        client.from('notification_reads').select('notification_id, read_at').eq('user_id', userId).order('notification_id')
      ]);
      if (notificationsResult.error) throw notificationsResult.error;
      if (readsResult.error) throw readsResult.error;
      return { notifications: notificationsResult.data || [], reads: readsResult.data || [] };
    }

    async function loadAccessRequests() {
      requireContext();
      return fetchAccessRequests(client, schoolId);
    }

    async function loadStudents() {
      requireContext();
      if (profileRole === 'coach') {
        const { data, error } = await client.rpc('coach_student_directory', { target_school_id: schoolId });
        if (error) throw error;
        return data || [];
      }
      return fetchAll(client, 'students', 'id, full_name, birth_date, birth_year, position, guardian_name, phone, email, address, notes, enrollment_date, fee_tracking_start_date, monthly_fee_amount, attendance_rate, is_active, profile_photo_path, player_card, training_groups(name)', 'id', { school_id: schoolId });
    }

    async function loadStudentPhotoUrls(paths) {
      const uniquePaths = [...new Set((paths || []).filter(Boolean))];
      if (!uniquePaths.length) return new Map();
      const { data, error } = await client.storage
        .from('student-profile-photos')
        .createSignedUrls(uniquePaths, 60 * 60);
      if (error) throw error;
      return new Map((data || []).filter(photo => photo.path && photo.signedUrl && !photo.error).map(photo => [photo.path, photo.signedUrl]));
    }

    async function loadConfiguration(role = profileRole) {
      requireContext();
      const [schoolSettingsResult, groupsResult, typesResult, coachesResult, fieldsResult] = await Promise.all([
        fetchSchoolSettings(client, schoolId, role),
        client.from('training_groups').select('id, name, sort_order').eq('school_id', schoolId).order('sort_order'),
        fetchTrainingTypes(client, schoolId),
        fetchTrainingCoaches(client, schoolId),
        fetchTrainingFields(client, schoolId)
      ]);
      if (schoolSettingsResult.error) throw schoolSettingsResult.error;
      if (groupsResult.error) throw groupsResult.error;
      if (typesResult.error) throw typesResult.error;
      if (coachesResult.error) throw coachesResult.error;
      if (fieldsResult.error) throw fieldsResult.error;
      groupsByName = new Map((groupsResult.data || []).map(group => [group.name, group.id]));
      return {
        school: schoolSettingsResult.data || {},
        groups: groupsResult.data || [],
        trainingTypes: (typesResult.data || []).map(item => item.name),
        trainingCoaches: (coachesResult.data || []).map(item => item.name),
        trainingFields: (fieldsResult.data || []).map(item => item.name)
      };
    }

    async function listSchools() {
      const { data, error } = await client.rpc('school_overview');
      let rows = data || [];
      if (error) {
        const fallback = await client.from('schools').select('id, name, slug, monthly_fee_amount, created_at').order('name');
        if (fallback.error) throw error;
        rows = fallback.data || [];
      }
      let subscriptionResult = await client
        .from('schools')
        .select('id, subscription_plan, subscription_status, subscription_trial_mode, subscription_monthly_price, subscription_billing_period, subscription_period_price, subscription_starts_on, subscription_ends_on');
      if (subscriptionResult.error && String(subscriptionResult.error.message || '').includes('subscription_trial_mode')) {
        subscriptionResult = await client
          .from('schools')
          .select('id, subscription_plan, subscription_status, subscription_monthly_price, subscription_billing_period, subscription_period_price, subscription_starts_on, subscription_ends_on');
      }
      const subscriptionBySchool = new Map((subscriptionResult.data || []).map(item => [item.id, item]));
      const paymentResult = await client
        .from('subscription_payment_reports')
        .select('school_id, created_at, reviewed_at')
        .order('created_at', { ascending: false });
      const lastSubscriptionActivityBySchool = new Map();
      if (!paymentResult.error) {
        (paymentResult.data || []).forEach(report => {
          if (!report.school_id || lastSubscriptionActivityBySchool.has(report.school_id)) return;
          lastSubscriptionActivityBySchool.set(report.school_id, report.reviewed_at || report.created_at || '');
        });
      }
      return rows.map(school => {
        const subscription = subscriptionBySchool.get(school.id) || {};
        return {
          subscriptionPlan: normalizeSubscriptionPlan(subscription.subscription_plan),
          subscriptionStatus: normalizeSubscriptionStatus(subscription.subscription_status),
          subscriptionTrialMode: normalizeSubscriptionTrialMode(subscription.subscription_trial_mode),
          subscriptionMonthlyPrice: Number.isFinite(Number(subscription.subscription_monthly_price)) ? Number(subscription.subscription_monthly_price) : subscriptionPlanPrice(subscription.subscription_plan, 'monthly'),
          subscriptionBillingPeriod: subscription.subscription_billing_period || 'monthly',
          subscriptionPeriodPrice: Number.isFinite(Number(subscription.subscription_period_price)) ? Number(subscription.subscription_period_price) : subscriptionPlanPrice(subscription.subscription_plan, subscription.subscription_billing_period),
          subscriptionStartsOn: subscription.subscription_starts_on || '',
          subscriptionEndsOn: subscription.subscription_ends_on || '',
          subscriptionLastActivityAt: lastSubscriptionActivityBySchool.get(school.id) || '',
          id: school.id,
          name: school.name,
          slug: school.slug,
          active: school.is_active !== false,
          monthlyFeeAmount: Number(school.monthly_fee_amount || 0),
          studentCount: Number(school.student_count || 0),
          activeStudentCount: Number(school.active_student_count || 0),
          adminCount: Number(school.admin_count || 0),
          unpaidTotal: Number(school.unpaid_total || 0),
          createdAt: school.created_at
        };
      });
    }

    async function listUserSchools() {
      const { data, error } = await client.rpc('my_school_memberships');
      if (error) throw error;
      return (data || []).map(school => ({
        id: school.id,
        name: school.name,
        slug: school.slug,
        active: school.is_active !== false,
        subscriptionStatus: normalizeSubscriptionStatus(school.subscription_status),
        role: school.role
      }));
    }

    async function activateUserSchool(targetSchoolId) {
      const { data, error } = await client.rpc('switch_user_school', {
        target_school_id: targetSchoolId
      });
      if (error) throw error;
      return Array.isArray(data) ? data[0] : data;
    }

    async function updateSchoolSubscription({ schoolId: targetSchoolId, status, trialMode, billingPeriod, startsOn, endsOn }) {
      const parameters = {
        target_school_id: targetSchoolId,
        plan_code: 'standard',
        subscription_state: status,
        trial_mode_code: trialMode,
        billing_period_code: billingPeriod,
        starts_on: startsOn,
        ends_on: endsOn
      };
      let { data, error } = await client.rpc('update_school_subscription', parameters);
      // The six-parameter RPC remains on older installations until the trial
      // migration is deployed. Active subscription actions can safely use it.
      if (error && status !== 'trial' && /trial_mode_code|Could not find the function|function .*update_school_subscription/i.test(String(error.message || ''))) {
        ({ data, error } = await client.rpc('update_school_subscription', {
          target_school_id: targetSchoolId,
          plan_code: 'standard',
          subscription_state: status,
          billing_period_code: billingPeriod,
          starts_on: startsOn,
          ends_on: endsOn
        }));
      }
      if (error) throw error;
      return Array.isArray(data) ? data[0] : data;
    }

    async function createSchool({ name, slug, monthlyFeeAmount }) {
      const { data, error } = await client.rpc('create_school', {
        school_name: name,
        school_slug: slug,
        initial_monthly_fee: monthlyFeeAmount
      });
      if (error) throw error;
      const school = Array.isArray(data) ? data[0] : data;
      return school;
    }

    async function updateSchool({ id, name, active }) {
      const { data, error } = await client.rpc('update_school', {
        target_school_id: id,
        school_name: name,
        active
      });
      if (error) throw error;
      const school = Array.isArray(data) ? data[0] : data;
      return school;
    }

    async function deleteSchool(targetSchoolId) {
      const { data, error } = await client.rpc('delete_school', {
        target_school_id: targetSchoolId
      });
      if (error) throw error;
      return data;
    }

    async function inviteSchoolAdmin({ schoolId: targetSchoolId, fullName, email, role, confirmMultipleSchool = false }) {
      const { data, error } = await client.functions.invoke('invite-school-admin', {
        body: { schoolId: targetSchoolId, fullName, email, role, confirmMultipleSchool }
      });
      if (error) {
        throw new Error(await edgeFunctionErrorMessage(error, data, 'Kullanıcı daveti gönderilemedi.'));
      }
      if (data?.error) throw new Error(data.error);
      return data;
    }

    async function submitSchoolApplication(application) {
      const { data, error } = await client.functions.invoke('submit-school-application', {
        body: application
      });
      if (error) throw new Error(await edgeFunctionErrorMessage(error, data, 'Başvuru gönderilemedi.'));
      if (data?.error) throw new Error(data.error);
      return data;
    }

    async function listSchoolApplications() {
      const { data, error } = await client
        .from('school_applications')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    }

    async function reviewSchoolApplication({ applicationId, status, customerMessage, internalNote }) {
      const { data, error } = await client.rpc('review_school_application', {
        target_application_id: applicationId,
        next_status: status,
        customer_note: customerMessage || null,
        private_note: internalNote || null
      });
      if (error) throw error;
      return Array.isArray(data) ? data[0] : data;
    }

    async function approveSchoolApplication(applicationId) {
      const { data, error } = await client.functions.invoke('approve-school-application', { body: { applicationId } });
      if (error) throw new Error(await edgeFunctionErrorMessage(error, data, 'Başvuru onaylanamadı.'));
      if (data?.error) throw new Error(data.error);
      return data;
    }

    async function getMySchoolOnboarding() {
      const { data, error } = await client.from('school_onboardings').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data || null;
    }

    async function getMyApprovedSubscriptionPeriod() {
      requireContext();
      const { data, error } = await client
        .from('subscription_payment_reports')
        .select('school_subscription_periods!subscription_payment_reports_period_id_fkey(billing_period, starts_on, ends_on, status)')
        .eq('school_id', schoolId)
        .eq('status', 'APPROVED')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const period = data?.school_subscription_periods;
      return period && typeof period === 'object' ? period : null;
    }

    async function listMySubscriptionHistory() {
      requireContext();
      const { data, error } = await client
        .from('subscription_payment_reports')
        .select('id, amount, status, created_at, reviewed_at, school_subscription_periods!subscription_payment_reports_period_id_fkey(plan_code, billing_period, amount, starts_on, ends_on, status)')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data || []).map(item => ({
        id: item.id,
        amount: Number(item.amount || 0),
        status: item.status,
        created_at: item.created_at,
        reviewed_at: item.reviewed_at,
        period: item.school_subscription_periods || {}
      }));
    }

    async function getSubscriptionBankAccounts() {
      const { data, error } = await client.rpc('get_subscription_bank_accounts');
      if (error) throw error;
      return Array.isArray(data) ? data.slice(0, 4) : [];
    }

    async function saveSubscriptionBankAccounts(accounts) {
      const { data, error } = await client.rpc('save_subscription_bank_accounts', { accounts });
      if (error) throw error;
      return Array.isArray(data) ? data.slice(0, 4) : [];
    }

    async function sendSubscriptionReminderTestEmail(testEmail = '00vetmaster00+iskelefb@gmail.com') {
      const { data, error } = await client.functions.invoke('send-subscription-renewal-reminders', {
        body: { action: 'send-test-email', testEmail }
      });
      if (error) throw new Error(await edgeFunctionErrorMessage(error, data, 'Deneme e-postası gönderilemedi.'));
      if (data?.error) throw new Error(data.error);
      return data;
    }

    async function startSchoolTrial() {
      const { data, error } = await client.rpc('start_school_trial');
      if (error) throw error;
      return Array.isArray(data) ? data[0] : data;
    }

    async function createSubscriptionPaymentReport({ billingPeriod, note }) {
      const { data, error } = await client.rpc('create_subscription_payment_report', {
        requested_plan: 'standard',
        requested_billing_period: billingPeriod,
        payer_note: note || null
      });
      if (error) throw error;
      return Array.isArray(data) ? data[0] : data;
    }

    async function listSubscriptionPaymentReports() {
      const { data, error } = await client
        .from('subscription_payment_reports')
        .select('*, schools(name), school_subscription_periods!subscription_payment_reports_period_id_fkey(plan_code, billing_period, starts_on, ends_on)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    }

    async function loadSystemEmailLogs() {
      const { data, error } = await client
        .from('system_email_logs')
        .select('id, school_id, recipient_email, recipient_name, email_type, subject, status, provider, created_at')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    }

    async function reviewSubscriptionPaymentReport({ reportId, approved, note }) {
      const { data, error } = await client.rpc('review_subscription_payment_report', {
        target_report_id: reportId,
        approved,
        reviewer_note: note || null
      });
      if (error) throw error;
      return Array.isArray(data) ? data[0] : data;
    }

    async function saveSchoolSettings(monthlyFeeAmount) {
      requireContext();
      const amount = Number(monthlyFeeAmount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Geçerli bir aylık aidat tutarı girin.');
      const { data, error } = await client
        .from('schools')
        .update({ monthly_fee_amount: amount })
        .eq('id', schoolId)
        .select('monthly_fee_amount')
        .single();
      if (error) throw error;
      return Number(data.monthly_fee_amount);
    }

    async function saveSchoolBankDetails(accounts) {
      requireContext();
      const normalizedAccounts = (Array.isArray(accounts) ? accounts : []).slice(0, 4).map(account => ({
        bankName: String(account?.bankName || '').trim().replace(/\s+/g, ' '),
        accountHolder: String(account?.accountHolder || '').trim().replace(/\s+/g, ' '),
        iban: String(account?.iban || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
      })).filter(account => account.bankName || account.accountHolder || account.iban);
      if (normalizedAccounts.some(account => !account.bankName || !account.accountHolder || !isValidTurkishIban(account.iban))) {
        throw new Error('Her hesap için banka adı, hesap sahibi ve geçerli TR IBAN bilgisini birlikte girin.');
      }
      if (new Set(normalizedAccounts.map(account => account.iban)).size !== normalizedAccounts.length) {
        throw new Error('Aynı IBAN birden fazla kez eklenemez.');
      }
      const primaryAccount = normalizedAccounts[0] || {};
      const normalized = {
        bank_accounts: normalizedAccounts,
        bank_name: primaryAccount.bankName || null,
        bank_account_holder: primaryAccount.accountHolder || null,
        bank_iban: primaryAccount.iban || null
      };
      const { data, error } = await client
        .from('schools')
        .update(normalized)
        .eq('id', schoolId)
        .select('bank_accounts')
        .single();
      if (error) throw error;
      return Array.isArray(data.bank_accounts) ? data.bank_accounts.slice(0, 4) : [];
    }

    async function saveGroup(groupName) {
      requireContext();
      const name = String(groupName || '').trim().replace(/\s+/g, ' ');
      if (!name) throw new Error('Grup adı boş bırakılamaz.');
      if (!/^[\p{L}\p{N} .:()\-/]{1,60}$/u.test(name)) throw new Error('Grup adında desteklenmeyen karakterler var.');
      const duplicate = [...groupsByName.keys()].some(existing => existing.localeCompare(name, 'tr-TR', { sensitivity: 'base' }) === 0);
      if (duplicate) throw new Error('Bu grup zaten kayıtlı.');
      const { data, error } = await client
        .from('training_groups')
        .insert({ school_id: schoolId, name, sort_order: groupsByName.size + 1 })
        .select('id, name, sort_order')
        .single();
      if (error) throw error;
      groupsByName.set(data.name, data.id);
      return data;
    }

    async function deleteGroup(groupName) {
      requireContext();
      if (groupsByName.size <= 1) throw new Error('Okuldaki son grup silinemez.');
      const id = groupId(groupName);
      const [studentsResult, trainingsResult] = await Promise.all([
        client.from('students').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('group_id', id),
        client.from('trainings').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('group_id', id)
      ]);
      if (studentsResult.error) throw studentsResult.error;
      if (trainingsResult.error) throw trainingsResult.error;
      if ((studentsResult.count || 0) > 0 || (trainingsResult.count || 0) > 0) {
        throw new Error('Öğrenci veya antrenman kaydı bulunan grup silinemez.');
      }
      const { error } = await client.from('training_groups').delete().eq('id', id).eq('school_id', schoolId);
      if (error) throw error;
      groupsByName.delete(groupName);
    }

    async function updateGroup(currentName, groupName) {
      requireContext();
      const id = groupId(currentName);
      const name = String(groupName || '').trim().replace(/\s+/g, ' ');
      if (!name) throw new Error('Grup adı boş bırakılamaz.');
      if (!/^[\p{L}\p{N} .:()\-/]{1,60}$/u.test(name)) throw new Error('Grup adında desteklenmeyen karakterler var.');
      const duplicate = [...groupsByName.keys()].some(existing => existing !== currentName && existing.localeCompare(name, 'tr-TR', { sensitivity: 'base' }) === 0);
      if (duplicate) throw new Error('Bu grup zaten kayıtlı.');
      const { data, error } = await client
        .from('training_groups')
        .update({ name })
        .eq('id', id)
        .eq('school_id', schoolId)
        .select('id, name, sort_order')
        .single();
      if (error) throw error;
      groupsByName.delete(currentName);
      groupsByName.set(data.name, data.id);
      return data;
    }

    async function saveTrainingType(trainingTypeName) {
      requireContext();
      const name = String(trainingTypeName || '').trim().replace(/\s+/g, ' ');
      if (!name || !/^[\p{L}\p{N} .:()\-/]{1,60}$/u.test(name)) throw new Error('Geçerli bir antrenman adı girin.');
      const { data: existing, error: existingError } = await client.from('training_types').select('id, name').eq('school_id', schoolId);
      if (existingError) throw existingError;
      if ((existing || []).some(item => item.name.localeCompare(name, 'tr-TR', { sensitivity: 'base' }) === 0)) throw new Error('Bu antrenman adı zaten kayıtlı.');
      const { data, error } = await client.from('training_types').insert({ school_id: schoolId, name, sort_order: (existing || []).length + 1 }).select('id, name, sort_order').single();
      if (error) throw error;
      return data;
    }

    async function updateTrainingType(currentName, trainingTypeName) {
      requireContext();
      const name = String(trainingTypeName || '').trim().replace(/\s+/g, ' ');
      if (!name || !/^[\p{L}\p{N} .:()\-/]{1,60}$/u.test(name)) throw new Error('Geçerli bir antrenman adı girin.');
      const { data: existing, error: existingError } = await client.from('training_types').select('id, name').eq('school_id', schoolId);
      if (existingError) throw existingError;
      const current = (existing || []).find(item => item.name === currentName);
      if (!current) throw new Error('Antrenman adı bulunamadı.');
      if ((existing || []).some(item => item.id !== current.id && item.name.localeCompare(name, 'tr-TR', { sensitivity: 'base' }) === 0)) throw new Error('Bu antrenman adı zaten kayıtlı.');
      const { data, error } = await client.from('training_types').update({ name }).eq('id', current.id).eq('school_id', schoolId).select('id, name, sort_order').single();
      if (error) throw error;
      return data;
    }

    async function deleteTrainingType(trainingTypeName) {
      requireContext();
      const { data: existing, error: existingError } = await client.from('training_types').select('id, name').eq('school_id', schoolId);
      if (existingError) throw existingError;
      if ((existing || []).length <= 1) throw new Error('Okuldaki son antrenman türü silinemez.');
      const current = (existing || []).find(item => item.name === trainingTypeName);
      if (!current) throw new Error('Antrenman adı bulunamadı.');
      const { error } = await client.from('training_types').delete().eq('id', current.id).eq('school_id', schoolId);
      if (error) throw error;
    }

    async function saveTrainingCoach(trainingCoachName) {
      requireContext();
      const name = String(trainingCoachName || '').trim().replace(/\s+/g, ' ');
      if (!/^[\p{L} .()'\-]{2,80}$/u.test(name)) throw new Error('Geçerli bir antrenör adı ve soyadı girin.');
      const { data: existing, error: existingError } = await client.from('training_coaches').select('id, name').eq('school_id', schoolId);
      if (existingError) throw existingError;
      if ((existing || []).some(item => item.name.localeCompare(name, 'tr-TR', { sensitivity: 'base' }) === 0)) throw new Error('Bu antrenör zaten kayıtlı.');
      const { data, error } = await client.from('training_coaches').insert({ school_id: schoolId, name, sort_order: (existing || []).length + 1 }).select('id, name, sort_order').single();
      if (error) throw error;
      return data;
    }

    async function updateTrainingCoach(currentName, trainingCoachName) {
      requireContext();
      const name = String(trainingCoachName || '').trim().replace(/\s+/g, ' ');
      if (!/^[\p{L} .()'\-]{2,80}$/u.test(name)) throw new Error('Geçerli bir antrenör adı ve soyadı girin.');
      const { data: existing, error: existingError } = await client.from('training_coaches').select('id, name').eq('school_id', schoolId);
      if (existingError) throw existingError;
      const current = (existing || []).find(item => item.name === currentName);
      if (!current) throw new Error('Antrenör bulunamadı.');
      if ((existing || []).some(item => item.id !== current.id && item.name.localeCompare(name, 'tr-TR', { sensitivity: 'base' }) === 0)) throw new Error('Bu antrenör zaten kayıtlı.');
      const { data, error } = await client.from('training_coaches').update({ name }).eq('id', current.id).eq('school_id', schoolId).select('id, name, sort_order').single();
      if (error) throw error;
      return data;
    }

    async function deleteTrainingCoach(trainingCoachName) {
      requireContext();
      const { data: existing, error: existingError } = await client.from('training_coaches').select('id, name').eq('school_id', schoolId);
      if (existingError) throw existingError;
      if ((existing || []).length <= 1) throw new Error('Okuldaki son antrenör silinemez.');
      const current = (existing || []).find(item => item.name === trainingCoachName);
      if (!current) throw new Error('Antrenör bulunamadı.');
      const { error } = await client.from('training_coaches').delete().eq('id', current.id).eq('school_id', schoolId);
      if (error) throw error;
    }

    async function saveTrainingField(trainingFieldName) {
      requireContext();
      const name = String(trainingFieldName || '').trim().replace(/\s+/g, ' ');
      if (!/^[\p{L}\p{N} .:()'\/\-]{1,80}$/u.test(name)) throw new Error('Geçerli bir saha adı girin.');
      const { data: existing, error: existingError } = await client.from('training_fields').select('id, name').eq('school_id', schoolId);
      if (existingError) throw existingError;
      if ((existing || []).some(item => item.name.localeCompare(name, 'tr-TR', { sensitivity: 'base' }) === 0)) throw new Error('Bu saha zaten kayıtlı.');
      const { data, error } = await client.from('training_fields').insert({ school_id: schoolId, name, sort_order: (existing || []).length + 1 }).select('id, name, sort_order').single();
      if (error) throw error;
      return data;
    }

    async function updateTrainingField(currentName, trainingFieldName) {
      requireContext();
      const name = String(trainingFieldName || '').trim().replace(/\s+/g, ' ');
      if (!/^[\p{L}\p{N} .:()'\/\-]{1,80}$/u.test(name)) throw new Error('Geçerli bir saha adı girin.');
      const { data: existing, error: existingError } = await client.from('training_fields').select('id, name').eq('school_id', schoolId);
      if (existingError) throw existingError;
      const current = (existing || []).find(item => item.name === currentName);
      if (!current) throw new Error('Saha bulunamadı.');
      if ((existing || []).some(item => item.id !== current.id && item.name.localeCompare(name, 'tr-TR', { sensitivity: 'base' }) === 0)) throw new Error('Bu saha zaten kayıtlı.');
      const { data, error } = await client.from('training_fields').update({ name }).eq('id', current.id).eq('school_id', schoolId).select('id, name, sort_order').single();
      if (error) throw error;
      return data;
    }

    async function deleteTrainingField(trainingFieldName) {
      requireContext();
      const { data: existing, error: existingError } = await client.from('training_fields').select('id, name').eq('school_id', schoolId);
      if (existingError) throw existingError;
      if ((existing || []).length <= 1) throw new Error('Okuldaki son saha silinemez.');
      const current = (existing || []).find(item => item.name === trainingFieldName);
      if (!current) throw new Error('Saha bulunamadı.');
      const { error } = await client.from('training_fields').delete().eq('id', current.id).eq('school_id', schoolId);
      if (error) throw error;
    }

    async function saveStudent(student, isNew) {
      requireContext();
      const birthValue = String(student.birth || '');
      const birthMatch = birthValue.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
      const normalizedBirthDate = /^\d{4}-\d{2}-\d{2}$/.test(birthValue)
        ? birthValue
        : birthMatch ? `${birthMatch[3]}-${birthMatch[2].padStart(2, '0')}-${birthMatch[1].padStart(2, '0')}` : null;
      const payload = {
        school_id: schoolId,
        group_id: groupId(student.group),
        full_name: student.name,
        birth_date: normalizedBirthDate,
        birth_year: /^\d{4}$/.test(birthValue) ? Number(birthValue) : null,
        position: student.position || null,
        guardian_name: student.parent || null,
        phone: student.phone || null,
        email: student.email || null,
        address: student.address || null,
        notes: student.notes || null,
        profile_photo_path: student.photoPath || null,
        enrollment_date: student.enrollmentDate,
        fee_tracking_start_date: student.feeTrackingStartDate,
        monthly_fee_amount: Number(student.monthlyFeeAmount) || null,
        attendance_rate: Number(student.attendance || 0),
        is_active: student.active !== false
      };
      const query = isNew
        ? client.from('students').insert(payload)
        : client.from('students').update(payload).eq('id', student.id);
      const { data, error } = await query.select('id').single();
      if (error) throw error;
      return Number(data.id);
    }

    async function setStudentActiveStatus(studentId, isActive) {
      requireContext();
      const { error } = await client.rpc('set_student_active_status', {
        target_student_id: Number(studentId),
        next_is_active: Boolean(isActive)
      });
      if (error) throw error;
    }

    async function saveStudentPhoto(studentId, photoFile, previousPath = '') {
      requireContext();
      const safeStudentId = Number(studentId);
      if (!safeStudentId || !photoFile) throw new Error('Öğrenci fotoğrafı hazırlanamadı.');
      const objectId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const path = `${schoolId}/${safeStudentId}/${objectId}.jpg`;
      const bucket = client.storage.from('student-profile-photos');
      const { error: uploadError } = await bucket.upload(path, photoFile, {
        cacheControl: '3600',
        contentType: 'image/jpeg',
        upsert: false
      });
      if (uploadError) throw uploadError;

      const { error: updateError } = await client
        .from('students')
        .update({ profile_photo_path: path })
        .eq('id', safeStudentId)
        .eq('school_id', schoolId);
      if (updateError) {
        await bucket.remove([path]).catch(() => {});
        throw updateError;
      }
      if (previousPath && previousPath !== path) await bucket.remove([previousPath]).catch(() => {});
      const { data: signedPhoto } = await bucket.createSignedUrl(path, 60 * 60);
      return { path, url: signedPhoto?.signedUrl || '' };
    }

    async function saveStudentPlayerCard(studentId, playerCard) {
      requireContext();
      const safeStudentId = Number(studentId);
      if (!safeStudentId) throw new Error('Öğrenci kartı için geçerli bir öğrenci seçilmedi.');
      const { error } = await client
        .from('students')
        .update({ player_card: playerCard })
        .eq('id', safeStudentId)
        .eq('school_id', schoolId);
      if (error) throw error;
    }

    async function deleteStudentPhoto(studentId, photoPath) {
      requireContext();
      const safeStudentId = Number(studentId);
      if (!safeStudentId) throw new Error('Öğrenci fotoğrafı kaldırılamadı.');
      const { error: updateError } = await client
        .from('students')
        .update({ profile_photo_path: null })
        .eq('id', safeStudentId)
        .eq('school_id', schoolId);
      if (updateError) throw updateError;
      if (photoPath) await client.storage.from('student-profile-photos').remove([photoPath]);
    }

    async function inviteGuardian(studentId, previousEmail = '') {
      requireContext();
      const { data, error } = await client.functions.invoke('invite-guardian', {
        body: { studentId: Number(studentId), previousEmail: String(previousEmail || ''), schoolId }
      });
      if (error) {
        let responseMessage = '';
        try {
          const responseBody = await error.context?.clone().json();
          responseMessage = responseBody?.error || '';
        } catch {
          responseMessage = '';
        }
        throw new Error(responseMessage || data?.error || error.message || 'Veli daveti gönderilemedi.');
      }
      if (data?.error) throw new Error(data.error);
      return data;
    }

    async function saveTraining(training, isNew) {
      requireContext();
      const payload = {
        school_id: schoolId,
        group_id: groupId(training.group),
        training_date: training.date,
        start_time: training.time,
        duration_minutes: training.duration,
        title: training.title,
        coach: training.coach,
        field: training.field
      };
      const query = isNew
        ? client.from('trainings').insert(payload)
        : client.from('trainings').update(payload).eq('id', training.id);
      const { data, error } = await query.select('id').single();
      if (error) throw error;
      return Number(data.id);
    }

    async function deleteTraining(id) {
      requireContext();
      const { error } = await client.from('trainings').delete().eq('id', id);
      if (error) throw error;
    }

    async function saveAccounting(entry, isNew) {
      requireContext();
      const payload = {
        school_id: schoolId,
        occurred_on: entry.date,
        title: entry.title,
        kind: entry.kind,
        amount: entry.amount,
        payment_method: entry.paymentMethod,
        source: entry.source || 'manual',
        reference: entry.reference || null,
        student_id: entry.studentId || null,
        created_by: userId
      };
      const query = isNew
        ? client.from('accounting_entries').insert(payload)
        : client.from('accounting_entries').update(payload).eq('id', entry.id);
      const { data, error } = await query.select('id').single();
      if (error) throw error;
      return Number(data.id);
    }

    async function deleteAccounting(id) {
      requireContext();
      const { error } = await client.from('accounting_entries').delete().eq('id', id).eq('school_id', schoolId);
      if (error) throw error;
    }

    async function saveFeeStatus(student, month, status, amount, paymentDetails = {}) {
      requireContext();
      const feeMonth = `${month}-01`;
      const reference = `fee:${student.id}:${month}`;
      const paid = status === 'paid';
      const paymentDate = paid && /^\d{4}-\d{2}-\d{2}$/.test(paymentDetails.paymentDate || '')
        ? paymentDetails.paymentDate
        : new Date().toISOString().slice(0, 10);
      const paymentMethod = paid && ['cash', 'transfer', 'card'].includes(paymentDetails.paymentMethod)
        ? paymentDetails.paymentMethod
        : 'cash';
      const feeMonthLabel = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T00:00:00`));
      const feePayload = {
        school_id: schoolId,
        student_id: student.id,
        fee_month: feeMonth,
        status,
        amount: status === 'none' ? null : Number(amount || 1500),
        due_date: new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10),
        paid_at: paid ? `${paymentDate}T12:00:00.000Z` : null,
        payment_method: paid ? paymentMethod : null,
        note: status === 'none' ? 'Aidat yok' : null,
        source: 'app'
      };
      const { data: feePeriod, error: feeError } = await client
        .from('fee_periods')
        .upsert(feePayload, { onConflict: 'student_id,fee_month' })
        .select('id')
        .single();
      if (feeError) throw feeError;

      if (paid) {
        const { data: existingEntry, error: existingError } = await client
          .from('accounting_entries')
          .select('id')
          .eq('school_id', schoolId)
          .eq('reference', reference)
          .maybeSingle();
        if (existingError) throw existingError;
        const accountingPayload = {
          school_id: schoolId,
          student_id: student.id,
          fee_period_id: feePeriod.id,
          occurred_on: paymentDate,
          title: `${student.name} · ${feeMonthLabel} aidatı`,
          kind: 'income',
          amount: Number(amount || 1500),
          payment_method: paymentMethod,
          source: 'fee',
          reference,
          created_by: userId
        };
        const accountingQuery = existingEntry
          ? client.from('accounting_entries').update(accountingPayload).eq('id', existingEntry.id)
          : client.from('accounting_entries').insert(accountingPayload);
        const { error } = await accountingQuery;
        if (error) throw error;
      } else {
        const { error } = await client.from('accounting_entries').delete().eq('school_id', schoolId).eq('reference', reference);
        if (error) throw error;
      }
    }

    async function recordAccountingFeePayments(studentId, months, amounts, paymentDate, paymentMethod) {
      requireContext();
      const { data, error } = await client.rpc('record_accounting_fee_payments_with_amounts', {
        target_school_id: schoolId,
        target_student_id: studentId,
        target_months: months,
        target_amounts: amounts,
        payment_date: paymentDate,
        payment_method: paymentMethod
      });
      if (error) throw error;
      return data || [];
    }

    async function saveAttendance(trainingId, allStudentIds, presentStudentIds) {
      requireContext();
      const { data, error } = await client.rpc('save_training_attendance', {
        target_school_id: schoolId,
        target_training_id: trainingId,
        student_ids: allStudentIds,
        present_student_ids: presentStudentIds
      });
      if (error) throw error;
      return Number(data);
    }

    async function saveNotification(notification) {
      requireContext();
      const { data, error } = await client.from('notifications').insert({
        school_id: schoolId,
        audience: notification.audience,
        title: notification.title,
        body: notification.body,
        status: 'queued',
        sent_by: userId
      }).select('id, created_at').single();
      if (error) throw error;
      return { id: Number(data.id), createdAt: data.created_at };
    }

    async function markNotificationsRead(notificationIds) {
      if (!userId || !notificationIds.length) return [];
      const { data, error } = await client.rpc('mark_notifications_read_and_get_counts', {
        notification_ids: notificationIds.map(Number)
      });
      if (error) throw error;
      return (data || []).map(row => ({
        notificationId: Number(row.notification_id),
        readCount: Number(row.read_count || 0)
      }));
    }

    async function deleteNotification(id) {
      requireContext();
      const { error } = await client
        .from('notifications')
        .delete()
        .eq('id', Number(id))
        .eq('school_id', schoolId);
      if (error) throw error;
    }

    async function approveAccessRequest(requestId, role) {
      const { error } = await client.rpc('approve_access_request', {
        target_request_id: requestId,
        approved_role: role
      });
      if (error) throw error;
    }

    async function revokeAccessRequestApproval(requestId) {
      const { error } = await client.rpc('revoke_access_request_approval', {
        target_request_id: requestId
      });
      if (error) throw error;
    }

    return {
      load,
      loadFeePeriods,
      loadAccountingEntries,
      loadAttendanceSessions,
      loadAttendanceForTraining,
      loadAttendanceForTrainings,
      loadTrainings,
      loadNotifications,
      loadAccessRequests,
      loadStudents,
      loadStudentPhotoUrls,
      loadConfiguration,
      listSchools,
      listUserSchools,
      activateUserSchool,
      createSchool,
      updateSchool,
      deleteSchool,
      updateSchoolSubscription,
      inviteSchoolAdmin,
      submitSchoolApplication,
      listSchoolApplications,
      reviewSchoolApplication,
      approveSchoolApplication,
      getMySchoolOnboarding,
      getMyApprovedSubscriptionPeriod,
      listMySubscriptionHistory,
      getSubscriptionBankAccounts,
      saveSubscriptionBankAccounts,
      sendSubscriptionReminderTestEmail,
      startSchoolTrial,
      createSubscriptionPaymentReport,
      listSubscriptionPaymentReports,
      loadSystemEmailLogs,
      reviewSubscriptionPaymentReport,
      saveSchoolSettings,
      saveSchoolBankDetails,
      saveGroup,
      deleteGroup,
      updateGroup,
      saveTrainingType,
      updateTrainingType,
      deleteTrainingType,
      saveTrainingCoach,
      updateTrainingCoach,
      deleteTrainingCoach,
      saveTrainingField,
      updateTrainingField,
      deleteTrainingField,
      saveStudent,
      setStudentActiveStatus,
      saveStudentPlayerCard,
      saveStudentPhoto,
      deleteStudentPhoto,
      inviteGuardian,
      saveTraining,
      deleteTraining,
      saveAccounting,
      deleteAccounting,
      saveFeeStatus,
      recordAccountingFeePayments,
      saveAttendance,
      saveNotification,
      markNotificationsRead,
      deleteNotification,
      approveAccessRequest,
      revokeAccessRequestApproval
    };
  }

  window.SasaSupabaseData = { create };
})();
