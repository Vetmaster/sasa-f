const APP_VERSION = '2026.09.29.513';
const ANDROID_APK_URL = 'https://github.com/Vetmaster/sporx-futbol-okulu/releases/download/v1.0.30-beta/SASA-F-v1.0.30-beta.apk';
const INSTALL_PROMPT_DISMISS_KEY = 'sasa_install_prompt_dismissed_v2';
const INSTALL_PROMPT_SESSION_DISMISS_KEY = 'sasa_install_prompt_dismissed_this_session';
const NATIVE_VERSION_STORAGE_KEY = 'sasa_native_version_code';
const ANDROID_APP_LAST_SEEN_STORAGE_KEY = 'sasa_android_app_last_seen';
const ANDROID_APP_SEEN_MAX_AGE_MS = 45 * 24 * 60 * 60 * 1000;
const PUSH_PREFERENCE_STORAGE_KEY = 'sasa_phone_notifications';
const PUSH_PROMPT_DISMISS_STORAGE_KEY = 'sasa_push_prompt_dismissed_v1';
const ACCESS_REQUEST_CACHE_PREFIX = 'sasa_access_requests_cache_v1';
const ANDROID_PACKAGE_ID = 'com.sasafutbol.yonetim';
const SUPABASE_URL = 'https://tezeflsiljqprrqbsypl.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_b8NKvXEXTLAOz2o1L8XN9w_QQVuMUJx';
const AUTH_REDIRECT_URL = 'https://sasa-f.com/';
const SCHOOL_APPLICATION_LOCATION_DATA_URL = 'https://cdn.jsdelivr.net/gh/talhaekrem/TurkiyeSehirVeIlcelerJSON@main/Turkey%20Cities%20and%20Districts.json';
const KKTC_PROVINCES = ['Gazimağusa', 'Girne', 'Güzelyurt', 'İskele', 'Lefke', 'Lefkoşa'];
const NATIVE_FCM_TOKEN_STORAGE_KEY = 'sasa_native_fcm_token';
const NATIVE_NOTIFICATION_PERMISSION_STORAGE_KEY = 'sasa_native_notification_permission';
const runtimeQueryParameters = new URLSearchParams(window.location.search);
const launchedByAndroidParameter = runtimeQueryParameters.get('androidShell') === '1';
const launchedByAndroidReferrer = document.referrer.startsWith(`android-app://${ANDROID_PACKAGE_ID}`);
const LAUNCHED_NATIVE_VERSION = Number(runtimeQueryParameters.get('nativeVersion')) || 0;
const launchedWithNativeVersion = LAUNCHED_NATIVE_VERSION > 0;
const explicitlyLaunchedByAndroid = launchedByAndroidParameter
  || launchedByAndroidReferrer
  || launchedWithNativeVersion;
// Android uygulaması artık web ile aynı giriş şablonunu kullanır. Böylece giriş
// ekranına eklenen bağlantı ve iyileştirmeler iki platformda da birlikte görünür.
const IS_ANDROID_SHELL = explicitlyLaunchedByAndroid;
if (IS_ANDROID_SHELL) {
  try {
    if (LAUNCHED_NATIVE_VERSION > 0) {
      window.localStorage.setItem(NATIVE_VERSION_STORAGE_KEY, String(LAUNCHED_NATIVE_VERSION));
    }
  } catch {
    // Oturum depolaması kapalıysa açılış URL'si ve Android referrer bilgisi kullanılmaya devam eder.
  }
}
const supabaseAuthOptions = {
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: true
};
const supabaseClient = window.supabase?.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: supabaseAuthOptions
});
const remoteDataStore = supabaseClient && window.SasaSupabaseData?.create(supabaseClient);
const initialFragmentParameters = new URLSearchParams(window.location.hash.slice(1));
const PENDING_OPEN_PAGE_STORAGE_KEY = 'sasa_pending_open_page';
const initialRequestedOpenPage = runtimeQueryParameters.get('open') || initialFragmentParameters.get('open') || '';
if (['notifications', 'onboarding', 'userApprovals', 'applications'].includes(initialRequestedOpenPage)) {
  try {
    window.sessionStorage.setItem(PENDING_OPEN_PAGE_STORAGE_KEY, initialRequestedOpenPage);
  } catch {
    // Gizli mod/depolama kısıtı varsa açılış URL'sindeki hedef kullanılmaya devam eder.
  }
}
const bridgedNativeFcmToken = initialFragmentParameters.get('nativeFcmToken') || '';
const bridgedNativeNotificationPermission = initialFragmentParameters.get('nativeNotificationPermission') || '';
let rememberedNativeFcmToken = '';
let rememberedNativeNotificationPermission = '';
try {
  rememberedNativeFcmToken = window.localStorage.getItem(NATIVE_FCM_TOKEN_STORAGE_KEY) || '';
  rememberedNativeNotificationPermission = window.localStorage.getItem(NATIVE_NOTIFICATION_PERMISSION_STORAGE_KEY) || '';
  if (bridgedNativeFcmToken) window.localStorage.setItem(NATIVE_FCM_TOKEN_STORAGE_KEY, bridgedNativeFcmToken);
  if (bridgedNativeNotificationPermission) window.localStorage.setItem(NATIVE_NOTIFICATION_PERMISSION_STORAGE_KEY, bridgedNativeNotificationPermission);
} catch {
  rememberedNativeFcmToken = '';
  rememberedNativeNotificationPermission = '';
}
const NATIVE_FCM_TOKEN = bridgedNativeFcmToken || rememberedNativeFcmToken;
const NATIVE_NOTIFICATION_PERMISSION = bridgedNativeNotificationPermission || rememberedNativeNotificationPermission;
// Supabase may deliver recovery callbacks in the URL fragment (implicit flow)
// or in the query string (PKCE flow). Handle both before auth state events.
const authCallbackType = runtimeQueryParameters.get('type') || initialFragmentParameters.get('type');
const authCallbackErrorCode = runtimeQueryParameters.get('error_code') || initialFragmentParameters.get('error_code') || '';
const authCallbackError = runtimeQueryParameters.get('error') || initialFragmentParameters.get('error') || '';
const hasExpiredAuthLink = authCallbackErrorCode === 'otp_expired'
  || (authCallbackType === 'recovery' && Boolean(authCallbackError));
let authMode = ['invite', 'recovery'].includes(authCallbackType) ? 'set-password' : 'login';
let authRequestPending = false;
let pendingAdminMfa = null;
let signedOutMessage = '';
let openDashboardAfterPasswordLogin = false;
let expiredAuthLinkSessionCleared = false;
let schoolApplicationLocations = null;
let schoolApplicationLocationsLoading = null;
const PAYMENT_METHODS = { cash: 'Nakit', transfer: 'Havale', card: 'Kredi kartı' };
const SUBSCRIPTION_PERIODS = {
  monthly: { name: '1 aylık', months: 1 },
  quarterly: { name: '3 aylık', months: 3 },
  yearly: { name: 'Yıllık', months: 12 }
};
const TRIAL_MODES = { time_limited: 'Süreli deneme' };
const STANDARD_SUBSCRIPTION_PRICES = { monthly: 2990, quarterly: 8370, yearly: 29900 };
const SUBSCRIPTION_STATUSES = { trial: 'Deneme', active: 'Aktif', stopped: 'Durduruldu' };
const ACCOUNTING_PERIODS = [
  { id: 'today', label: 'Bugün' }
];
const NAVIGATION_STORAGE_KEY = 'sasa_navigation_state';
const BROWSER_NAVIGATION_STATE_KEY = 'sasaAppNavigation';
const SELECTED_SCHOOL_STORAGE_KEY = 'sasa_selected_school_id';
if (window.top !== window.self) {
  document.documentElement.replaceChildren();
  throw new Error('SASA-F güvenlik nedeniyle başka bir sayfa içinde çalıştırılamaz.');
}
if (window.SporXDB?.storageKey) window.localStorage.removeItem(window.SporXDB.storageKey);
const localData = remoteDataStore
  ? { students: [], trainings: [], accountingEntries: [], notifications: [], attendanceRecords: [] }
  : window.SporXDB.load();
const state = {
  role: 'admin',
  actualRole: 'admin',
  schoolId: null,
  schoolName: '',
  schoolSubscriptionPlan: 'standard',
  schoolSubscriptionStatus: 'trial',
  schoolSubscriptionTrialMode: null,
  schoolSubscriptionBillingPeriod: 'monthly',
  schoolSubscriptionStartsOn: '',
  schoolSubscriptionEndsOn: '',
  schools: [],
  schoolSearchQuery: '',
  schoolStatusFilter: 'all',
  schoolSortOrder: 'created_desc',
  subscriptionSearchQuery: '',
  subscriptionSortOrder: 'name_asc',
  userId: null,
  userFullName: '',
  userEmail: '',
  page: 'dashboard',
  pageHistory: [],
  students: localData.students,
  trainings: localData.trainings,
  accountingEntries: localData.accountingEntries,
  notifications: localData.notifications,
  attendanceRecords: localData.attendanceRecords,
  accessRequests: [],
  accessRequestRoleFilter: 'all',
  accessRequestSearchQuery: '',
  accessRequestSortOrder: 'name_asc',
  accessRequestsLoadedAt: 0,
  accessRequestsLoading: false,
  emailLogs: [],
  schoolApplications: [],
  applicationSearchQuery: '',
  applicationStatusFilter: 'all',
  applicationSortOrder: 'created_desc',
  subscriptionPaymentReports: [],
  subscriptionPaymentStatusFilter: 'all',
  subscriptionPaymentSortOrder: 'created_desc',
  subscriptionPaymentSearchQuery: '',
  subscriptionHistory: [],
  onboarding: null,
  approvedSubscriptionPeriod: null,
  onboardingPurchaseOpen: false,
  activeTrainingId: null,
  selectedStudentId: null,
  selectedParentStudentId: null,
  selectedParentPaymentMonth: null,
  activeStudentsOnly: false,
  debtStudentsOnly: false,
  studentSortKey: 'enrollmentDate',
  studentSortDirection: 'desc',
  monthlyFeeSortKey: 'period',
  monthlyFeeSortDirection: 'desc',
  monthlyFeeUnpaidOnly: false,
  expandedTimelineStudentId: null,
  trainingSortDirection: 'desc',
  attendanceSortDirection: 'desc',
  studentAttendanceMonth: null,
  studentAttendanceShowAll: false,
  showPastTrainings: false,
  showPastAttendance: false,
  feeFilter: 'all',
  feeSearchQuery: '',
  feeListSortKey: 'enrollmentDate',
  feeListSortDirection: 'desc',
  accountingFilter: 'all',
  accountingPeriod: 'month',
  accountingMonth: feeMonthKey(),
  accountingDateRangeStart: '',
  accountingDateRangeEnd: '',
  monthlyFeeAmount: 1500,
  schoolBankAccounts: [],
  subscriptionBankAccounts: [],
  trainingTypes: ['Teknik Antrenman', 'Taktik Çalışma', 'Kondisyon', 'Kaleci Çalışması', 'Maç Hazırlığı'],
  trainingCoaches: [],
  trainingFields: [...new Set(localData.trainings.map(training => training.field).filter(Boolean))],
  pushStatus: 'checking',
  pushBusy: false,
  nativeFcmToken: NATIVE_FCM_TOKEN,
  nativeNotificationPermission: NATIVE_NOTIFICATION_PERMISSION,
  notificationComposeOpen: false,
  notificationDraft: { audience: 'Tüm kullanıcılar', title: '', body: '' },
  editingStudentId: null,
  studentPhotoRemoveRequested: false,
  studentPhotoPreviewUrl: '',
  editingGroupName: null,
  editingTrainingTypeName: null,
  editingTrainingCoachName: null,
  editingTrainingFieldName: null,
  invitingSchoolId: null,
  schoolInviteConfirmation: null,
  editingSchoolId: null,
  editingSubscriptionSchoolId: null,
  groupSettingsOpen: false,
  trainingTypeSettingsOpen: false,
  trainingCoachSettingsOpen: false,
  trainingFieldSettingsOpen: false,
  newestGroupPinned: false,
  newestGroupName: '',
  editingTrainingId: null,
  editingAccountingEntryId: null
};
const notificationReadIdsInFlight = new Set();
let skipNextNotificationDraftCapture = false;
let browserNavigationReady = false;

const MENU_ICONS = {
  schools: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21h18M5 21V8l7-4 7 4v13M9 21v-5h6v5M8 10h1M12 10h1M16 10h1M8 13h1M12 13h1M16 13h1"></path></svg>',
  student: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"></circle><path d="M5.5 20c.7-4 3-6 6.5-6s5.8 2 6.5 6"></path></svg>',
  training: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 21V3M7 4l10 3-10 4M4 21h8"></path></svg>',
  accounting: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="2.5" width="14" height="19" rx="2"></rect><path d="M8 6h8v4H8zM8.5 14h1M12 14h1M15.5 14h1M8.5 18h1M12 18h1M15.5 18h1"></path></svg>',
  bank: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h18L12 4 3 9ZM5 9v8M9.5 9v8M14.5 9v8M19 9v8M3 17h18M2 21h20"></path></svg>',
  attendance: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="3"></rect><path d="m7.5 12 3 3 6-7"></path></svg>',
  notifications: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"></path></svg>',
  approvedToggle: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6.5" width="19" height="11" rx="5.5"></rect><circle cx="16" cy="12" r="3"></circle><path d="m6.5 12 1.4 1.4 2.6-3"></path></svg>',
  settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"></path></svg>',
  subscriptions: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"></rect><path d="M3 9h18M7 14h4M16 13v3M14.5 14.5h3"></path></svg>'
};

const BASE_GROUPS = ['Saat 09:00', 'Saat 10:00', 'Saat 11:00', 'Saat 12:00', 'U11', 'U12', 'U13', 'U14'];
let GROUPS = [...new Set([...BASE_GROUPS, ...localData.students.map(student => student.group).filter(Boolean)])];

function persistLocalData() {
  if (remoteDataStore) return;
  window.SporXDB.save({
    students: state.students,
    trainings: state.trainings,
    accountingEntries: state.accountingEntries,
    notifications: state.notifications,
    attendanceRecords: state.attendanceRecords
  });
}
function clearSensitiveState() {
  if (typeof loadedPageData !== 'undefined') loadedPageData.clear();
  if (typeof pendingPageDataLoads !== 'undefined') pendingPageDataLoads.clear();
  state.students = [];
  state.trainings = [];
  state.accountingEntries = [];
  state.notifications = [];
  state.attendanceRecords = [];
  state.accessRequests = [];
  state.accessRequestsLoadedAt = 0;
  state.accessRequestsLoading = false;
  state.schoolBankAccounts = [];
  state.subscriptionBankAccounts = [];
  state.onboardingPurchaseOpen = false;
  state.schools = [];
  state.schoolId = null;
  state.schoolName = '';
  state.selectedStudentId = null;
  state.selectedParentStudentId = null;
  state.selectedParentPaymentMonth = null;
  state.trainingCoaches = [];
  state.trainingFields = [];
  state.trainingTypes = ['Teknik Antrenman', 'Taktik Çalışma', 'Kondisyon', 'Kaleci Çalışması', 'Maç Hazırlığı'];
  window.sessionStorage.removeItem(NAVIGATION_STORAGE_KEY);
  window.localStorage.removeItem(SELECTED_SCHOOL_STORAGE_KEY);
  if (window.SporXDB?.storageKey) window.localStorage.removeItem(window.SporXDB.storageKey);
}

const SAFE_HTML_CONFIG = {
  USE_PROFILES: { html: true, svg: true, svgFilters: false },
  ALLOW_DATA_ATTR: true,
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed'],
  FORBID_ATTR: ['srcdoc']
};
function sanitizedHtml(markup) {
  if (!window.DOMPurify) throw new Error('Güvenli içerik filtresi yüklenemedi.');
  return window.DOMPurify.sanitize(String(markup || ''), SAFE_HTML_CONFIG);
}
function setSafeHtml(element, markup) {
  if (!element) return;
  element.innerHTML = sanitizedHtml(markup);
}
function setSafeTableRows(tableBody, rowsMarkup) {
  if (!tableBody) return;
  const template = document.createElement('template');
  template.innerHTML = sanitizedHtml(`<table><tbody>${rowsMarkup}</tbody></table>`);
  const sanitizedBody = template.content.querySelector('tbody');
  tableBody.replaceChildren(...(sanitizedBody ? [...sanitizedBody.childNodes] : []));
}
function appendSafeHtml(element, markup) {
  if (!element) return;
  const template = document.createElement('template');
  template.innerHTML = sanitizedHtml(markup);
  element.append(template.content);
}

const navItems = {
  dashboard: { label: 'Genel Bakış', icon: '⌂', roles: ['super_admin', 'admin', 'coach', 'parent'] },
  schools: { label: 'Okullar', icon: MENU_ICONS.schools, roles: ['super_admin'] },
  settings: { label: 'Ayarlar', icon: MENU_ICONS.settings, roles: ['super_admin', 'admin'], hidden: true },
  subscriptions: { label: 'Abonelikler', icon: MENU_ICONS.subscriptions, roles: ['super_admin'], hidden: true },
  applications: { label: 'Başvurular', icon: '✦', roles: ['super_admin'] },
  subscriptionPayments: { label: 'Ödemeler', icon: MENU_ICONS.subscriptions, roles: ['super_admin'] },
  emailLogs: { label: 'E-posta Kayıtları', icon: '✉', roles: ['super_admin'], hidden: true },
  help: { label: 'Yardım', icon: '?', roles: ['super_admin', 'admin'], hidden: true },
  onboarding: { label: 'Aboneliği başlat', icon: MENU_ICONS.subscriptions, roles: ['admin'], hidden: true },
  bankSettings: { label: 'Aidat Havale Bilgileri', icon: MENU_ICONS.bank, roles: ['super_admin', 'admin'], hidden: true },
  subscriptionBankSettings: { label: 'Abonelik Havale Bilgileri', icon: MENU_ICONS.bank, roles: ['super_admin'], hidden: true },
  students: { label: 'Öğrenciler', icon: MENU_ICONS.student, roles: ['super_admin', 'admin', 'coach'] },
  studentSettings: { label: 'Öğrenci Ayarları', icon: MENU_ICONS.settings, roles: ['super_admin', 'admin'], hidden: true },
  studentProfile: { label: 'Öğrenci Profili', icon: '◎', roles: ['super_admin', 'admin', 'coach', 'parent'], hidden: true },
  studentAttendanceHistory: { label: 'Öğrenci Yoklamaları', icon: '✓', roles: ['super_admin', 'admin', 'coach', 'parent'], hidden: true },
  child: { label: 'Öğrenci', icon: MENU_ICONS.student, roles: ['parent'] },
  trainings: { label: 'Antrenman', icon: MENU_ICONS.training, roles: ['super_admin', 'admin', 'coach', 'parent'] },
  trainingSettings: { label: 'Antrenman Ayarları', icon: MENU_ICONS.settings, roles: ['super_admin', 'admin'], hidden: true },
  attendance: { label: 'Yoklama', icon: MENU_ICONS.attendance, roles: ['super_admin', 'admin', 'coach'] },
  fees: { label: 'Aidat', icon: '₺', roles: ['super_admin', 'admin', 'parent'] },
  parentPayment: { label: 'Ödeme Yap', icon: '₺', roles: ['parent'], hidden: true },
  parentBankTransfer: { label: 'Aidat Havale Bilgileri', icon: '↗', roles: ['parent'], hidden: true },
  parentCardPayment: { label: 'Kartla Ödeme', icon: '▣', roles: ['parent'], hidden: true },
  accounting: { label: 'Muhasebe', icon: MENU_ICONS.accounting, roles: ['super_admin', 'admin'] },
  accountingSettings: { label: 'Muhasebe Ayarları', icon: MENU_ICONS.settings, roles: ['super_admin', 'admin'], hidden: true },
  accountingEntries: { label: 'Son İşlemler', icon: '↗', roles: ['super_admin', 'admin'], hidden: true },
  userApprovals: { label: 'Kullanıcı Onayları', icon: MENU_ICONS.approvedToggle, roles: ['super_admin', 'admin'] },
  notifications: { label: 'Bildirimler', icon: MENU_ICONS.notifications, roles: ['super_admin', 'admin', 'coach', 'parent'] }
};

const roleNames = { super_admin: 'Süper Admin', admin: 'Admin', coach: 'Antrenör', parent: 'Veli' };
const pageMeta = {
  dashboard: ['Genel Bakış', 'Kulübün bugünkü durumu'], schools: ['Okullar', 'Tüm futbol okullarını tek ekrandan yönetin'], settings: ['Ayarlar', 'Okul ve abonelik ayarları'], subscriptions: ['Abonelikler', 'Okulların abonelik durumları'], applications: ['Başvurular', 'Yeni müşteri başvurularını inceleyin'], subscriptionPayments: ['Ödemeler', 'Abonelik ödeme bildirimlerini onaylayın'], onboarding: ['Aboneliğinizi başlatın', 'Deneme hesabı veya satın alma seçin'], bankSettings: ['Aidat Havale Bilgileri', 'Velilere gösterilecek banka hesabı'], subscriptionBankSettings: ['Abonelik Havale Bilgileri', 'Okul yöneticilerinin abonelik ödemesinde göreceği hesaplar'], students: ['Öğrenciler', 'Kayıtlar ve öğrenci profilleri'], studentSettings: ['Öğrenci Ayarları', 'Antrenman gruplarını yönetin'], studentProfile: ['Öğrenci Profili', 'Öğrenci bilgileri ve antrenman durumu'], studentAttendanceHistory: ['Öğrenci Yoklamaları', 'Geldiği ve gelmediği antrenmanlar'], child: ['Öğrenci', 'Öğrenci profili ve güncel durum'],
  trainings: ['Antrenman', 'Antrenman takvimi ve gruplar'], trainingSettings: ['Antrenman Ayarları', 'Antrenman isimlerini ve antrenörleri yönetin'], attendance: ['Yoklama', 'Antrenman katılım takibi'], fees: ['Aidat', 'Aylık ödeme ve tahsilat takibi'], parentPayment: ['Ödeme Yap', 'Aidat ödeme yöntemini seçin'], parentBankTransfer: ['Aidat Havale Bilgileri', 'Kulübün banka hesabı bilgileri'], parentCardPayment: ['Kartla Ödeme', 'Güvenli ödeme önizlemesi'],
  accounting: ['Muhasebe', 'Temel gelir ve gider takibi'], accountingSettings: ['Muhasebe Ayarları', 'Aylık aidat tutarı ve tahakkuk ayarları'], accountingEntries: ['Son İşlemler', 'Tüm gelir ve gider kayıtları'], userApprovals: ['Kullanıcı Onayları', 'Yeni kullanıcıların erişim talepleri'], emailLogs: ['E-posta Kayıtları', 'Sistemden gönderilen mail işlemleri'], help: ['Yardım', 'Kullanım videoları ve sık sorulan sorular'], notifications: ['Bildirimler', 'Duyurular ve gönderim merkezi']
};

function persistNavigationState() {
  if (!state.userId) return;
  window.sessionStorage.setItem(NAVIGATION_STORAGE_KEY, JSON.stringify({
    userId: state.userId,
    page: state.page,
    selectedStudentId: state.selectedStudentId,
    selectedParentStudentId: state.selectedParentStudentId,
    feeFilter: state.feeFilter,
    accountingFilter: state.accountingFilter,
    trainingSortDirection: state.trainingSortDirection,
    attendanceSortDirection: state.attendanceSortDirection
  }));
}

function restoreNavigationState(userId) {
  let savedState;
  try {
    savedState = JSON.parse(window.sessionStorage.getItem(NAVIGATION_STORAGE_KEY) || 'null');
  } catch {
    window.sessionStorage.removeItem(NAVIGATION_STORAGE_KEY);
    return;
  }
  if (!savedState || savedState.userId !== userId) return;

  state.page = subscriptionGatePage(navItems[savedState.page]?.roles.includes(state.role) ? savedState.page : 'dashboard');
  state.selectedStudentId = Number(savedState.selectedStudentId) || null;
  state.selectedParentStudentId = Number(savedState.selectedParentStudentId) || state.students[0]?.id || null;
  state.feeFilter = ['all', 'pending'].includes(savedState.feeFilter) ? savedState.feeFilter : 'all';
  state.accountingFilter = ['all', 'income', 'expense'].includes(savedState.accountingFilter) ? savedState.accountingFilter : 'all';
  state.trainingSortDirection = savedState.trainingSortDirection === 'asc' ? 'asc' : 'desc';
  state.attendanceSortDirection = savedState.attendanceSortDirection === 'asc' ? 'asc' : 'desc';

  if (['studentProfile', 'studentAttendanceHistory'].includes(state.page) && !state.students.some(student => Number(student.id) === state.selectedStudentId)) {
    state.page = state.role === 'parent' ? 'child' : 'students';
    state.selectedStudentId = null;
  }
}

function navigationSnapshot() {
  return {
    page: state.page,
    selectedStudentId: state.selectedStudentId,
    selectedParentStudentId: state.selectedParentStudentId,
    feeFilter: state.feeFilter,
    accountingFilter: state.accountingFilter
  };
}

function browserNavigationState(snapshot = navigationSnapshot(), pageHistory = state.pageHistory) {
  return {
    ...(window.history.state || {}),
    [BROWSER_NAVIGATION_STATE_KEY]: {
      snapshot,
      pageHistory: pageHistory.map(item => ({ ...item }))
    }
  };
}

function initializeBrowserNavigation() {
  browserNavigationReady = false;
  const currentSnapshot = navigationSnapshot();
  const defaultPage = subscriptionGatePage('dashboard');
  currentSnapshot.page = subscriptionGatePage(currentSnapshot.page);
  const dashboardSnapshot = { ...currentSnapshot, page: defaultPage };
  state.pageHistory = [];
  window.history.replaceState(browserNavigationState(dashboardSnapshot, []), document.title);

  if (currentSnapshot.page !== defaultPage) {
    state.pageHistory = [dashboardSnapshot];
    window.history.pushState(browserNavigationState(currentSnapshot, state.pageHistory), document.title);
  }
  browserNavigationReady = true;
}

function restoreBrowserNavigation(eventState) {
  const browserState = eventState?.[BROWSER_NAVIGATION_STATE_KEY];
  if (!browserState?.snapshot || !navItems[browserState.snapshot.page]?.roles.includes(state.role)) return false;
  browserState.snapshot.page = subscriptionGatePage(browserState.snapshot.page);
  if (adminMustChooseSubscription()) browserState.pageHistory = [];
  Object.assign(state, browserState.snapshot);
  state.pageHistory = Array.isArray(browserState.pageHistory)
    ? browserState.pageHistory.map(item => ({ ...item }))
    : [];
  document.querySelector('#sidebar').classList.remove('open');
  render();
  if (state.page === 'notifications') {
    refreshPushStatus(true);
    markAllNotificationsRead();
  }
  return true;
}

function navigateToPage(page, updates = {}) {
  const requestedPage = navItems[page]?.roles.includes(state.role) ? page : 'dashboard';
  const targetPage = subscriptionGatePage(requestedPage);
  if (targetPage !== requestedPage) {
    showToast('Uygulamayı kullanmadan önce ücretsiz denemeyi başlatın veya satın alma bildirimi oluşturun.');
  }
  const pageChanged = targetPage !== state.page;
  if (pageChanged) {
    state.pageHistory.push(navigationSnapshot());
    if (state.pageHistory.length > 30) state.pageHistory.shift();
  }
  if (pageChanged && targetPage === 'studentSettings') state.groupSettingsOpen = false;
  if (pageChanged && targetPage === 'trainingSettings') {
    state.trainingTypeSettingsOpen = false;
    state.trainingCoachSettingsOpen = false;
  }
  if (pageChanged && targetPage === 'studentAttendanceHistory') {
    state.studentAttendanceMonth = feeMonthKey();
    state.studentAttendanceShowAll = false;
  }
  Object.assign(state, updates);
  state.page = targetPage;
  document.querySelector('#sidebar').classList.remove('open');
  render();
  if (pageChanged && browserNavigationReady) {
    window.history.pushState(browserNavigationState(), document.title);
  }
  // Sayfa görünür olur; sayfaya ait veri arka planda getirilip yalnızca o
  // ekran yeniden çizilir. Böylece sekme geçişi tüm okul verisini çekmez.
  loadPageData(targetPage, { force: true }).then(() => {
    if (state.page !== targetPage) return;
    render();
    if (targetPage === 'notifications') markAllNotificationsRead();
  }).catch(error => console.error(`${targetPage} verisi yüklenemedi:`, error));
  queueVisiblePageDataRefresh();
  if (targetPage === 'notifications') refreshPushStatus(true);
}

function isMobileTabSwipeBlocked(target) {
  const element = target instanceof Element ? target : null;
  if (!element || element.closest('dialog[open], input, textarea, select, label, [contenteditable="true"]')) return true;
  for (let current = element; current && current !== appContent; current = current.parentElement) {
    const style = window.getComputedStyle(current);
    if (/(auto|scroll)/.test(style.overflowX) && current.scrollWidth > current.clientWidth + 2) return true;
  }
  return false;
}

function navigateMobileTabBySwipe(step) {
  if (!window.matchMedia('(max-width: 820px)').matches || document.querySelector('dialog[open]') || document.querySelector('#sidebar')?.classList.contains('open')) return false;
  const mobileKeys = mobileNavigationKeys();
  const currentIndex = mobileKeys.indexOf(state.page);
  const targetKey = mobileKeys[currentIndex + step];
  if (currentIndex < 0 || !targetKey) return false;
  navigateToPage(targetKey, targetKey === 'fees' ? { feeFilter: 'all' } : {});
  appContent.classList.remove('mobile-tab-swipe-next', 'mobile-tab-swipe-previous');
  void appContent.offsetWidth;
  appContent.classList.add(step > 0 ? 'mobile-tab-swipe-next' : 'mobile-tab-swipe-previous');
  window.setTimeout(() => appContent.classList.remove('mobile-tab-swipe-next', 'mobile-tab-swipe-previous'), 220);
  return true;
}

function requestAppBack() {
  if (adminMustChooseSubscription()) {
    state.page = 'onboarding';
    state.pageHistory = [];
    render();
    return;
  }
  if (state.page === 'dashboard') return;
  if (browserNavigationReady && window.history.state?.[BROWSER_NAVIGATION_STATE_KEY]) {
    window.history.back();
    return;
  }
  goBack();
}

function goBack() {
  if (adminMustChooseSubscription()) {
    state.page = 'onboarding';
    state.pageHistory = [];
    render();
    return;
  }
  const previous = state.pageHistory.pop();
  if (previous && navItems[previous.page]?.roles.includes(state.role)) {
    Object.assign(state, previous);
  } else {
    state.page = 'dashboard';
  }
  document.querySelector('#sidebar').classList.remove('open');
  render();
}

const appShell = document.querySelector('#appShell');
const authScreen = document.querySelector('#authScreen');
const appContent = document.querySelector('#appContent');
const mainNav = document.querySelector('#mainNav');
const bottomNav = document.querySelector('#bottomNav');
const globalBackButton = document.querySelector('#globalBackButton');
let mobileTabSwipeStart = null;
let mobileTabSwipeSuppressClickUntil = 0;
const loginForm = document.querySelector('#loginForm');
const loginEmail = document.querySelector('#loginEmail');
const loginPassword = document.querySelector('#loginPassword');
const loginPasswordConfirm = document.querySelector('#loginPasswordConfirm');
const loginSubmitButton = document.querySelector('#loginSubmitButton');
const authMessage = document.querySelector('#authMessage');
const adminMfaForm = document.querySelector('#adminMfaForm');
const adminMfaCode = document.querySelector('#adminMfaCode');
const adminMfaMessage = document.querySelector('#adminMfaMessage');
const adminMfaSubmitButton = document.querySelector('#adminMfaSubmitButton');
const adminMfaEnrollment = document.querySelector('#adminMfaEnrollment');
const adminMfaQrCode = document.querySelector('#adminMfaQrCode');
const adminMfaSecret = document.querySelector('#adminMfaSecret');
const adminMfaCopySecretButton = document.querySelector('#adminMfaCopySecretButton');
const adminMfaOpenAuthenticator = document.querySelector('#adminMfaOpenAuthenticator');
const installPrompt = document.querySelector('#installPrompt');
const installAppButton = document.querySelector('#installAppButton');
const neverShowInstallPrompt = document.querySelector('#neverShowInstallPrompt');
const appUpdatePrompt = document.querySelector('#appUpdatePrompt');
const appUpdatePromptDescription = document.querySelector('#appUpdatePromptDescription');
let pendingUpdateUrl = ANDROID_APK_URL;
let deferredInstallPrompt = null;

function runsAsInstalledApp() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function shouldOfferAndroidInstall() {
  return /Android/i.test(window.navigator.userAgent)
    && !runsInAndroidAppShell()
    && !runsAsInstalledApp()
    && !window.localStorage.getItem(INSTALL_PROMPT_DISMISS_KEY)
    && !window.sessionStorage.getItem(INSTALL_PROMPT_SESSION_DISMISS_KEY);
}

function markAndroidAppAsSeen() {
  window.localStorage.setItem(ANDROID_APP_LAST_SEEN_STORAGE_KEY, String(Date.now()));
}

function wasAndroidAppRecentlySeen() {
  if (Number(window.localStorage.getItem(NATIVE_VERSION_STORAGE_KEY)) > 0) return true;
  const lastSeenAt = Number(window.localStorage.getItem(ANDROID_APP_LAST_SEEN_STORAGE_KEY));
  return lastSeenAt > 0 && Date.now() - lastSeenAt < ANDROID_APP_SEEN_MAX_AGE_MS;
}

async function isAndroidAppInstalled() {
  if (runsInAndroidAppShell()) {
    markAndroidAppAsSeen();
    return true;
  }
  if (wasAndroidAppRecentlySeen()) return true;
  if (typeof window.navigator.getInstalledRelatedApps !== 'function') return false;
  try {
    const relatedApps = await window.navigator.getInstalledRelatedApps();
    const installed = relatedApps.some(app => app.platform === 'play' && app.id === ANDROID_PACKAGE_ID);
    if (installed) markAndroidAppAsSeen();
    return installed;
  } catch (error) {
    console.warn('Kurulu Android uygulaması kontrol edilemedi:', error);
    return false;
  }
}

async function showAndroidInstallPrompt() {
  if (!shouldOfferAndroidInstall() || !deferredInstallPrompt) return;
  if (await isAndroidAppInstalled()) {
    installPrompt.classList.add('is-hidden');
    return;
  }
  if (!shouldOfferAndroidInstall()) return;
  appUpdatePrompt.classList.add('is-hidden');
  installPrompt.classList.remove('is-hidden');
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installAppButton.classList.remove('is-hidden');
  showAndroidInstallPrompt();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  installPrompt.classList.add('is-hidden');
});

installAppButton.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installAppButton.classList.add('is-hidden');
  closeInstallPrompt();
});

function closeInstallPrompt() {
  window.sessionStorage.setItem(INSTALL_PROMPT_SESSION_DISMISS_KEY, '1');
  if (neverShowInstallPrompt.checked) window.localStorage.setItem(INSTALL_PROMPT_DISMISS_KEY, '1');
  installPrompt.classList.add('is-hidden');
}

document.querySelector('#continueOnWebButton').addEventListener('click', closeInstallPrompt);

window.setTimeout(showAndroidInstallPrompt, 1200);

function androidShellVersion() {
  const versionFromLaunchUrl = LAUNCHED_NATIVE_VERSION
    || Number(new URLSearchParams(window.location.search).get('nativeVersion'));
  if (versionFromLaunchUrl > 0) {
    window.localStorage.setItem(NATIVE_VERSION_STORAGE_KEY, String(versionFromLaunchUrl));
    return versionFromLaunchUrl;
  }
  return Number(window.localStorage.getItem(NATIVE_VERSION_STORAGE_KEY)) || 1;
}

function runsInAndroidAppShell() {
  const launchParameters = new URLSearchParams(window.location.search);
  const explicitlyLaunchedByAndroidShell = launchParameters.get('androidShell') === '1';
  const launchedWithVersion = Number(launchParameters.get('nativeVersion')) > 0;
  const launchedByAndroidPackage = document.referrer.startsWith(`android-app://${ANDROID_PACKAGE_ID}`);
  const legacyNativeLaunch = launchedWithVersion && (launchedByAndroidPackage || runsAsInstalledApp());
  return IS_ANDROID_SHELL || explicitlyLaunchedByAndroidShell || launchedByAndroidPackage || legacyNativeLaunch;
}

if (runsInAndroidAppShell()) markAndroidAppAsSeen();


async function checkForAndroidUpdate() {
  if (!runsInAndroidAppShell()) return;
  try {
    const response = await fetch(`android-version.json?check=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return;
    const release = await response.json();
    const latestVersionCode = Number(release.versionCode);
    if (!latestVersionCode || latestVersionCode <= androidShellVersion()) return;
    pendingUpdateUrl = release.apkUrl || ANDROID_APK_URL;
    appUpdatePrompt.dataset.versionCode = String(latestVersionCode);
    appUpdatePromptDescription.textContent = `${release.versionName || 'Yeni sürüm'} hazır. Güncel özellikler ve yeni logo için uygulamayı güncelleyin.`;
    installPrompt.classList.add('is-hidden');
    appUpdatePrompt.classList.remove('is-hidden');
  } catch (error) {
    console.warn('Android sürüm kontrolü yapılamadı:', error);
  }
}

document.querySelector('#updateAppButton').addEventListener('click', () => {
  appUpdatePrompt.classList.add('is-hidden');
  if (runsInAndroidAppShell() && androidShellVersion() >= 18) {
    window.location.assign(`sasaf://update?url=${encodeURIComponent(pendingUpdateUrl)}`);
    return;
  }
  window.location.assign(pendingUpdateUrl);
});

document.querySelector('#dismissUpdatePrompt').addEventListener('click', () => {
  appUpdatePrompt.classList.add('is-hidden');
});

window.setTimeout(checkForAndroidUpdate, 1500);
window.setTimeout(checkForAndroidUpdate, 6000);

function syncGroupOptions() {
  document.querySelectorAll('select[name="group"]').forEach(select => {
    const selectedGroup = select.value;
    select.replaceChildren(new Option('Seçiniz', ''), ...GROUPS.map(group => new Option(group, group)));
    if (GROUPS.includes(selectedGroup)) select.value = selectedGroup;
  });
}
syncGroupOptions();
function syncTrainingTypeOptions(selectedType = '') {
  const select = document.querySelector('#trainingTypeSelect');
  if (!select) return;
  const currentType = selectedType || select.value;
  const options = [...state.trainingTypes];
  if (currentType && !options.includes(currentType)) options.push(currentType);
  select.replaceChildren(
    new Option('Seçiniz', ''),
    ...options.map(type => new Option(type, type))
  );
  if (currentType) select.value = currentType;
}
syncTrainingTypeOptions();
function syncTrainingCoachOptions(selectedCoach = '') {
  const select = document.querySelector('#trainingCoachSelect');
  if (!select) return;
  const currentCoach = selectedCoach || select.value;
  const options = [...state.trainingCoaches];
  if (currentCoach && !options.includes(currentCoach)) options.push(currentCoach);
  select.replaceChildren(
    new Option('Seçiniz', ''),
    ...options.map(coach => new Option(coach, coach))
  );
  if (currentCoach) select.value = currentCoach;
}
syncTrainingCoachOptions();
function syncTrainingFieldOptions(selectedField = '') {
  const select = document.querySelector('#trainingFieldSelect');
  if (!select) return;
  const currentField = selectedField || select.value;
  const options = [...state.trainingFields];
  if (currentField && !options.includes(currentField)) options.push(currentField);
  select.replaceChildren(
    new Option('Seçiniz', ''),
    ...options.map(field => new Option(field, field))
  );
  if (currentField) select.value = currentField;
}
syncTrainingFieldOptions();
document.querySelector('#headerVersionLabel').textContent = `v${APP_VERSION}`;
document.querySelector('#authVersionLabel').textContent = `v${APP_VERSION}`;

function allowedItems() {
  if (adminMustChooseSubscription()) return [];
  return Object.entries(navItems).filter(([, item]) => item.roles.includes(state.role) && !item.hidden);
}
function isAdminRole() { return ['super_admin', 'admin'].includes(state.role); }
function isCoachRole() { return state.role === 'coach'; }
function isActualSuperAdmin() { return state.actualRole === 'super_admin'; }
function isRolePreview() { return isActualSuperAdmin() && state.role !== 'super_admin'; }
function hasCurrentSubscriptionAccess() {
  if (state.role !== 'admin') return false;
  if (!['active', 'trial'].includes(state.schoolSubscriptionStatus)) return false;
  if (!state.schoolSubscriptionEndsOn) return true;
  return state.schoolSubscriptionEndsOn >= localDateValue();
}
function adminMustChooseSubscription() {
  return state.role === 'admin' && !hasCurrentSubscriptionAccess() && ['PENDING_CHOICE', 'PAYMENT_PENDING'].includes(state.onboarding?.status);
}
function subscriptionGatePage(page) {
  return adminMustChooseSubscription() && page !== 'onboarding' ? 'onboarding' : page;
}
function initials(name) { return name.split(' ').map(part => part[0]).slice(0, 2).join(''); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character])); }
function studentAvatarMarkup(student, useStudentIcon = false, extraClasses = '') {
  const hasPhoto = Boolean(student?.photoUrl);
  const fallback = useStudentIcon ? MENU_ICONS.student : escapeHtml(initials(student?.name || 'Ö'));
  const content = hasPhoto
    ? `<img src="${escapeHtml(student.photoUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : fallback;
  return `<span class="profile-avatar ${useStudentIcon ? 'student-icon-avatar' : ''} ${hasPhoto ? 'has-photo' : ''} ${extraClasses}" aria-hidden="true">${content}</span>`;
}
const PLAYER_CARD_FIELDS = ['overall', 'speed', 'shooting', 'passing', 'dribbling', 'defense', 'physical'];
const PLAYER_CARD_DEFAULTS = { overall: 50, speed: 50, shooting: 50, passing: 50, dribbling: 50, defense: 50, physical: 50 };
function normalizePlayerCard(value) {
  if (!value || typeof value !== 'object') return null;
  const normalized = {};
  for (const field of PLAYER_CARD_FIELDS) {
    const rating = Number(value[field]);
    if (!Number.isInteger(rating) || rating < 0 || rating > 99) return null;
    normalized[field] = rating;
  }
  return normalized;
}
function playerPositionCode(position) {
  return ({ Kaleci: 'KL', Defans: 'DEF', 'Orta saha': 'OS', Forvet: 'FOR' })[position] || 'OY';
}
function playerCardMarkup(student, playerCard = student?.playerCard) {
  const ratings = normalizePlayerCard(playerCard);
  const rating = field => ratings ? String(ratings[field]).padStart(2, '0') : '—';
  const portrait = student?.photoUrl
    ? `<img src="${escapeHtml(student.photoUrl)}" alt="${escapeHtml(student.name)} oyuncu fotoğrafı" referrerpolicy="no-referrer">`
    : `<span class="player-card-photo-fallback" aria-hidden="true">${MENU_ICONS.student}</span>`;
  return `<article class="fut-player-card ${ratings ? '' : 'is-unrated'}" aria-label="${escapeHtml(student?.name || 'Öğrenci')} oyuncu kartı">
    <div class="fut-card-topline"><div class="fut-card-rating"><strong>${rating('overall')}</strong><span>${escapeHtml(playerPositionCode(student?.position))}</span></div><span class="fut-card-brand">SASA-F</span></div>
    <div class="fut-card-photo">${portrait}</div>
    <div class="fut-card-name">${escapeHtml(student?.name || 'Öğrenci')}</div>
    <div class="fut-card-meta"><span>${escapeHtml(student?.group || 'Grup yok')}</span><span>${escapeHtml(student?.position || 'Mevki yok')}</span></div>
    <div class="fut-card-stats">
      <span><strong>${rating('speed')}</strong> HIZ</span><span><strong>${rating('dribbling')}</strong> DRİ</span>
      <span><strong>${rating('shooting')}</strong> ŞUT</span><span><strong>${rating('defense')}</strong> DEF</span>
      <span><strong>${rating('passing')}</strong> PAS</span><span><strong>${rating('physical')}</strong> FİZ</span>
    </div>
    ${ratings ? '' : '<div class="fut-card-unrated">Henüz değerlendirilmedi</div>'}
  </article>`;
}
function normalizeIban(value) { return String(value || '').toLocaleUpperCase('tr-TR').replace(/[^A-Z0-9]/g, ''); }
function formatIban(value) { return normalizeIban(value).replace(/(.{4})/g, '$1 ').trim(); }
function formatTurkishIbanLocalPart(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 24);
  return formatIban(`TR${digits}`).slice(2).trim();
}
function formatTurkishIbanEntry(value) {
  const normalized = normalizeIban(value);
  if (normalized.startsWith('T')) {
    if (!normalized.startsWith('TR')) return { value: normalized.slice(0, 26), hasExplicitPrefix: true };
    const digits = normalized.slice(2).replace(/\D/g, '').slice(0, 24);
    return { value: formatIban(`TR${digits}`), hasExplicitPrefix: true };
  }
  return { value: formatTurkishIbanLocalPart(value), hasExplicitPrefix: false };
}
function normalizeTurkishIbanEntry(value) {
  const normalized = normalizeIban(value);
  if (!normalized) return '';
  const digits = (normalized.startsWith('TR') ? normalized.slice(2) : normalized).replace(/\D/g, '').slice(0, 24);
  return digits ? `TR${digits}` : '';
}
function parentBankThemeClass(bankName) {
  const normalized = String(bankName || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]/g, '');
  if (normalized.includes('akbank')) return 'bank-theme-akbank';
  if (normalized.includes('garanti')) return 'bank-theme-garanti';
  if (normalized.includes('yapikredi')) return 'bank-theme-yapi-kredi';
  if (normalized.includes('isbankasi') || normalized.includes('turkiyeisbankasi')) return 'bank-theme-is-bankasi';
  if (normalized.includes('ziraat')) return 'bank-theme-ziraat';
  if (normalized.includes('halkbank')) return 'bank-theme-halkbank';
  if (normalized.includes('vakifbank')) return 'bank-theme-vakifbank';
  if (normalized.includes('qnb') || normalized.includes('finansbank')) return 'bank-theme-qnb';
  if (normalized.includes('denizbank')) return 'bank-theme-denizbank';
  if (normalized.includes('teb')) return 'bank-theme-teb';
  if (normalized.includes('ing')) return 'bank-theme-ing';
  if (normalized.includes('kuveytturk')) return 'bank-theme-kuveyt-turk';
  if (normalized.includes('albaraka')) return 'bank-theme-albaraka';
  return '';
}
function isValidTurkishIban(value) {
  const iban = normalizeIban(value);
  if (!/^TR\d{24}$/.test(iban)) return false;
  const checksumValue = `${iban.slice(4)}2927${iban.slice(2, 4)}`;
  let remainder = 0;
  for (const digit of checksumValue) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
}
function statusLabel(fee) {
  if (fee === 'paid') return '<span class="status">Ödendi</span>';
  if (fee === 'late') return '<span class="status danger">Ödenmedi</span>';
  if (fee === 'none') return '<span class="status blue">Aidat yok</span>';
  if (fee === 'exempt') return '<span class="status blue">Muaf</span>';
  if (fee === 'unknown') return '<span class="status blue">Kaynak notu</span>';
  return '<span class="status warning">Bekliyor</span>';
}
function formatCurrency(value) { return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(value); }
function localDateValue(date = new Date()) { const offset = date.getTimezoneOffset(); return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10); }
function studentBirthInputValue(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = String(value).match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  return match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : '';
}
function formatStudentBirthDate(value) { const [year, month, day] = String(value).split('-'); return year && month && day ? `${day}.${month}.${year}` : value; }
function formatStudentBirthDisplay(value) {
  const birthValue = String(value || '').trim();
  const isoMatch = birthValue.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) return `${isoMatch[3].padStart(2, '0')}.${isoMatch[2].padStart(2, '0')}.${isoMatch[1]}`;
  const localMatch = birthValue.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
  if (localMatch) return `${localMatch[1].padStart(2, '0')}.${localMatch[2].padStart(2, '0')}.${localMatch[3]}`;
  return birthValue || '—';
}
function formatTurkishPhoneInput(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
  const parts = [];
  if (digits) parts.push(digits.slice(0, 1));
  if (digits.length > 1) parts.push(` (${digits.slice(1, 4)}`);
  if (digits.length >= 4) parts.push(')');
  if (digits.length > 4) parts.push(` ${digits.slice(4, 7)}`);
  if (digits.length > 7) parts.push(` ${digits.slice(7, 9)}`);
  if (digits.length > 9) parts.push(` ${digits.slice(9, 11)}`);
  return parts.join('');
}
function studentBirthYearLabel(student) {
  const year = String(student?.birth || '').match(/(?:19|20)\d{2}/)?.[0];
  return year ? `${year} doğumlu` : 'Doğum yılı belirtilmedi';
}
function feeMonthKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; }
function notificationDate(value) {
  if (!value) return '';
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Bugün';
  if (date.toDateString() === yesterday.toDateString()) return 'Dün';
  return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' }).format(date);
}
function notificationTargetLabel(audience) {
  if (audience === 'Süper Admin') return 'Süper Admin';
  if (audience === 'Abonelik işlemi') return state.schoolName || 'Okul';
  return ['Aidat borcu olanlar', 'Aidat borcu olmayanlar'].includes(audience)
    ? 'Aidat hatırlatma'
    : audience;
}
function formatFeeMonth(key) { const [year, month] = String(key).split('-').map(Number); return new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1)); }
function upcomingFeeMonths(count = 6) {
  const cursor = new Date();
  cursor.setDate(1);
  return Array.from({ length: count }, (_, index) => {
    const month = new Date(cursor.getFullYear(), cursor.getMonth() + index, 1);
    return feeMonthKey(month);
  });
}
function upcomingFeeLoadEndMonth() {
  return upcomingFeeMonths().at(-1) || feeMonthKey();
}
function formatFeeDueDate(key) {
  const [year, month] = String(key).split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${String(lastDay).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`;
}
function formatEnrollmentDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${value}T00:00:00`)) : value; }
function formatEnrollmentDateNumeric(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('.') : value; }
function monthlyFeePeriods(student) {
  const feeStartDate = student.feeTrackingStartDate || student.enrollmentDate;
  const enrollmentDate = /^\d{4}-\d{2}-\d{2}$/.test(feeStartDate) ? feeStartDate : '2026-07-01';
  const [startYear, startMonth] = enrollmentDate.split('-').map(Number);
  const start = new Date(startYear, startMonth - 1, 1);
  const end = new Date();
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  const cursor = start > endMonth ? endMonth : start;
  const periods = [];
  while (cursor <= endMonth) {
    periods.push(feeMonthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  const historicalPeriods = Object.keys(student.feeHistory || {}).filter(month => /^\d{4}-\d{2}$/.test(month));
  return [...new Set([...periods, ...historicalPeriods])].sort().reverse();
}
function monthlyFeeStatus(student, month) {
  if (student.feePayments?.[month]) return student.feePayments[month] === 'pending' ? 'none' : student.feePayments[month];
  if (student.feeHistory?.[month]?.status) return student.feeHistory[month].status === 'pending' ? 'none' : student.feeHistory[month].status;
  return 'none';
}
function currentFeeStatus(student) { return monthlyFeeStatus(student, feeMonthKey()); }
function isActiveStudent(student) { return student?.active !== false; }
function unpaidFeePeriods(student) { return monthlyFeePeriods(student).filter(month => monthlyFeeStatus(student, month) === 'late'); }
function monthlyFeeAmount(student, month) {
  const historicalAmount = student?.feeHistory?.[month]?.amount;
  if (Number.isFinite(Number(historicalAmount)) && historicalAmount !== null) return Number(historicalAmount);
  const studentAmount = Number(student?.monthlyFeeAmount);
  return Number.isFinite(studentAmount) && studentAmount > 0 ? studentAmount : state.monthlyFeeAmount;
}
function feeAccountingReference(student, month) { return `fee:${student.id}:${month}`; }
function removeFeeAccountingEntry(student, month) {
  const reference = feeAccountingReference(student, month);
  state.accountingEntries = state.accountingEntries.filter(entry => entry.reference !== reference);
}
function addFeeAccountingEntry(student, month, paymentDetails = {}) {
  const reference = feeAccountingReference(student, month);
  const amount = Number(paymentDetails.amount) > 0 ? Number(paymentDetails.amount) : monthlyFeeAmount(student, month);
  const paymentDate = /^\d{4}-\d{2}-\d{2}$/.test(paymentDetails.paymentDate || '') ? paymentDetails.paymentDate : localDateValue();
  const paymentMethod = PAYMENT_METHODS[paymentDetails.paymentMethod] ? paymentDetails.paymentMethod : 'cash';
  const existingEntry = state.accountingEntries.find(entry => entry.reference === reference);
  const accountingEntry = {
    id: existingEntry?.id || Date.now(),
    date: paymentDate,
    title: `${student.name} · ${formatFeeMonth(month)} aidatı`,
    type: 'Gelir',
    amount,
    kind: 'income',
    paymentMethod,
    source: 'fee',
    reference,
    studentId: student.id,
    feeMonth: month
  };
  if (existingEntry) Object.assign(existingEntry, accountingEntry);
  else state.accountingEntries.unshift(accountingEntry);
}
function setMonthlyFeeStatus(student, month, status, paymentDetails = {}) {
  const amount = status === 'none'
    ? null
    : Number(paymentDetails.amount) > 0
      ? Number(paymentDetails.amount)
      : monthlyFeeAmount(student, month);
  const paymentDate = status === 'paid'
    ? (/^\d{4}-\d{2}-\d{2}$/.test(paymentDetails.paymentDate || '') ? paymentDetails.paymentDate : localDateValue())
    : null;
  const paymentMethod = status === 'paid' && PAYMENT_METHODS[paymentDetails.paymentMethod] ? paymentDetails.paymentMethod : status === 'paid' ? 'cash' : null;
  student.feePayments = { ...student.feePayments, [month]: status };
  student.feeHistory = {
    ...student.feeHistory,
    [month]: {
      ...(student.feeHistory?.[month] || {}),
      status,
      amount,
      note: status === 'none' ? 'Aidat yok' : null,
      paymentMethod,
      paidAt: paymentDate ? `${paymentDate}T12:00:00.000Z` : null,
      createdAt: student.feeHistory?.[month]?.createdAt || new Date().toISOString(),
      source: 'app'
    }
  };
  if (month === feeMonthKey()) student.fee = status;
  if (status === 'paid') addFeeAccountingEntry(student, month, { ...paymentDetails, amount, paymentDate, paymentMethod });
  else removeFeeAccountingEntry(student, month);
}
function feeStatusControl(student, month, status) {
  const selectValue = status === 'none' ? 'none' : 'late';
  return `<select class="fee-status-select" data-monthly-fee-status data-id="${student.id}" data-month="${month}" aria-label="${formatFeeMonth(month)} aidat durumu"><option value="none" ${selectValue === 'none' ? 'selected' : ''}>Aidat yok</option><option value="late" ${selectValue === 'late' ? 'selected' : ''}>Ödenmedi</option></select>`;
}
function monthlyFeeSortHeader(key, label) {
  const active = state.monthlyFeeSortKey === key;
  const direction = active ? state.monthlyFeeSortDirection : 'none';
  const indicator = active ? state.monthlyFeeSortDirection === 'asc' ? '↑' : '↓' : '↕';
  return `<th aria-sort="${direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'}"><button class="table-sort-button" type="button" data-action="monthly-fee-sort" data-sort-key="${key}"><span>${label}</span><span class="sort-indicator" aria-hidden="true">${indicator}</span></button></th>`;
}
function monthlyFeeSortValue(student, month, key) {
  if (key === 'amount') return monthlyFeeStatus(student, month) === 'none' ? 0 : monthlyFeeAmount(student, month);
  if (key === 'status') {
    const labels = { none: 'Aidat yok', late: 'Ödenmedi', paid: 'Ödendi', exempt: 'Muaf', unknown: 'Bilinmiyor' };
    return labels[monthlyFeeStatus(student, month)] || '';
  }
  return month;
}
function sortedMonthlyFeePeriods(student) {
  const direction = state.monthlyFeeSortDirection === 'desc' ? -1 : 1;
  const periods = state.monthlyFeeUnpaidOnly
    ? monthlyFeePeriods(student).filter(month => monthlyFeeStatus(student, month) === 'late')
    : monthlyFeePeriods(student);
  return [...periods].sort((left, right) => {
    const leftValue = monthlyFeeSortValue(student, left, state.monthlyFeeSortKey);
    const rightValue = monthlyFeeSortValue(student, right, state.monthlyFeeSortKey);
    return typeof leftValue === 'number' && typeof rightValue === 'number'
      ? (leftValue - rightValue) * direction
      : String(leftValue).localeCompare(String(rightValue), 'tr-TR', { numeric: true, sensitivity: 'base' }) * direction;
  });
}
function monthlyFeeRows(student) {
  const canEdit = state.role !== 'parent';
  const periods = sortedMonthlyFeePeriods(student);
  if (!periods.length) return `<tr><td colspan="${canEdit ? 5 : 4}"><div class="empty-state">${state.monthlyFeeUnpaidOnly ? 'Ödenmemiş aidat bulunmuyor.' : 'Aidat dönemi bulunmuyor.'}</div></td></tr>`;
  return periods.map(month => {
    const status = monthlyFeeStatus(student, month);
    const history = student.feeHistory?.[month];
    const amount = history?.amount !== null && history?.amount !== undefined ? formatCurrency(history.amount) : history?.note === 'Yıllık ödeme' ? 'Yıllık' : history || status === 'none' ? '—' : '₺1.500';
    const sourceNote = history?.note && !(status === 'none' && history.note === 'Aidat yok') ? `<small class="muted">${history.note}</small>` : '';
    const canSelectFeeStatus = canEdit && ['none', 'late'].includes(status);
    const statusMarkup = canSelectFeeStatus ? `${feeStatusControl(student, month, status)}${sourceNote}` : `${parentFeeStatusMarkup(student, month, status)}${sourceNote}`;
    const paymentControl = status === 'none' ? statusLabel('none') : !['exempt', 'unknown'].includes(status) ? `<label class="fee-paid-control"><input type="checkbox" data-monthly-fee data-id="${student.id}" data-month="${month}" aria-label="${formatFeeMonth(month)} aidatını ödendi işaretle" ${status === 'paid' ? 'checked' : ''}><span>${status === 'paid' ? 'Ödendi' : 'Ödendi seç'}</span></label>` : '—';
    return `<tr><td><strong>${formatFeeMonth(month)}</strong></td><td>${amount}</td><td>${formatFeeDueDate(month)}</td><td>${statusMarkup}</td>${canEdit ? `<td>${paymentControl}</td>` : ''}</tr>`;
  }).join('');
}
function formatTrainingDate(value) { return value ? new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', weekday: 'short' }).format(new Date(`${value}T00:00:00`)) : 'Tarih belirtilmedi'; }
function formatTrainingDateLong(value) { return value ? new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }).format(new Date(`${value}T00:00:00`)) : 'Tarih belirtilmedi'; }
function sortedTrainings(list, direction = 'asc') {
  const multiplier = direction === 'desc' ? -1 : 1;
  return [...list].sort((left, right) => `${left.date || ''}T${left.time || ''}`.localeCompare(`${right.date || ''}T${right.time || ''}`) * multiplier);
}
function formatAccountingDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' }).format(new Date(`${value}T00:00:00`)) : value; }
function accountingDateInputValue(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const monthNumbers = { Oca: '01', Şub: '02', Mar: '03', Nis: '04', May: '05', Haz: '06', Tem: '07', Ağu: '08', Eyl: '09', Eki: '10', Kas: '11', Ara: '12' };
  const [day, month] = String(value).split(' ');
  return monthNumbers[month] ? `2026-${monthNumbers[month]}-${String(day).padStart(2, '0')}` : localDateValue();
}
function accountingMonthOptions(count = 12) {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => feeMonthKey(new Date(now.getFullYear(), now.getMonth() - index, 1)));
}
function accountingPeriodLabel() {
  if (state.accountingDateRangeStart && state.accountingDateRangeEnd) return `${formatEnrollmentDate(state.accountingDateRangeStart)} – ${formatEnrollmentDate(state.accountingDateRangeEnd)}`;
  if (state.accountingPeriod === 'today') return 'Bugün';
  if (state.accountingMonth) return formatFeeMonth(state.accountingMonth);
  return 'Bugün';
}
function accountingPeriodEntries() {
  const start = state.accountingDateRangeStart;
  const end = state.accountingDateRangeEnd;
  const today = localDateValue();
  return state.accountingEntries.filter(entry => {
    const entryDate = accountingDateInputValue(entry.date);
    if (start && end) return entryDate >= start && entryDate <= end;
    if (state.accountingPeriod === 'today') return entryDate === today;
    if (state.accountingMonth) return entryDate.slice(0, 7) === state.accountingMonth;
    return entryDate === today;
  }).sort((left, right) => {
    const dateOrder = accountingDateInputValue(right.date).localeCompare(accountingDateInputValue(left.date));
    return dateOrder || (Number(right.id) || 0) - (Number(left.id) || 0);
  });
}
function studentsForTraining(training) { return state.students.filter(student => student.group === training.group && isActiveStudent(student)); }
function latestAttendanceForTraining(training) { return state.attendanceRecords.find(record => Number(record.trainingId) === Number(training.id)); }
function attendanceEntriesForStudent(student) {
  const seenTrainingIds = new Set();
  return state.attendanceRecords.map(record => {
    const training = state.trainings.find(item => Number(item.id) === Number(record.trainingId));
    const trainingId = Number(record.trainingId);
    if (!training || seenTrainingIds.has(trainingId)) return null;
    seenTrainingIds.add(trainingId);
    const present = Array.isArray(record.presentStudentIds) && record.presentStudentIds.some(studentId => Number(studentId) === Number(student.id));
    if (!present && training.group !== student.group) return null;
    return { record, training, present };
  }).filter(Boolean).sort((a, b) => `${a.training.date || ''}T${a.training.time || ''}`.localeCompare(`${b.training.date || ''}T${b.training.time || ''}`));
}
function studentAttendanceMonthOptions(student) {
  const enrollmentDate = /^\d{4}-\d{2}-\d{2}$/.test(student?.enrollmentDate || '')
    ? student.enrollmentDate
    : localDateValue();
  const [startYear, startMonth] = enrollmentDate.split('-').map(Number);
  const current = new Date();
  const currentMonth = new Date(current.getFullYear(), current.getMonth(), 1);
  const startMonthDate = new Date(startYear, startMonth - 1, 1);
  const cursor = startMonthDate > currentMonth ? currentMonth : startMonthDate;
  const months = [];
  while (cursor <= currentMonth) {
    months.push(feeMonthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months.reverse();
}
function studentAttendanceRate(student) {
  const entries = attendanceEntriesForStudent(student);
  if (!entries.length) return 0;
  const presentCount = entries.filter(entry => entry.present).length;
  return Math.round(presentCount / entries.length * 100);
}
function formatTimelineDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`))
    : value;
}
function studentTimelineEntries(student) {
  const attendanceEvents = attendanceEntriesForStudent(student).map(({ training, present }) => ({
    date: training.date,
    title: present ? 'Antrenmana katıldı' : 'Antrenmana katılmadı',
    detail: `${training.title} · ${training.group} · ${training.coach}`,
    tone: present ? 'positive' : 'negative'
  }));
  const feeEvents = isCoachRole() ? [] : monthlyFeePeriods(student).flatMap(month => {
    const status = monthlyFeeStatus(student, month);
    if (!['paid', 'late'].includes(status)) return [];
    const history = student.feeHistory?.[month];
    const amount = history?.amount !== null && history?.amount !== undefined ? formatCurrency(history.amount) : history?.note === 'Yıllık ödeme' ? 'Yıllık ödeme' : formatCurrency(1500);
    const definitionDate = /^\d{4}-\d{2}-\d{2}/.test(history?.createdAt || '') ? history.createdAt.slice(0, 10) : `${month}-01`;
    const events = [{
      date: definitionDate,
      title: 'Aidat tanımlandı',
      detail: `${formatFeeMonth(month)} · ${amount} · Son ödeme ${formatFeeDueDate(month)}`,
      tone: 'neutral'
    }];
    if (status === 'paid') {
      const paymentDate = /^\d{4}-\d{2}-\d{2}/.test(history?.paidAt || '') ? history.paidAt.slice(0, 10) : definitionDate;
      events.push({
        date: paymentDate,
        title: 'Aidat ödendi',
        detail: `${formatFeeMonth(month)} · ${amount}`,
        tone: 'positive'
      });
    }
    return events;
  });
  const enrollmentDate = /^\d{4}-\d{2}-\d{2}$/.test(student.enrollmentDate) ? student.enrollmentDate : '2026-07-22';
  const importedRecord = enrollmentDate === '2026-07-22';
  const enrollmentEvent = {
    date: enrollmentDate,
    title: importedRecord ? 'Öğrenci kaydı sisteme aktarıldı' : 'Futbol okuluna kaydoldu',
    detail: importedRecord ? `${student.group} grubu · Excel öğrenci listesi` : `${student.group} grubuna öğrenci kaydı oluşturuldu`,
    tone: 'neutral'
  };
  return [...attendanceEvents, ...feeEvents, enrollmentEvent].sort((a, b) => {
    const dateOrder = String(b.date).localeCompare(String(a.date));
    if (dateOrder) return dateOrder;
    if (a.title === 'Aidat ödendi' && b.title === 'Aidat tanımlandı') return -1;
    if (a.title === 'Aidat tanımlandı' && b.title === 'Aidat ödendi') return 1;
    return 0;
  });
}
function studentTimelineMarkup(student) {
  const entries = studentTimelineEntries(student);
  const expanded = Number(state.expandedTimelineStudentId) === Number(student.id);
  const visibleEntries = expanded ? entries : entries.slice(0, 4);
  const historyButton = entries.length > 4 ? `<div class="student-timeline-actions"><button class="secondary-button" type="button" data-action="toggle-student-timeline" data-id="${student.id}" aria-expanded="${expanded}">${expanded ? 'Daha az göster' : 'Geçmiş hareketler'}</button></div>` : '';
  return `<section class="panel student-timeline-card"><div class="panel-heading"><div><h3>Öğrenci zaman çizelgesi</h3><small class="muted">${isCoachRole() ? 'Kayıt ve yoklama hareketleri' : 'Kayıt, aidat ve yoklama hareketleri'}</small></div><span class="status blue">${entries.length} hareket</span></div><ol class="student-timeline">${visibleEntries.map(entry => `<li class="${entry.tone}"><span class="timeline-dot" aria-hidden="true"></span><div class="timeline-content"><time datetime="${entry.date}">${formatTimelineDate(entry.date)}</time><strong>${entry.title}</strong><small>${entry.detail}</small></div></li>`).join('') || '<li class="timeline-empty">Henüz zaman çizelgesi hareketi bulunmuyor.</li>'}</ol>${historyButton}</section>`;
}
function trainingAttendanceLabel(training) {
  const trainingStudents = studentsForTraining(training);
  const latestAttendance = latestAttendanceForTraining(training);
  if (!latestAttendance) return `${trainingStudents.length} öğrenci`;
  const trainingStudentIds = new Set(trainingStudents.map(student => student.id));
  const presentCount = latestAttendance.presentStudentIds.filter(studentId => trainingStudentIds.has(Number(studentId))).length;
  return `${presentCount} / ${trainingStudents.length} öğrenci katıldı`;
}
function studentNameLink(student, inverse = false) { return `<button class="student-name-link${inverse ? ' inverse' : ''}" type="button" data-action="profile" data-id="${Number(student.id)}">${escapeHtml(student.name)}</button>`; }

function navMarkup(key, item) {
  return `<button class="nav-button ${state.page === key ? 'active' : ''}" type="button" data-page="${key}"><span class="nav-icon">${item.icon}</span><span>${item.label}</span></button>`;
}

function mobileNavigationKeys() {
  const keys = state.role === 'parent'
    ? ['dashboard', 'child', 'trainings', 'fees']
    : ['dashboard', 'students', 'trainings', isAdminRole() ? 'accounting' : 'attendance'];
  return keys.filter(key => navItems[key]?.roles.includes(state.role));
}

function renderNavigation() {
  const items = allowedItems();
  setSafeHtml(mainNav, items.map(([key, item]) => navMarkup(key, item)).join(''));
  const settingsItem = navItems.settings;
  const showSettings = settingsItem.roles.includes(state.role);
  const sidebarSettings = document.querySelector('#sidebarSettings');
  setSafeHtml(sidebarSettings, showSettings ? navMarkup('settings', settingsItem) : '');
  sidebarSettings.classList.toggle('is-hidden', !showSettings);
  setSafeHtml(bottomNav, mobileNavigationKeys().map(key => navMarkup(key, navItems[key])).join(''));
}

function dashboardNotificationPromptMarkup() {
  if (runsInAndroidAppShell()) return '';
  const permission = currentPushPermission();
  const dismissed = window.localStorage.getItem(PUSH_PROMPT_DISMISS_STORAGE_KEY) === '1';
  const notificationsManuallyDisabled = window.localStorage.getItem(PUSH_PREFERENCE_STORAGE_KEY) === 'disabled';
  if (dismissed || notificationsManuallyDisabled || state.pushStatus !== 'disabled' || permission !== 'default') return '';
  return `<section class="panel dashboard-notification-prompt" aria-labelledby="dashboardNotificationPromptTitle">
    <span class="dashboard-notification-prompt-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"></path></svg></span>
    <div class="dashboard-notification-prompt-copy"><strong id="dashboardNotificationPromptTitle">Antrenman ve duyurulardan haberdar olun</strong><small>Yeni antrenmanları, iptalleri ve okul duyurularını telefonunuzdan takip edin. Android ilk etkinleştirmede web ve uygulama için iki onay gösterebilir.</small></div>
    <div class="dashboard-notification-prompt-actions"><button class="primary-button" type="button" data-action="enable-dashboard-notifications">Bildirimleri aç</button><button class="secondary-button" type="button" data-action="dismiss-dashboard-notifications">Şimdi değil</button></div>
  </section>`;
}

function schoolsView() {
  const activeSchools = state.schools.filter(school => school.active).length;
  const totalStudents = state.schools.reduce((total, school) => total + school.studentCount, 0);
  const totalActiveStudents = state.schools.reduce((total, school) => total + school.activeStudentCount, 0);
  const normalizedSearch = state.schoolSearchQuery.trim().toLocaleLowerCase('tr');
  const schoolStatusFilter = ['all', 'active', 'inactive'].includes(state.schoolStatusFilter) ? state.schoolStatusFilter : 'all';
  const schoolSortOrder = ['name_asc', 'name_desc', 'created_desc', 'created_asc'].includes(state.schoolSortOrder) ? state.schoolSortOrder : 'created_desc';
  const filteredSchools = state.schools.filter(school => {
    const statusMatches = schoolStatusFilter === 'all'
      || (schoolStatusFilter === 'active' && school.active)
      || (schoolStatusFilter === 'inactive' && !school.active);
    const searchMatches = !normalizedSearch || `${school.name} ${school.slug}`.toLocaleLowerCase('tr').includes(normalizedSearch);
    return statusMatches && searchMatches;
  }).sort((a, b) => {
    if (schoolSortOrder === 'name_asc' || schoolSortOrder === 'name_desc') {
      return String(a.name || '').localeCompare(String(b.name || ''), 'tr', { sensitivity: 'base' }) * (schoolSortOrder === 'name_asc' ? 1 : -1);
    }
    const aTime = new Date(a.createdAt || 0).getTime();
    const bTime = new Date(b.createdAt || 0).getTime();
    return (aTime - bTime) * (schoolSortOrder === 'created_asc' ? 1 : -1);
  });
  const schoolCards = filteredSchools.map(school => {
    const canDeleteSchool = Number(school.studentCount || 0) === 0 && Number(school.adminCount || 0) === 0;
    const deleteSchoolTitle = canDeleteSchool
      ? 'Okulu sil'
      : 'Öğrencisi veya yetkili kullanıcısı olan okullar silinemez. Önce pasife alabilirsiniz.';
    return `
    <details class="panel school-management-card ${school.id === state.schoolId ? 'is-selected' : ''}">
      <summary class="school-management-heading">
        <div><span class="eyebrow">${escapeHtml(school.slug)}</span><h3>${escapeHtml(school.name)}</h3></div>
        <span class="status ${school.active ? '' : 'warning'}">${school.active ? 'Aktif' : 'Pasif'}</span>
      </summary>
      <div class="school-management-content">
        <div class="school-management-stats">
        <span><small>Öğrenci</small><strong>${school.studentCount}</strong></span>
        <span><small>Bu ay aktif</small><strong>${school.activeStudentCount}</strong></span>
        <span><small>Admin</small><strong>${school.adminCount}</strong></span>
        </div>
        <div class="school-management-actions">
        <button class="primary-button" type="button" data-action="select-school" data-id="${school.id}" ${school.id === state.schoolId ? 'disabled' : ''}>${school.id === state.schoolId ? 'Açık okul' : 'Okulu aç'}</button>
        <button class="secondary-button" type="button" data-action="invite-school-admin" data-id="${school.id}" ${school.active ? '' : 'disabled'}>Kullanıcı davet et</button>
        <button class="secondary-button" type="button" data-action="rename-school" data-id="${school.id}">Adını düzenle</button>
        <button class="secondary-button" type="button" data-action="toggle-school-status" data-id="${school.id}">${school.active ? 'Pasife al' : 'Aktifleştir'}</button>
        <button class="danger-button" type="button" data-action="delete-school" data-id="${school.id}" ${canDeleteSchool ? '' : 'disabled'} title="${deleteSchoolTitle}">Sil</button>
        </div>
      </div>
    </details>`;
  }).join('');
  return `<div class="page-stack">
    <div class="section-heading"><div><h2>Futbol okulları</h2><p>Süper Admin yönetim merkezi</p></div></div>
    <section class="stats-grid school-platform-summary">
      <article class="stat-card"><span class="label">Toplam okul</span><strong>${state.schools.length}</strong><small>${activeSchools} aktif okul</small></article>
      <article class="stat-card"><span class="label">Toplam öğrenci</span><strong>${totalStudents}</strong><small>${totalActiveStudents} aktif öğrenci · Tüm okullar</small></article>
    </section>
    <details class="panel school-create-panel">
      <summary class="panel-heading school-create-heading"><div><h3>Yeni okul ekle</h3><small class="muted">Okul kendi öğrencileri, grupları, aidatları ve muhasebesiyle ayrı oluşturulur.</small></div></summary>
      <form id="schoolCreateForm" class="school-create-form">
        <label>Okul adı<input name="schoolName" maxlength="120" placeholder="Örn. Çekmeköy Futbol Okulu" required></label>
        <label>Okul kodu<input name="schoolSlug" maxlength="80" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="cekmekoy-futbol" required><small>Küçük harf, rakam ve tire kullanın.</small></label>
        <label>Aylık aidat<input name="monthlyFeeAmount" type="number" min="1" step="1" value="${state.monthlyFeeAmount}" required></label>
        <button class="primary-button" type="submit">Okulu oluştur</button>
      </form>
    </details>
    <div class="toolbar school-toolbar"><label class="training-sort-control"><span>Durum</span><select id="schoolStatusFilter" aria-label="Okulları duruma göre filtrele"><option value="all" ${schoolStatusFilter === 'all' ? 'selected' : ''}>Tümü</option><option value="active" ${schoolStatusFilter === 'active' ? 'selected' : ''}>Aktif</option><option value="inactive" ${schoolStatusFilter === 'inactive' ? 'selected' : ''}>Pasif</option></select></label><label class="training-sort-control"><span>Sırala</span><select id="schoolSortOrder" aria-label="Okulları sırala"><option value="created_desc" ${schoolSortOrder === 'created_desc' ? 'selected' : ''}>Yeniden eskiye doğru sırala</option><option value="created_asc" ${schoolSortOrder === 'created_asc' ? 'selected' : ''}>Eskiden yeniye doğru sırala</option><option value="name_asc" ${schoolSortOrder === 'name_asc' ? 'selected' : ''}>A’dan Z’ye sırala</option><option value="name_desc" ${schoolSortOrder === 'name_desc' ? 'selected' : ''}>Z’den A’ya sırala</option></select></label><label class="school-search-control"><span class="sr-only">Okul ara</span><input id="schoolSearch" type="search" value="${escapeHtml(state.schoolSearchQuery)}" placeholder="Okul adı veya kodu ara" autocomplete="off"></label></div>
    <section class="school-management-grid">${schoolCards || `<div class="panel empty-state">${state.schools.length ? 'Aramanızla eşleşen okul bulunamadı.' : 'Henüz okul bulunmuyor.'}</div>`}</section>
  </div>`;
}

function subscriptionDateLabel(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return 'Belirlenmedi';
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function trialRemainingLabel(endsOn) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(endsOn || ''))) return '';
  const today = new Date(`${localDateValue()}T12:00:00`);
  const endDate = new Date(`${endsOn}T12:00:00`);
  const daysRemaining = Math.max(0, Math.round((endDate - today) / 86400000));
  return daysRemaining === 0 ? 'Bugün son gününüz.' : `${daysRemaining} gün kaldı.`;
}

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

function subscriptionStatusMarkup(status) {
  const tone = status === 'active' ? '' : status === 'trial' ? 'blue' : 'warning';
  return `<span class="status ${tone}">${SUBSCRIPTION_STATUSES[status] || 'Belirlenmedi'}</span>`;
}

function trialModeLabel(mode) {
  return TRIAL_MODES[mode] || 'Deneme';
}

function subscriptionPrice(_planCode, billingPeriod = 'monthly') {
  return STANDARD_SUBSCRIPTION_PRICES[billingPeriod] ?? STANDARD_SUBSCRIPTION_PRICES.monthly;
}

function onboardingPaymentAmountMarkup(billingPeriod = 'monthly') {
  const amount = subscriptionPrice('standard', billingPeriod);
  const months = SUBSCRIPTION_PERIODS[billingPeriod]?.months || 1;
  const regularAmount = subscriptionPrice('standard', 'monthly') * months;
  const discountRate = months > 1 && regularAmount > amount
    ? Math.round((1 - amount / regularAmount) * 100)
    : 0;
  return `Ödenecek tutar: <strong>${formatCurrency(amount)}</strong>${discountRate ? `<small>${subscriptionPeriodLabel(billingPeriod)} ödemede %${discountRate} indirim</small>` : ''}`;
}

function subscriptionPeriodLabel(billingPeriod) {
  return SUBSCRIPTION_PERIODS[billingPeriod]?.name || SUBSCRIPTION_PERIODS.monthly.name;
}

function subscriptionHistoryStatusLabel(status) {
  return ({ PENDING_REVIEW: 'İncelemede', APPROVED: 'Onaylandı', REJECTED: 'İptal edildi', PENDING_PAYMENT: 'Ödeme bekliyor', SCHEDULED: 'Planlandı', ACTIVE: 'Aktif', EXPIRED: 'Tamamlandı' })[status] || status || 'Kayıt';
}

function subscriptionHistoryStatusClass(status) {
  if (['PENDING_REVIEW', 'PENDING_PAYMENT'].includes(status)) return 'blue';
  if (status === 'REJECTED') return 'warning';
  return '';
}

function subscriptionHistorySection() {
  const rows = (state.subscriptionHistory || []).map(item => {
    const period = item.period || {};
    const status = item.status || period.status;
    const range = [period.starts_on, period.ends_on].filter(Boolean).map(subscriptionDateLabel).join(' – ');
    return `<article class="subscription-history-row">
      <div><strong>${subscriptionPeriodLabel(period.billing_period)}</strong><small>${range || 'Dönem bilgisi bekleniyor'}</small></div>
      <span>${formatCurrency(item.amount || period.amount || subscriptionPrice('standard', period.billing_period))}<small>${formatDateTime(item.created_at)}</small></span>
      <span class="status ${subscriptionHistoryStatusClass(status)}">${subscriptionHistoryStatusLabel(status)}</span>
    </article>`;
  }).join('');
  return `<section class="panel subscription-history-card"><div class="panel-heading"><div><h3>Abonelik geçmişi</h3><small class="muted">Ödeme bildirimi ve abonelik dönemlerinizi buradan takip edebilirsiniz.</small></div></div><div class="subscription-history-list">${rows || '<div class="empty-state">Henüz abonelik geçmişi bulunmuyor.</div>'}</div></section>`;
}

function subscriptionsView() {
  const schools = state.schools;
  const normalizedSearch = state.subscriptionSearchQuery.trim().toLocaleLowerCase('tr');
  const sortOrder = ['name_asc', 'name_desc', 'end_asc', 'end_desc'].includes(state.subscriptionSortOrder) ? state.subscriptionSortOrder : 'name_asc';
  const filteredSchools = schools
    .filter(school => {
      if (!normalizedSearch) return true;
      return `${school.name || ''} ${school.slug || ''}`.toLocaleLowerCase('tr').includes(normalizedSearch);
    })
    .sort((firstSchool, secondSchool) => {
      if (sortOrder === 'end_asc' || sortOrder === 'end_desc') {
        const firstDate = firstSchool.subscriptionLastActivityAt || '0000-01-01T00:00:00';
        const secondDate = secondSchool.subscriptionLastActivityAt || '0000-01-01T00:00:00';
        const compared = firstDate.localeCompare(secondDate);
        return sortOrder === 'end_asc' ? compared : -compared;
      }
      const compared = String(firstSchool.name || '').localeCompare(String(secondSchool.name || ''), 'tr');
      return sortOrder === 'name_asc' ? compared : -compared;
    });
  const activeCount = schools.filter(school => school.subscriptionStatus === 'active').length;
  const trialCount = schools.filter(school => school.subscriptionStatus === 'trial').length;
  const stoppedCount = schools.filter(school => school.subscriptionStatus === 'stopped').length;
  const recurringTotal = schools
    .filter(school => school.subscriptionStatus === 'active')
    .reduce((total, school) => {
      const billingPeriod = school.subscriptionBillingPeriod || 'monthly';
      const periodPrice = Number(school.subscriptionPeriodPrice) || subscriptionPrice('standard', billingPeriod);
      return total + periodPrice / (SUBSCRIPTION_PERIODS[billingPeriod]?.months || 1);
    }, 0);
  const rows = filteredSchools.map(school => `<div class="subscription-school-row">
    <div><strong>${escapeHtml(school.name)}</strong><small>${escapeHtml(school.slug)}</small></div>
    ${subscriptionStatusMarkup(school.subscriptionStatus)}
    <span>${school.subscriptionStatus === 'trial' ? 'Ücretsiz' : formatCurrency(school.subscriptionPeriodPrice || subscriptionPrice('standard', school.subscriptionBillingPeriod))}<small>${school.subscriptionStatus === 'trial' ? trialModeLabel(school.subscriptionTrialMode) : subscriptionPeriodLabel(school.subscriptionBillingPeriod)}</small></span>
    <span>${subscriptionDateLabel(school.subscriptionEndsOn)}<small>Bitiş / yenileme</small></span>
    <div class="subscription-row-actions">
      ${school.subscriptionStatus === 'active' ? `<button class="secondary-button" type="button" data-action="extend-subscription" data-id="${school.id}">Süre uzat</button>` : ''}
      <button class="secondary-button" type="button" data-action="edit-subscription" data-id="${school.id}">Düzenle</button>
    </div>
  </div>`).join('');
  return `<div class="page-stack">
    <div class="section-heading"><div><h2>Abonelikler</h2><p>Okul bazında ücret ve yenileme takibi</p></div></div>
    <section class="stats-grid subscription-summary-grid">
      <article class="stat-card"><span class="label">Aktif abonelik</span><strong>${activeCount}</strong><small>${trialCount} deneme hesabı</small></article>
      <article class="stat-card"><span class="label">Durdurulan abonelik</span><strong>${stoppedCount}</strong><small>Erişimi durdurulan okul</small></article>
      <article class="stat-card"><span class="label">Aylık eşdeğer gelir</span><strong>${formatCurrency(recurringTotal)}</strong><small>Aktif ve deneme abonelikleri</small></article>
    </section>
    <section class="panel subscription-schools-panel"><div class="panel-heading"><div><h3>Okul abonelikleri</h3><small class="muted">Dönem ücreti ödeme dönemine göre otomatik uygulanır.</small></div><span class="status blue">${filteredSchools.length} / ${schools.length} okul</span></div>
      <div class="toolbar subscription-toolbar"><label class="training-sort-control"><span>Sırala</span><select id="subscriptionSortOrder" aria-label="Abonelikleri sırala"><option value="name_asc" ${sortOrder === 'name_asc' ? 'selected' : ''}>A’dan Z’ye</option><option value="name_desc" ${sortOrder === 'name_desc' ? 'selected' : ''}>Z’den A’ya</option><option value="end_asc" ${sortOrder === 'end_asc' ? 'selected' : ''}>Son ödeme · Eski-yeni</option><option value="end_desc" ${sortOrder === 'end_desc' ? 'selected' : ''}>Son ödeme · Yeni-eski</option></select></label><input class="search-input" id="subscriptionSearch" type="search" value="${escapeHtml(state.subscriptionSearchQuery)}" placeholder="Okul adı veya kodu ara" aria-label="Aboneliklerde okul ara"></div>
      <div class="subscription-school-list">${rows || `<div class="empty-state">${schools.length ? 'Aramanızla eşleşen abonelik bulunamadı.' : 'Henüz okul bulunmuyor.'}</div>`}</div>
    </section>
  </div>`;
}

function applicationStatusLabel(status) {
  return ({ PENDING: 'Bekliyor', INFO_REQUESTED: 'Bilgi bekleniyor', APPROVED: 'Onaylandı', REJECTED: 'Reddedildi' })[status] || status;
}

function applicationsView() {
  const normalizedSearch = state.applicationSearchQuery.trim().toLocaleLowerCase('tr');
  const statusFilter = ['all', 'pending', 'approved', 'rejected'].includes(state.applicationStatusFilter) ? state.applicationStatusFilter : 'all';
  const sortOrder = ['name_asc', 'name_desc', 'created_desc', 'created_asc'].includes(state.applicationSortOrder) ? state.applicationSortOrder : 'created_desc';
  const filteredApplications = state.schoolApplications.filter(application => {
    if (statusFilter === 'pending' && !['PENDING', 'INFO_REQUESTED'].includes(application.status)) return false;
    if (statusFilter === 'approved' && application.status !== 'APPROVED') return false;
    if (statusFilter === 'rejected' && application.status !== 'REJECTED') return false;
    if (!normalizedSearch) return true;
    return `${application.school_name || ''} ${application.applicant_name || ''}`.toLocaleLowerCase('tr').includes(normalizedSearch);
  }).sort((a, b) => {
    if (sortOrder === 'name_asc' || sortOrder === 'name_desc') {
      return String(a.school_name || '').localeCompare(String(b.school_name || ''), 'tr', { sensitivity: 'base' }) * (sortOrder === 'name_asc' ? 1 : -1);
    }
    const aTime = new Date(a.created_at || 0).getTime();
    const bTime = new Date(b.created_at || 0).getTime();
    return (aTime - bTime) * (sortOrder === 'created_asc' ? 1 : -1);
  });
  const rows = filteredApplications.map(application => {
    const canReview = ['PENDING', 'INFO_REQUESTED'].includes(application.status);
    const location = [application.country || 'Türkiye', application.city, application.district].filter(Boolean).join(' · ');
    const approvedAt = application.status === 'APPROVED' && application.reviewed_at
      ? `<small class="muted">Onay: ${formatDateTime(application.reviewed_at)}</small>`
      : '';
    return `<article class="panel application-card">
      <div class="panel-heading"><div><span class="eyebrow">${escapeHtml(location)}</span><h3>${escapeHtml(application.school_name)}</h3><small>${escapeHtml(application.applicant_name)} · ${escapeHtml(application.email)} · ${escapeHtml(application.phone)}</small></div><span class="status ${application.status === 'APPROVED' ? '' : application.status === 'REJECTED' ? 'warning' : 'blue'}">${applicationStatusLabel(application.status)}</span></div>
      ${application.address ? `<p class="muted"><strong>Adres:</strong> ${escapeHtml(application.address)}</p>` : ''}
      ${application.note ? `<p>${escapeHtml(application.note)}</p>` : ''}
      ${application.customer_message ? `<p class="muted"><strong>Müşteriye not:</strong> ${escapeHtml(application.customer_message)}</p>` : ''}
      ${application.internal_note ? `<p class="muted"><strong>İç not:</strong> ${escapeHtml(application.internal_note)}</p>` : ''}
      <div class="application-card-dates"><small class="muted">Başvuru: ${formatDateTime(application.created_at)}</small>${approvedAt}</div>
      ${canReview ? `<div class="subscription-row-actions"><button class="danger-button" type="button" data-action="reject-application" data-id="${application.id}">Reddet</button><button class="primary-button" type="button" data-action="approve-application" data-id="${application.id}">Onayla ve davet et</button></div>` : ''}
    </article>`;
  }).join('');
  return `<div class="page-stack"><div class="section-heading"><div><h2>Yeni müşteri başvuruları</h2><p>Onayda okul ve ilk Admin hesabı oluşturulur; başvuru sahibine şifre kurulum bağlantısı gönderilir.</p></div><span class="status blue">${state.schoolApplications.filter(item => item.status === 'PENDING').length} yeni</span></div><div class="toolbar application-toolbar"><div class="application-filter-row"><label class="training-sort-control"><span>Durum</span><select id="applicationStatusFilter" aria-label="Başvuruları duruma göre filtrele"><option value="all" ${statusFilter === 'all' ? 'selected' : ''}>Tümü</option><option value="pending" ${statusFilter === 'pending' ? 'selected' : ''}>Bekliyor</option><option value="approved" ${statusFilter === 'approved' ? 'selected' : ''}>Onaylandı</option><option value="rejected" ${statusFilter === 'rejected' ? 'selected' : ''}>Reddedildi</option></select></label><label class="training-sort-control"><span>Sırala</span><select id="applicationSortOrder" aria-label="Başvuruları sırala"><option value="created_desc" ${sortOrder === 'created_desc' ? 'selected' : ''}>Başvuru tarihi · Yeni-eski</option><option value="created_asc" ${sortOrder === 'created_asc' ? 'selected' : ''}>Başvuru tarihi · Eski-yeni</option><option value="name_asc" ${sortOrder === 'name_asc' ? 'selected' : ''}>A’dan Z’ye</option><option value="name_desc" ${sortOrder === 'name_desc' ? 'selected' : ''}>Z’den A’ya</option></select></label></div><div class="application-search-row"><input class="search-input" id="applicationSearch" type="search" value="${escapeHtml(state.applicationSearchQuery)}" placeholder="Futbol okulu veya yetkili kişi ara" aria-label="Başvurularda ara"><span class="muted" aria-live="polite">${filteredApplications.length} / ${state.schoolApplications.length} başvuru</span></div></div><section class="page-stack application-card-list">${rows || `<div class="panel empty-state">${state.schoolApplications.length ? 'Aramanızla eşleşen başvuru bulunamadı.' : 'İncelenecek başvuru bulunmuyor.'}</div>`}</section></div>`;
}

function subscriptionPaymentsView() {
  const statusFilter = ['all', 'pending', 'approved', 'rejected'].includes(state.subscriptionPaymentStatusFilter) ? state.subscriptionPaymentStatusFilter : 'all';
  const sortOrder = ['created_desc', 'created_asc'].includes(state.subscriptionPaymentSortOrder) ? state.subscriptionPaymentSortOrder : 'created_desc';
  const normalizedSearch = state.subscriptionPaymentSearchQuery.trim().toLocaleLowerCase('tr');
  const filteredReports = state.subscriptionPaymentReports.filter(report => {
    if (statusFilter === 'pending') return report.status === 'PENDING_REVIEW';
    if (statusFilter === 'approved') return report.status === 'APPROVED';
    if (statusFilter === 'rejected') return report.status === 'REJECTED';
    return true;
  }).filter(report => {
    if (!normalizedSearch) return true;
    const schoolRelation = Array.isArray(report.schools) ? report.schools[0] : report.schools;
    const schoolName = schoolRelation?.name || state.schools.find(school => school.id === report.school_id)?.name || '';
    return `${schoolName} ${report.payer_note || ''} ${report.amount || ''}`.toLocaleLowerCase('tr').includes(normalizedSearch);
  }).sort((a, b) => {
    const aTime = new Date(a.created_at || 0).getTime();
    const bTime = new Date(b.created_at || 0).getTime();
    return (aTime - bTime) * (sortOrder === 'created_asc' ? 1 : -1);
  });
  const rows = filteredReports.map(report => {
    const period = report.school_subscription_periods || {};
    const schoolRelation = Array.isArray(report.schools) ? report.schools[0] : report.schools;
    const schoolName = schoolRelation?.name || state.schools.find(school => school.id === report.school_id)?.name || 'Okul';
    const pending = report.status === 'PENDING_REVIEW';
    return `<article class="panel application-card"><div class="panel-heading"><div><span class="eyebrow">HAVALE BİLDİRİMİ</span><h3>${escapeHtml(schoolName)}</h3><small>${subscriptionPeriodLabel(period.billing_period)} · ${subscriptionDateLabel(period.starts_on)} – ${subscriptionDateLabel(period.ends_on)}</small></div><span class="status ${pending ? 'blue' : report.status === 'APPROVED' ? '' : 'warning'}">${pending ? 'İncelemede' : report.status === 'APPROVED' ? 'Onaylandı' : 'İptal edildi'}</span></div><strong>${formatCurrency(report.amount)}</strong>${report.payer_note ? `<p class="muted">${escapeHtml(report.payer_note)}</p>` : ''}<small class="muted">Bildirim: ${formatDateTime(report.created_at)}</small>${pending ? `<div class="subscription-row-actions"><button class="danger-button" type="button" data-action="review-payment-report" data-approved="false" data-id="${report.id}">İptal et</button><button class="primary-button" type="button" data-action="review-payment-report" data-approved="true" data-id="${report.id}">Ödemeyi onayla</button></div>` : ''}</article>`;
  }).join('');
  return `<div class="page-stack"><div class="section-heading"><div><h2>Ödemeler ve abonelikler</h2><p>Havale bildirimi tek başına aboneliği aktifleştirmez; onay burada verilir.</p></div></div><div class="toolbar application-toolbar"><div class="application-filter-row"><label class="training-sort-control"><span>Durum</span><select id="subscriptionPaymentStatusFilter" aria-label="Ödemeleri duruma göre filtrele"><option value="all" ${statusFilter === 'all' ? 'selected' : ''}>Tümü</option><option value="pending" ${statusFilter === 'pending' ? 'selected' : ''}>Bekliyor</option><option value="approved" ${statusFilter === 'approved' ? 'selected' : ''}>Onaylandı</option><option value="rejected" ${statusFilter === 'rejected' ? 'selected' : ''}>İptal edildi</option></select></label><label class="training-sort-control"><span>Sırala</span><select id="subscriptionPaymentSortOrder" aria-label="Ödemeleri tarihe göre sırala"><option value="created_desc" ${sortOrder === 'created_desc' ? 'selected' : ''}>Bildirim tarihi · Yeni-eski</option><option value="created_asc" ${sortOrder === 'created_asc' ? 'selected' : ''}>Bildirim tarihi · Eski-yeni</option></select></label></div><div class="application-search-row"><input class="search-input" id="subscriptionPaymentSearch" type="search" value="${escapeHtml(state.subscriptionPaymentSearchQuery)}" placeholder="Okul adı, açıklama veya tutar ara" aria-label="Ödemelerde ara"><span class="muted" aria-live="polite">${filteredReports.length} / ${state.subscriptionPaymentReports.length} ödeme</span></div></div><section class="page-stack application-card-list payment-report-card-list">${rows || '<div class="panel empty-state">Bu filtreyle eşleşen ödeme bildirimi bulunmuyor.</div>'}</section></div>`;
}

function onboardingView() {
  const onboarding = state.onboarding;
  const paymentPending = onboarding?.status === 'PAYMENT_PENDING';
  const trialStarted = onboarding?.status === 'TRIAL_STARTED';
  const subscriptionActive = state.schoolSubscriptionStatus === 'active';
  const approvedPeriod = state.approvedSubscriptionPeriod;
  if (subscriptionActive && !state.onboardingPurchaseOpen) {
    const subscriptionEndsOn = state.schoolSubscriptionEndsOn;
    const remaining = trialRemainingLabel(subscriptionEndsOn);
    const paymentPendingNotice = paymentPending ? `<p class="onboarding-trial-remaining"><strong>Yeni ödeme bildiriminiz incelemede.</strong><br>sasa-f.com ödemeyi onayladığında satın aldığınız süre mevcut abonelik bitiş tarihinize eklenecek.</p>` : '';
    return `<div class="page-stack"><section class="panel onboarding-card"><span class="eyebrow">ABONELİĞİNİZ AKTİF</span><h2>Standart üyeliğiniz devam ediyor.</h2><p>Abonelik sürenizi ve yenileme bilgilerinizi buradan takip edebilirsiniz.</p><p class="onboarding-trial-remaining"><strong>Abonelik süresi:</strong> ${subscriptionPeriodLabel(state.schoolSubscriptionBillingPeriod)}<br><strong>Abonelik bitişi:</strong> ${subscriptionDateLabel(subscriptionEndsOn)}${remaining ? ` · ${remaining}` : ''}</p>${paymentPendingNotice}<div class="onboarding-actions"><button class="primary-button" type="button" data-action="complete-onboarding">Yönetim ekranına geç</button><button class="secondary-button" type="button" data-action="open-subscription-purchase">Süre uzat</button></div></section>${subscriptionHistorySection()}</div>`;
  }
  if (approvedPeriod && !state.onboardingPurchaseOpen) {
    const scheduledStart = subscriptionDateLabel(approvedPeriod.starts_on);
    const scheduledEnd = subscriptionDateLabel(approvedPeriod.ends_on);
    const trialEndsOn = subscriptionDateLabel(state.schoolSubscriptionEndsOn);
    return `<div class="page-stack"><section class="panel onboarding-card"><span class="eyebrow">ÖDEMENİZ ONAYLANDI</span><h2>Aboneliğiniz planlandı.</h2><p>Mevcut deneme süreniz <strong>${trialEndsOn}</strong> tarihinde bittiğinde üyeliğiniz otomatik olarak başlayacaktır.</p><p class="onboarding-trial-remaining"><strong>Abonelik süresi:</strong> ${subscriptionPeriodLabel(approvedPeriod.billing_period)}<br><strong>Başlangıç:</strong> ${scheduledStart}<br><strong>Bitiş / yenileme:</strong> ${scheduledEnd}</p><button class="primary-button" type="button" data-action="complete-onboarding">Yönetim ekranına geç</button></section>${subscriptionHistorySection()}</div>`;
  }
  if (trialStarted && !state.onboardingPurchaseOpen) {
    const trialEndsOn = state.schoolSubscriptionEndsOn;
    const remaining = trialRemainingLabel(trialEndsOn);
    return `<div class="page-stack"><section class="panel onboarding-card"><span class="eyebrow">DENEME BAŞLATILDI</span><h2>Standart üyeliğinizi 3 ay boyunca ücretsiz deneyebilirsiniz.</h2><p>Deneme sonunda aboneliğinizi başlatabilirsiniz.</p>${remaining ? `<p class="onboarding-trial-remaining"><strong>Deneme bitişi:</strong> ${subscriptionDateLabel(trialEndsOn)} · ${remaining}</p>` : ''}<div class="onboarding-actions"><button class="primary-button" type="button" data-action="complete-onboarding">Yönetim ekranına geç</button><button class="secondary-button" type="button" data-action="open-subscription-purchase">Satın al</button></div></section>${subscriptionHistorySection()}</div>`;
  }
  if (paymentPending) return `<div class="page-stack"><section class="panel onboarding-card"><span class="eyebrow">ÖDEME İNCELEMEDE</span><h2>Havale bildiriminiz alındı.</h2><p>sasa-f.com ödemeyi onayladığında aboneliğiniz etkinleşir. Bu aşamada ödeme talep edilmez.</p></section>${subscriptionHistorySection()}</div>`;
  const bankAccounts = state.subscriptionBankAccounts?.length
    ? `<div class="parent-bank-account-list">${state.subscriptionBankAccounts.map((account, index) => `<article class="parent-bank-account ${parentBankThemeClass(account.bankName)}"><strong>${escapeHtml(account.bankName)}</strong><small>${escapeHtml(account.accountHolder)}</small><code>${escapeHtml(formatIban(account.iban))}</code><button class="secondary-button" type="button" data-action="copy-subscription-iban" data-account-index="${index}">IBAN'ı kopyala</button></article>`).join('')}</div>`
    : '<p class="muted">Havale hesabı bilgileri henüz tanımlanmadı. Ödeme bildirimi oluşturmak için yetkili ile iletişime geçin.</p>';
  const trialChoice = (trialStarted || subscriptionActive) ? '' : `<section class="panel onboarding-card"><span class="eyebrow">HOŞ GELDİNİZ</span><h2>Aboneliğinizi nasıl başlatmak istersiniz?</h2><p>Standart üyeliğinizi 3 ay ücretsiz deneyebilir veya satın alabilirsiniz.</p><button class="primary-button" type="button" data-action="start-school-trial">3 ay ücretsiz dene</button></section>`;
  const purchaseTitle = subscriptionActive ? 'Aboneliğinizi uzatın' : trialStarted ? 'Aboneliğinizi başlatın' : 'Aboneliği başlat';
  return `<div class="page-stack">${trialChoice}<section class="panel onboarding-card"><h3>${purchaseTitle}</h3><label>Ödeme dönemi<select id="onboardingBillingPeriod"><option value="monthly">1 aylık</option><option value="quarterly">3 aylık</option><option value="yearly">Yıllık</option></select></label><p class="onboarding-payment-amount" id="onboardingPaymentAmount" aria-live="polite">${onboardingPaymentAmountMarkup()}</p><div class="payment-method-list"><span class="status blue">Havale</span><button class="secondary-button" type="button" disabled>Kredi kartı · Yakında</button></div>${bankAccounts}<label>Havale gönderen ad soyad<input id="onboardingPayerName" maxlength="120" autocomplete="name" placeholder="Ödemeyi gönderen kişinin adı soyadı"></label><button class="primary-button" type="button" data-action="report-subscription-payment">Ödemeyi yaptım</button><small class="muted">Ödeme bildirimi gönderildikten sonra sasa-f.com tarafından onayı beklenir; abonelik otomatik olarak açılmaz.</small></section>${subscriptionHistorySection()}</div>`;
}

function settingsView() {
  const subscriptionSettingsMarkup = state.role === 'super_admin'
    ? `<button class="panel settings-link-card" type="button" data-page="subscriptions">
        <span class="settings-link-icon" aria-hidden="true">${MENU_ICONS.subscriptions}</span>
        <span class="settings-link-copy"><strong>Abonelikler</strong><small>Okulların ücret ve abonelik durumlarını yönetin.</small></span>
        <span class="settings-link-arrow" aria-hidden="true">›</span>
      </button>`
    : '';
  const adminSubscriptionMarkup = state.role === 'admin'
    ? `<button class="panel settings-link-card" type="button" data-page="onboarding">
        <span class="settings-link-icon" aria-hidden="true">${MENU_ICONS.subscriptions}</span>
        <span class="settings-link-copy"><strong>Abonelik</strong><small>Deneme sürenizi ve abonelik seçeneklerinizi görüntüleyin.</small></span>
        <span class="settings-link-arrow" aria-hidden="true">›</span>
      </button>`
    : '';
  const coachInviteMarkup = state.role === 'admin'
    ? `<button class="panel settings-link-card" type="button" data-action="invite-school-admin" data-id="${escapeHtml(state.schoolId || '')}">
        <span class="settings-link-icon" aria-hidden="true">${MENU_ICONS.coach || MENU_ICONS.student}</span>
        <span class="settings-link-copy"><strong>Antrenör davet et</strong><small>Ad soyad ve e-posta ile okulunuza antrenör yetkisi gönderin.</small></span>
        <span class="settings-link-arrow" aria-hidden="true">›</span>
      </button>`
    : '';
  return `<div class="page-stack">
    <div class="section-heading"><div><h2>Ayarlar</h2><p>${escapeHtml(state.schoolName || 'Futbol okulu')} ayarlarını yönetin</p></div></div>
    <section class="settings-hub-grid" aria-label="Ayarlar seçenekleri">
      ${subscriptionSettingsMarkup}
      ${state.role === 'super_admin' ? `<button class="panel settings-link-card" type="button" data-page="subscriptionBankSettings">
        <span class="settings-link-icon" aria-hidden="true">${MENU_ICONS.bank}</span>
        <span class="settings-link-copy"><strong>Abonelik Havale Bilgileri</strong><small>Okul yöneticilerinin abonelik ödemesinde göreceği hesapları yönetin.</small></span>
        <span class="settings-link-arrow" aria-hidden="true">›</span>
      </button>` : ''}
      ${adminSubscriptionMarkup}
      <button class="panel settings-link-card" type="button" data-page="bankSettings">
        <span class="settings-link-icon" aria-hidden="true">${MENU_ICONS.bank}</span>
        <span class="settings-link-copy"><strong>Aidat Havale Bilgileri</strong><small>Velilerin aidat ödemesinde göreceği banka ve IBAN bilgilerini yönetin.</small></span>
        <span class="settings-link-arrow" aria-hidden="true">›</span>
      </button>
      ${coachInviteMarkup}
      ${state.role === 'super_admin' ? `<button class="panel settings-link-card" type="button" data-page="emailLogs">
        <span class="settings-link-icon" aria-hidden="true">✉</span>
        <span class="settings-link-copy"><strong>E-posta Kayıtları</strong><small>Sistemden gönderilen davet ve hatırlatma maillerini görüntüleyin.</small></span>
        <span class="settings-link-arrow" aria-hidden="true">›</span>
      </button>` : ''}
      <button class="panel settings-link-card" type="button" data-page="help">
        <span class="settings-link-icon settings-help-icon" aria-hidden="true">?</span>
        <span class="settings-link-copy"><strong>Yardım</strong><small>Kullanım videolarını ve sık sorulan soruları görüntüleyin.</small></span>
        <span class="settings-link-arrow" aria-hidden="true">›</span>
      </button>
    </section>
  </div>`;
}

function helpView() {
  const topics = [
    ['Futbol okulu olarak nasıl başvurulur?', 'Futbol okulu başvurusunun nasıl oluşturulduğunu adım adım izleyin.'],
    ['Şifre nasıl oluşturulur?', 'Davet e-postasındaki bağlantıyı kullanarak hesabınızı nasıl etkinleştireceğinizi izleyin.'],
    ['Ücretsiz deneme nasıl başlatılır?', '3 aylık ücretsiz denemeyi başlatma ve abonelik seçeneklerini görüntüleme adımlarını izleyin.'],
    ['Yeni öğrenci nasıl eklenir?', 'Öğrenci, veli iletişim bilgileri ve aidat bilgilerinin nasıl kaydedildiğini izleyin.']
  ];
  const cards = topics.map(([question, description]) => `<details class="panel help-topic-card"><summary><span>${escapeHtml(question)}</span><span class="disclosure-chevron" aria-hidden="true">⌄</span></summary><div class="help-topic-content"><p>${escapeHtml(description)}</p><div class="help-video-placeholder"><span aria-hidden="true">▶</span><strong>Kullanım videosu</strong><small>Video bağlantısı eklendiğinde burada izlenebilecek.</small></div></div></details>`).join('');
  return `<div class="page-stack"><div class="section-heading"><div><h2>Yardım</h2><p>Merak ettiğiniz konuyu açarak kullanım videosuna ulaşabilirsiniz.</p></div></div><section class="help-topic-list" aria-label="Yardım konuları">${cards}</section></div>`;
}

function bankAccountSettingsCardMarkup(account = {}, index = 0, accountCount = 1, isUnsaved = false) {
  return `<fieldset class="bank-account-settings-card ${parentBankThemeClass(account.bankName)}" ${isUnsaved ? 'data-bank-unsaved="true"' : ''}>
    <div class="bank-account-settings-heading"><strong>Hesap ${index + 1}</strong><button class="text-button bank-account-remove-button" type="button" data-action="remove-bank-account" ${accountCount === 1 ? 'hidden' : ''}>Kaldır</button></div>
    <div class="bank-account-settings-fields">
      <label>Banka adı<input name="bankName${index}" data-bank-field="bankName" maxlength="80" value="${escapeHtml(account.bankName || '')}" placeholder="Banka adını yazın" autocomplete="off"></label>
      <label>Hesap sahibi<input name="accountHolder${index}" data-bank-field="accountHolder" maxlength="120" value="${escapeHtml(account.accountHolder || '')}" placeholder="Resmî hesap sahibini yazın" autocomplete="off"></label>
      <label class="bank-settings-iban">IBAN<span class="iban-prefix-control"><span class="iban-prefix" aria-hidden="true">TR</span><input name="iban${index}" data-bank-field="iban" maxlength="32" inputmode="text" autocapitalize="characters" value="${escapeHtml(formatTurkishIbanLocalPart(normalizeIban(account.iban || '').slice(2)))}" placeholder="__ ____ ____ ____ ____ ____ __" autocomplete="off" spellcheck="false" aria-label="IBAN numarası"></span></label>
    </div>
  </fieldset>`;
}

function syncBankAccountFormControls(form) {
  const cards = [...form.querySelectorAll('.bank-account-settings-card')];
  cards.forEach((card, index) => {
    card.querySelector('.bank-account-settings-heading strong').textContent = `Hesap ${index + 1}`;
    card.querySelectorAll('[data-bank-field]').forEach(input => { input.name = `${input.dataset.bankField}${index}`; });
    card.querySelector('[data-action="remove-bank-account"]').hidden = cards.length === 1;
  });
  const addButton = form.querySelector('[data-action="add-bank-account"]');
  addButton.hidden = cards.length >= 4 || cards.some(card => card.dataset.bankUnsaved === 'true');
}

function bankSettingsView() {
  const hasSavedAccount = state.schoolBankAccounts.length > 0;
  const bankAccounts = hasSavedAccount ? state.schoolBankAccounts.slice(0, 4) : [{}];
  const accountFields = bankAccounts.map((account, index) => bankAccountSettingsCardMarkup(account, index, bankAccounts.length, !hasSavedAccount)).join('');
  return `<div class="page-stack">
    <div class="section-heading"><div><h2>Aidat havale bilgileri</h2><p>${escapeHtml(state.schoolName || 'Futbol okulu')} için veli ödeme hesabı</p></div></div>
    <section class="panel bank-settings-panel">
      <div class="panel-heading"><div><h3>Aidat havale bilgileri</h3><small class="muted">Velilere gösterilmek üzere en fazla 4 doğrulanmış hesap ekleyebilirsiniz.</small></div></div>
      <form id="schoolBankSettingsForm" class="bank-settings-form">
        <div class="bank-account-settings-list">${accountFields}</div>
        <div class="bank-settings-actions"><button class="secondary-button" type="button" data-action="add-bank-account" ${!hasSavedAccount || bankAccounts.length >= 4 ? 'hidden' : ''}>+ Hesap Ekle</button><button class="primary-button" type="submit">Kaydet</button></div>
      </form>
      <small class="form-hint settings-form-hint">Her hesapta üç alan birlikte kaydedilir. Tamamen boş bırakılan hesaplar gösterilmez. Kaydetmeden önce IBAN ve hesap sahibini bankanızdan doğrulayın.</small>
    </section>
  </div>`;
}

function subscriptionBankSettingsView() {
  const hasSavedAccount = state.subscriptionBankAccounts.length > 0;
  const bankAccounts = hasSavedAccount ? state.subscriptionBankAccounts.slice(0, 4) : [{}];
  const accountFields = bankAccounts.map((account, index) => bankAccountSettingsCardMarkup(account, index, bankAccounts.length, !hasSavedAccount)).join('');
  return `<div class="page-stack">
    <div class="section-heading"><div><h2>Abonelik havale bilgileri</h2><p>Okul yöneticilerinin abonelik ödemesinde göreceği hesaplar</p></div></div>
    <section class="panel bank-settings-panel">
      <div class="panel-heading"><div><h3>Havale bilgileri</h3><small class="muted">Yeni okul başvurusu yapan yöneticilere gösterilmek üzere en fazla 4 hesap ekleyebilirsiniz.</small></div></div>
      <form id="subscriptionBankSettingsForm" class="bank-settings-form">
        <div class="bank-account-settings-list">${accountFields}</div>
        <div class="bank-settings-actions"><button class="secondary-button" type="button" data-action="add-bank-account" ${!hasSavedAccount || bankAccounts.length >= 4 ? 'hidden' : ''}>+ Hesap Ekle</button><button class="primary-button" type="submit">Kaydet</button></div>
      </form>
      <small class="form-hint settings-form-hint">Bu bilgiler yalnızca abonelik ödemesi ekranında gösterilir; velilerin aidat hesaplarından bağımsızdır.</small>
      <div class="bank-settings-actions"><button class="secondary-button" type="button" data-action="send-subscription-reminder-test-email">00vetmaster00+iskelefb@gmail.com adresine deneme maili ve bildirimi gönder</button></div>
    </section>
  </div>`;
}

function dashboardView() {
  if (state.role === 'parent') return parentDashboard();
  if (isCoachRole()) return coachDashboard();
  const activeStudents = state.students.filter(isActiveStudent);
  const pendingFeeStudents = state.students.filter(studentHasFeeDebt);
  const pendingFeeAmount = pendingFeeStudents.reduce((total, student) => total + unpaidFeePeriods(student).reduce((studentTotal, month) => studentTotal + monthlyFeeAmount(student, month), 0), 0);
  const currentMonth = feeMonthKey();
  const currentMonthEntries = state.accountingEntries.filter(entry => String(entry.date || '').startsWith(currentMonth));
  const currentMonthNet = currentMonthEntries.reduce((total, entry) => total + (entry.kind === 'expense' ? -entry.amount : entry.amount), 0);
  const plannedTrainings = sortedTrainings(
    state.trainings.filter(training => training.date >= localDateValue())
  );
  return `<div class="page-stack">
    ${dashboardNotificationPromptMarkup()}
    <div class="section-heading"><div><h2>Bugünün kulüp özeti</h2><p>${new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' }).format(new Date())} · Son güncelleme şimdi</p></div></div>
    <section class="stats-grid club-summary-grid">
      <button class="stat-card dashboard-navigation-card" type="button" data-page="students" aria-label="Öğrenciler sayfasına git"><span class="label">Aktif öğrenci</span><strong>${activeStudents.length} / ${state.students.length}</strong><small>${GROUPS.length} grup</small></button>
      <button class="stat-card dashboard-navigation-card" type="button" data-page="trainings" aria-label="Antrenman takvimine git"><span class="label">Planlanan antrenman</span><strong>${plannedTrainings.length}</strong><small>Takvime git</small></button>
      <button class="stat-card dashboard-navigation-card" type="button" data-action="pending-fees" aria-label="Bekleyen aidatlara git"><span class="label">Bekleyen aidat</span><strong>${formatCurrency(pendingFeeAmount)}</strong><small>${pendingFeeStudents.length} öğrenci</small></button>
      <button class="stat-card dashboard-navigation-card" type="button" data-page="accounting" aria-label="Muhasebe sayfasına git"><span class="label">Aylık net durum</span><strong>${formatCurrency(currentMonthNet)}</strong><small>${currentMonthEntries.length} muhasebe kaydı</small></button>
    </section>
    <section class="dashboard-grid dashboard-grid-single">
      <article class="panel"><div class="panel-heading"><h3>Planlanan antrenmanlar</h3><button class="text-button" data-page="trainings">Tüm takvim</button></div>${plannedTrainings.slice(0, 4).map(t => `<div class="list-row training-summary-row"><span class="training-date-time"><small>${formatTrainingDate(t.date)}</small><b>${t.time}</b></span><div><strong>${t.group} · ${t.title}</strong><small>${t.coach} · ${t.field}</small></div><span class="status">${trainingAttendanceLabel(t)}</span></div>`).join('') || '<div class="empty-state">Planlanmış güncel antrenman bulunmuyor.</div>'}</article>
    </section>
    <section class="panel"><div class="panel-heading"><h3>İşlem bekleyen aidatlar</h3><button class="text-button" data-page="fees">Tümünü gör</button></div>${pendingFeeStudents.slice(0, 4).map(s => `<div class="list-row">${studentAvatarMarkup(s)}<div>${studentNameLink(s)}<span class="inline-separator" aria-hidden="true">•</span><small>Grup: ${s.group}${s.parent ? ` · Veli: ${s.parent}` : ''}</small></div><div class="fee-month-badges" aria-label="Ödenmemiş aylar">${unpaidFeePeriods(s).map(month => `<span class="status danger">${formatFeeMonth(month)}</span>`).join('')}</div></div>`).join('')}</section>
  </div>`;
}

function coachDashboard() {
  const plannedTrainings = sortedTrainings(state.trainings.filter(training => training.date >= localDateValue()));
  const recordedTrainings = state.attendanceRecords.length;
  const groupsWithStudents = new Set(state.students.map(student => student.group).filter(Boolean)).size;
  return `<div class="page-stack">
    ${dashboardNotificationPromptMarkup()}
    <div class="section-heading"><div><h2>Antrenör özeti</h2><p>${new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' }).format(new Date())} · Son güncelleme şimdi</p></div></div>
    <section class="stats-grid club-summary-grid">
      <button class="stat-card dashboard-navigation-card" type="button" data-page="students" aria-label="Öğrenciler sayfasına git"><span class="label">Öğrenci</span><strong>${state.students.length}</strong><small>${groupsWithStudents} grup</small></button>
      <button class="stat-card dashboard-navigation-card" type="button" data-page="trainings" aria-label="Antrenman takvimine git"><span class="label">Planlanan antrenman</span><strong>${plannedTrainings.length}</strong><small>Takvime git</small></button>
      <button class="stat-card dashboard-navigation-card" type="button" data-page="attendance" aria-label="Yoklama sayfasına git"><span class="label">Kayıtlı yoklama</span><strong>${recordedTrainings}</strong><small>Yoklamaya git</small></button>
    </section>
    <section class="panel"><div class="panel-heading"><h3>Planlanan antrenmanlar</h3><button class="text-button" data-page="trainings">Tüm takvim</button></div>${plannedTrainings.slice(0, 4).map(training => `<div class="list-row training-summary-row"><span class="training-date-time"><small>${formatTrainingDate(training.date)}</small><b>${training.time}</b></span><div><strong>${training.group} · ${training.title}</strong><small>${training.coach} · ${training.field}</small></div><span class="status">${trainingAttendanceLabel(training)}</span></div>`).join('') || '<div class="empty-state">Planlanmış güncel antrenman bulunmuyor.</div>'}</section>
  </div>`;
}

function progress(label, value) { return `<div><div class="progress-label"><span>${label}</span><strong>%${value}</strong></div><div class="progress-track"><div class="progress-fill" style="width:${value}%"></div></div></div>`; }

function currentParentStudent() {
  return state.students.find(student => Number(student.id) === Number(state.selectedParentStudentId)) || state.students[0] || null;
}

function parentPaymentContext() {
  if (state.role !== 'parent') return null;
  const student = currentParentStudent();
  if (!student) return null;
  const unpaidMonths = unpaidFeePeriods(student);
  const month = unpaidMonths.includes(state.selectedParentPaymentMonth)
    ? state.selectedParentPaymentMonth
    : unpaidMonths[0];
  if (!month) return null;
  return { student, month, amount: monthlyFeeAmount(student, month) };
}

function parentFeeStatusMarkup(student, month, status) {
  if (state.role !== 'parent' || status !== 'late' || Number(student.id) !== Number(currentParentStudent()?.id)) return statusLabel(status);
  return `<div class="parent-fee-status-actions">${statusLabel(status)}<button class="primary-button parent-pay-button" type="button" data-action="parent-payment" data-month="${month}">Ödeme Yap</button></div>`;
}

function parentStudentSwitcherMarkup() {
  if (state.role !== 'parent' || isRolePreview() || state.students.length < 2) return '';
  const currentStudent = currentParentStudent();
  return `<label class="parent-student-switcher"><span>Öğrenci</span><select id="parentStudentSelect" aria-label="Görüntülenecek öğrenciyi seçin">${state.students.map(student => `<option value="${student.id}" ${Number(student.id) === Number(currentStudent?.id) ? 'selected' : ''}>${escapeHtml(student.name)}</option>`).join('')}</select></label>`;
}

function parentDashboard() {
  const student = currentParentStudent();
  if (!student) return '<div class="page-stack"><section class="panel empty-state">Bu veli hesabına bağlı öğrenci bulunmuyor.</section></div>';
  const unpaidMonths = unpaidFeePeriods(student);
  const feeDebtText = unpaidMonths.length === 0
    ? 'Aidat borcunuz yoktur.'
    : unpaidMonths.length === 1
      ? `${formatFeeMonth(unpaidMonths[0])} ayına ait aidat borcunuz mevcuttur.`
      : `${unpaidMonths.map(formatFeeMonth).join(', ')} aylarına ait aidat borcunuz mevcuttur.`;
  const now = new Date();
  const currentDateTime = `${localDateValue(now)}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const studentTrainings = state.trainings.filter(training => training.group === student.group);
  const nextTraining = sortedTrainings(studentTrainings)
    .find(training => `${training.date || ''}T${training.time || ''}` >= currentDateTime);
  const nextTrainingCard = nextTraining
    ? `<button class="stat-card next-training-card dashboard-navigation-card" type="button" data-page="trainings" aria-label="Antrenman takvimine git"><span class="label">Sıradaki antrenman</span><strong>${formatTrainingDateLong(nextTraining.date)} · ${nextTraining.time}</strong><span class="next-training-details"><span><b>Tür:</b> ${nextTraining.title}</span><span><b>Süre:</b> ${nextTraining.duration || 90} dakika</span><span><b>Hoca:</b> ${nextTraining.coach}</span></span></button>`
    : '<button class="stat-card next-training-card dashboard-navigation-card" type="button" data-page="trainings" aria-label="Antrenman takvimine git"><span class="label">Sıradaki antrenman</span><strong>Planlanmış antrenman yok</strong><small>Öğrencinin grubu için yaklaşan kayıt bulunmuyor.</small></button>';
  const newsfeedItems = state.notifications.slice(0, 5).map(item => `<button class="newsfeed-item ${item.read ? '' : 'is-unread'}" type="button" data-page="notifications"><span class="newsfeed-marker" aria-hidden="true"></span><span class="newsfeed-content"><span class="newsfeed-meta"><span>${escapeHtml(item.date)} · ${escapeHtml(item.time)}</span>${item.read ? '' : '<span class="status warning">Yeni</span>'}</span><strong>${escapeHtml(item.title)}</strong>${item.body ? `<span class="newsfeed-message">${escapeHtml(item.body)}</span>` : ''}</span></button>`).join('');
  return `<div class="page-stack">
    ${dashboardNotificationPromptMarkup()}
    <section class="panel parent-hero">${studentAvatarMarkup(student, true)}<div><h2>${student.name}</h2><p>${studentBirthYearLabel(student)} · ${student.group}${student.position ? ` · ${student.position}` : ''}</p></div><div class="parent-hero-actions">${parentStudentSwitcherMarkup()}<button class="secondary-button" data-action="profile" data-id="${student.id}">Profili görüntüle</button></div></section>
    <section class="stats-grid parent-dashboard-stats">
      ${nextTrainingCard}
      <button class="stat-card parent-fee-card dashboard-navigation-card" type="button" data-page="fees" aria-label="Aidat sayfasına git"><span class="label">Aidat durumu</span><strong>${feeDebtText}</strong><small>Aidat detaylarını görüntüle</small></button>
      <button class="stat-card dashboard-navigation-card" type="button" data-page="studentAttendanceHistory" aria-label="Yoklama geçmişine git"><span class="label">Katılım oranı</span><strong>%${studentAttendanceRate(student)}</strong><small>${attendanceEntriesForStudent(student).length} kayıtlı yoklama</small></button>
    </section>
    <section class="dashboard-grid"><article class="panel"><div class="panel-heading"><h3>Yaklaşan program</h3><button class="text-button" data-page="trainings">Takvim</button></div>${sortedTrainings(studentTrainings).slice(0,2).map(t => `<div class="list-row"><span class="time">${t.time}</span><div><strong>${t.group} · ${t.title}</strong><small>${formatTrainingDate(t.date)} · ${t.field}</small></div><span class="status">Planlandı</span></div>`).join('') || '<div class="empty-state">Öğrencinin grubu için planlanmış antrenman bulunmuyor.</div>'}</article><article class="panel parent-newsfeed-panel"><div class="panel-heading"><h3>Duyurular</h3><button class="text-button" data-page="notifications">Tümünü gör</button></div><div class="parent-newsfeed">${newsfeedItems || '<div class="empty-state">Henüz yayınlanmış duyuru bulunmuyor.</div>'}</div></article></section>
  </div>`;
}

function studentsView() {
  const visibleStudents = filteredAndSortedStudents();
  const headingAction = isCoachRole() ? '' : `<button class="heading-icon-button" type="button" data-page="studentSettings" aria-label="Öğrenci ayarlarına git" title="Öğrenci ayarları">${MENU_ICONS.settings}</button>`;
  const addStudentButton = isCoachRole() ? '' : '<button class="primary-button" data-action="add-student">+ Yeni öğrenci</button>';
  const filters = isCoachRole() ? '' : `<div class="students-checkbox-filters"><label class="students-active-filter"><input id="activeStudentsOnlyFilter" type="checkbox" ${state.activeStudentsOnly ? 'checked' : ''}><span>Sadece aktif öğrenciler</span></label><label class="students-active-filter"><input id="debtStudentsOnlyFilter" type="checkbox" ${state.debtStudentsOnly ? 'checked' : ''}><span>Aidat borcu olanlar</span></label></div>`;
  const tableHeaders = isCoachRole()
    ? `${studentSortHeader('name', 'Öğrenci')}${studentSortHeader('birth', 'Doğum tarihi')}${studentSortHeader('enrollmentDate', 'Kayıt tarihi')}${studentSortHeader('group', 'Grup')}${studentSortHeader('position', 'Mevki')}${studentSortHeader('attendance', 'Devam')}<th></th>`
    : `${studentSortHeader('name', 'Öğrenci')}${studentSortHeader('birth', 'Doğum tarihi')}${studentSortHeader('enrollmentDate', 'Kayıt tarihi')}${studentSortHeader('group', 'Grup')}${studentSortHeader('position', 'Mevki')}${studentSortHeader('parent', 'Veli')}${studentSortHeader('fee', 'Aidat')}${studentSortHeader('attendance', 'Devam')}<th></th>`;
  return `<div class="page-stack"><div class="section-heading"><div><div class="section-title-with-action"><h2>Kayıtlı öğrenciler</h2>${headingAction}</div><p>Öğrenci kayıtları ve profilleri</p></div>${addStudentButton}</div>
    <div class="toolbar"><input class="search-input" id="studentSearch" type="search" placeholder="${isCoachRole() ? 'Öğrenci ara' : 'Öğrenci veya veli ara'}"><select id="groupFilter"><option value="">Tüm gruplar</option>${GROUPS.map(group => `<option>${escapeHtml(group)}</option>`).join('')}</select></div>
    ${filters}
    <div class="student-list-summary" aria-live="polite"><span>Listelenen öğrenci sayısı</span><strong><span id="studentsCountSummary">${visibleStudents.length}</span> / ${state.students.length}</strong></div>
    <section class="panel table-wrap"><table><thead><tr>${tableHeaders}</tr></thead><tbody id="studentsBody">${studentRows(visibleStudents)}</tbody></table></section></div>`;
}

function studentSettingsView() {
  const alphabeticGroups = [...GROUPS].sort((left, right) => left.localeCompare(right, 'tr-TR', { numeric: true, sensitivity: 'base' }));
  const displayedGroups = state.newestGroupPinned && state.newestGroupName && GROUPS.includes(state.newestGroupName)
    ? [state.newestGroupName, ...alphabeticGroups.filter(group => group !== state.newestGroupName)]
    : alphabeticGroups;
  const groupRows = displayedGroups.map(group => {
    const studentCount = state.students.filter(student => student.group === group).length;
    const trainingCount = state.trainings.filter(training => training.group === group).length;
    const isLastGroup = GROUPS.length <= 1;
    const inUse = studentCount > 0 || trainingCount > 0;
    if (state.editingGroupName === group) {
      return `<form class="group-settings-row group-rename-form" data-group="${escapeHtml(group)}" data-original-group="${escapeHtml(group)}"><div><label for="editGroupName">Grup adını düzenle</label><input id="editGroupName" name="groupName" maxlength="60" value="${escapeHtml(group)}" required><small>${studentCount} öğrenci · ${trainingCount} antrenman</small></div><div class="group-settings-actions"><button class="secondary-button" type="button" data-action="cancel-edit-group">Vazgeç</button><button class="primary-button" type="submit">Kaydet</button></div></form>`;
    }
    return `<div class="group-settings-row" data-group="${escapeHtml(group)}"><div><strong>${escapeHtml(group)}</strong><small>${studentCount} öğrenci · ${trainingCount} antrenman</small></div><div class="group-settings-actions"><button class="secondary-button" type="button" data-action="edit-group" data-group="${escapeHtml(group)}">Düzenle</button><button class="danger-button" type="button" data-action="delete-group" data-group="${escapeHtml(group)}" ${(inUse || isLastGroup) ? 'disabled' : ''} title="${isLastGroup ? 'Okuldaki son grup silinemez' : inUse ? 'Önce bu gruptaki öğrenci ve antrenman kayıtlarını başka gruba taşıyın' : 'Grubu sil'}">Sil</button></div></div>`;
  }).join('');
  return `<div class="page-stack"><div class="section-heading"><div><h2>Öğrenci ayarları</h2><p>Öğrenci kayıtlarında kullanılacak gruplar</p></div></div><details class="panel group-settings-panel"${state.groupSettingsOpen ? ' open' : ''}><summary class="group-settings-summary"><div><h3>Gruplar</h3><small class="muted">${GROUPS.length} kayıtlı grup</small></div><span class="disclosure-chevron" aria-hidden="true">⌄</span></summary><div class="group-settings-content"><form id="groupSettingsForm" class="group-settings-form"><label for="newGroupName">Yeni grup adı</label><input id="newGroupName" name="groupName" maxlength="60" placeholder="Örn. U15 veya Saat 14:00" required><button class="primary-button" type="submit">Grup ekle</button></form><div class="group-settings-list">${groupRows || '<div class="empty-state">Henüz grup eklenmemiş.</div>'}</div><small class="form-hint group-settings-hint">Öğrenci veya antrenman kaydı bulunan gruplar silinemez. Önce ilgili kayıtları başka bir gruba taşıyın.</small></div></details></div>`;
}

function studentSortHeader(key, label) {
  const active = state.studentSortKey === key;
  const direction = active ? state.studentSortDirection : 'none';
  const indicator = active ? state.studentSortDirection === 'asc' ? '↑' : '↓' : '↕';
  return `<th aria-sort="${direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'}"><button class="table-sort-button" type="button" data-action="student-sort" data-sort-key="${key}"><span>${label}</span><span class="sort-indicator" aria-hidden="true">${indicator}</span></button></th>`;
}
function studentSortValue(student, key) {
  if (key === 'fee') return studentHasFeeDebt(student) ? 'Borç var' : 'Borç yok';
  if (key === 'attendance') return studentAttendanceRate(student);
  return student[key] || '';
}
function sortStudentList(list) {
  if (!state.studentSortKey) return list;
  const direction = state.studentSortDirection === 'desc' ? -1 : 1;
  return [...list].sort((left, right) => {
    const leftValue = studentSortValue(left, state.studentSortKey);
    const rightValue = studentSortValue(right, state.studentSortKey);
    const comparison = typeof leftValue === 'number' && typeof rightValue === 'number'
      ? (leftValue - rightValue) * direction
      : String(leftValue).localeCompare(String(rightValue), 'tr-TR', { numeric: true, sensitivity: 'base' }) * direction;
    if (comparison !== 0) return comparison;
    return state.studentSortKey === 'enrollmentDate' ? (Number(left.id) - Number(right.id)) * direction : 0;
  });
}
function filteredAndSortedStudents() {
  const query = (document.querySelector('#studentSearch')?.value || '').toLocaleLowerCase('tr');
  const group = document.querySelector('#groupFilter')?.value || '';
  const filtered = state.students.filter(student => {
    const searchText = isCoachRole() ? student.name : `${student.name} ${student.parent}`;
    const roleFiltersMatch = isCoachRole() || ((!state.activeStudentsOnly || isActiveStudent(student)) && (!state.debtStudentsOnly || studentHasFeeDebt(student)));
    return roleFiltersMatch && (!query || searchText.toLocaleLowerCase('tr').includes(query)) && (!group || student.group === group);
  });
  return sortStudentList(filtered);
}
function updateStudentsTable() {
  const filtered = filteredAndSortedStudents();
  const studentsBody = document.querySelector('#studentsBody');
  setSafeTableRows(studentsBody, studentRows(filtered));
  const countSummary = document.querySelector('#studentsCountSummary');
  if (countSummary) countSummary.textContent = filtered.length;
}
function updateStudentSortHeaders() {
  document.querySelectorAll('[data-action="student-sort"]').forEach(button => {
    const active = button.dataset.sortKey === state.studentSortKey;
    button.querySelector('.sort-indicator').textContent = active ? state.studentSortDirection === 'asc' ? '↑' : '↓' : '↕';
    button.closest('th')?.setAttribute('aria-sort', active ? state.studentSortDirection === 'asc' ? 'ascending' : 'descending' : 'none');
  });
}
function studentHasFeeDebt(student) { return unpaidFeePeriods(student).length > 0; }
function studentListFeeLabel(student) { return studentHasFeeDebt(student) ? '<span class="status danger">Borç var</span>' : '<span class="status">Borç yok</span>'; }
function studentRows(list) {
  return list.map(student => {
    const commonStart = `<td><span class="profile-cell">${studentAvatarMarkup(student)}${studentNameLink(student)}</span></td><td>${escapeHtml(formatStudentBirthDisplay(student.birth))}</td><td>${escapeHtml(formatEnrollmentDate(student.enrollmentDate) || '—')}</td><td>${escapeHtml(student.group || '—')}</td><td>${escapeHtml(student.position || '—')}</td>`;
    const protectedColumns = isCoachRole() ? '' : `<td>${escapeHtml(student.parent || '—')}<br><small class="muted">${escapeHtml(student.phone)}</small></td><td>${studentListFeeLabel(student)}</td>`;
    return `<tr>${commonStart}${protectedColumns}<td>%${studentAttendanceRate(student)}</td><td><button class="text-button" data-action="profile" data-id="${student.id}">Profili aç</button></td></tr>`;
  }).join('');
}

function childView() {
  const s = currentParentStudent();
  if (!s) return '<div class="page-stack"><section class="panel empty-state">Bu veli hesabına bağlı öğrenci bulunmuyor.</section></div>';
  const feeStatus = currentFeeStatus(s);
  const feeText = feeStatus === 'paid' ? 'Ödendi' : feeStatus === 'late' ? 'Ödenmedi' : feeStatus === 'none' ? 'Aidat yok' : 'Bekliyor';
  const attendanceCount = attendanceEntriesForStudent(s).length;
  return `<div class="page-stack"><section class="panel parent-hero">${studentAvatarMarkup(s, true)}<div><h2>${studentNameLink(s, true)}</h2><p>${formatStudentBirthDisplay(s.birth)} · ${s.group}${s.position ? ` · ${s.position}` : ''}</p></div><button class="secondary-button" data-action="profile" data-id="${s.id}">Tam profili aç</button></section><section class="stats-grid"><article class="stat-card"><span class="label">Katılım</span><strong>%${studentAttendanceRate(s)}</strong><small>${attendanceCount ? `${attendanceCount} kayıtlı yoklama` : 'Henüz yoklama yok'}</small></article><article class="stat-card"><span class="label">Aidat</span><strong>${feeText}</strong><small>${formatFeeMonth(feeMonthKey())}</small></article><article class="stat-card"><span class="label">Antrenman grubu</span><strong>${s.group}</strong><small>Güncel grup</small></article><article class="stat-card"><span class="label">Mevki</span><strong>${s.position || 'Belirtilmedi'}</strong><small>Oyuncu profili</small></article></section><section class="panel"><div class="panel-heading"><h3>İletişim bilgileri</h3></div><div class="progress-group"><span><strong>Veli:</strong> ${s.parent || 'Bilgi girilmedi'}</span><span><strong>Telefon:</strong> ${s.phone}</span><span><strong>E-posta:</strong> ${s.email || 'Bilgi girilmedi'}</span></div></section></div>`;
}

function studentProfileView() {
  const allowedStudent = state.role === 'parent' ? currentParentStudent() : state.students.find(student => student.id === Number(state.selectedStudentId));
  const student = allowedStudent || state.students[0];
  if (!student) return `<div class="page-stack"><section class="panel empty-state"><h2>Öğrenci bulunamadı</h2><button class="secondary-button" data-page="${state.role === 'parent' ? 'dashboard' : 'students'}">Geri dön</button></section></div>`;
  const attendanceCount = attendanceEntriesForStudent(student).length;
  const activeStudent = isActiveStudent(student);
  const unpaidFees = unpaidFeePeriods(student);
  const feeDebtBalance = unpaidFees.reduce((total, month) => total + monthlyFeeAmount(student, month), 0);
  const feeSummaryCard = `<button class="stat-card profile-fee-summary-card" type="button" data-action="scroll-profile-fees" aria-label="Aylık aidat takibine git"><span class="label">Aidat durumu</span><strong>${formatCurrency(feeDebtBalance)}</strong><small class="${feeDebtBalance ? 'fee-debt-present' : 'fee-debt-clear'}">${feeDebtBalance ? 'Borç bakiye mevcut' : 'Borç bulunmuyor'}</small></button>`;
  const profileActions = state.role === 'parent'
    ? parentStudentSwitcherMarkup()
    : isAdminRole() ? `<div class="profile-actions"><button class="secondary-button" data-action="send-student-notification" data-id="${student.id}">Bildirim gönder</button><button class="secondary-button" data-action="edit-profile">Bilgileri düzenle</button></div>`
    : isCoachRole() ? '<button class="secondary-button" data-action="edit-profile">Bilgileri düzenle</button>' : '';
  const positionSummaryCard = `<button class="stat-card player-card-launch" type="button" data-action="player-card" data-id="${student.id}" aria-label="${escapeHtml(student.name)} oyuncu kartını aç"><span class="label">Mevki</span><strong>${escapeHtml(student.position || 'Belirtilmedi')}</strong><small>Oyuncu kartını görüntüle</small></button>`;
  const trainingGroupSummaryCard = `<button class="stat-card profile-training-group-card" type="button" data-page="trainings" aria-label="${escapeHtml(student.group)} grubu antrenman takvimine git"><span class="label">Antrenman Grubu</span><strong>${escapeHtml(student.group)}</strong><small>Antrenman takvimini görüntüle</small></button>`;
  const profileStats = isCoachRole()
    ? `<button class="stat-card profile-attendance-summary-card" type="button" data-page="studentAttendanceHistory" aria-label="Yoklama geçmişine git"><span class="label">Devam oranı</span><strong>%${studentAttendanceRate(student)}</strong><small>${attendanceCount} kayıtlı yoklama</small></button>${trainingGroupSummaryCard}${positionSummaryCard}`
    : `<button class="stat-card profile-attendance-summary-card" type="button" data-page="studentAttendanceHistory" aria-label="Yoklama geçmişine git"><span class="label">Devam oranı</span><strong>%${studentAttendanceRate(student)}</strong><small>${attendanceCount} kayıtlı yoklama</small></button>${feeSummaryCard}${trainingGroupSummaryCard}${positionSummaryCard}`;
  const guardianDetails = isCoachRole() ? '' : `<article class="panel"><div class="panel-heading"><h3>Veli ve iletişim</h3></div><dl class="detail-list"><div><dt>Veli adı soyadı</dt><dd>${student.parent || 'Bilgi girilmedi'}</dd></div><div><dt>Telefon</dt><dd><a href="tel:${student.phone}">${student.phone}</a></dd></div><div><dt>E-posta</dt><dd>${student.email ? `<a href="mailto:${student.email}">${student.email}</a>` : 'Bilgi girilmedi'}</dd></div><div><dt>Kısa adres</dt><dd>${student.address || 'Adres bilgisi girilmemiş'}</dd></div></dl></article>`;
  const feeTrackingSection = isCoachRole() ? '' : `<section class="panel" id="monthlyFeeSection"><div class="panel-heading"><div><h3>Aylık aidat takibi</h3><small class="muted">Kayıt tarihinden itibaren tüm dönemler</small></div><span class="status blue">${monthlyFeePeriods(student).length} dönem</span></div><div class="students-checkbox-filters monthly-fee-filter"><label class="students-active-filter"><input id="monthlyFeeUnpaidOnlyFilter" type="checkbox" ${state.monthlyFeeUnpaidOnly ? 'checked' : ''}><span>Sadece ödenmemiş aidatları göster</span></label></div><div class="table-wrap"><table class="monthly-fee-table"><thead><tr>${monthlyFeeSortHeader('period', 'Dönem')}${monthlyFeeSortHeader('amount', 'Tutar')}${monthlyFeeSortHeader('due', 'Son ödeme')}${monthlyFeeSortHeader('status', 'Durum')}${state.role !== 'parent' ? '<th>Ödeme</th>' : ''}</tr></thead><tbody>${monthlyFeeRows(student)}</tbody></table></div></section>`;
  return `<div class="page-stack">
    <div class="section-heading"><div></div>${profileActions}</div>
    <section class="panel student-profile-hero">${studentAvatarMarkup(student, true)}<div>${activeStudent && !isCoachRole() ? '<span class="eyebrow">AKTİF ÖĞRENCİ</span>' : ''}<h2>${student.name}</h2><p>${studentBirthYearLabel(student)} · Grup: ${student.group}${student.position ? ` · ${student.position}` : ''}</p></div></section>
    <section class="stats-grid profile-stats-grid">${profileStats}</section>
    <section class="profile-details-grid"><article class="panel"><div class="panel-heading"><h3>Öğrenci bilgileri</h3></div><dl class="detail-list"><div><dt>Adı soyadı</dt><dd>${student.name}</dd></div><div><dt>Doğum tarihi</dt><dd>${formatStudentBirthDisplay(student.birth)}</dd></div><div><dt>Kayıt tarihi</dt><dd>${formatEnrollmentDateNumeric(student.enrollmentDate)}</dd></div><div><dt>Antrenman Grubu</dt><dd>${student.group}</dd></div><div><dt>Oynadığı mevki</dt><dd>${student.position || 'Bilgi girilmedi'}</dd></div></dl></article>${guardianDetails}</section>
    ${feeTrackingSection}
    <section class="panel"><div class="panel-heading"><h3>Yaklaşan antrenmanlar</h3><button class="text-button" data-page="trainings">Tüm takvim</button></div>${sortedTrainings(state.trainings.filter(training => training.group === student.group)).slice(0, 4).map(training => `<div class="list-row"><span class="time">${training.time}</span><div><strong>${training.title}</strong><small>${formatTrainingDate(training.date)} · ${training.coach} · ${training.field}</small></div><span class="status">${training.group}</span></div>`).join('') || '<div class="empty-state">Bu grup için planlanmış antrenman bulunmuyor.</div>'}</section>
    ${studentTimelineMarkup(student)}
  </div>`;
}

function studentAttendanceHistoryView() {
  const allowedStudent = state.role === 'parent' ? currentParentStudent() : state.students.find(student => student.id === Number(state.selectedStudentId));
  const student = allowedStudent || state.students[0];
  if (!student) return `<div class="page-stack"><section class="panel empty-state"><h2>Öğrenci bulunamadı</h2><button class="secondary-button" data-page="dashboard">Geri dön</button></section></div>`;
  const monthOptions = studentAttendanceMonthOptions(student);
  const currentMonth = feeMonthKey();
  const selectedMonth = monthOptions.includes(state.studentAttendanceMonth) ? state.studentAttendanceMonth : currentMonth;
  state.studentAttendanceMonth = selectedMonth;
  const allEntries = attendanceEntriesForStudent(student);
  const entries = state.studentAttendanceShowAll
    ? allEntries
    : allEntries.filter(entry => String(entry.training.date || '').slice(0, 7) === selectedMonth);
  const presentCount = entries.filter(entry => entry.present).length;
  const absentCount = entries.length - presentCount;
  const filterLabel = state.studentAttendanceShowAll ? 'Tüm zamanlar' : formatFeeMonth(selectedMonth);
  const monthFilter = `<div class="attendance-history-filter"><label><span>Ay</span><select id="studentAttendanceMonthFilter" aria-label="Yoklama geçmişi ayını seçin" ${state.studentAttendanceShowAll ? 'disabled' : ''}>${monthOptions.map(month => `<option value="${month}" ${month === selectedMonth ? 'selected' : ''}>${formatFeeMonth(month)}</option>`).join('')}</select></label><label class="students-active-filter attendance-all-time-filter"><input id="studentAttendanceShowAllFilter" type="checkbox" ${state.studentAttendanceShowAll ? 'checked' : ''}><span>Tüm zamanları göster</span></label></div>`;
  return `<div class="page-stack"><div class="section-heading"><div><h2>${student.name} · Yoklama geçmişi</h2><p>Kayıtlı antrenman katılım sonuçları</p></div></div>${monthFilter}<section class="stats-grid"><article class="stat-card"><span class="label">Toplam yoklama</span><strong>${entries.length}</strong><small>${filterLabel} kaydı</small></article><article class="stat-card"><span class="label">Geldi</span><strong>${presentCount}</strong><small>Katıldığı antrenman</small></article><article class="stat-card"><span class="label">Gelmedi</span><strong>${absentCount}</strong><small>Katılmadığı antrenman</small></article></section><section class="panel table-wrap"><table><thead><tr><th>Tarih / Saat</th><th>Antrenman</th><th>Antrenör / Saha</th><th>Durum</th></tr></thead><tbody>${entries.map(entry => `<tr><td><strong>${formatTrainingDate(entry.training.date)}</strong><br><small class="muted">${entry.training.time}</small></td><td>${entry.training.title}<br><small class="muted">${entry.training.group}</small></td><td>${entry.training.coach}<br><small class="muted">${entry.training.field}</small></td><td><span class="status ${entry.present ? '' : 'danger'}">${entry.present ? 'Geldi' : 'Gelmedi'}</span></td></tr>`).join('') || `<tr><td colspan="4"><div class="empty-state">${filterLabel} için kayıtlı yoklama bulunmuyor.</div></td></tr>`}</tbody></table></section></div>`;
}

function trainingsView() {
  const parentStudent = state.role === 'parent' ? currentParentStudent() : null;
  const groupTrainings = parentStudent
    ? state.trainings.filter(training => training.group === parentStudent.group)
    : state.role === 'parent'
      ? []
      : state.trainings;
  const visibleTrainings = state.showPastTrainings
    ? groupTrainings
    : groupTrainings.filter(training => training.date >= localDateValue());
  const orderedTrainings = sortedTrainings(visibleTrainings, state.trainingSortDirection);
  const listDescription = parentStudent
    ? `${parentStudent.group} grubu · ${visibleTrainings.length} kayıt`
    : `Planlanan grup çalışmaları · ${visibleTrainings.length} kayıt`;
  const emptyMessage = parentStudent
    ? `${parentStudent.group} grubu için planlanmış antrenman bulunmuyor.`
    : 'Henüz planlanmış antrenman bulunmuyor.';
  const canManageTrainings = ['super_admin', 'admin', 'coach'].includes(state.role);
  const canManageTrainingSettings = isAdminRole();
  const settingsButton = canManageTrainingSettings ? `<button class="heading-icon-button" type="button" data-page="trainingSettings" aria-label="Antrenman ayarlarına git" title="Antrenman ayarları">${MENU_ICONS.settings}</button>` : '';
  return `<div class="page-stack"><div class="section-heading"><div><div class="section-title-with-action"><h2>Antrenman takvimi</h2>${settingsButton}</div><p>${listDescription}</p></div>${canManageTrainings ? '<button class="primary-button" data-action="new-training">+ Antrenman ekle</button>' : ''}</div><div class="training-list-block"><div class="training-list-toolbar"><label class="students-active-filter"><input id="showPastTrainingsFilter" type="checkbox" ${state.showPastTrainings ? 'checked' : ''}><span>Tarihi geçenleri de göster</span></label><label class="training-sort-control"><span>Sırala</span><select id="trainingSortSelect" aria-label="Antrenmanları sırala"><option value="desc" ${state.trainingSortDirection === 'desc' ? 'selected' : ''}>Yeniden eskiye</option><option value="asc" ${state.trainingSortDirection === 'asc' ? 'selected' : ''}>Eskiden yeniye</option></select></label></div><section class="card-grid">${orderedTrainings.map(t => `<article class="panel training-card ${t.date < localDateValue() ? 'is-past' : ''}"><header><div><span class="eyebrow">${t.group}</span><h3>${t.title}</h3></div><span class="training-schedule">${formatTrainingDate(t.date)}${state.role === 'parent' ? '' : ` · ${t.time}`}</span></header><div class="training-duration"><span aria-hidden="true">⏱️</span><span>${t.duration || 90} dakika</span></div><div class="training-meta"><span>⚑ ${t.field}</span><span>● ${t.coach}</span>${latestAttendanceForTraining(t) ? `<span>◎ ${trainingAttendanceLabel(t)}</span>` : ''}</div>${state.role !== 'parent' ? `<div class="training-actions"><button class="primary-button" data-action="attendance" data-id="${t.id}">Yoklama al</button>${canManageTrainings ? `<button class="secondary-button" type="button" data-action="edit-training" data-id="${t.id}">Düzenle</button>` : ''}</div>` : ''}</article>`).join('') || `<div class="panel empty-state">${emptyMessage}</div>`}</section></div></div>`;
}

function trainingSettingsView() {
  const sortedTypes = [...state.trainingTypes].sort((left, right) => left.localeCompare(right, 'tr-TR', { numeric: true, sensitivity: 'base' }));
  const typeRows = sortedTypes.map(type => {
    const usageCount = state.trainings.filter(training => String(training.title || '').localeCompare(type, 'tr-TR', { sensitivity: 'base' }) === 0).length;
    if (state.editingTrainingTypeName === type) {
      return `<form class="group-settings-row training-type-rename-form" data-original-type="${escapeHtml(type)}"><div><label for="editTrainingTypeName">Antrenman adını düzenle</label><input id="editTrainingTypeName" name="trainingTypeName" maxlength="60" value="${escapeHtml(type)}" required><small>${usageCount} antrenmanda kullanılıyor</small></div><div class="group-settings-actions"><button class="secondary-button" type="button" data-action="cancel-edit-training-type">Vazgeç</button><button class="primary-button" type="submit">Kaydet</button></div></form>`;
    }
    return `<div class="group-settings-row"><div><strong>${escapeHtml(type)}</strong><small>${usageCount} antrenmanda kullanılıyor</small></div><div class="group-settings-actions"><button class="secondary-button" type="button" data-action="edit-training-type" data-type="${escapeHtml(type)}">Düzenle</button><button class="danger-button" type="button" data-action="delete-training-type" data-type="${escapeHtml(type)}" ${state.trainingTypes.length <= 1 ? 'disabled title="Okuldaki son antrenman türü silinemez"' : ''}>Sil</button></div></div>`;
  }).join('');
  const sortedCoaches = [...state.trainingCoaches].sort((left, right) => left.localeCompare(right, 'tr-TR', { numeric: true, sensitivity: 'base' }));
  const coachRows = sortedCoaches.map(coach => {
    const usageCount = state.trainings.filter(training => String(training.coach || '').localeCompare(coach, 'tr-TR', { sensitivity: 'base' }) === 0).length;
    if (state.editingTrainingCoachName === coach) {
      return `<form class="group-settings-row training-coach-rename-form" data-original-coach="${escapeHtml(coach)}"><div><label for="editTrainingCoachName">Antrenör adını düzenle</label><input id="editTrainingCoachName" name="trainingCoachName" maxlength="80" value="${escapeHtml(coach)}" required><small>${usageCount} antrenmanda kullanılıyor</small></div><div class="group-settings-actions"><button class="secondary-button" type="button" data-action="cancel-edit-training-coach">Vazgeç</button><button class="primary-button" type="submit">Kaydet</button></div></form>`;
    }
    return `<div class="group-settings-row"><div><strong>${escapeHtml(coach)}</strong><small>${usageCount} antrenmanda kullanılıyor</small></div><div class="group-settings-actions"><button class="secondary-button" type="button" data-action="edit-training-coach" data-coach="${escapeHtml(coach)}">Düzenle</button><button class="danger-button" type="button" data-action="delete-training-coach" data-coach="${escapeHtml(coach)}" ${state.trainingCoaches.length <= 1 ? 'disabled title="Okuldaki son antrenör silinemez"' : ''}>Sil</button></div></div>`;
  }).join('');
  const sortedFields = [...state.trainingFields].sort((left, right) => left.localeCompare(right, 'tr-TR', { numeric: true, sensitivity: 'base' }));
  const fieldRows = sortedFields.map(field => {
    const usageCount = state.trainings.filter(training => String(training.field || '').localeCompare(field, 'tr-TR', { sensitivity: 'base' }) === 0).length;
    if (state.editingTrainingFieldName === field) {
      return `<form class="group-settings-row training-field-rename-form" data-original-field="${escapeHtml(field)}"><div><label for="editTrainingFieldName">Saha adını düzenle</label><input id="editTrainingFieldName" name="trainingFieldName" maxlength="80" value="${escapeHtml(field)}" required><small>${usageCount} antrenmanda kullanılıyor</small></div><div class="group-settings-actions"><button class="secondary-button" type="button" data-action="cancel-edit-training-field">Vazgeç</button><button class="primary-button" type="submit">Kaydet</button></div></form>`;
    }
    return `<div class="group-settings-row"><div><strong>${escapeHtml(field)}</strong><small>${usageCount} antrenmanda kullanılıyor</small></div><div class="group-settings-actions"><button class="secondary-button" type="button" data-action="edit-training-field" data-field="${escapeHtml(field)}">Düzenle</button><button class="danger-button" type="button" data-action="delete-training-field" data-field="${escapeHtml(field)}" ${state.trainingFields.length <= 1 ? 'disabled title="Okuldaki son saha silinemez"' : ''}>Sil</button></div></div>`;
  }).join('');
  const typePanel = `<details class="panel group-settings-panel training-type-settings-panel"${state.trainingTypeSettingsOpen ? ' open' : ''}><summary class="group-settings-summary"><div><h3>Antrenman isimleri</h3><small class="muted">${state.trainingTypes.length} kayıtlı isim</small></div><span class="disclosure-chevron" aria-hidden="true">⌄</span></summary><div class="group-settings-content"><form id="trainingTypeSettingsForm" class="group-settings-form"><label for="newTrainingTypeName">Yeni antrenman adı</label><input id="newTrainingTypeName" name="trainingTypeName" maxlength="60" placeholder="Örn. Şut çalışması" required><button class="primary-button" type="submit">İsim ekle</button></form><div class="group-settings-list">${typeRows || '<div class="empty-state">Henüz antrenman ismi eklenmemiş.</div>'}</div><small class="form-hint group-settings-hint">Buradaki isimler yeni antrenman formunda gösterilir. Geçmiş antrenman kayıtları silme işleminden etkilenmez.</small></div></details>`;
  const coachPanel = `<details class="panel group-settings-panel training-coach-settings-panel"${state.trainingCoachSettingsOpen ? ' open' : ''}><summary class="group-settings-summary"><div><h3>Antrenör isimleri</h3><small class="muted">${state.trainingCoaches.length} kayıtlı antrenör</small></div><span class="disclosure-chevron" aria-hidden="true">⌄</span></summary><div class="group-settings-content"><form id="trainingCoachSettingsForm" class="group-settings-form"><label for="newTrainingCoachName">Yeni antrenör adı</label><input id="newTrainingCoachName" name="trainingCoachName" maxlength="80" placeholder="Adı soyadı" required><button class="primary-button" type="submit">Antrenör ekle</button></form><div class="group-settings-list">${coachRows || '<div class="empty-state">Henüz antrenör eklenmemiş.</div>'}</div><small class="form-hint group-settings-hint">Buradaki antrenörler yeni antrenman formundaki açılır menüde gösterilir. Geçmiş kayıtlar silme işleminden etkilenmez.</small></div></details>`;
  const fieldPanel = `<details class="panel group-settings-panel training-field-settings-panel"${state.trainingFieldSettingsOpen ? ' open' : ''}><summary class="group-settings-summary"><div><h3>Sahalar</h3><small class="muted">${state.trainingFields.length} kayıtlı saha</small></div><span class="disclosure-chevron" aria-hidden="true">⌄</span></summary><div class="group-settings-content"><form id="trainingFieldSettingsForm" class="group-settings-form"><label for="newTrainingFieldName">Yeni saha adı</label><input id="newTrainingFieldName" name="trainingFieldName" maxlength="80" placeholder="Örn. Ana saha" required><button class="primary-button" type="submit">Saha ekle</button></form><div class="group-settings-list">${fieldRows || '<div class="empty-state">Henüz saha eklenmemiş.</div>'}</div><small class="form-hint group-settings-hint">Buradaki sahalar yeni antrenman formundaki açılır menüde gösterilir. Geçmiş kayıtlar silme işleminden etkilenmez.</small></div></details>`;
  return `<div class="page-stack"><div class="section-heading"><div><h2>Antrenman ayarları</h2><p>Antrenman isimlerini, antrenörleri ve sahaları yönetin</p></div></div>${typePanel}${coachPanel}${fieldPanel}</div>`;
}

function attendanceView() {
  const visibleTrainings = state.showPastAttendance
    ? state.trainings
    : state.trainings.filter(training => training.date >= localDateValue());
  const orderedTrainings = sortedTrainings(visibleTrainings, state.attendanceSortDirection);
  return `<div class="page-stack"><div class="section-heading"><div><h2>Yoklama merkezi</h2><p>Antrenman bazında katılım kaydı</p></div></div><div class="training-list-block"><div class="training-list-toolbar"><label class="students-active-filter"><input id="showPastAttendanceFilter" type="checkbox" ${state.showPastAttendance ? 'checked' : ''}><span>Tarihi geçenleri de göster</span></label><label class="training-sort-control"><span>Sırala</span><select id="attendanceSortSelect" aria-label="Yoklama antrenmanlarını sırala"><option value="desc" ${state.attendanceSortDirection === 'desc' ? 'selected' : ''}>Yeniden eskiye</option><option value="asc" ${state.attendanceSortDirection === 'asc' ? 'selected' : ''}>Eskiden yeniye</option></select></label></div><section class="panel">${orderedTrainings.map(t => `<div class="list-row attendance-training-row ${t.date < localDateValue() ? 'is-past' : ''}"><span class="time">${t.time}</span><div><strong>${t.group} · ${t.title}</strong><small>${formatTrainingDate(t.date)} · ${trainingAttendanceLabel(t)} · ${t.coach}</small></div><button class="primary-button" data-action="attendance" data-id="${t.id}">Yoklama al</button></div>`).join('') || '<div class="empty-state">Gösterilecek antrenman bulunmuyor.</div>'}</section></div></div>`;
}

function feesView() {
  const isParent = state.role === 'parent';
  const selectedParentStudent = isParent ? currentParentStudent() : null;
  const allStudents = isParent ? (selectedParentStudent ? [selectedParentStudent] : []) : state.students;
  const parentStudent = isParent ? allStudents[0] : null;
  const parentUnpaidMonths = parentStudent ? unpaidFeePeriods(parentStudent) : [];
  const parentFeeMonths = parentStudent ? monthlyFeePeriods(parentStudent) : [];
  const parentDebtBalance = parentStudent
    ? parentUnpaidMonths.reduce((total, month) => total + monthlyFeeAmount(parentStudent, month), 0)
    : 0;
  const pendingStudents = allStudents.filter(student => currentFeeStatus(student) === 'late');
  const unfilteredList = state.feeFilter === 'pending' ? pendingStudents : allStudents;
  const feeSearchQuery = state.feeSearchQuery.trim().toLocaleLowerCase('tr-TR');
  const list = isParent || !feeSearchQuery
    ? unfilteredList
    : unfilteredList.filter(student => `${student.name} ${student.parent || ''} ${student.group || ''}`.toLocaleLowerCase('tr-TR').includes(feeSearchQuery));
  const currentMonth = feeMonthKey();
  const currentMonthLabel = formatFeeMonth(currentMonth);
  const liableStudents = allStudents.filter(student => ['paid', 'late'].includes(currentFeeStatus(student)));
  const total = liableStudents.reduce((sum, student) => sum + monthlyFeeAmount(student, currentMonth), 0);
  const collected = allStudents.filter(student => currentFeeStatus(student) === 'paid').reduce((sum, student) => sum + monthlyFeeAmount(student, currentMonth), 0);
  const pending = pendingStudents.reduce((sum, student) => sum + monthlyFeeAmount(student, currentMonth), 0);
  const title = state.feeFilter === 'pending' && !isParent ? 'Ödemesi yapılmamış öğrenciler' : isParent ? 'Aidat bilgilerim' : 'Aidat takip listesi';
  const headerAction = state.feeFilter === 'pending' && !isParent ? '<button class="secondary-button" data-action="fee-filter" data-filter="all">Tüm aidatları göster</button>' : !isParent ? '<button class="primary-button" data-action="collect-fee">+ Aidat tanımla</button>' : '';
  const summaryMarkup = isParent
    ? `<section class="stats-grid"><article class="stat-card parent-fee-card"><span class="label">Aidat durumu</span><strong>${parentDebtBalance ? `${formatCurrency(parentDebtBalance)} borç bakiyesi` : 'Aidat borcunuz yoktur.'}</strong><small>${parentDebtBalance ? `${parentUnpaidMonths.length} ödenmemiş dönem` : 'Ödenmemiş aidat bulunmuyor'}</small></article></section>`
    : `<section class="stats-grid"><article class="stat-card"><span class="label">Aylık tahakkuk</span><strong>${formatCurrency(total)}</strong><small>${currentMonthLabel}</small></article><article class="stat-card"><span class="label">Tahsil edilen</span><strong>${formatCurrency(collected)}</strong><small>${total ? `%${Math.round(collected / total * 100)} tahsilat` : '%0 tahsilat'}</small></article><article class="stat-card"><span class="label">Bekleyen</span><strong>${formatCurrency(pending)}</strong><small>${pendingStudents.length} öğrenci</small></article></section>`;
  const feeRows = isParent
    ? parentFeeMonths.map(month => ({ student: parentStudent, month, status: monthlyFeeStatus(parentStudent, month) })).filter(row => state.feeFilter !== 'pending' || row.status === 'late')
    : list.map(student => ({ student, month: currentMonth, status: currentFeeStatus(student) }));
  const sortedFeeRows = sortFeeListRows(feeRows);
  const tableRows = isParent
    ? sortedFeeRows.map(row => `<tr><td>${studentNameLink(row.student)}</td><td>${formatFeeMonth(row.month)}</td><td>${formatCurrency(monthlyFeeAmount(row.student, row.month))}</td><td>${formatFeeDueDate(row.month)}</td><td>${parentFeeStatusMarkup(row.student, row.month, row.status)}</td></tr>`).join('') || '<tr><td colspan="5"><div class="empty-state">Aidat borcunuz bulunmuyor.</div></td></tr>'
    : sortedFeeRows.map(row => {
        const { student, month, status } = row;
        const paymentControl = status === 'none'
          ? statusLabel('none')
          : `<label class="fee-paid-control"><input type="checkbox" data-monthly-fee data-id="${student.id}" data-month="${month}" aria-label="${formatFeeMonth(month)} aidatını ödendi işaretle" ${status === 'paid' ? 'checked' : ''}><span>${status === 'paid' ? 'Ödendi' : 'Ödendi seç'}</span></label>`;
        return `<tr><td>${studentNameLink(student)}</td><td>${formatFeeMonth(month)}</td><td>${status === 'none' ? '—' : formatCurrency(monthlyFeeAmount(student, month))}</td><td>${formatFeeDueDate(month)}</td><td>${feeStatusControl(student, month, status)}</td><td>${paymentControl}</td></tr>`;
      }).join('') || `<tr><td colspan="6"><div class="empty-state">${feeSearchQuery ? 'Aramanızla eşleşen aidat kaydı bulunamadı.' : 'Aidat kaydı bulunmuyor.'}</div></td></tr>`;
  const subtitle = isParent ? `${parentFeeMonths.length} aidat dönemi · ${parentUnpaidMonths.length} ödenmemiş` : `${currentMonthLabel} ödeme dönemi · ${list.length} öğrenci`;
  const unpaidOnlyFilterMarkup = `<label class="students-active-filter"><input id="feeUnpaidOnlyFilter" type="checkbox" ${state.feeFilter === 'pending' ? 'checked' : ''}><span>Sadece ödenmemiş aidatları göster</span></label>`;
  const searchMarkup = isParent
    ? `<div class="toolbar fee-list-toolbar">${unpaidOnlyFilterMarkup}</div>`
    : `<div class="toolbar fee-list-toolbar"><input class="search-input" id="feeSearch" type="search" value="${escapeHtml(state.feeSearchQuery)}" placeholder="Öğrenci, veli veya grup ara" aria-label="Aidat kayıtlarında ara">${unpaidOnlyFilterMarkup}<span class="muted" aria-live="polite">${list.length} / ${unfilteredList.length} öğrenci</span></div>`;
  return `<div class="page-stack"><div class="section-heading"><div><h2>${title}</h2><p>${subtitle}</p></div>${headerAction}</div>${summaryMarkup}${searchMarkup}<section class="panel table-wrap"><table><thead><tr>${feeListSortHeader('name', 'Öğrenci')}${feeListSortHeader('period', 'Dönem')}${feeListSortHeader('amount', 'Tutar')}${feeListSortHeader('due', 'Son ödeme')}${feeListSortHeader('status', 'Durum')}${!isParent ? '<th></th>' : ''}</tr></thead><tbody>${tableRows}</tbody></table></section></div>`;
}

function parentPaymentUnavailableView() {
  return `<div class="page-stack parent-payment-page"><section class="panel empty-state"><h2>Ödeme yapılacak aidat bulunmuyor</h2><p>Bu ekran yalnızca ödenmemiş aidatlar için kullanılabilir.</p><button class="secondary-button" type="button" data-page="fees">Aidat sayfasına dön</button></section></div>`;
}

function parentPaymentSummaryMarkup(context) {
  return `<section class="panel parent-payment-summary"><div><span class="eyebrow">ÖDENECEK AİDAT</span><h2>${escapeHtml(context.student.name)}</h2><p>${formatFeeMonth(context.month)} dönemi</p></div><strong>${formatCurrency(context.amount)}</strong></section>`;
}

function parentPaymentView() {
  const context = parentPaymentContext();
  if (!context) return parentPaymentUnavailableView();
  return `<div class="page-stack parent-payment-page">
    ${parentPaymentSummaryMarkup(context)}
    <section class="parent-payment-choice-grid" aria-label="Ödeme yöntemi seçimi">
      <button class="panel parent-payment-option" type="button" data-page="parentBankTransfer"><span class="parent-payment-option-icon" aria-hidden="true">↗</span><span><strong>Havale</strong><small>Kulübün doğrulanmış banka bilgilerini görüntüleyin.</small></span><span class="settings-link-arrow" aria-hidden="true">›</span></button>
      <button class="panel parent-payment-option" type="button" data-page="parentCardPayment"><span class="parent-payment-option-icon" aria-hidden="true">▣</span><span><strong>Kredi Kartı</strong><small>Yakında kullanıma açılacak ödeme ekranını inceleyin.</small></span><span class="settings-link-arrow" aria-hidden="true">›</span></button>
    </section>
    <section class="payment-safety-note"><strong>Güvenli ödeme</strong><span>Ödeme yöntemi seçilmeden hiçbir finansal bilgi istenmez veya kaydedilmez.</span></section>
  </div>`;
}

function parentBankTransferView() {
  const context = parentPaymentContext();
  if (!context) return parentPaymentUnavailableView();
  const bankAccounts = (state.schoolBankAccounts || []).filter(account => account.iban && account.accountHolder && account.bankName);
  const bankDetailsMarkup = bankAccounts.length
    ? `<div class="parent-bank-account-list">${bankAccounts.map((account, index) => `<article class="parent-bank-account ${parentBankThemeClass(account.bankName)}"><dl class="parent-bank-details"><div><dt>Banka</dt><dd>${escapeHtml(account.bankName)}</dd></div><div><dt>Hesap sahibi</dt><dd>${escapeHtml(account.accountHolder)}</dd></div><div class="parent-bank-iban"><dt>IBAN</dt><dd>${escapeHtml(formatIban(account.iban))}</dd></div></dl><button class="secondary-button" type="button" data-action="copy-parent-iban" data-account-index="${index}">IBAN'ı kopyala</button></article>`).join('')}</div>`
    : `<div class="parent-bank-placeholder"><span aria-hidden="true">i</span><div><strong>Banka bilgisi henüz tanımlanmadı</strong><p>IBAN ve hesap sahibi bilgileri kulüp yöneticisi tarafından doğrulanıp buraya eklenecek.</p></div></div><button class="secondary-button" type="button" disabled>IBAN'ı kopyala</button>`;
  return `<div class="page-stack parent-payment-page">
    ${parentPaymentSummaryMarkup(context)}
    <section class="panel parent-bank-panel"><div class="panel-heading"><div><h3>Aidat havale bilgileri</h3><small class="muted">${escapeHtml(state.schoolName || 'Futbol okulu')}</small></div></div>${bankDetailsMarkup}</section>
    <section class="payment-safety-note warning"><strong>Havale yapmadan önce</strong><span>Yalnızca bu ekranda doğrulanmış IBAN göründüğünde işlem yapın ve alıcı adını kulüple teyit edin. Havale göndermek aidatı otomatik olarak ödendi yapmaz.</span></section>
  </div>`;
}

function parentCardPaymentView() {
  const context = parentPaymentContext();
  if (!context) return parentPaymentUnavailableView();
  return `<div class="page-stack parent-payment-page">
    ${parentPaymentSummaryMarkup(context)}
    <section class="panel parent-card-demo-panel"><div class="demo-label">DEMO · ÖDEME ALINMAZ</div><div class="demo-payment-card" aria-label="Temsili kredi kartı"><span class="demo-card-chip" aria-hidden="true"></span><strong>•••• •••• •••• ••••</strong><div><span>AD SOYAD</span><span>AA/YY</span></div></div><h3>Kredi kartıyla ödeme yakında</h3><p>Gerçek ödeme sağlayıcısı henüz bağlı değildir. Bu sayfa yalnızca tasarım önizlemesidir; kart bilgisi girilmez, saklanmaz ve aidat durumu değiştirilmez.</p><button class="primary-button" type="button" disabled>Ödeme altyapısı yakında</button></section>
    <section class="payment-safety-note"><strong>Kart bilginizi paylaşmayın</strong><span>Resmî ödeme altyapısı açılana kadar uygulama sizden kart numarası, son kullanma tarihi veya güvenlik kodu istemez.</span></section>
  </div>`;
}

function feeListSortHeader(key, label) {
  const active = state.feeListSortKey === key;
  const indicator = active ? state.feeListSortDirection === 'asc' ? '↑' : '↓' : '↕';
  return `<th aria-sort="${active ? state.feeListSortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}"><button class="table-sort-button" type="button" data-action="fee-list-sort" data-sort-key="${key}"><span>${label}</span><span class="sort-indicator" aria-hidden="true">${indicator}</span></button></th>`;
}

function feeListSortValue(row, key) {
  if (key === 'enrollmentDate') return row.student.enrollmentDate || '';
  if (key === 'name') return row.student.name || '';
  if (key === 'period' || key === 'due') return row.month || '';
  if (key === 'amount') return row.status === 'none' ? 0 : monthlyFeeAmount(row.student, row.month);
  if (key === 'status') return ({ none: 'Aidat yok', late: 'Ödenmedi', paid: 'Ödendi', exempt: 'Muaf', unknown: 'Kaynak notu' })[row.status] || 'Bekliyor';
  return '';
}

function sortFeeListRows(rows) {
  const direction = state.feeListSortDirection === 'desc' ? -1 : 1;
  return [...rows].sort((left, right) => {
    const leftValue = feeListSortValue(left, state.feeListSortKey);
    const rightValue = feeListSortValue(right, state.feeListSortKey);
    const comparison = typeof leftValue === 'number' && typeof rightValue === 'number'
      ? (leftValue - rightValue) * direction
      : String(leftValue).localeCompare(String(rightValue), 'tr-TR', { numeric: true, sensitivity: 'base' }) * direction;
    if (comparison !== 0) return comparison;
    if (state.feeListSortKey === 'enrollmentDate') {
      const studentOrder = (Number(left.student.id) - Number(right.student.id)) * direction;
      return studentOrder || String(right.month || '').localeCompare(String(left.month || ''));
    }
    return String(left.student.name || '').localeCompare(String(right.student.name || ''), 'tr-TR', { sensitivity: 'base' });
  });
}

function accountingPeriodFiltersMarkup() {
  const hasDateRange = Boolean(state.accountingDateRangeStart && state.accountingDateRangeEnd);
  const monthOptions = accountingMonthOptions();
  const monthIsActive = state.accountingPeriod === 'month' && Boolean(state.accountingMonth);
  return `<div class="accounting-periods" role="group" aria-label="Muhasebe dönemi"><button class="${state.accountingPeriod === 'today' ? 'primary-button' : 'secondary-button'}" type="button" data-action="accounting-period" data-period="today" aria-pressed="${state.accountingPeriod === 'today'}">Bugün</button><label class="accounting-month-filter"><span class="sr-only">Ay seçin</span><select id="accountingMonthFilter" aria-label="Ay seçin"><option value="" ${monthIsActive ? '' : 'selected'}>Ay seçiniz</option>${monthOptions.map(month => `<option value="${month}" ${monthIsActive && month === state.accountingMonth ? 'selected' : ''}>${formatFeeMonth(month)}</option>`).join('')}</select></label><button class="${hasDateRange ? 'primary-button' : 'secondary-button'}" type="button" data-action="accounting-date-range" aria-pressed="${hasDateRange}">Aralık seç</button></div>`;
}

function paymentMethodTotals(entries, kind) {
  return entries.filter(entry => entry.kind === kind).reduce((totals, entry) => {
    const method = PAYMENT_METHODS[entry.paymentMethod] ? entry.paymentMethod : 'cash';
    totals[method] += Number(entry.amount) || 0;
    return totals;
  }, { cash: 0, transfer: 0, card: 0 });
}
function paymentMethodSummary(totals) {
  return `<small class="payment-method-summary"><span class="payment-method-cash">Nakit ${formatCurrency(totals.cash)}</span><span class="payment-method-transfer">Havale ${formatCurrency(totals.transfer)}</span><span class="payment-method-card">Kredi kartı ${formatCurrency(totals.card)}</span></small>`;
}

function accountingView() {
  const periodEntries = accountingPeriodEntries();
  const income = periodEntries.filter(entry => entry.kind === 'income').reduce((sum, entry) => sum + Number(entry.amount), 0);
  const expense = periodEntries.filter(entry => entry.kind === 'expense').reduce((sum, entry) => sum + Number(entry.amount), 0);
  const incomeCount = periodEntries.filter(entry => entry.kind === 'income').length;
  const expenseCount = periodEntries.filter(entry => entry.kind === 'expense').length;
  const incomeMethods = paymentMethodTotals(periodEntries, 'income');
  const expenseMethods = paymentMethodTotals(periodEntries, 'expense');
  const cashRegisterMethods = {
    cash: incomeMethods.cash - expenseMethods.cash,
    transfer: incomeMethods.transfer - expenseMethods.transfer,
    card: incomeMethods.card - expenseMethods.card
  };
  return `<div class="page-stack"><div class="section-heading"><div><div class="section-title-with-action"><h2>Muhasebe</h2><button class="heading-icon-button" type="button" data-page="accountingSettings" aria-label="Muhasebe ayarlarına git" title="Muhasebe ayarları">${MENU_ICONS.settings}</button></div><p>Gelir ve Gider kayıtları</p></div><button class="primary-button" data-action="new-entry">+ Yeni işlem</button></div>${accountingPeriodFiltersMarkup()}<div class="accounting-period-indicator">Gösterilen zaman dilimi: <strong>${accountingPeriodLabel()}</strong></div><section class="stats-grid"><article class="stat-card"><span class="label">Toplam gelir</span><strong>${formatCurrency(income)}</strong><div class="stat-card-breakdown"><button class="stat-link accounting-record-count" type="button" data-action="accounting-entries" data-kind="income">${incomeCount} kayıt</button>${paymentMethodSummary(incomeMethods)}</div></article><article class="stat-card"><span class="label">Toplam gider</span><strong>${formatCurrency(expense)}</strong><div class="stat-card-breakdown"><button class="stat-link accounting-record-count" type="button" data-action="accounting-entries" data-kind="expense">${expenseCount} kayıt</button>${paymentMethodSummary(expenseMethods)}</div></article><article class="stat-card"><span class="label">Kasa</span><strong>${formatCurrency(income - expense)}</strong><div class="stat-card-breakdown"><button class="stat-link accounting-record-count" type="button" data-action="accounting-entries" data-kind="all">${periodEntries.length} kayıt</button>${paymentMethodSummary(cashRegisterMethods)}</div></article></section><section class="panel"><div class="panel-heading"><h3>Son işlemler</h3><button class="text-button" type="button" data-action="accounting-entries" data-kind="all">Tümünü gör</button></div>${accountingEntryRows(periodEntries.slice(0, 4))}</section></div>`;
}

function accountingSettingsView() {
  return `<div class="page-stack"><div class="section-heading"><div><h2>Muhasebe ayarları</h2><p>Yeni aidat dönemlerinde kullanılacak varsayılan tutar</p></div></div><section class="panel accounting-settings-panel"><form id="accountingSettingsForm" class="accounting-settings-form"><label for="monthlyFeeAmount">Aylık aidat tutarı</label><div class="settings-amount-control"><input id="monthlyFeeAmount" name="monthlyFeeAmount" type="number" min="1" step="1" inputmode="numeric" value="${state.monthlyFeeAmount}" required><span>₺</span></div><button class="primary-button" type="submit">Kaydet</button></form><small class="form-hint settings-form-hint">Yeni aylarda Aidat tanımla formu bu tutarla açılır; geçmiş aidatlar değişmez.</small></section></div>`;
}

function accountingEntryRows(entries) {
  return entries.map(entry => `<div class="ledger-entry" data-entry-id="${entry.id}"><div class="ledger-date"><strong>${formatAccountingDate(entry.date)}</strong><span class="entry-type ${entry.kind}">${entry.type}</span></div><div class="ledger-details"><strong>${entry.title}</strong></div><div class="ledger-amount"><span class="amount ${entry.kind}">${entry.kind === 'income' ? '+' : '-'}${formatCurrency(entry.amount)}</span><small class="muted payment-method-label">${PAYMENT_METHODS[entry.paymentMethod] || 'Nakit'}</small></div><button class="ledger-menu-button" type="button" data-action="toggle-entry-actions" aria-label="${entry.title} işlem menüsünü aç" aria-expanded="false">...</button><div class="ledger-actions"><button class="secondary-button" type="button" data-action="edit-entry" data-id="${entry.id}">Düzenle</button><button class="danger-button" type="button" data-action="delete-entry" data-id="${entry.id}">Sil</button></div></div>`).join('') || '<div class="empty-state">Henüz muhasebe işlemi bulunmuyor.</div>';
}

function accountingEntriesView() {
  const periodEntries = accountingPeriodEntries();
  const filteredEntries = state.accountingFilter === 'all' ? periodEntries : periodEntries.filter(entry => entry.kind === state.accountingFilter);
  const filterLabel = state.accountingFilter === 'income' ? 'Gelir işlemleri' : state.accountingFilter === 'expense' ? 'Gider işlemleri' : 'Tüm işlemler';
  return `<div class="page-stack"><div class="section-heading"><div><h2>${filterLabel}</h2><p>${filteredEntries.length} kayıt · ${accountingPeriodLabel()}</p></div><button class="primary-button" data-action="new-entry">+ Yeni işlem</button></div>${accountingPeriodFiltersMarkup()}<div class="toolbar accounting-filters"><button class="${state.accountingFilter === 'all' ? 'primary-button' : 'secondary-button'}" type="button" data-action="accounting-entries" data-kind="all">Tümü</button><button class="${state.accountingFilter === 'income' ? 'primary-button' : 'secondary-button'}" type="button" data-action="accounting-entries" data-kind="income">Gelir</button><button class="${state.accountingFilter === 'expense' ? 'primary-button' : 'secondary-button'}" type="button" data-action="accounting-entries" data-kind="expense">Gider</button></div><section class="panel">${accountingEntryRows(filteredEntries)}</section></div>`;
}

function notificationsView() {
  const canSend = ['super_admin', 'admin'].includes(state.role);
  const canDelete = isAdminRole();
  const pushEnabled = state.pushStatus === 'enabled';
  const pushUnsupported = state.pushStatus === 'unsupported';
  const pushDenied = state.pushStatus === 'denied';
  const pushChecking = state.pushStatus === 'checking';
  const pushStatusLabel = state.pushBusy
    ? 'İşleniyor…'
    : pushEnabled
      ? 'Açık'
      : pushDenied
        ? 'Engellendi'
        : pushUnsupported
          ? 'Desteklenmiyor'
          : pushChecking
            ? 'Kontrol ediliyor…'
            : 'Kapalı';
  const pushSwitchDisabled = state.pushBusy || pushUnsupported || pushDenied || pushChecking;
  const pushDescription = pushEnabled
    ? 'Bu cihaz sistem bildirimlerini alacak.'
    : pushDenied
      ? 'Android uygulama ayarlarından bildirim iznini açın.'
      : 'Yeni duyuruları telefonunuzun bildirim alanında görün.';
  const pushPermissionCard = `<section class="panel push-permission-card"><div class="push-permission-row"><div class="push-permission-copy"><strong>Telefon bildirimleri</strong><small>${pushDescription}</small></div><label class="push-switch-control"><span>${pushStatusLabel}</span><input type="checkbox" role="switch" data-action="toggle-phone-notifications" aria-label="Telefon bildirimlerini ${pushEnabled ? 'kapat' : 'aç'}" ${pushEnabled ? 'checked' : ''} ${pushSwitchDisabled ? 'disabled' : ''}><span class="push-switch-track" aria-hidden="true"><span class="push-switch-thumb"></span></span></label></div></section>`;
  const audienceOptions = ['Tüm kullanıcılar', 'Tüm veliler', 'Aidat borcu olanlar', 'Aidat borcu olmayanlar', ...GROUPS.map(group => `${group} velileri`)];
  const composePanel = canSend ? `<section class="panel"><details class="notification-compose-disclosure" ${state.notificationComposeOpen ? 'open' : ''}><summary><h3>Yeni bildirim oluştur</h3><span class="status blue">Telefon bildirimi</span><span class="disclosure-chevron" aria-hidden="true">⌄</span></summary><form class="notification-compose" id="notificationForm"><label>Alıcı grubu<select id="notificationAudience" name="audience" required>${audienceOptions.map(audience => `<option ${state.notificationDraft.audience === audience ? 'selected' : ''}>${escapeHtml(audience)}</option>`).join('')}</select></label><label>Başlık<input id="notificationTitle" name="title" required placeholder="Örn. Antrenman saati değişikliği" value="${escapeHtml(state.notificationDraft.title)}"></label><label>Mesaj<textarea id="notificationMessage" name="message" rows="3" required placeholder="Bildirim metnini yazın">${escapeHtml(state.notificationDraft.body)}</textarea></label><div class="compose-actions"><button class="primary-button" type="submit">Bildirimi gönder</button></div></form></details></section>` : '';
  const notificationRows = state.notifications.map(item => {
    const sentByCurrentUser = item.sentBy === state.userId;
    const recipientStatus = item.read ? 'Okundu' : 'Okunmadı';
    const visibleStatus = sentByCurrentUser ? item.status : recipientStatus;
    const deleteButton = canDelete ? `<button class="notification-delete-button" type="button" data-action="delete-notification" data-id="${item.id}" aria-label="${escapeHtml(item.title)} bildirimini sil">Sil</button>` : '';
    const metricsAvailable = item.recipientCount !== null && item.deliveredCount !== null;
    const deliverySucceeded = Number(item.deliveredCount) > 0;
    const deliveryStatus = metricsAvailable
      ? `<span class="status ${deliverySucceeded ? 'notification-delivery-status' : 'danger'}">${deliverySucceeded ? 'Teslim edildi' : 'Teslim edilemedi'} ${item.deliveredCount}/${item.recipientCount}</span>`
      : `<span class="status">${escapeHtml(item.status)}</span>`;
    const readStatus = metricsAvailable
      ? `<span class="status blue notification-read-status">Okundu ${item.readCount || 0}/${item.deliveredCount}</span>`
      : '';
    const statusMarkup = canDelete
      ? `<div class="notification-metrics">${deliveryStatus}${readStatus}</div>`
      : `<span class="status ${!sentByCurrentUser && !item.read ? 'warning' : ''}">${escapeHtml(visibleStatus)}</span>`;
    const senderLabel = item.senderLabel || (!item.sentBy || item.audience === 'Abonelik işlemi'
      ? 'SASA-F'
      : (state.schoolName || 'Okul'));
    const destinationPage = item.title === 'Yeni futbol okulu başvurusu' && state.role === 'super_admin'
      ? 'applications'
      : '';
    const destinationAttributes = destinationPage
      ? ` data-page="${destinationPage}" role="button" tabindex="0" aria-label="${escapeHtml(item.title)} bildirimini aç"`
      : '';
    return `<div class="list-row notification-list-row"><span class="time">${escapeHtml(item.date)}</span><div class="notification-list-content"${destinationAttributes}><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.body || '')}</p><small>${escapeHtml(senderLabel)} --> ${escapeHtml(notificationTargetLabel(item.audience))} · ${escapeHtml(item.time)}</small></div>${deleteButton}${statusMarkup}</div>`;
  }).join('');
  return `<div class="page-stack"><div class="section-heading"><div><h2>Bildirim merkezi</h2><p>Telefon bildirimleri ve gönderilen duyurular</p></div></div>${pushPermissionCard}${composePanel}<section class="panel"><div class="panel-heading"><h3>Son bildirimler</h3><span class="status">${state.notifications.length} kayıt</span></div>${notificationRows}</section></div>`;
}

function accessRequestRoleDetail(request) {
  if (request.requestedRole === 'coach' || request.requestedRole === 'admin') {
    return request.contextSchoolName || state.schoolName || '';
  }
  if (request.requestedRole === 'parent') {
    return request.contextStudentName
      || state.students.find(student => String(student.email || '').toLocaleLowerCase('tr') === String(request.email || '').toLocaleLowerCase('tr'))?.name
      || '';
  }
  return '';
}

function accessRequestRoleLabel(request) {
  const roleLabel = roleNames[request.requestedRole] || request.requestedRole || 'Kullanıcı';
  const detail = accessRequestRoleDetail(request);
  return detail ? `${roleLabel} (${detail})` : roleLabel;
}

function userApprovalsView() {
  const accessRequestsLoaded = Number(state.accessRequestsLoadedAt || 0) > 0;
  const isInitialLoading = !accessRequestsLoaded && !state.accessRequests.length;
  const selectedRoleFilter = ['all', 'admin', 'coach', 'parent'].includes(state.accessRequestRoleFilter)
    ? state.accessRequestRoleFilter
    : 'all';
  const selectedSortOrder = ['name_asc', 'approved_desc', 'approved_asc'].includes(state.accessRequestSortOrder)
    ? state.accessRequestSortOrder
    : 'name_asc';
  const accessRequestSearchQuery = String(state.accessRequestSearchQuery || '').trim();
  const normalizedAccessRequestSearch = accessRequestSearchQuery.toLocaleLowerCase('tr');
  const visibleRequests = state.role === 'super_admin'
    ? state.accessRequests
    : state.accessRequests.filter(request => request.requestedRole === 'parent');
  const roleFilteredRequests = selectedRoleFilter === 'all'
    ? visibleRequests
    : visibleRequests.filter(request => request.requestedRole === selectedRoleFilter);
  const filteredRequests = normalizedAccessRequestSearch
    ? roleFilteredRequests.filter(request => {
      const searchableText = [
        request.fullName,
        request.email,
        roleNames[request.requestedRole],
        accessRequestRoleDetail(request),
        accessRequestRoleLabel(request)
      ].filter(Boolean).join(' ').toLocaleLowerCase('tr');
      return searchableText.includes(normalizedAccessRequestSearch);
    })
    : roleFilteredRequests;
  const sortedRequests = [...filteredRequests].sort((first, second) => {
    if (selectedSortOrder === 'name_asc') {
      return String(first.fullName || '').localeCompare(String(second.fullName || ''), 'tr', { sensitivity: 'base' });
    }
    const firstDate = new Date(first.reviewedAt || first.createdAt || 0).getTime() || 0;
    const secondDate = new Date(second.reviewedAt || second.createdAt || 0).getTime() || 0;
    return selectedSortOrder === 'approved_asc' ? firstDate - secondDate : secondDate - firstDate;
  });
  const roleFilterOptions = [
    ['all', 'Tümü'],
    ['admin', 'Admin'],
    ['coach', 'Antrenör'],
    ['parent', 'Veli']
  ];
  const roleFilter = `<label class="training-sort-control"><span>Rol</span><select id="accessRequestRoleFilter" aria-label="Kullanıcı onaylarını role göre filtrele">${roleFilterOptions.map(([value, label]) => `<option value="${value}" ${selectedRoleFilter === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`;
  const sortFilter = `<label class="training-sort-control"><span>Sırala</span><select id="accessRequestSortOrder" aria-label="Kullanıcı onaylarını sırala"><option value="name_asc" ${selectedSortOrder === 'name_asc' ? 'selected' : ''}>A’dan Z’ye</option><option value="approved_desc" ${selectedSortOrder === 'approved_desc' ? 'selected' : ''}>Onay tarihi · Yeni-eski</option><option value="approved_asc" ${selectedSortOrder === 'approved_asc' ? 'selected' : ''}>Onay tarihi · Eski-yeni</option></select></label>`;
  const searchFilter = `<input class="search-input" id="accessRequestSearch" type="search" value="${escapeHtml(accessRequestSearchQuery)}" placeholder="İsim veya okul ara" aria-label="Kullanıcı onaylarında isim veya okul adına göre ara">`;
  const pendingRequests = sortedRequests.filter(request => request.status === 'pending');
  const approvedRequests = sortedRequests.filter(request => request.status === 'approved');
  const pendingCountLabel = isInitialLoading ? 'Yükleniyor' : `${pendingRequests.length} bekleyen erişim talebi`;
  const filteredCountLabel = isInitialLoading ? 'Yükleniyor' : `${filteredRequests.length} / ${visibleRequests.length} kullanıcı`;
  const pendingBadgeLabel = isInitialLoading ? '—' : `${pendingRequests.length} talep`;
  const approvedBadgeLabel = isInitialLoading ? '—' : `${approvedRequests.length} kullanıcı`;
  const pendingRows = pendingRequests.map(request => {
    const emailVerified = Boolean(request.emailVerifiedAt);
    const roleControl = state.role === 'super_admin'
      ? `<select id="approval-role-${request.id}" aria-label="${escapeHtml(request.fullName)} için kullanıcı rolü" ${emailVerified ? '' : 'disabled'}>
        <option value="admin" ${request.requestedRole === 'admin' ? 'selected' : ''}>Admin</option>
        <option value="coach" ${request.requestedRole === 'coach' ? 'selected' : ''}>Antrenör</option>
        <option value="parent" ${request.requestedRole === 'parent' ? 'selected' : ''}>Veli</option>
      </select>`
      : `<input type="hidden" id="approval-role-${request.id}" value="parent"><span class="status blue">Veli</span>`;
    return `
    <div class="approval-row">
      <div>
        <strong>${escapeHtml(request.fullName)}</strong>
        <small>${escapeHtml(request.email)} · ${escapeHtml(accessRequestRoleLabel(request))}</small>
        <span class="status ${emailVerified ? '' : 'warning'}">${emailVerified ? 'E-posta doğrulandı' : 'E-posta doğrulaması bekleniyor'}</span>
      </div>
      ${roleControl}
      <div class="approval-actions">
        <label class="approval-switch-control pending"><span>${emailVerified ? 'Onay bekliyor' : 'Doğrulama bekleniyor'}</span><input type="checkbox" role="switch" aria-label="${escapeHtml(request.fullName)} kullanıcısını onayla" data-action="approve-user" data-id="${request.id}" ${emailVerified ? '' : 'disabled'}><span class="approval-switch-track" aria-hidden="true"><span class="approval-switch-thumb"></span></span></label>
      </div>
    </div>`;
  }).join('');
  const resolvedRows = approvedRequests.slice(0, 10).map(request => `
    <div class="list-row">
      <div class="approval-status-stack"><span class="status">Onaylandı</span>${request.reviewedAt ? `<small class="muted">${escapeHtml(formatDateTime(request.reviewedAt))}</small>` : ''}</div>
      <div><strong>${escapeHtml(request.fullName)}</strong><small>${escapeHtml(request.email)} · ${escapeHtml(accessRequestRoleLabel(request))}</small></div>
      ${state.role === 'super_admin' ? `<label class="approval-switch-control"><span>Onaylı</span><input type="checkbox" role="switch" checked aria-label="${escapeHtml(request.fullName)} kullanıcısının onayını kaldır" data-action="revoke-user-approval" data-id="${request.id}"><span class="approval-switch-track" aria-hidden="true"><span class="approval-switch-thumb"></span></span></label>` : '<span class="status">Onaylı</span>'}
    </div>`).join('');
  const loadingHint = isInitialLoading ? '<div class="panel empty-state">Kullanıcı onayları yükleniyor...</div>' : '';
  return `<div class="page-stack"><div class="section-heading"><div><h2>Kullanıcı onayları</h2><p>${pendingCountLabel}</p></div></div><div class="access-requests-toolbar"><div class="access-requests-filter-row">${roleFilter}${sortFilter}</div><div class="access-requests-search-row">${searchFilter}<span class="muted" aria-live="polite">${filteredCountLabel}</span></div></div>${loadingHint}<details class="panel group-settings-panel approval-section-panel"><summary class="group-settings-summary"><div><h3>Onay bekleyenler</h3><small class="muted">${pendingBadgeLabel}</small></div><span class="status warning">${pendingBadgeLabel}</span><span class="disclosure-chevron" aria-hidden="true">⌄</span></summary><div class="approval-section-content">${isInitialLoading ? '<div class="empty-state">Kullanıcı onayları yükleniyor...</div>' : pendingRows || '<div class="empty-state">Onay bekleyen kullanıcı bulunmuyor.</div>'}</div></details><details class="panel group-settings-panel approval-section-panel"><summary class="group-settings-summary"><div><h3>Onaylanmış kullanıcılar</h3><small class="muted">${approvedBadgeLabel}</small></div><span class="status">${approvedBadgeLabel}</span><span class="disclosure-chevron" aria-hidden="true">⌄</span></summary><div class="approval-section-content">${isInitialLoading ? '<div class="empty-state">Kullanıcı onayları yükleniyor...</div>' : resolvedRows || '<div class="empty-state">Onaylanmış kullanıcı bulunmuyor.</div>'}</div></details></div>`;
}

function emailTypeLabel(type) {
  return ({
    school_application_invite: 'Okul başvurusu daveti',
    school_admin_invite: 'Okul admin daveti',
    coach_invite: 'Antrenör daveti',
    guardian_invite: 'Veli daveti',
    subscription_renewal_reminder: 'Abonelik hatırlatma',
    password_reset_request: 'Şifre yenileme talebi'
  })[type] || 'Sistem maili';
}

function emailStatusLabel(status) {
  return ({ sent: 'Gönderildi', queued: 'Sırada', failed: 'Hata', skipped: 'Atlandı' })[status] || status || 'Bilinmiyor';
}

function emailLogsView() {
  const rows = state.emailLogs.map(log => {
    const school = Array.isArray(log.schools) ? log.schools[0] : log.schools;
    const schoolName = school?.name || 'Genel';
    const statusClass = log.status === 'failed' ? 'danger' : log.status === 'sent' ? '' : 'blue';
    return `<div class="list-row notification-list-row"><span class="time">${escapeHtml(formatDateTime(log.created_at))}</span><div class="notification-list-content"><strong>${escapeHtml(emailTypeLabel(log.email_type))}</strong><p>${escapeHtml(log.subject || '')}</p><small>${escapeHtml(log.recipient_name || '')}${log.recipient_name ? ' · ' : ''}${escapeHtml(log.recipient_email)} · ${escapeHtml(schoolName)}</small></div><span class="status ${statusClass}">${escapeHtml(emailStatusLabel(log.status))}</span></div>`;
  }).join('');
  return `<div class="page-stack"><div class="section-heading"><div><h2>E-posta kayıtları</h2><p>Sistemden gönderilen mail hareketleri</p></div></div><section class="panel"><div class="panel-heading"><h3>Son 100 kayıt</h3><span class="status blue">${state.emailLogs.length} kayıt</span></div>${rows || '<div class="empty-state">Henüz e-posta kaydı bulunmuyor.</div>'}</section></div>`;
}

const views = { dashboard: dashboardView, schools: schoolsView, settings: settingsView, subscriptions: subscriptionsView, applications: applicationsView, subscriptionPayments: subscriptionPaymentsView, emailLogs: emailLogsView, help: helpView, onboarding: onboardingView, bankSettings: bankSettingsView, subscriptionBankSettings: subscriptionBankSettingsView, students: studentsView, studentSettings: studentSettingsView, studentProfile: studentProfileView, studentAttendanceHistory: studentAttendanceHistoryView, child: studentProfileView, trainings: trainingsView, trainingSettings: trainingSettingsView, attendance: attendanceView, fees: feesView, parentPayment: parentPaymentView, parentBankTransfer: parentBankTransferView, parentCardPayment: parentCardPaymentView, accounting: accountingView, accountingSettings: accountingSettingsView, accountingEntries: accountingEntriesView, userApprovals: userApprovalsView, notifications: notificationsView };

function captureNotificationDraftFromDom() {
  if (skipNextNotificationDraftCapture) {
    skipNextNotificationDraftCapture = false;
    return;
  }
  const form = document.querySelector('#notificationForm');
  if (!form) return;
  const audienceField = form.querySelector('#notificationAudience');
  const titleField = form.querySelector('#notificationTitle');
  const messageField = form.querySelector('#notificationMessage');
  state.notificationDraft = {
    audience: audienceField?.value || state.notificationDraft.audience || 'Tüm kullanıcılar',
    title: titleField?.value || '',
    body: messageField?.value || ''
  };
}

function render() {
  captureNotificationDraftFromDom();
  if (!navItems[state.page]?.roles.includes(state.role)) state.page = 'dashboard';
  state.page = subscriptionGatePage(state.page);
  if (adminMustChooseSubscription()) state.pageHistory = [];
  persistNavigationState();
  renderNavigation();
  const [title, subtitle] = pageMeta[state.page];
  document.querySelector('#pageTitle').textContent = title;
  document.querySelector('#pageSubtitle').textContent = state.schoolName ? `${subtitle} · ${state.schoolName}` : subtitle;
  document.querySelector('#sidebarRole').textContent = state.userEmail || roleNames[state.role];
  document.querySelector('#sidebarUser').textContent = state.userFullName || state.userEmail || 'SASA-F Kullanıcısı';
  const bannerSubtitle = state.role === 'super_admin'
    ? 'Futbol Okulu Yönetim Sistemi'
    : state.schoolName || 'Futbol Okulu';
  document.querySelector('#appBannerSubtitle').textContent = bannerSubtitle;
  document.querySelector('#sidebarBannerSubtitle').textContent = bannerSubtitle;
  const topbarSessionRole = document.querySelector('#topbarSessionRole');
  topbarSessionRole.textContent = roleNames[state.role];
  topbarSessionRole.classList.toggle('is-hidden', isActualSuperAdmin() || state.role === 'parent');
  const rolePreviewSelect = document.querySelector('#rolePreviewSelect');
  rolePreviewSelect.classList.toggle('is-hidden', !isActualSuperAdmin());
  rolePreviewSelect.value = state.role;
  const schoolSwitcher = document.querySelector('#schoolSwitcher');
  const schoolSelect = document.querySelector('#schoolSelect');
  const currentSchoolName = document.querySelector('#currentSchoolName');
  const canSwitchSchool = isActualSuperAdmin();
  schoolSwitcher.classList.toggle('is-hidden', !canSwitchSchool);
  currentSchoolName.classList.toggle('is-hidden', canSwitchSchool || !state.schoolName);
  currentSchoolName.textContent = state.schoolName || 'Futbol Okulu';
  document.querySelector('.topbar').classList.toggle('has-school-switcher', canSwitchSchool);
  document.querySelector('.topbar').classList.toggle('has-current-school-name', !canSwitchSchool && Boolean(state.schoolName));
  if (canSwitchSchool) {
    setSafeHtml(schoolSelect, state.schools.map(school => `<option value="${school.id}" ${school.id === state.schoolId ? 'selected' : ''}>${escapeHtml(school.name)}${school.active ? '' : ' (Pasif)'}${!isActualSuperAdmin() && school.role ? ` · ${escapeHtml(roleNames[school.role])}` : ''}</option>`).join(''));
    schoolSelect.disabled = state.schools.length < 2;
  }
  updateNotificationUnreadBadge();
  globalBackButton.classList.toggle('is-hidden', state.page === 'dashboard');
  globalBackButton.disabled = state.page === 'dashboard';
  document.querySelector('.user-avatar').textContent = initials(state.userFullName || state.userEmail || 'SF');
  setSafeHtml(appContent, views[state.page]());
  appContent.focus({ preventScroll: true });
}

function patchVisiblePageFromRealtime() {
  if (!appContent || appShell.classList.contains('is-hidden')) return;
  captureNotificationDraftFromDom();
  const template = document.createElement('template');
  template.innerHTML = sanitizedHtml(views[state.page]());
  const currentRoots = [...appContent.children];
  const nextRoots = [...template.content.children];
  const activeElement = document.activeElement;

  if (currentRoots.length !== nextRoots.length) {
    appContent.replaceChildren(...nextRoots);
  } else {
    currentRoots.forEach((currentRoot, rootIndex) => {
      const nextRoot = nextRoots[rootIndex];
      if (!nextRoot || currentRoot.tagName !== nextRoot.tagName || currentRoot.className !== nextRoot.className) {
        currentRoot.replaceWith(nextRoot);
        return;
      }
      const currentChildren = [...currentRoot.children];
      const nextChildren = [...nextRoot.children];
      if (currentChildren.length !== nextChildren.length) {
        if (!currentRoot.contains(activeElement)) currentRoot.replaceWith(nextRoot);
        return;
      }
      currentChildren.forEach((currentChild, childIndex) => {
        const nextChild = nextChildren[childIndex];
        if (!nextChild || currentChild.outerHTML === nextChild.outerHTML || currentChild.contains(activeElement)) return;
        currentChild.replaceWith(nextChild);
      });
    });
  }

  updateNotificationUnreadBadge();
  const currentSchoolName = document.querySelector('#currentSchoolName');
  if (currentSchoolName) currentSchoolName.textContent = state.schoolName || 'Futbol Okulu';
  const pageSubtitle = document.querySelector('#pageSubtitle');
  if (pageSubtitle) {
    const subtitle = pageMeta[state.page]?.[1] || '';
    pageSubtitle.textContent = state.schoolName ? `${subtitle} · ${state.schoolName}` : subtitle;
  }
}

function updateNotificationUnreadBadge() {
  const unreadCount = state.notifications.filter(notification => !notification.read).length;
  const badge = document.querySelector('#notificationUnreadBadge');
  const button = badge?.closest('.topbar-notification-button');
  if (!badge || !button) return;
  badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
  badge.classList.toggle('is-hidden', unreadCount === 0);
  button.setAttribute('aria-label', unreadCount
    ? `Bildirimleri aç, ${unreadCount} okunmamış bildirim`
    : 'Bildirimleri aç');
}

async function markAllNotificationsRead() {
  const unreadNotifications = state.notifications.filter(notification =>
    !notification.read
    && notification.id
    && !notificationReadIdsInFlight.has(Number(notification.id))
  );
  if (!unreadNotifications.length || !remoteDataStore) return;
  const notificationIds = unreadNotifications.map(notification => Number(notification.id));
  notificationIds.forEach(notificationId => notificationReadIdsInFlight.add(notificationId));
  unreadNotifications.forEach(notification => { notification.read = true; });
  if (state.page === 'notifications') render();
  else updateNotificationUnreadBadge();
  try {
    const updatedCounts = await remoteDataStore.markNotificationsRead(notificationIds);
    const readCountsById = new Map(updatedCounts.map(item => [Number(item.notificationId), Number(item.readCount)]));
    unreadNotifications.forEach(notification => {
      if (readCountsById.has(Number(notification.id))) {
        notification.readCount = readCountsById.get(Number(notification.id));
      }
    });
    if (state.page === 'notifications') render();
  } catch (error) {
    unreadNotifications.forEach(notification => { notification.read = false; });
    if (state.page === 'notifications') render();
    else updateNotificationUnreadBadge();
    showToast(`Bildirimler okundu olarak işaretlenemedi: ${error.message || 'Bağlantı hatası'}`);
  } finally {
    notificationIds.forEach(notificationId => notificationReadIdsInFlight.delete(notificationId));
  }
}

function showAuthMessage(message = '', isError = false) {
  authMessage.textContent = message;
  authMessage.classList.toggle('is-hidden', !message);
  authMessage.classList.toggle('error', Boolean(message) && isError);
}

function setAuthPending(pending) {
  authRequestPending = pending;
  loginSubmitButton.disabled = pending;
  loginSubmitButton.textContent = pending ? 'Lütfen bekleyin…' : authMode === 'set-password' ? 'Şifremi kaydet' : authMode === 'reset-password' ? 'Bağlantı gönder' : 'Giriş yap';
}

function configureAuthForm(mode = 'login') {
  authMode = ['login', 'set-password', 'reset-password'].includes(mode) ? mode : 'login';
  const settingPassword = mode === 'set-password';
  const resettingPassword = mode === 'reset-password';
  document.querySelector('#authEyebrow').textContent = settingPassword ? 'HESABINIZI ETKİNLEŞTİRİN' : resettingPassword ? 'ŞİFRE YENİLEME' : 'HOŞ GELDİNİZ';
  document.querySelector('#authTitle').textContent = settingPassword ? 'Şifrenizi belirleyin' : resettingPassword ? 'E-posta adresinizi yazın' : 'Kulübünüz tek ekranda';
  document.querySelector('#authDescription').textContent = settingPassword
    ? 'SASA-F hesabınız için en az 8 karakterli yeni bir şifre oluşturun.'
    : resettingPassword
      ? 'Şifre yenileme bağlantısını gönderebilmemiz için kayıtlı e-posta adresinizi girin.'
      : 'Öğrenci, antrenman, aidat ve kulüp yönetimine güvenli erişim.';
  document.querySelector('#authEmailField').classList.toggle('is-hidden', settingPassword);
  document.querySelector('#authPasswordField').classList.toggle('is-hidden', resettingPassword);
  document.querySelector('#authPasswordConfirmField').classList.toggle('is-hidden', !settingPassword);
  document.querySelector('#authSecondaryActions').classList.toggle('is-hidden', settingPassword || resettingPassword);
  document.querySelector('#backToLoginButton').classList.toggle('is-hidden', !settingPassword && !resettingPassword);
  document.querySelector('#pendingAccessLogoutButton')?.classList.add('is-hidden');
  loginEmail.required = !settingPassword;
  loginPassword.required = !resettingPassword;
  loginPasswordConfirm.required = settingPassword;
  loginPassword.autocomplete = settingPassword ? 'new-password' : 'current-password';
  loginPassword.value = '';
  loginPasswordConfirm.value = '';
  showAuthMessage();
  setAuthPending(false);
}

function showLoginScreen(message = '', isError = false) {
  appShell.classList.add('is-hidden');
  authScreen.classList.remove('is-hidden');
  adminMfaForm.classList.add('is-hidden');
  loginForm.classList.remove('is-hidden');
  configureAuthForm('login');
  loginSubmitButton.classList.remove('is-hidden');
  showAuthMessage(message, isError);
  window.setTimeout(() => loginEmail.focus(), 0);
}

function showPendingAccessScreen(request = {}) {
  const school = Array.isArray(request.schools) ? request.schools[0] : request.schools;
  const schoolName = school?.name || request.school_name || request.schoolName || 'okul';
  appShell.classList.add('is-hidden');
  authScreen.classList.remove('is-hidden');
  adminMfaForm.classList.add('is-hidden');
  loginForm.classList.remove('is-hidden');
  configureAuthForm('login');
  document.querySelector('#authEyebrow').textContent = 'ONAY BEKLENİYOR';
  document.querySelector('#authTitle').textContent = 'Kayıt onayı bekleniyor';
  document.querySelector('#authDescription').textContent = `Kayıt işleminiz ${schoolName} okulu yetkilisi tarafından onay beklemektedir. Lütfen daha sonra tekrar deneyiniz.`;
  document.querySelector('#authEmailField').classList.add('is-hidden');
  document.querySelector('#authPasswordField').classList.add('is-hidden');
  document.querySelector('#authPasswordConfirmField').classList.add('is-hidden');
  document.querySelector('#authSecondaryActions').classList.add('is-hidden');
  loginSubmitButton.classList.add('is-hidden');
  document.querySelector('#pendingAccessLogoutButton')?.classList.remove('is-hidden');
  showAuthMessage();
  setAuthPending(false);
}

function showAdminMfaMessage(message = '', isError = false) {
  adminMfaMessage.textContent = message;
  adminMfaMessage.classList.toggle('is-hidden', !message);
  adminMfaMessage.classList.toggle('error', Boolean(message) && isError);
}

function finishAdminMfa(result) {
  const pending = pendingAdminMfa;
  pendingAdminMfa = null;
  adminMfaSubmitButton.disabled = false;
  adminMfaSubmitButton.textContent = 'Doğrula ve devam et';
  adminMfaCode.value = '';
  adminMfaForm.classList.add('is-hidden');
  pending?.resolve(result);
}

async function requireAdminMfa() {
  return true;
}

function showSubscriptionBlockedScreen() {
  showLoginScreen('Abonelik yeniden etkinleştirildiğinde mevcut bilgilerinizle giriş yapabilirsiniz.', true);
  document.querySelector('#authEyebrow').textContent = 'ABONELİK DURUMU';
  document.querySelector('#authTitle').textContent = 'Aboneliğiniz durduruldu';
  document.querySelector('#authDescription').textContent = 'Uygulamaya yeniden erişebilmek için okul yöneticinizin aboneliği etkinleştirmesi gerekir.';
}

function showPasswordSetupScreen() {
  appShell.classList.add('is-hidden');
  authScreen.classList.remove('is-hidden');
  configureAuthForm('set-password');
  window.setTimeout(() => loginPassword.focus(), 0);
}

function showExpiredPasswordLinkScreen() {
  appShell.classList.add('is-hidden');
  authScreen.classList.remove('is-hidden');
  adminMfaForm.classList.add('is-hidden');
  loginForm.classList.remove('is-hidden');
  configureAuthForm('reset-password');
  showAuthMessage('Bu şifre yenileme bağlantısı kullanılmış veya süresi dolmuş. Lütfen yeni bir bağlantı isteyin.', true);
  window.setTimeout(() => loginEmail.focus(), 0);
}

function applyRemoteData(remoteData) {
  const schoolChanged = state.schoolId && state.schoolId !== remoteData.schoolId;
  if (schoolChanged && typeof loadedPageData !== 'undefined') {
    loadedPageData.clear();
    pendingPageDataLoads.clear();
  }
  state.schoolId = remoteData.schoolId;
  state.schoolName = remoteData.schoolName || state.schools.find(school => school.id === remoteData.schoolId)?.name || '';
  state.schoolSubscriptionPlan = remoteData.subscriptionPlan || state.schools.find(school => school.id === remoteData.schoolId)?.subscriptionPlan || 'standard';
  state.schoolSubscriptionStatus = remoteData.subscriptionStatus || state.schools.find(school => school.id === remoteData.schoolId)?.subscriptionStatus || 'trial';
  state.schoolSubscriptionTrialMode = remoteData.subscriptionTrialMode || state.schools.find(school => school.id === remoteData.schoolId)?.subscriptionTrialMode || null;
  state.schoolSubscriptionBillingPeriod = remoteData.subscriptionBillingPeriod || state.schools.find(school => school.id === remoteData.schoolId)?.subscriptionBillingPeriod || 'monthly';
  state.schoolSubscriptionStartsOn = remoteData.subscriptionStartsOn || state.schools.find(school => school.id === remoteData.schoolId)?.subscriptionStartsOn || '';
  state.schoolSubscriptionEndsOn = remoteData.subscriptionEndsOn || state.schools.find(school => school.id === remoteData.schoolId)?.subscriptionEndsOn || '';
  state.students = remoteData.students;
  state.trainings = remoteData.trainings;
  state.accountingEntries = remoteData.accountingEntries;
  state.notifications = remoteData.notifications;
  state.attendanceRecords = remoteData.attendanceRecords;
  setAccessRequestsFromRows(remoteData.accessRequests || [], {
    preserveEmpty: state.page === 'userApprovals' && Number(state.accessRequestsLoadedAt || 0) > 0
  });
  state.monthlyFeeAmount = Number(remoteData.monthlyFeeAmount) > 0 ? Number(remoteData.monthlyFeeAmount) : 1500;
  const remoteBankAccounts = Array.isArray(remoteData.bankAccounts)
    ? remoteData.bankAccounts
    : remoteData.bankDetails?.iban ? [remoteData.bankDetails] : [];
  state.schoolBankAccounts = remoteBankAccounts.slice(0, 4).map(account => ({
    bankName: account?.bankName || '',
    accountHolder: account?.accountHolder || '',
    iban: normalizeIban(account?.iban)
  })).filter(account => account.bankName || account.accountHolder || account.iban);
  state.trainingTypes = Array.isArray(remoteData.trainingTypes) ? remoteData.trainingTypes : state.trainingTypes;
  state.trainingCoaches = Array.isArray(remoteData.trainingCoaches) ? remoteData.trainingCoaches : state.trainingCoaches;
  state.trainingFields = Array.isArray(remoteData.trainingFields) ? remoteData.trainingFields : state.trainingFields;
  if (state.role === 'parent' && !state.students.some(student => Number(student.id) === Number(state.selectedParentStudentId))) {
    state.selectedParentStudentId = state.students[0]?.id || null;
  }
  const remoteGroups = [...new Set(remoteData.groups.map(group => group.name))];
  GROUPS = state.newestGroupPinned && state.newestGroupName && remoteGroups.includes(state.newestGroupName)
    ? [state.newestGroupName, ...remoteGroups.filter(group => group !== state.newestGroupName)]
    : remoteGroups;
  syncGroupOptions();
  syncTrainingTypeOptions();
  syncTrainingCoachOptions();
  syncTrainingFieldOptions();
  persistLocalData();
}

// Sayfa verileri açılışta topluca çekilmez. Bu yardımcılar ilgili sayfaya
// girildiğinde yalnız o modülün güncel dönem verisini Supabase'den alır.
const loadedPageData = new Map();
const pendingPageDataLoads = new Map();

function monthBounds(month = feeMonthKey()) {
  const [year, monthNumber] = String(month).split('-').map(Number);
  const start = new Date(year, monthNumber - 1, 1);
  const next = new Date(year, monthNumber, 1);
  const end = new Date(year, monthNumber, 0);
  return {
    from: localDateValue(start),
    to: localDateValue(end),
    next: localDateValue(next)
  };
}

function applyFeeRows(rows) {
  const currentMonth = feeMonthKey();
  rows.forEach(row => {
    const student = state.students.find(item => Number(item.id) === Number(row.student_id));
    if (!student) return;
    const month = String(row.fee_month || '').slice(0, 7);
    if (!month) return;
    student.feePayments ||= {};
    student.feeHistory ||= {};
    student.feePayments[month] = row.status;
    student.feeHistory[month] = {
      status: row.status,
      amount: row.amount === null ? null : Number(row.amount),
      note: row.note,
      source: row.source,
      paymentMethod: row.payment_method,
      paidAt: row.paid_at,
      createdAt: row.created_at
    };
    if (month === currentMonth) student.fee = row.status;
  });
}

function mapAccountingRows(rows) {
  return rows.map(row => ({
    id: Number(row.id), date: row.occurred_on, title: row.title,
    type: row.kind === 'income' ? 'Gelir' : 'Gider', amount: Number(row.amount), kind: row.kind,
    paymentMethod: row.payment_method, source: row.source, reference: row.reference,
    studentId: row.student_id ? Number(row.student_id) : null,
    feePeriodId: row.fee_period_id ? Number(row.fee_period_id) : null
  }));
}

function mapAttendanceRows(rows) {
  return rows.map(row => ({
    id: Number(row.id), trainingId: Number(row.training_id), date: row.taken_at,
    presentStudentIds: (row.attendance_records || []).filter(record => record.present).map(record => Number(record.student_id))
  }));
}

function mapAccessRequestRows(rows) {
  return (rows || []).map(row => ({
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
}

function accessRequestCacheKey() {
  if (!state.userId || !state.schoolId) return '';
  return `${ACCESS_REQUEST_CACHE_PREFIX}:${state.userId}:${state.schoolId}:${state.role}`;
}

function readCachedAccessRequests() {
  try {
    const key = accessRequestCacheKey();
    if (!key) return [];
    const cached = JSON.parse(window.localStorage.getItem(key) || '[]');
    return Array.isArray(cached) ? cached : [];
  } catch {
    return [];
  }
}

function writeCachedAccessRequests(rows) {
  try {
    const key = accessRequestCacheKey();
    if (!key || !rows.length) return;
    window.localStorage.setItem(key, JSON.stringify(rows.slice(0, 100)));
  } catch {
    // Session storage is best-effort only.
  }
}

function setAccessRequestsFromRows(rows, { preserveEmpty = false, markLoaded = true } = {}) {
  const nextAccessRequests = mapAccessRequestRows(rows);
  if (preserveEmpty && !nextAccessRequests.length) {
    const fallbackRows = state.accessRequests.length ? state.accessRequests : readCachedAccessRequests();
    if (fallbackRows.length) {
      state.accessRequests = fallbackRows;
      if (markLoaded) state.accessRequestsLoadedAt = Date.now();
      return state.accessRequests;
    }
  }
  state.accessRequests = nextAccessRequests;
  if (state.accessRequests.length) writeCachedAccessRequests(state.accessRequests);
  if (markLoaded) state.accessRequestsLoadedAt = Date.now();
  return state.accessRequests;
}

async function loadVisibleTrainingAttendance() {
  if (!remoteDataStore?.loadAttendanceForTrainings) return;
  const rows = await remoteDataStore.loadAttendanceForTrainings(state.trainings.map(training => training.id));
  state.attendanceRecords = mapAttendanceRows(rows);
}

function mapTrainingRows(rows) {
  return rows.map(row => ({
    id: Number(row.id), date: row.training_date, time: String(row.start_time || '').slice(0, 5),
    duration: Number(row.duration_minutes), group: row.training_groups?.name || 'Atanmamış',
    title: row.title, coach: row.coach, field: row.field
  }));
}

function mapNotificationRows(rows, reads) {
  const readIds = new Set(reads.map(row => Number(row.notification_id)));
  return rows.map(row => {
    const timestamp = row.sent_at || row.created_at;
    return {
      id: Number(row.id), date: notificationDate(timestamp), title: row.title, body: row.body,
      audience: row.audience, sentBy: row.sent_by, senderLabel: row.sender_label || '',
      time: new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp)),
      status: row.status === 'sent' ? 'Teslim edildi' : row.status === 'failed' || (row.status === 'queued' && Date.now() - new Date(timestamp).getTime() > 120000) ? 'Başarısız' : row.status === 'queued' ? 'Sırada' : 'Taslak',
      recipientCount: row.recipient_count === null ? null : Number(row.recipient_count),
      deliveredCount: row.delivered_count === null ? null : Number(row.delivered_count),
      readCount: Number(row.read_count || 0), read: readIds.has(Number(row.id))
    };
  });
}

function pageDataCacheKey(page = state.page) {
  const accountingMonth = state.accountingPeriod === 'month' && state.accountingMonth ? state.accountingMonth : feeMonthKey();
  const attendanceMonth = state.studentAttendanceMonth || feeMonthKey();
  return [
    state.userId || '',
    state.schoolId || '',
    state.role || '',
    state.actualRole || '',
    page,
    accountingMonth,
    attendanceMonth,
    state.accountingDateRangeStart || '',
    state.accountingDateRangeEnd || '',
    state.showPastTrainings ? 'past-trainings' : 'future-trainings',
    state.showPastAttendance ? 'past-attendance' : 'future-attendance'
  ].join(':');
}

async function loadPageData(page = state.page, { force = false } = {}) {
  if (!remoteDataStore || !state.schoolId || !state.userId) return;
  const accountingMonth = state.accountingPeriod === 'month' && state.accountingMonth ? state.accountingMonth : feeMonthKey();
  const attendanceMonth = state.studentAttendanceMonth || feeMonthKey();
  const key = pageDataCacheKey(page);
  if (!force && loadedPageData.get(key)) return;
  if (pendingPageDataLoads.has(key)) return pendingPageDataLoads.get(key);

  const task = (async () => {
    if (['students', 'studentProfile', 'studentAttendanceHistory'].includes(page) || (page === 'dashboard' && state.role === 'parent')) {
      const selectedStudent = state.students.find(item => Number(item.id) === Number(state.selectedStudentId)) || currentParentStudent();
      const paths = page === 'students'
        ? state.students.map(student => student.photoPath).filter(Boolean)
        : [selectedStudent?.photoPath].filter(Boolean);
      try {
        const photoUrls = await remoteDataStore.loadStudentPhotoUrls(paths);
        state.students.forEach(student => {
          if (photoUrls.has(student.photoPath)) student.photoUrl = photoUrls.get(student.photoPath);
        });
      } catch (error) {
        console.warn('Öğrenci fotoğrafları yüklenemedi:', error);
      }
    }
    if (['fees', 'studentProfile', 'parentPayment', 'parentBankTransfer', 'parentCardPayment'].includes(page)) {
      const selectedStudent = state.students.find(item => Number(item.id) === Number(state.selectedStudentId)) || currentParentStudent();
      const from = page === 'studentProfile' && selectedStudent?.enrollmentDate
        ? String(selectedStudent.enrollmentDate).slice(0, 7)
        : feeMonthKey();
      const shouldLoadUpcomingStudentFees = (page !== 'fees' || state.role === 'parent') && selectedStudent?.id;
      const to = shouldLoadUpcomingStudentFees ? upcomingFeeLoadEndMonth() : feeMonthKey();
      const studentId = page === 'fees' && state.role !== 'parent' ? null : selectedStudent?.id;
      applyFeeRows(await remoteDataStore.loadFeePeriods({ from, to, studentId }));
    }
    if (['dashboard', 'accounting', 'accountingEntries'].includes(page) && !isCoachRole() && state.role !== 'parent') {
      const bounds = monthBounds(accountingMonth);
      const from = state.accountingDateRangeStart || (state.accountingPeriod === 'today' ? localDateValue() : bounds.from);
      const to = state.accountingDateRangeEnd || (state.accountingPeriod === 'today' ? localDateValue() : bounds.to);
      state.accountingEntries = mapAccountingRows(await remoteDataStore.loadAccountingEntries({ from, to }));
    }
    if ((page === 'dashboard' && isCoachRole()) || ['attendance', 'studentAttendanceHistory', 'studentProfile'].includes(page)) {
      const bounds = monthBounds(attendanceMonth);
      const from = page === 'studentProfile' ? bounds.from : (state.studentAttendanceShowAll ? '' : bounds.from);
      const toExclusive = page === 'studentProfile' ? bounds.next : (state.studentAttendanceShowAll ? '' : bounds.next);
      state.attendanceRecords = mapAttendanceRows(await remoteDataStore.loadAttendanceSessions({ from, toExclusive }));
    }
    if (page === 'trainings') {
      const current = localDateValue();
      state.trainings = mapTrainingRows(await remoteDataStore.loadTrainings({ from: state.showPastTrainings ? '' : current }));
      await loadVisibleTrainingAttendance();
    }
    if (page === 'notifications') {
      const notificationData = await remoteDataStore.loadNotifications();
      state.notifications = mapNotificationRows(notificationData.notifications, notificationData.reads);
    }
    if (page === 'userApprovals') {
      const rows = await remoteDataStore.loadAccessRequests();
      setAccessRequestsFromRows(rows, { preserveEmpty: force || state.page === 'userApprovals' });
    }
    if (page === 'emailLogs') {
      state.emailLogs = await remoteDataStore.loadSystemEmailLogs();
    }
    loadedPageData.set(key, true);
  })().finally(() => pendingPageDataLoads.delete(key));
  pendingPageDataLoads.set(key, task);
  return task;
}

async function refreshSchools() {
  if (!remoteDataStore) return [];
  state.schools = await remoteDataStore.listSchools();
  return state.schools;
}

async function switchSchool(schoolId, { navigate = true } = {}) {
  if (!state.schools.some(school => school.id === schoolId)) return false;
  const selectedSchool = state.schools.find(school => school.id === schoolId);
  if (!selectedSchool?.active && (!isActualSuperAdmin() || !window.confirm('Bu okul pasif durumda. Yine de okulu açmak istiyor musunuz?'))) return false;
  try {
    let targetRole = state.actualRole;
    if (!isActualSuperAdmin()) {
      const activated = await remoteDataStore.activateUserSchool(schoolId);
      targetRole = activated?.role || selectedSchool.role;
      if (!roleNames[targetRole]) throw new Error('Okul rolü doğrulanamadı.');
    }
    const remoteData = await remoteDataStore.load({ school_id: schoolId, user_id: state.userId, role: targetRole });
    state.actualRole = targetRole;
    state.role = targetRole;
    state.selectedStudentId = null;
    state.selectedParentStudentId = null;
    state.notificationComposeOpen = false;
    applyRemoteData(remoteData);
    window.localStorage.setItem(SELECTED_SCHOOL_STORAGE_KEY, schoolId);
    if (navigate) {
      state.page = 'dashboard';
      state.pageHistory = [];
      initializeBrowserNavigation();
    }
    startRealtimeSync();
    render();
    return true;
  } catch (error) {
    showToast(error.message === 'SUBSCRIPTION_STOPPED'
      ? 'Bu okulun aboneliği durdurulmuş.'
      : `Okul verileri yüklenemedi: ${error.message || 'Bağlantı hatası'}`);
    return false;
  }
}

const REALTIME_TABLES = [
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
let realtimeChannel = null;
let realtimeRefreshTimer = null;
let realtimeReconnectTimer = null;
let visiblePageRefreshInterval = null;
let realtimeChannelStatus = 'closed';
let realtimeRefreshInFlight = false;
let realtimeRefreshQueued = false;
const realtimeChangedTables = new Set();

function stopVisiblePageRefreshGuard() {
  window.clearInterval(visiblePageRefreshInterval);
  visiblePageRefreshInterval = null;
}

function stopRealtimeSync({ clearPending = true } = {}) {
  window.clearTimeout(realtimeRefreshTimer);
  window.clearTimeout(realtimeReconnectTimer);
  stopVisiblePageRefreshGuard();
  realtimeRefreshTimer = null;
  realtimeReconnectTimer = null;
  realtimeRefreshQueued = false;
  realtimeChannelStatus = 'closed';
  if (clearPending) realtimeChangedTables.clear();
  if (realtimeChannel && supabaseClient) supabaseClient.removeChannel(realtimeChannel);
  realtimeChannel = null;
}

function userApprovalsPanelsOpen() {
  return state.page === 'userApprovals'
    && Boolean(document.querySelector('.approval-section-panel[open]'));
}

function applyStudentRows(rows) {
  const currentMonth = feeMonthKey();
  const byId = new Map(state.students.map(student => [Number(student.id), student]));
  state.students = (rows || []).map(row => {
    const previous = byId.get(Number(row.id));
    return {
      id: Number(row.id), name: row.full_name,
      birth: row.birth_date || row.birth_year || '',
      group: (state.actualRole === 'coach' ? row.group_name : row.training_groups?.name) || 'Atanmamış',
      position: (state.actualRole === 'coach' ? row.player_position : row.position) || '',
      parent: row.guardian_name || '', phone: row.phone || '', email: row.email || '', address: row.address || '', notes: row.notes || '',
      photoPath: row.profile_photo_path || '', photoUrl: previous?.photoPath === row.profile_photo_path ? previous.photoUrl : '',
      playerCard: row.player_card && typeof row.player_card === 'object' ? row.player_card : null,
      enrollmentDate: row.enrollment_date, feeTrackingStartDate: row.fee_tracking_start_date,
      monthlyFeeAmount: Number(row.monthly_fee_amount) || 0,
      feePayments: previous?.feePayments || {}, feeHistory: previous?.feeHistory || {},
      fee: previous?.feePayments?.[currentMonth] || 'none', attendance: Number(row.attendance_rate || 0),
      active: row.is_active !== false
    };
  });
}

async function refreshRemoteDataFromRealtime() {
  if (!remoteDataStore || !state.schoolId || !state.userId) return;
  if (realtimeRefreshInFlight) {
    realtimeRefreshQueued = true;
    return;
  }
  realtimeRefreshInFlight = true;
  try {
    const tables = new Set(realtimeChangedTables);
    realtimeChangedTables.clear();
    const currentMonth = feeMonthKey();
    const tasks = [];
    if (tables.has('students')) {
      tasks.push(remoteDataStore.loadStudents().then(applyStudentRows));
    }
    if (tables.has('fee_periods')) {
      tasks.push(remoteDataStore.loadFeePeriods({ from: currentMonth, to: currentMonth }).then(applyFeeRows));
    }
    if (tables.has('trainings')) {
      tasks.push(remoteDataStore.loadTrainings({ from: state.showPastTrainings || state.page === 'trainings' ? '' : localDateValue() }).then(rows => { state.trainings = mapTrainingRows(rows); }));
    }
    if (tables.has('accounting_entries') && ['dashboard', 'accounting', 'accountingEntries'].includes(state.page)) {
      const bounds = monthBounds(state.accountingMonth || currentMonth);
      tasks.push(remoteDataStore.loadAccountingEntries({ from: bounds.from, to: bounds.to }).then(rows => { state.accountingEntries = mapAccountingRows(rows); }));
    }
    if ((tables.has('attendance_sessions') || tables.has('attendance_records')) && state.page === 'trainings') {
      tasks.push(loadVisibleTrainingAttendance());
    }
    if ((tables.has('attendance_sessions') || tables.has('attendance_records')) && ['attendance', 'studentAttendanceHistory', 'studentProfile', 'dashboard'].includes(state.page)) {
      const bounds = monthBounds(state.studentAttendanceMonth || currentMonth);
      tasks.push(remoteDataStore.loadAttendanceSessions({ from: bounds.from, toExclusive: bounds.next }).then(rows => { state.attendanceRecords = mapAttendanceRows(rows); }));
    }
    if (tables.has('notifications') || tables.has('notification_reads') || tables.has('notification_recipients')) {
      tasks.push(remoteDataStore.loadNotifications().then(data => { state.notifications = mapNotificationRows(data.notifications, data.reads); }));
    }
    if (tables.has('access_requests') && state.page === 'userApprovals') {
      if (userApprovalsPanelsOpen()) {
        realtimeChangedTables.add('access_requests');
      } else {
      tasks.push(remoteDataStore.loadAccessRequests().then(rows => {
        setAccessRequestsFromRows(rows, { preserveEmpty: true, markLoaded: false });
      }));
      }
    }
    if (tables.has('school_applications') && state.page === 'applications' && isActualSuperAdmin()) {
      tasks.push(remoteDataStore.listSchoolApplications().then(rows => { state.schoolApplications = rows; }));
    }
    if (tables.has('subscription_payment_reports') && state.page === 'subscriptionPayments' && isActualSuperAdmin()) {
      tasks.push(remoteDataStore.listSubscriptionPaymentReports().then(rows => { state.subscriptionPaymentReports = rows; }));
    }
    if (tables.has('schools') && ['schools', 'subscriptions'].includes(state.page) && isActualSuperAdmin()) {
      tasks.push(refreshSchools());
    }
    if (tables.has('schools') || tables.has('training_groups') || tables.has('training_types') || tables.has('training_coaches') || tables.has('training_fields') || tables.has('school_user_memberships')) {
      tasks.push(remoteDataStore.loadConfiguration(state.actualRole).then(configuration => {
        state.schoolName = configuration.school.name || state.schoolName;
        state.monthlyFeeAmount = Number(configuration.school.monthly_fee_amount) || state.monthlyFeeAmount;
        state.trainingTypes = configuration.trainingTypes;
        state.trainingCoaches = configuration.trainingCoaches;
        state.trainingFields = configuration.trainingFields;
        GROUPS = configuration.groups.map(group => group.name);
      }));
    }
    await Promise.all(tasks);
    patchVisiblePageFromRealtime();
    if (state.page === 'notifications') markAllNotificationsRead();
  } catch (error) {
    console.error('Realtime veri yenileme hatası:', error);
  } finally {
    realtimeRefreshInFlight = false;
    if (realtimeRefreshQueued) {
      realtimeRefreshQueued = false;
      scheduleRealtimeRefresh();
    }
  }
}

function scheduleRealtimeRefresh(payload = null) {
  if (payload?.table === 'profiles' && payload.eventType === 'DELETE' && payload.old?.id === state.userId) {
    signedOutMessage = 'Uygulama erişiminiz Süper Admin tarafından kaldırıldı.';
    stopRealtimeSync();
    supabaseClient.auth.signOut();
    return;
  }
  if (payload?.table === 'schools' && payload.eventType === 'UPDATE' && payload.new?.id === state.schoolId && payload.new?.subscription_status === 'stopped' && !isActualSuperAdmin()) {
    signedOutMessage = 'SUBSCRIPTION_STOPPED';
    stopRealtimeSync();
    supabaseClient.auth.signOut();
    return;
  }
  if (payload?.table) realtimeChangedTables.add(payload.table);
  window.clearTimeout(realtimeRefreshTimer);
  realtimeRefreshTimer = window.setTimeout(refreshRemoteDataFromRealtime, 700);
}

function queueRealtimeReconnect(delay = 1500) {
  if (!supabaseClient || !state.schoolId || !state.userId || appShell.classList.contains('is-hidden')) return;
  window.clearTimeout(realtimeReconnectTimer);
  realtimeReconnectTimer = window.setTimeout(() => {
    startRealtimeSync({ preservePending: true });
  }, delay);
}

function startRealtimeSync({ preservePending = false } = {}) {
  stopRealtimeSync({ clearPending: !preservePending });
  if (!supabaseClient || !state.schoolId || !state.userId) return;
  realtimeChannelStatus = 'connecting';
  const channel = supabaseClient.channel(`sasa-school-${state.schoolId}-${state.userId}`);
  REALTIME_TABLES.forEach(table => {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleRealtimeRefresh);
  });
  realtimeChannel = channel;
  channel.subscribe(status => {
    realtimeChannelStatus = String(status || '').toLocaleLowerCase('en-US');
    if (['channel_error', 'timed_out', 'closed'].includes(realtimeChannelStatus)) {
      queueRealtimeReconnect(realtimeChannelStatus === 'timed_out' ? 2500 : 1500);
    }
  });
}

function queueVisiblePageDataRefresh() {
  if (!state.userId || !state.schoolId || appShell.classList.contains('is-hidden')) return;
  const page = state.page;
  const tables = new Set();
  if (['dashboard', 'students', 'studentProfile', 'studentAttendanceHistory', 'child', 'attendance', 'fees'].includes(page)) {
    tables.add('students');
  }
  if (['dashboard', 'trainings', 'attendance'].includes(page)) {
    tables.add('trainings');
    tables.add('attendance_sessions');
    tables.add('attendance_records');
  }
  if (['dashboard', 'accounting', 'accountingEntries'].includes(page)) {
    tables.add('accounting_entries');
  }
  if (page === 'notifications' && !state.notificationComposeOpen) {
    tables.add('notifications');
    tables.add('notification_reads');
    tables.add('notification_recipients');
  }
  if (page === 'userApprovals' && !userApprovalsPanelsOpen()) {
    refreshUserApprovalsOnResume();
  }
  if (!tables.size) return;
  tables.forEach(table => realtimeChangedTables.add(table));
  window.clearTimeout(realtimeRefreshTimer);
  realtimeRefreshTimer = window.setTimeout(refreshRemoteDataFromRealtime, 350);
}

function startVisiblePageRefreshGuard() {
  if (!state.userId || !state.schoolId || appShell.classList.contains('is-hidden')) return;
  if (document.visibilityState === 'hidden') return;
  if (visiblePageRefreshInterval) return;
  visiblePageRefreshInterval = window.setInterval(() => {
    if (document.visibilityState === 'hidden' || appShell.classList.contains('is-hidden')) {
      stopVisiblePageRefreshGuard();
      return;
    }
    queueVisiblePageDataRefresh();
  }, 7000);
}

function handleAppResume() {
  if (!state.userId || appShell.classList.contains('is-hidden')) return;
  startRealtimeSync({ preservePending: true });
  refreshPushStatus(state.page === 'notifications' || state.page === 'dashboard');
  if (state.page === 'schools' || state.page === 'subscriptions') {
    refreshSchools().then(render).catch(error => console.error('Okul verileri yenilenemedi:', error));
  } else if (state.page === 'applications') {
    remoteDataStore.listSchoolApplications().then(rows => { state.schoolApplications = rows; render(); }).catch(error => console.error('Başvurular yenilenemedi:', error));
  } else if (state.page === 'subscriptionPayments') {
    remoteDataStore.listSubscriptionPaymentReports().then(rows => { state.subscriptionPaymentReports = rows; render(); }).catch(error => console.error('Ödeme bildirimleri yenilenemedi:', error));
  } else {
    loadPageData(state.page, { force: true }).then(render).catch(error => console.error(`${state.page} verisi yenilenemedi:`, error));
  }
  queueVisiblePageDataRefresh();
}

let activeProfileLoad = null;
async function showAuthenticatedApp(user) {
  if (activeProfileLoad?.userId === user.id) return activeProfileLoad.promise;
  const loadPromise = (async () => {
  const { data: profile, error } = await supabaseClient
    .from('profiles')
    .select('full_name, role, school_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!error && !profile) {
    let request = null;
    const { data: pendingRequest, error: pendingRequestError } = await supabaseClient
      .rpc('pending_access_request_for_current_user');
    if (!pendingRequestError && Array.isArray(pendingRequest) && pendingRequest.length) {
      request = pendingRequest[0];
    } else {
      const { data: fallbackRequest } = await supabaseClient
        .from('access_requests')
        .select('status, requested_role')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      request = fallbackRequest;
    }
    if (request?.status === 'pending' && request.requested_role === 'parent') {
      showPendingAccessScreen(request);
      setAuthPending(false);
      return;
    }
    await supabaseClient.auth.signOut();
    const requestMessage = request?.status === 'pending'
      ? 'E-posta adresiniz doğrulandı. Uygulama erişiminiz yetkili onayı bekliyor.'
      : request?.status === 'rejected'
        ? 'Kullanıcı erişim talebiniz admin tarafından reddedildi.'
        : 'Bu hesap için yetkili bir SASA-F profili bulunamadı.';
    showLoginScreen(requestMessage, request?.status !== 'pending');
    return;
  }

  if (error || !roleNames[profile.role]) {
    await supabaseClient.auth.signOut();
    showLoginScreen('Kullanıcı yetkisi kontrol edilemedi. Lütfen tekrar deneyin.', true);
    return;
  }

  try {
    if (!(await requireAdminMfa(profile))) return;
  } catch (mfaError) {
    await supabaseClient.auth.signOut();
    showLoginScreen(`İki aşamalı doğrulama başlatılamadı: ${mfaError.message || 'Bağlantı hatası'}`, true);
    return;
  }

  if (!remoteDataStore) {
    showLoginScreen('Supabase veri bağlantısı yüklenemedi. Sayfayı yenileyip tekrar deneyin.', true);
    return;
  }

  authScreen.classList.remove('is-hidden');
  appShell.classList.add('is-hidden');
  configureAuthForm('login');
  document.querySelector('#authEyebrow').textContent = 'SASA-F.COM';
  document.querySelector('#authTitle').textContent = 'Kulüp verileri yükleniyor..';
  document.querySelector('#authDescription').textContent = 'Öğrenci, aidat, antrenman ve muhasebe kayıtları yükleniyor.';
  document.querySelector('#authEmailField').classList.add('is-hidden');
  document.querySelector('#authPasswordField').classList.add('is-hidden');
  document.querySelector('#authSecondaryActions').classList.add('is-hidden');
  loginSubmitButton.classList.add('is-hidden');

  let remoteData;
  try {
    if (profile.role === 'coach') {
      const { error: coachSyncError } = await supabaseClient.rpc('register_signed_in_training_coach');
      if (coachSyncError) console.warn('Antrenör listesi eşitlenemedi:', coachSyncError);
    }
    state.schools = profile.role === 'super_admin'
      ? await remoteDataStore.listSchools()
      : await remoteDataStore.listUserSchools();
    const savedSchoolId = window.localStorage.getItem(SELECTED_SCHOOL_STORAGE_KEY);
    const initialSchoolId = profile.role === 'super_admin'
      ? (state.schools.find(school => school.id === savedSchoolId)?.id || state.schools.find(school => school.active)?.id || state.schools[0]?.id)
      : (state.schools.find(school => school.id === savedSchoolId && school.active)?.id || profile.school_id || state.schools.find(school => school.active)?.id);
    if (!initialSchoolId) throw new Error('Yönetilecek aktif bir okul bulunamadı.');
    let initialRole = profile.role;
    if (profile.role !== 'super_admin' && initialSchoolId !== profile.school_id) {
      const activated = await remoteDataStore.activateUserSchool(initialSchoolId);
      initialRole = activated?.role || state.schools.find(school => school.id === initialSchoolId)?.role;
    }
    if (profile.role !== 'super_admin') {
      const { data: subscriptionSchool, error: subscriptionError } = await supabaseClient
        .from('schools')
        .select('subscription_status')
        .eq('id', initialSchoolId)
        .single();
      if (subscriptionError) throw subscriptionError;
      if (subscriptionSchool?.subscription_status === 'stopped') {
        const { data: onboarding } = await supabaseClient
          .from('school_onboardings')
          .select('status')
          .eq('school_id', initialSchoolId)
          .eq('applicant_user_id', user.id)
          .maybeSingle();
        if (!onboarding || !['PENDING_CHOICE', 'PAYMENT_PENDING'].includes(onboarding.status)) throw new Error('SUBSCRIPTION_STOPPED');
      }
    }
    remoteData = await remoteDataStore.load({ school_id: initialSchoolId, user_id: user.id, role: initialRole });
    profile.role = initialRole;
  } catch (loadError) {
    if (loadError.message === 'SUBSCRIPTION_STOPPED') {
      signedOutMessage = 'SUBSCRIPTION_STOPPED';
      await supabaseClient.auth.signOut();
      showSubscriptionBlockedScreen();
      return;
    }
    configureAuthForm('login');
    showLoginScreen(`Kulüp verileri yüklenemedi: ${loadError.message || 'Bağlantı hatası'}`, true);
    return;
  }

  state.actualRole = profile.role;
  state.role = profile.role;
  state.userId = user.id;
  state.userFullName = profile.full_name || user.user_metadata?.full_name || '';
  state.userEmail = user.email || '';
  state.page = 'dashboard';
  state.pageHistory = [];
  state.notificationComposeOpen = false;
  state.notificationDraft = { audience: 'Tüm kullanıcılar', title: '', body: '' };
  applyRemoteData(remoteData);
  try {
    state.onboarding = profile.role === 'admin' ? await remoteDataStore.getMySchoolOnboarding() : null;
  } catch (onboardingError) {
    console.warn('Okul başlangıç durumu yüklenemedi:', onboardingError);
    state.onboarding = null;
  }
  try {
    state.approvedSubscriptionPeriod = profile.role === 'admin' ? await remoteDataStore.getMyApprovedSubscriptionPeriod() : null;
  } catch (subscriptionPeriodError) {
    console.warn('Onaylı abonelik dönemi yüklenemedi:', subscriptionPeriodError);
    state.approvedSubscriptionPeriod = null;
  }
  try {
    state.subscriptionHistory = profile.role === 'admin' ? await remoteDataStore.listMySubscriptionHistory() : [];
  } catch (subscriptionHistoryError) {
    console.warn('Abonelik geçmişi yüklenemedi:', subscriptionHistoryError);
    state.subscriptionHistory = [];
  }
  try {
    state.subscriptionBankAccounts = ['super_admin', 'admin'].includes(profile.role)
      ? await remoteDataStore.getSubscriptionBankAccounts()
      : [];
  } catch (subscriptionBankError) {
    console.warn('Abonelik havale bilgileri yüklenemedi:', subscriptionBankError);
    state.subscriptionBankAccounts = [];
  }
  const signedInWithPasswordThisTurn = openDashboardAfterPasswordLogin;
  if (signedInWithPasswordThisTurn) {
    window.sessionStorage.removeItem(NAVIGATION_STORAGE_KEY);
    openDashboardAfterPasswordLogin = false;
  } else {
    restoreNavigationState(user.id);
  }
  let requestedPage = initialRequestedOpenPage;
  try {
    requestedPage = requestedPage || window.sessionStorage.getItem(PENDING_OPEN_PAGE_STORAGE_KEY) || '';
  } catch {
    requestedPage = requestedPage || '';
  }
  if (adminMustChooseSubscription()) {
    state.page = 'onboarding';
    state.pageHistory = [];
    state.onboardingPurchaseOpen = false;
  } else if (requestedPage && navItems[requestedPage]?.roles.includes(state.role)) {
    state.page = requestedPage;
    state.pageHistory = [];
    try { window.sessionStorage.removeItem(PENDING_OPEN_PAGE_STORAGE_KEY); } catch {}
    const notificationUrl = new URL(window.location.href);
    notificationUrl.searchParams.delete('open');
    notificationUrl.searchParams.delete('resume');
    window.history.replaceState(
      null,
      '',
      `${notificationUrl.pathname}${notificationUrl.search}${notificationUrl.hash}`
    );
  } else if (requestedPage === 'onboarding' && state.role === 'admin') {
    state.page = 'onboarding';
    state.onboardingPurchaseOpen = false;
    state.pageHistory = [];
    try { window.sessionStorage.removeItem(PENDING_OPEN_PAGE_STORAGE_KEY); } catch {}
    const onboardingUrl = new URL(window.location.href);
    onboardingUrl.searchParams.delete('open');
    window.history.replaceState(
      null,
      '',
      `${onboardingUrl.pathname}${onboardingUrl.search}${onboardingUrl.hash}`
    );
  } else if (signedInWithPasswordThisTurn && state.onboarding && ['PENDING_CHOICE', 'PAYMENT_PENDING', 'TRIAL_STARTED'].includes(state.onboarding.status) && profile.role === 'admin' && !hasCurrentSubscriptionAccess()) {
    state.page = 'onboarding';
    state.pageHistory = [];
    state.onboardingPurchaseOpen = false;
  }
  if (state.role === 'super_admin' && state.page === 'applications') {
    try {
      state.schoolApplications = await remoteDataStore.listSchoolApplications();
    } catch (applicationError) {
      console.warn('Başvurular ilk açılışta yüklenemedi:', applicationError);
    }
  }
  if (state.role === 'super_admin' && state.page === 'subscriptionPayments') {
    try {
      state.subscriptionPaymentReports = await remoteDataStore.listSubscriptionPaymentReports();
    } catch (paymentError) {
      console.warn('Ödeme bildirimleri ilk açılışta yüklenemedi:', paymentError);
    }
  }
  initializeBrowserNavigation();
  document.querySelector('#authPasswordField').classList.remove('is-hidden');
  loginSubmitButton.classList.remove('is-hidden');
  authScreen.classList.add('is-hidden');
  appShell.classList.remove('is-hidden');
  setAuthPending(false);
  render();
  startRealtimeSync();
  refreshPushStatus(state.page === 'notifications' || state.page === 'dashboard');
  loadPageData(state.page).then(() => {
    render();
    if (state.page === 'notifications') markAllNotificationsRead();
  }).catch(error => console.error('Açılış sayfası verisi yüklenemedi:', error));
  })();
  activeProfileLoad = { userId: user.id, promise: loadPromise };
  try {
    await loadPromise;
  } finally {
    if (activeProfileLoad?.promise === loadPromise) activeProfileLoad = null;
  }
}

async function logout() {
  if (!supabaseClient) return;
  persistNavigationState();
  signedOutMessage = 'Oturumunuz güvenli biçimde kapatıldı.';
  if (!runsInAndroidAppShell()) await unregisterWebFcmToken().catch(() => {});
  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    signedOutMessage = '';
    showToast('Oturum kapatılamadı. Lütfen tekrar deneyin.');
    return;
  }
  state.userFullName = '';
  state.userEmail = '';
  state.userId = null;
  state.actualRole = 'admin';
  state.role = 'admin';
  clearSensitiveState();
  stopRealtimeSync();
}

function friendlyAuthError(error) {
  const rawMessage = error?.message || error?.error_description || error?.msg || '';
  const message = typeof rawMessage === 'string' && rawMessage !== '{}' ? rawMessage : '';
  if (/invalid login credentials/i.test(message)) return 'E-posta adresi veya şifre hatalı.';
  if (/email not confirmed/i.test(message)) return 'E-posta adresiniz henüz doğrulanmamış.';
  if (/password should be at least/i.test(message)) return 'Şifreniz en az 8 karakter olmalıdır.';
  if (/already registered|already been registered/i.test(message)) return 'Bu e-posta adresiyle daha önce kullanıcı kaydı oluşturulmuş.';
  if (/database error saving new user|kayıtlı veli e-posta adresi/i.test(message)) return 'Bu e-posta adresi öğrenci kayıtlarındaki irtibat adresleriyle eşleşmiyor.';
  if (/confirmation email|sending.*email|smtp|email.*authorized/i.test(message)) return 'Güvenli e-posta işlemi tamamlanamadı. Lütfen yöneticiyle iletişime geçin.';
  if (/rate limit/i.test(message)) return 'İşlem şu anda tamamlanamadı. Kısa süre içinde çok fazla deneme yapıldığı için sistem geçici olarak beklemeye aldı. Lütfen birkaç dakika sonra tekrar deneyin.';
  return message || 'Kullanıcı kaydı tamamlanamadı. Lütfen tekrar deneyin.';
}

let dataSaveLoadingShownAt = 0;
let dataSaveLoadingCloseTimer = 0;
let dataSaveLoadingSafetyTimer = 0;

function showDataSaveLoading() {
  window.clearTimeout(dataSaveLoadingCloseTimer);
  window.clearTimeout(dataSaveLoadingSafetyTimer);
  dataSaveLoadingShownAt = Date.now();
  const loadingScreen = document.querySelector('#dataSaveLoadingScreen');
  if (!loadingScreen) return;
  loadingScreen.classList.remove('is-hidden');
  if (typeof loadingScreen.showModal === 'function' && !loadingScreen.open) loadingScreen.showModal();
  dataSaveLoadingSafetyTimer = window.setTimeout(() => {
    if (loadingScreen.open) loadingScreen.close();
    loadingScreen.classList.add('is-hidden');
  }, 30000);
}

function hideDataSaveLoading() {
  const loadingScreen = document.querySelector('#dataSaveLoadingScreen');
  if (!loadingScreen || loadingScreen.classList.contains('is-hidden')) return;
  const delay = Math.max(0, 500 - (Date.now() - dataSaveLoadingShownAt));
  window.clearTimeout(dataSaveLoadingCloseTimer);
  window.clearTimeout(dataSaveLoadingSafetyTimer);
  dataSaveLoadingCloseTimer = window.setTimeout(() => {
    if (loadingScreen.open) loadingScreen.close();
    loadingScreen.classList.add('is-hidden');
  }, delay);
}

document.addEventListener('submit', event => {
  if (!(event.target instanceof HTMLFormElement) || ['loginForm', 'adminMfaForm', 'schoolApplicationForm', 'schoolBankSettingsForm', 'subscriptionBankSettingsForm'].includes(event.target.id)) return;
  showDataSaveLoading();
}, true);

document.addEventListener('reset', event => {
  if (event.target instanceof HTMLFormElement) hideDataSaveLoading();
}, true);

document.addEventListener('close', event => {
  if (event.target instanceof HTMLDialogElement && event.target.id !== 'dataSaveLoadingScreen') hideDataSaveLoading();
}, true);

function showToast(message, tone = 'info', duration = 2800) {
  hideDataSaveLoading();
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.classList.remove('success');
  if (tone === 'success') toast.classList.add('success');
  toast.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('show'), duration);
}

function showRecordCreated(message, options = {}) {
  const visibleDuration = Number.isFinite(Number(options.duration)) ? Math.max(1000, Number(options.duration)) : 3000;
  const titleText = String(options.title || 'İşlem tamamlandı');
  hideDataSaveLoading();
  window.clearTimeout(showRecordCreated.openTimer);
  window.clearTimeout(showRecordCreated.closeTimer);
  document.querySelector('#recordSuccessOverlay')?.remove();
  showRecordCreated.openTimer = window.setTimeout(() => {
    const overlay = document.createElement('div');
    overlay.id = 'recordSuccessOverlay';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'assertive');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:20px;background:rgba(45,42,37,.38);pointer-events:none;';
    const card = document.createElement('div');
    card.style.cssText = 'display:grid;grid-template-columns:52px minmax(0,1fr);align-items:center;gap:16px;width:min(430px,100%);padding:24px;border:1px solid rgba(23,107,69,.24);border-radius:20px;color:#26231f;background:#fffdf9;box-shadow:0 24px 70px rgba(32,28,24,.34);';
    const icon = document.createElement('div');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '✓';
    icon.style.cssText = 'display:grid;place-items:center;width:52px;height:52px;border-radius:50%;color:#fff;background:#176b45;box-shadow:0 10px 24px rgba(23,107,69,.28);font-size:28px;font-weight:900;';
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = titleText;
    title.style.cssText = 'display:block;color:#176b45;font-size:19px;';
    const description = document.createElement('p');
    description.textContent = message;
    description.style.cssText = 'margin:6px 0 0;color:#26231f;font-size:15px;font-weight:700;line-height:1.5;';
    copy.append(title, description);
    const progress = document.createElement('div');
    progress.setAttribute('aria-hidden', 'true');
    progress.style.cssText = 'grid-column:1/-1;height:5px;overflow:hidden;margin-top:2px;border-radius:999px;background:rgba(23,107,69,.14);';
    const progressFill = document.createElement('div');
    progressFill.style.cssText = 'width:100%;height:100%;border-radius:inherit;background:#176b45;transform:scaleX(0);transform-origin:left center;';
    progress.append(progressFill);
    card.append(icon, copy, progress);
    overlay.append(card);
    document.body.append(overlay);
    progressFill.animate(
      [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
      { duration: visibleDuration, easing: 'linear', fill: 'forwards' }
    );
    showRecordCreated.closeTimer = window.setTimeout(() => overlay.remove(), visibleDuration);
  }, 0);
}

function pushSupported() {
  return window.isSecureContext
    && 'serviceWorker' in navigator;
}

function currentPushPermission() {
  if ('Notification' in window) return Notification.permission;
  return runsInAndroidAppShell() ? 'granted' : 'unsupported';
}

function clearNativeBridgeFragment() {
  if (!NATIVE_FCM_TOKEN && !NATIVE_NOTIFICATION_PERMISSION) return;
  const remainingFragment = new URLSearchParams(window.location.hash.slice(1));
  remainingFragment.delete('nativeFcmToken');
  remainingFragment.delete('nativeNotificationPermission');
  const fragment = remainingFragment.toString();
  window.history.replaceState(
    window.history.state,
    '',
    `${window.location.pathname}${window.location.search}${fragment ? `#${fragment}` : ''}`
  );
}

async function registerNativeFcmToken() {
  if (!state.userId || !state.nativeFcmToken) return false;
  const { error } = await supabaseClient.rpc('register_fcm_token', {
    fcm_registration_token: state.nativeFcmToken,
    fcm_device_name: navigator.userAgent,
    fcm_platform: 'android'
  });
  if (error) throw error;
  clearNativeBridgeFragment();
  return true;
}

async function unregisterNativeFcmToken() {
  if (!state.userId) return;
  let query = supabaseClient
    .from('fcm_tokens')
    .delete()
    .eq('user_id', state.userId);
  if (state.nativeFcmToken) query = query.eq('token', state.nativeFcmToken);
  const { error } = await query;
  if (error) throw error;
}

async function getPushRegistration() {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.register('./service-worker.js?v=2026.09.21.462', { scope: './', updateViaCache: 'none' });
  await registration.update().catch(() => {});
  if (!registration.pushManager) throw new Error('PushManager kullanılamıyor.');
  return registration;
}

async function getFreshFunctionAccessToken({ forceRefresh = false } = {}) {
  if (!supabaseClient?.auth) return '';
  let session = null;
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (!error) session = data.session || null;
  } catch (_) {
    session = null;
  }
  const expiresAtMs = Number(session?.expires_at || 0) * 1000;
  const shouldRefresh = forceRefresh || !session?.access_token || (expiresAtMs && expiresAtMs < Date.now() + 60000);
  if (shouldRefresh) {
    try {
      const { data } = await supabaseClient.auth.refreshSession(session || undefined);
      session = data.session || session;
    } catch (_) {}
  }
  if (!session?.access_token) {
    try {
      await supabaseClient.auth.getUser();
      const { data } = await supabaseClient.auth.getSession();
      session = data.session || session;
    } catch (_) {}
  }
  return session?.access_token || '';
}

async function invokePushFunction(body) {
  const formatPushFunctionError = async ({ data, error, status }) => {
    let result = data || null;
    if (!result && error?.context) {
      try {
        result = await error.context.clone().json();
      } catch (_) {
        result = null;
      }
    }
    const detail = String(result?.error || '').trim();
    const missingLabels = { audience: 'alıcı grubu', title: 'başlık', message: 'mesaj' };
    const missingFields = Array.isArray(result?.missing)
      ? result.missing.map(field => missingLabels[field] || field).join(', ')
      : '';
    const translatedErrors = {
      'Forbidden school context': 'Bu okul için bildirim gönderme yetkiniz bulunmuyor.',
      'School is inactive': 'Seçili okul aktif olmadığı için bildirim gönderilemedi.',
      'Push service is not configured': 'Telefon bildirim servisi henüz yapılandırılmamış.',
      'Invalid notification': 'Bildirim başlığı, mesajı veya alıcı grubu boş bırakılamaz.',
      'Unauthorized': 'Oturum doğrulanamadı. Lütfen yeniden giriş yapın.'
    };
    return new Error(`${translatedErrors[detail] || detail || error?.message || `Bildirim servisi ${status || ''} hatası döndürdü.`}${missingFields ? ` Eksik alan: ${missingFields}.` : ''}`);
  };
  if (body.action === 'public-key') {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_PUBLISHABLE_KEY
      },
      body: JSON.stringify(body)
    });
    let result = null;
    try {
      result = await response.json();
    } catch (_) {
      result = null;
    }
    if (!response.ok) return { data: null, error: await formatPushFunctionError({ data: result, status: response.status }) };
    return { data: result, error: null };
  }
  await getFreshFunctionAccessToken();
  let { data, error } = await supabaseClient.functions.invoke('send-push-notification', { body });
  const status = Number(error?.context?.status || 0);
  if (error && status === 401) {
    await getFreshFunctionAccessToken({ forceRefresh: true });
    ({ data, error } = await supabaseClient.functions.invoke('send-push-notification', { body }));
  }
  if (error || data?.error) {
    return { data: null, error: await formatPushFunctionError({ data, error, status: Number(error?.context?.status || 0) }) };
  }
  return { data, error: null };
}

async function saveAndSendNotification({ audience, title, body, studentId = null }) {
  const normalizedAudience = String(audience || '').trim();
  const normalizedTitle = String(title || '').trim();
  const normalizedBody = String(body || '').trim();
  const notification = {
    date: 'Bugün',
    title: normalizedTitle,
    body: normalizedBody,
    audience: normalizedAudience,
    sentBy: state.userId,
    senderLabel: state.role === 'super_admin' ? 'SASA-F' : (state.schoolName || 'Okul'),
    time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    status: 'Sırada'
  };

  try {
    const { data: pushResult, error: pushError } = await invokePushFunction({
      action: 'create-and-send',
      schoolId: state.schoolId,
      audience: normalizedAudience,
      title: normalizedTitle,
      message: normalizedBody,
      studentId,
      notification: {
        audience: normalizedAudience,
        title: normalizedTitle,
        body: normalizedBody
      }
    });
    if (pushError) throw pushError;
    notification.id = Number(pushResult.notificationId);
    notification.senderLabel = pushResult.senderLabel || notification.senderLabel;
    notification.status = pushResult.sent > 0 ? 'Teslim edildi' : 'Başarısız';
    notification.recipientCount = Number(pushResult.recipients || 0);
    notification.deliveredCount = Number(pushResult.sent || 0);
    notification.readCount = 0;
    state.notifications.unshift(notification);
    persistLocalData();
    return { notification, sent: Number(pushResult.sent || 0) };
  } catch (error) {
    throw error;
  }
}

async function createTrainingAndSendNotification(training) {
  const { data: result, error } = await invokePushFunction({
    action: 'create-training-and-send',
    schoolId: state.schoolId,
    training
  });
  if (error) throw error;
  if (!result?.trainingId) throw new Error(result?.error || 'Antrenman oluşturulamadı.');

  const notification = {
    id: Number(result.notificationId),
    date: 'Bugün',
    title: `${training.group} grubu · Yeni antrenman`,
    body: `${formatTrainingDateLong(training.date)} saat ${training.time}’de ${training.title} antrenmanı yapılacaktır.`,
    audience: `${training.group} velileri`,
    sentBy: state.userId,
    senderLabel: state.role === 'super_admin' ? 'SASA-F' : (state.schoolName || 'Okul'),
    time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    status: Number(result.sent || 0) > 0 ? 'Teslim edildi' : 'Başarısız',
    recipientCount: Number(result.recipients || 0),
    deliveredCount: Number(result.sent || 0),
    readCount: 0
  };
  state.notifications.unshift(notification);
  persistLocalData();
  return {
    trainingId: Number(result.trainingId),
    sent: Number(result.sent || 0),
    recipients: Number(result.recipients || 0)
  };
}

let pushStatusRefreshPromise = null;
let enablePhoneNotificationsPromise = null;
let webFirebaseMessagingPromise = null;
let webFirebaseForegroundUnsubscribe = null;
let webFirebaseToken = '';

function firebaseWebConfigIsReady() {
  const config = window.SasaFirebaseWebConfig || {};
  return ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId', 'vapidKey']
    .every(key => typeof config[key] === 'string' && config[key].trim().length > 0);
}

async function getWebFirebaseMessaging(registration) {
  if (!firebaseWebConfigIsReady()) return null;
  if (!webFirebaseMessagingPromise) {
    webFirebaseMessagingPromise = (async () => {
      const config = window.SasaFirebaseWebConfig;
      const [{ getApps, initializeApp }, { getMessaging, getToken, onMessage, deleteToken }] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js')
      ]);
      const app = getApps().find(item => item.options.projectId === config.projectId) || initializeApp(config);
      const messaging = getMessaging(app);
      if (!webFirebaseForegroundUnsubscribe) {
        webFirebaseForegroundUnsubscribe = onMessage(messaging, payload => {
          const data = payload?.data || {};
          if (data.title || data.body) {
            showToast(data.title ? `${data.title}: ${data.body || 'Yeni bildiriminiz var.'}` : (data.body || 'Yeni bildiriminiz var.'));
          }
        });
      }
      return {
        async token() {
          return getToken(messaging, {
            vapidKey: config.vapidKey,
            serviceWorkerRegistration: registration
          });
        },
        async deleteToken() {
          return deleteToken(messaging);
        }
      };
    })().catch(error => {
      webFirebaseMessagingPromise = null;
      console.warn('Firebase Web Messaging başlatılamadı; klasik Web Push kullanılacak.', error);
      return null;
    });
  }
  return webFirebaseMessagingPromise;
}

async function registerWebFcmToken(registration) {
  const firebaseMessaging = await getWebFirebaseMessaging(registration);
  if (!firebaseMessaging || !state.userId) return false;
  const token = await firebaseMessaging.token();
  if (!token) return false;
  const { error } = await supabaseClient.rpc('register_fcm_token', {
    fcm_registration_token: token,
    fcm_device_name: navigator.userAgent,
    fcm_platform: 'web'
  });
  if (error) throw error;
  webFirebaseToken = token;
  return true;
}

async function unregisterWebFcmToken() {
  if (!state.userId) return;
  let firebaseMessaging = await webFirebaseMessagingPromise?.catch(() => null);
  if (!firebaseMessaging && firebaseWebConfigIsReady()) {
    const registration = await getPushRegistration().catch(() => null);
    if (registration) firebaseMessaging = await getWebFirebaseMessaging(registration);
  }
  // Sayfa yenilendiyse anahtar yalnızca bellekte olmayabilir. İzin zaten verilmiş
  // ise Firebase'den aynı tarayıcı anahtarını sessizce alıp sadece onu kaldırırız.
  const token = webFirebaseToken || await firebaseMessaging?.token().catch(() => '');
  if (!token) return;
  const { error } = await supabaseClient
    .from('fcm_tokens')
    .delete()
    .eq('user_id', state.userId)
    .eq('token', token);
  if (error) throw error;
  await firebaseMessaging?.deleteToken().catch(() => {});
  webFirebaseToken = '';
}

async function refreshPushStatus(shouldRender = false) {
  if (!pushStatusRefreshPromise) {
    pushStatusRefreshPromise = (async () => {
      if (runsInAndroidAppShell()) {
        if (state.nativeNotificationPermission === 'denied') {
          state.pushStatus = 'denied';
          return;
        }
        if (!state.nativeFcmToken) {
          try {
            const { count, error } = await supabaseClient
              .from('fcm_tokens')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', state.userId);
            if (error) throw error;
            state.pushStatus = Number(count || 0) > 0 ? 'enabled' : 'disabled';
          } catch (error) {
            console.error('Firebase cihaz kaydı kontrol edilemedi:', error);
            state.pushStatus = 'disabled';
          }
          return;
        }
        if (window.localStorage.getItem(PUSH_PREFERENCE_STORAGE_KEY) === 'disabled') {
          state.pushStatus = 'disabled';
          return;
        }
        try {
          await registerNativeFcmToken();
          window.localStorage.setItem(PUSH_PREFERENCE_STORAGE_KEY, 'enabled');
          state.pushStatus = 'enabled';
        } catch (error) {
          console.error('Firebase bildirim kaydı tamamlanamadı:', error);
          state.pushStatus = 'disabled';
        }
        return;
      }
      if (!pushSupported()) {
        state.pushStatus = 'unsupported';
        return;
      }
      const permission = currentPushPermission();
      if (permission === 'unsupported') {
        state.pushStatus = 'unsupported';
        return;
      }
      let registration;
      let subscription;
      try {
        registration = await getPushRegistration();
        subscription = await registration.pushManager.getSubscription();
      } catch (error) {
        console.error('Bildirim altyapısı kullanılamıyor:', error);
        state.pushStatus = 'unsupported';
        return;
      }

      if (permission === 'granted' && state.userId) {
        try {
          if (await registerWebFcmToken(registration)) {
            // Aynı tarayıcıdaki eski VAPID aboneliğini kaldırarak çift bildirimi önleriz.
            if (subscription) {
              await supabaseClient.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
              await subscription.unsubscribe().catch(() => {});
            }
            state.pushStatus = 'enabled';
            window.localStorage.setItem(PUSH_PREFERENCE_STORAGE_KEY, 'enabled');
            return;
          }
        } catch (error) {
          console.warn('Firebase Web tokenı kaydedilemedi; klasik Web Push korunuyor:', error);
        }
      }

      if (subscription) {
        state.pushStatus = 'enabled';
        window.localStorage.setItem(PUSH_PREFERENCE_STORAGE_KEY, 'enabled');
        if (state.userId) {
          try {
            await savePushSubscription(subscription);
          } catch (error) {
            console.warn('Bildirim aboneliği yenilenemedi; mevcut abonelik korunuyor:', error);
          }
        }
        return;
      }

      if (permission === 'denied') {
        state.pushStatus = 'denied';
        return;
      }

      try {
        const pushPreference = window.localStorage.getItem(PUSH_PREFERENCE_STORAGE_KEY);
        if (pushPreference !== 'disabled' && permission === 'granted' && state.userId) {
          let shouldRestoreSubscription = runsInAndroidAppShell();
          if (!shouldRestoreSubscription) {
            const { count, error: countError } = await supabaseClient
              .from('push_subscriptions')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', state.userId);
            if (countError) throw countError;
            shouldRestoreSubscription = Number(count || 0) > 0;
          }
          if (shouldRestoreSubscription) {
            subscription = await createAndSavePushSubscription(registration);
            window.localStorage.setItem(PUSH_PREFERENCE_STORAGE_KEY, 'enabled');
          }
        }
        state.pushStatus = subscription ? 'enabled' : 'disabled';
      } catch (error) {
        console.error('Bildirim durumu kontrol edilemedi:', error);
        state.pushStatus = 'disabled';
      }
    })();
  }
  const activeRefresh = pushStatusRefreshPromise;
  try {
    await activeRefresh;
  } finally {
    if (pushStatusRefreshPromise === activeRefresh) pushStatusRefreshPromise = null;
  }
  if ((shouldRender || state.page === 'notifications') && !appShell.classList.contains('is-hidden')) render();
}

function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map(character => character.charCodeAt(0)));
}

async function savePushSubscription(subscription) {
  const serialized = subscription.toJSON();
  const { error } = await supabaseClient.rpc('register_push_subscription', {
    subscription_endpoint: serialized.endpoint,
    subscription_p256dh: serialized.keys?.p256dh,
    subscription_auth_secret: serialized.keys?.auth,
    subscription_user_agent: navigator.userAgent
  });
  if (error) throw error;
}

async function createAndSavePushSubscription(registration) {
  const { data, error } = await invokePushFunction({ action: 'public-key' });
  if (error || !data?.publicKey) throw new Error(error?.message || 'Bildirim anahtarı alınamadı.');
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(data.publicKey)
  });
  await savePushSubscription(subscription);
  return subscription;
}

async function enablePhoneNotifications() {
  if (enablePhoneNotificationsPromise) return enablePhoneNotificationsPromise;
  enablePhoneNotificationsPromise = (async () => {
    if (runsInAndroidAppShell()) {
      if (state.nativeNotificationPermission !== 'granted') {
        state.pushStatus = state.nativeNotificationPermission === 'denied' ? 'denied' : 'unsupported';
        throw new Error('Android bildirim izni verilmedi. Telefon ayarlarından SASA-F bildirimlerini açın.');
      }
      if (!state.nativeFcmToken) {
        state.pushStatus = 'disabled';
        throw new Error('Firebase cihaz anahtarı bulunamadı. Uygulamayı tamamen kapatıp yeniden açın.');
      }
      await registerNativeFcmToken();
      window.localStorage.setItem(PUSH_PREFERENCE_STORAGE_KEY, 'enabled');
      state.pushStatus = 'enabled';
      return;
    }
    if (!pushSupported()) {
      if (window.location.protocol === 'file:') {
        throw new Error('Telefon bildirimleri yerel dosyada kullanılamaz. Canlı HTTPS adresini açın.');
      }
      throw new Error('Bu tarayıcı telefon bildirimlerini desteklemiyor. iPhone’da uygulamayı Ana Ekran’a ekleyip oradan açın.');
    }
    const registration = await getPushRegistration();
    let subscription = await registration.pushManager.getSubscription();
    let permission = currentPushPermission();
    if (permission === 'default' && 'Notification' in window) {
      permission = await Notification.requestPermission();
    }
    if (permission === 'unsupported') throw new Error('Bu tarayıcı telefon bildirimlerini desteklemiyor.');
    if (permission !== 'granted') {
      state.pushStatus = permission === 'denied' ? 'denied' : 'disabled';
      throw new Error('Bildirim izni verilmedi.');
    }
    try {
      if (await registerWebFcmToken(registration)) {
        if (subscription) {
          await supabaseClient.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
          await subscription.unsubscribe().catch(() => {});
        }
        window.localStorage.setItem(PUSH_PREFERENCE_STORAGE_KEY, 'enabled');
        state.pushStatus = 'enabled';
        return;
      }
    } catch (error) {
      console.warn('Firebase Web tokenı alınamadı; klasik Web Push kullanılacak:', error);
    }
    if (subscription) {
      await savePushSubscription(subscription);
      window.localStorage.setItem(PUSH_PREFERENCE_STORAGE_KEY, 'enabled');
      state.pushStatus = 'enabled';
      return;
    }
    subscription = await createAndSavePushSubscription(registration);
    window.localStorage.setItem(PUSH_PREFERENCE_STORAGE_KEY, 'enabled');
    state.pushStatus = 'enabled';
  })();
  try {
    return await enablePhoneNotificationsPromise;
  } finally {
    enablePhoneNotificationsPromise = null;
  }
}

async function disablePhoneNotifications() {
  if (runsInAndroidAppShell()) {
    await unregisterNativeFcmToken();
    window.localStorage.setItem(PUSH_PREFERENCE_STORAGE_KEY, 'disabled');
    state.pushStatus = 'disabled';
    return;
  }
  await unregisterWebFcmToken();
  const registration = await getPushRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    const { error } = await supabaseClient.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
    if (error) throw error;
    await subscription.unsubscribe();
  }
  window.localStorage.setItem(PUSH_PREFERENCE_STORAGE_KEY, 'disabled');
  state.pushStatus = 'disabled';
}

async function runRemoteMutation(action) {
  try {
    const result = await action();
    return result === undefined ? true : result;
  } catch (error) {
    showToast(`Supabase kaydı tamamlanamadı: ${error.message || 'Bağlantı hatası'}`);
    return false;
  }
}

async function openAttendance(id) {
  const training = state.trainings.find(item => item.id === Number(id));
  if (!training) return;
  const selectedSchoolId = state.schoolId;
  try {
    const attendanceRow = await remoteDataStore.loadAttendanceForTraining(training.id);
    if (state.schoolId !== selectedSchoolId) return;
    state.attendanceRecords = state.attendanceRecords.filter(record => Number(record.trainingId) !== Number(training.id));
    if (attendanceRow) state.attendanceRecords.unshift(...mapAttendanceRows([attendanceRow]));
  } catch (error) {
    showToast(`Yoklama bilgileri yüklenemedi: ${error.message || 'Bağlantı hatası'}`);
    return;
  }
  const trainingStudents = studentsForTraining(training);
  const latestAttendance = latestAttendanceForTraining(training);
  state.activeTrainingId = training.id;
  document.querySelector('#attendanceTitle').textContent = `${training.group} · ${training.title}`;
  document.querySelector('#attendanceStudentSearch').value = '';
  setSafeHtml(document.querySelector('#attendanceList'), trainingStudents.map(s => {
    const previousStatus = !latestAttendance ? '' : latestAttendance.presentStudentIds.includes(s.id) ? 'present' : 'absent';
    return `<div class="attendance-item" data-student-id="${s.id}" data-attendance-search-name="${escapeHtml(s.name.toLocaleLowerCase('tr'))}"><span class="attendance-student">${studentNameLink(s)} <small class="muted">· ${escapeHtml(s.group)}</small></span><div class="attendance-status-options" role="group" aria-label="${escapeHtml(s.name)} yoklama durumu"><label class="attendance-status-option present"><input type="checkbox" data-attendance-status="present" data-student-id="${s.id}" aria-label="${escapeHtml(s.name)} geldi" ${previousStatus === 'present' ? 'checked' : ''}><span>Geldi</span></label><label class="attendance-status-option absent"><input type="checkbox" data-attendance-status="absent" data-student-id="${s.id}" aria-label="${escapeHtml(s.name)} gelmedi" ${previousStatus === 'absent' ? 'checked' : ''}><span>Gelmedi</span></label></div></div>`;
  }).join('') || '<div class="empty-state">Bu gruba kayıtlı aktif öğrenci bulunmuyor.</div>');
  updateAttendanceSubmitState();
  document.querySelector('#attendanceDialog').showModal();
}

function updateAttendanceSubmitState() {
  const attendanceList = document.querySelector('#attendanceList');
  const saveButton = document.querySelector('#attendanceSubmitButton');
  if (!attendanceList || !saveButton) return;
  const rows = [...attendanceList.querySelectorAll('.attendance-item[data-student-id]')];
  saveButton.disabled = !rows.length || rows.some(row => !row.querySelector('[data-attendance-status]:checked'));
}

function filterAttendanceStudents(query = '') {
  const normalizedQuery = String(query).trim().toLocaleLowerCase('tr');
  document.querySelectorAll('#attendanceList .attendance-item').forEach(row => {
    row.classList.toggle('is-filtered-out', Boolean(normalizedQuery) && !String(row.dataset.attendanceSearchName || '').includes(normalizedQuery));
  });
}

function releaseStudentPhotoPreview() {
  if (state.studentPhotoPreviewUrl) URL.revokeObjectURL(state.studentPhotoPreviewUrl);
  state.studentPhotoPreviewUrl = '';
}

function showStudentPhotoPreview(photoUrl = '') {
  const preview = document.querySelector('#studentPhotoPreview');
  const removeButton = document.querySelector('#studentPhotoRemoveButton');
  if (!preview || !removeButton) return;
  preview.replaceChildren();
  if (photoUrl) {
    const image = document.createElement('img');
    image.src = photoUrl;
    image.alt = 'Seçilen öğrenci fotoğrafı';
    preview.append(image);
  } else {
    setSafeHtml(preview, MENU_ICONS.student);
  }
  removeButton.classList.toggle('is-hidden', !photoUrl);
}

function resetStudentPhotoEditor() {
  releaseStudentPhotoPreview();
  state.studentPhotoRemoveRequested = false;
  ['#studentCameraInput', '#studentGalleryInput'].forEach(selector => {
    const photoInput = document.querySelector(selector);
    if (photoInput) photoInput.value = '';
  });
  showStudentPhotoPreview();
}

async function prepareStudentPhoto(file) {
  const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
  if (file.type && !allowedTypes.has(file.type)) throw new Error('Fotoğraf JPEG, PNG veya WebP biçiminde olmalıdır.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Fotoğrafın boyutu 10 MB’tan küçük olmalıdır.');
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('Fotoğraf okunamadı. Başka bir fotoğraf deneyin.'));
      image.src = sourceUrl;
    });
    const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
    const outputSize = Math.min(640, sourceSize);
    if (!outputSize) throw new Error('Fotoğrafın boyutları geçersiz.');
    const canvas = document.createElement('canvas');
    canvas.width = outputSize;
    canvas.height = outputSize;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Fotoğraf işleme özelliği bu cihazda kullanılamıyor.');
    const sourceX = Math.max(0, (image.naturalWidth - sourceSize) / 2);
    const sourceY = Math.max(0, (image.naturalHeight - sourceSize) / 2);
    context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, outputSize, outputSize);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.84));
    if (!blob) throw new Error('Fotoğraf işlenemedi.');
    return new File([blob], `student-${Date.now()}.jpg`, { type: 'image/jpeg' });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function accessiblePlayerCardStudent(studentId) {
  const safeStudentId = Number(studentId);
  if (state.role === 'parent') {
    const student = currentParentStudent();
    return Number(student?.id) === safeStudentId ? student : null;
  }
  return state.students.find(student => Number(student.id) === safeStudentId) || null;
}

function fillPlayerCardForm(student) {
  const form = document.querySelector('#playerCardForm');
  const ratings = normalizePlayerCard(student?.playerCard) || PLAYER_CARD_DEFAULTS;
  form.reset();
  form.elements.studentId.value = student?.id || '';
  PLAYER_CARD_FIELDS.forEach(field => { form.elements[field].value = ratings[field]; });
}

function openPlayerCardDialog(student) {
  if (!student) return;
  setSafeHtml(document.querySelector('#playerCardPreview'), playerCardMarkup(student));
  fillPlayerCardForm(student);
  document.querySelector('#playerCardForm').classList.add('is-hidden');
  document.querySelector('#playerCardEditToggle').classList.toggle('is-hidden', !isAdminRole());
  document.querySelector('#playerCardDialog').showModal();
}

function playerCardFromForm(form) {
  const playerCard = {};
  for (const field of PLAYER_CARD_FIELDS) {
    const rating = Number(form.elements[field].value);
    if (!Number.isInteger(rating) || rating < 0 || rating > 99) return null;
    playerCard[field] = rating;
  }
  return playerCard;
}

function openStudentDialog(student = null) {
  const coachStatusOnly = isCoachRole();
  if ((!isAdminRole() && !coachStatusOnly) || (coachStatusOnly && !student)) {
    showToast('Bu işlem için yönetici yetkisi gereklidir.');
    return;
  }
  const form = document.querySelector('#studentForm');
  form.reset();
  releaseStudentPhotoPreview();
  state.studentPhotoRemoveRequested = false;
  state.editingStudentId = student?.id || null;
  form.elements.studentName.value = student?.name || '';
  form.elements.birthDate.value = student ? studentBirthInputValue(student.birth) : '';
  form.elements.group.value = student?.group || '';
  form.elements.position.value = student?.position || '';
  form.elements.parentName.value = student?.parent || '';
  form.elements.phone.value = formatTurkishPhoneInput(student?.phone || '');
  form.elements.email.value = String(student?.email || '').replace(/\s/g, '');
  form.elements.address.value = student?.address || '';
  form.elements.studentMonthlyFeeAmount.value = String(monthlyFeeAmount(student, feeMonthKey()));
  form.elements.studentActiveStatus.value = student?.active === false ? 'inactive' : 'active';
  form.querySelectorAll('input, select, textarea').forEach(control => {
    control.disabled = coachStatusOnly && control.name !== 'studentActiveStatus';
  });
  document.querySelector('.student-photo-field').classList.toggle('is-hidden', coachStatusOnly);
  form.querySelectorAll('.student-private-field').forEach(field => field.classList.toggle('is-hidden', coachStatusOnly));
  showStudentPhotoPreview(student?.photoUrl || '');
  document.querySelector('#studentEyebrow').textContent = coachStatusOnly ? 'OYUNCU DURUMU' : student ? 'PROFİLİ DÜZENLE' : 'YENİ KAYIT';
  document.querySelector('#studentDialogTitle').textContent = coachStatusOnly ? 'Aktiflik durumunu güncelle' : student ? 'Öğrenci ve veli bilgilerini güncelle' : 'Öğrenci bilgileri';
  document.querySelector('#studentSubmitButton').textContent = coachStatusOnly ? 'Durumu kaydet' : student ? 'Değişiklikleri kaydet' : 'Öğrenciyi kaydet';
  document.querySelector('#guardianInviteHint').classList.toggle('is-hidden', Boolean(student));
  document.querySelector('#studentActiveStatusField').classList.toggle('is-hidden', !student);
  const prepaymentSection = document.querySelector('#studentPrepaymentSection');
  prepaymentSection.classList.toggle('is-hidden', Boolean(student) || coachStatusOnly);
  prepaymentSection.open = false;
  setSafeHtml(document.querySelector('#studentPrepaymentMonths'), upcomingFeeMonths().map(month => `<label class="student-prepayment-month"><input type="checkbox" name="prepaymentMonth" value="${month}"><span>${formatFeeMonth(month)}</span><small>${formatCurrency(monthlyFeeAmount(student, month))}</small></label>`).join(''));
  form.elements.prepaymentMethod.value = 'cash';
  updateStudentPrepaymentSummary();
  document.querySelector('#studentDialog').showModal();
}

function updateStudentPrepaymentSummary() {
  const form = document.querySelector('#studentForm');
  const selectedCount = form.querySelectorAll('input[name="prepaymentMonth"]:checked').length;
  const selectedAmount = Number(form.elements.studentMonthlyFeeAmount.value);
  const monthlyAmount = Number.isFinite(selectedAmount) && selectedAmount > 0 ? selectedAmount : state.monthlyFeeAmount;
  form.querySelectorAll('#studentPrepaymentMonths small').forEach(item => { item.textContent = formatCurrency(monthlyAmount); });
  document.querySelector('#studentPrepaymentSummary').textContent = selectedCount
    ? `${selectedCount} ay seçili`
    : 'İsteğe bağlı · 0 ay seçili';
  document.querySelector('#studentPrepaymentTotal').textContent = formatCurrency(selectedCount * monthlyAmount);
}

function openTrainingDialog(training = null) {
  const form = document.querySelector('#trainingForm');
  form.reset();
  syncTrainingTypeOptions(training?.title || '');
  syncTrainingCoachOptions(training?.coach || '');
  syncTrainingFieldOptions(training?.field || '');
  state.editingTrainingId = training?.id || null;
  form.elements.date.value = training?.date || localDateValue();
  form.elements.time.value = training?.time || '09:00';
  form.elements.group.value = training?.group || '';
  form.elements.duration.value = String(training?.duration || 90);
  form.elements.title.value = training?.title || '';
  form.elements.coach.value = training?.coach || '';
  form.elements.field.value = training?.field || '';
  document.querySelector('#trainingEyebrow').textContent = training ? 'ANTRENMANI DÜZENLE' : 'YENİ ANTRENMAN';
  document.querySelector('#trainingDialogTitle').textContent = training ? 'Antrenman bilgilerini güncelle' : 'Antrenman planla';
  document.querySelector('#trainingSubmitButton').textContent = training ? 'Değişiklikleri kaydet' : 'Antrenmanı kaydet';
  document.querySelector('#deleteTrainingButton').classList.toggle('is-hidden', !training || !['super_admin', 'admin', 'coach'].includes(state.role));
  document.querySelector('#trainingDialog').showModal();
}

function openAccountingDialog(entry = null) {
  const form = document.querySelector('#accountingForm');
  form.reset();
  state.editingAccountingEntryId = entry?.id || null;
  form.elements.kind.querySelector('option[value="fee"]').disabled = Boolean(entry);
  form.elements.date.value = entry ? accountingDateInputValue(entry.date) : localDateValue();
  form.elements.kind.value = entry?.kind || '';
  form.elements.paymentMethod.value = entry?.paymentMethod || 'cash';
  form.elements.title.value = entry?.title || '';
  form.elements.amount.value = entry?.amount || '';
  form.elements.studentId.value = '';
  document.querySelector('#accountingStudentResults').classList.add('is-hidden');
  document.querySelector('#accountingFeeMonths').replaceChildren();
  syncAccountingKindFields();
  document.querySelector('#accountingEyebrow').textContent = entry ? 'İŞLEMİ DÜZENLE' : 'YENİ İŞLEM';
  document.querySelector('#accountingDialogTitle').textContent = entry ? 'Muhasebe kaydını güncelle' : 'Gelir veya gider kaydı';
  document.querySelector('#accountingSubmitButton').textContent = entry ? 'Değişiklikleri kaydet' : 'İşlemi kaydet';
  document.querySelector('#accountingDialog').showModal();
}

function syncAccountingKindFields() {
  const form = document.querySelector('#accountingForm');
  const isFee = form.elements.kind.value === 'fee';
  const feeFields = document.querySelector('#accountingFeeFields');
  const wasFee = !feeFields.classList.contains('is-hidden');
  feeFields.classList.toggle('is-hidden', !isFee);
  form.elements.studentSearch.required = isFee;
  form.elements.title.readOnly = isFee;
  form.elements.amount.readOnly = isFee;
  form.elements.title.required = !isFee;
  form.elements.amount.required = !isFee;
  if (!isFee && wasFee) {
    form.elements.title.value = '';
    form.elements.amount.value = '';
  }
  if (isFee) updateAccountingFeeSummary();
}

function updateAccountingStudentResults() {
  const form = document.querySelector('#accountingForm');
  const search = form.elements.studentSearch.value.trim().toLocaleLowerCase('tr-TR');
  form.elements.studentId.value = '';
  form.elements.title.value = '';
  form.elements.amount.value = '';
  document.querySelector('#accountingFeeMonths').replaceChildren();
  const results = document.querySelector('#accountingStudentResults');
  const matches = search
    ? state.students.filter(student => `${student.name} ${student.group} ${studentBirthYearLabel(student)}`.toLocaleLowerCase('tr-TR').includes(search)).slice(0, 8)
    : [];
  setSafeHtml(results, matches.map(student => `<button class="student-search-option" type="button" role="option" data-action="select-accounting-student" data-id="${student.id}"><strong>${escapeHtml(student.name)}</strong><small>${escapeHtml(student.group)} · ${escapeHtml(studentBirthYearLabel(student))}</small></button>`).join(''));
  results.classList.toggle('is-hidden', matches.length === 0);
  form.elements.studentSearch.setAttribute('aria-expanded', String(matches.length > 0));
}

function updateAccountingFeeSummary() {
  const form = document.querySelector('#accountingForm');
  if (form.elements.kind.value !== 'fee') return;
  const student = state.students.find(item => item.id === Number(form.elements.studentId.value));
  const selectedRows = [...form.querySelectorAll('input[name="feeMonth"]:checked')].map(input => input.closest('.accounting-fee-month-row'));
  const months = selectedRows.map(row => row.dataset.month);
  const amounts = selectedRows.map(accountingFeeRowAmount);
  form.elements.amount.value = student && months.length && amounts.every(amount => Number.isFinite(amount) && amount > 0)
    ? String(Math.round(amounts.reduce((total, amount) => total + amount, 0) * 100) / 100)
    : '';
  form.elements.title.value = student && months.length
    ? `${student.name} · ${months.map(formatFeeMonth).join(', ')} ${months.length === 1 ? 'aidatı' : 'aidatları'}`
    : '';
}

function accountingFeeRowAmount(row) {
  const input = row.querySelector('[data-accounting-fee-price-input]');
  return Number(row.classList.contains('is-editing') ? input?.value : row.dataset.amount);
}

function showAccountingFeeMonths(student, rows) {
  const rowsByMonth = new Map(rows.map(row => [String(row.fee_month).slice(0, 7), row]));
  setSafeHtml(document.querySelector('#accountingFeeMonths'), upcomingFeeMonths().map(month => {
    const status = rowsByMonth.get(month)?.status;
    const unavailable = status === 'paid' || status === 'exempt';
    const amount = monthlyFeeAmount(student, month);
    return `<div class="accounting-fee-month-row" data-month="${month}" data-amount="${amount}"><label class="student-prepayment-month"><input type="checkbox" name="feeMonth" value="${month}" ${unavailable ? 'disabled' : ''}><span>${formatFeeMonth(month)}</span></label><span class="accounting-fee-price">${unavailable ? status === 'paid' ? 'Ödendi' : 'Muaf' : formatCurrency(amount)}</span>${unavailable ? '' : `<input class="accounting-fee-price-input is-hidden" data-accounting-fee-price-input type="number" min="0.01" max="99999999.99" step="0.01" inputmode="decimal" value="${amount}" aria-label="${formatFeeMonth(month)} aidat tutarı"><button class="accounting-fee-edit-button" type="button" data-action="edit-accounting-fee-price" aria-label="${formatFeeMonth(month)} aidat tutarını düzenle" title="Aidat tutarını düzenle">✎</button>`}</div>`;
  }).join(''));
  updateAccountingFeeSummary();
}

function openAccountingDateRangeDialog() {
  const form = document.querySelector('#accountingDateRangeForm');
  form.elements.startDate.value = state.accountingDateRangeStart || localDateValue();
  form.elements.endDate.value = state.accountingDateRangeEnd || localDateValue();
  document.querySelector('#accountingDateRangeDialog').showModal();
}

function updateFeePaymentFields() {
  const form = document.querySelector('#feeDefinitionForm');
  const paid = form.elements.status.value === 'paid';
  form.querySelectorAll('.fee-payment-field').forEach(field => field.classList.toggle('is-hidden', !paid));
  form.elements.paymentDate.required = paid;
  form.elements.paymentMethod.required = paid;
}

function openFeeDefinitionDialog() {
  const form = document.querySelector('#feeDefinitionForm');
  form.reset();
  form.elements.studentSearch.value = '';
  form.elements.studentId.value = '';
  document.querySelector('#feeDefinitionStudentResults').classList.add('is-hidden');
  setSafeHtml(document.querySelector('#feeDefinitionStudentResults'), '');
  form.elements.studentSearch.setAttribute('aria-expanded', 'false');
  form.elements.period.value = feeMonthKey();
  form.elements.amount.value = String(state.monthlyFeeAmount);
  form.elements.status.value = 'late';
  form.elements.paymentDate.value = localDateValue();
  form.elements.paymentMethod.value = 'cash';
  updateFeePaymentFields();
  document.querySelector('#feeDefinitionDialog').showModal();
}

function openFeePaymentDialog(student, month) {
  const form = document.querySelector('#feePaymentForm');
  form.reset();
  form.elements.studentId.value = String(student.id);
  form.elements.period.value = month;
  form.elements.paymentDate.value = localDateValue();
  form.elements.paymentMethod.value = 'cash';
  document.querySelector('#feePaymentDescription').textContent = `${student.name} · ${formatFeeMonth(month)} · ${formatCurrency(monthlyFeeAmount(student, month))}`;
  document.querySelector('#feePaymentDialog').showModal();
}

function updateFeeDefinitionStudentResults() {
  const form = document.querySelector('#feeDefinitionForm');
  const searchValue = form.elements.studentSearch.value.trim().toLocaleLowerCase('tr-TR');
  const results = document.querySelector('#feeDefinitionStudentResults');
  form.elements.studentId.value = '';
  const matches = searchValue
    ? [...state.students]
        .filter(student => `${student.name} ${student.group} ${studentBirthYearLabel(student)}`.toLocaleLowerCase('tr-TR').includes(searchValue))
        .sort((left, right) => left.name.localeCompare(right.name, 'tr-TR'))
        .slice(0, 8)
    : [];
  setSafeHtml(results, matches.map(student => `<button class="student-search-option" type="button" role="option" data-action="select-fee-student" data-id="${student.id}"><strong>${escapeHtml(student.name)}</strong><small>${escapeHtml(student.group)} · ${escapeHtml(studentBirthYearLabel(student))}</small></button>`).join(''));
  results.classList.toggle('is-hidden', matches.length === 0);
  form.elements.studentSearch.setAttribute('aria-expanded', String(matches.length > 0));
}

function closeLedgerActions() {
  document.querySelectorAll('.ledger-entry.show-actions').forEach(item => {
    item.classList.remove('show-actions');
    item.querySelector('.ledger-menu-button')?.setAttribute('aria-expanded', 'false');
  });
}

function toggleLedgerActions(row) {
  const shouldOpen = !row.classList.contains('show-actions');
  closeLedgerActions();
  if (shouldOpen) {
    row.classList.add('show-actions');
    row.querySelector('.ledger-menu-button')?.setAttribute('aria-expanded', 'true');
  }
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!supabaseClient || authRequestPending) return;
  showAuthMessage();
  setAuthPending(true);

  if (authMode === 'reset-password') {
    const email = loginEmail.value.trim();
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: AUTH_REDIRECT_URL });
    setAuthPending(false);
    showAuthMessage(error ? friendlyAuthError(error) : 'Şifre yenileme bağlantısı e-posta adresinize gönderildi.', Boolean(error));
    return;
  }

  if (authMode === 'set-password') {
    if (loginPassword.value !== loginPasswordConfirm.value) {
      setAuthPending(false);
      showAuthMessage('Şifreler birbiriyle aynı olmalıdır.', true);
      return;
    }
    if (loginPassword.value.length < 8) {
      setAuthPending(false);
      showAuthMessage('Şifreniz en az 8 karakter olmalıdır.', true);
      return;
    }
    authMode = 'login';
    const { data, error } = await supabaseClient.auth.updateUser({ password: loginPassword.value });
    if (error) {
      authMode = 'set-password';
      setAuthPending(false);
      showAuthMessage(friendlyAuthError(error), true);
      return;
    }
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
    await showAuthenticatedApp(data.user);
    showToast('Şifreniz kaydedildi. Hesabınız kullanıma hazır.');
    return;
  }

  openDashboardAfterPasswordLogin = true;
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: loginEmail.value.trim(),
    password: loginPassword.value
  });
  if (error) {
    openDashboardAfterPasswordLogin = false;
    setAuthPending(false);
    showAuthMessage(friendlyAuthError(error), true);
    return;
  }
  await showAuthenticatedApp(data.user);
});

document.querySelector('#forgotPasswordButton').addEventListener('click', () => configureAuthForm('reset-password'));
document.querySelector('#backToLoginButton').addEventListener('click', () => configureAuthForm('login'));

function setSelectOptions(select, placeholder, values) {
  if (!select) return;
  select.replaceChildren(new Option(placeholder, ''), ...values.map(value => new Option(value, value)));
}

async function loadSchoolApplicationLocations() {
  if (schoolApplicationLocations) return schoolApplicationLocations;
  if (!schoolApplicationLocationsLoading) {
    schoolApplicationLocationsLoading = fetch(SCHOOL_APPLICATION_LOCATION_DATA_URL)
      .then(response => {
        if (!response.ok) throw new Error('Konum listesi yüklenemedi.');
        return response.json();
      })
      .then(data => {
        const districtsByCity = new Map((data.cities || []).map(city => [city.Id, []]));
        (data.districts || []).forEach(district => districtsByCity.get(district.cityId)?.push(district.name));
        schoolApplicationLocations = (data.cities || [])
          .map(city => ({ name: city.name, districts: (districtsByCity.get(city.Id) || []).sort((a, b) => a.localeCompare(b, 'tr-TR')) }))
          .sort((left, right) => left.name.localeCompare(right.name, 'tr-TR'));
        return schoolApplicationLocations;
      })
      .finally(() => { schoolApplicationLocationsLoading = null; });
  }
  return schoolApplicationLocationsLoading;
}

async function updateSchoolApplicationLocationFields() {
  const form = document.querySelector('#schoolApplicationForm');
  if (!form) return;
  const country = form.elements.country?.value || 'Türkiye';
  const citySelect = form.elements.city;
  const districtField = document.querySelector('#schoolApplicationDistrictField');
  const districtSelect = form.elements.district;
  const isKktc = country === 'KKTC';
  districtField?.classList.toggle('is-hidden', isKktc);
  districtSelect.required = !isKktc;
  districtSelect.value = '';

  if (isKktc) {
    setSelectOptions(citySelect, 'İl seçin', KKTC_PROVINCES);
    citySelect.disabled = false;
    districtSelect.disabled = true;
    return;
  }

  citySelect.disabled = true;
  districtSelect.disabled = true;
  setSelectOptions(citySelect, 'İller yükleniyor…', []);
  setSelectOptions(districtSelect, 'Önce il seçin', []);
  try {
    const locations = await loadSchoolApplicationLocations();
    if ((form.elements.country?.value || 'Türkiye') !== 'Türkiye') return;
    setSelectOptions(citySelect, 'İl seçin', locations.map(location => location.name));
    citySelect.disabled = false;
  } catch (error) {
    setSelectOptions(citySelect, 'İller yüklenemedi', []);
    const message = document.querySelector('#schoolApplicationMessage');
    message.textContent = 'İl ve ilçe listesi yüklenemedi. Lütfen bağlantınızı kontrol edip tekrar deneyin.';
    message.classList.remove('is-hidden');
  }
}

function updateSchoolApplicationDistrictOptions() {
  const form = document.querySelector('#schoolApplicationForm');
  if (!form || form.elements.country?.value !== 'Türkiye') return;
  const city = form.elements.city?.value || '';
  const districtSelect = form.elements.district;
  const location = schoolApplicationLocations?.find(item => item.name === city);
  setSelectOptions(districtSelect, city ? 'İlçe seçin' : 'Önce il seçin', location?.districts || []);
  districtSelect.disabled = !location;
}

document.querySelector('#schoolApplicationCountry')?.addEventListener('change', () => { void updateSchoolApplicationLocationFields(); });
document.querySelector('#schoolApplicationCity')?.addEventListener('change', updateSchoolApplicationDistrictOptions);
document.querySelector('#schoolApplicationPhone')?.addEventListener('input', event => {
  const input = event.currentTarget;
  input.value = formatTurkishPhoneInput(input.value);
});
document.querySelector('#schoolApplicationEmail')?.addEventListener('input', event => {
  const input = event.currentTarget;
  input.value = input.value.replace(/\s/g, '');
});
document.querySelector('#studentPhone')?.addEventListener('input', event => {
  const input = event.currentTarget;
  input.value = formatTurkishPhoneInput(input.value);
});
document.querySelector('#studentEmail')?.addEventListener('input', event => {
  const input = event.currentTarget;
  input.value = input.value.replace(/\s/g, '');
});
document.querySelector('#schoolApplicationButton')?.addEventListener('click', () => {
  const form = document.querySelector('#schoolApplicationForm');
  form?.reset();
  void updateSchoolApplicationLocationFields();
  const message = document.querySelector('#schoolApplicationMessage');
  message?.classList.add('is-hidden');
  message?.classList.remove('error');
  document.querySelector('#schoolApplicationDialog')?.showModal();
});
document.querySelector('#schoolApplicationForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.querySelector('#schoolApplicationMessage');
  const submit = form.querySelector('button[type="submit"]');
  const values = Object.fromEntries(new FormData(form).entries());
  message.classList.add('is-hidden');
  message.classList.remove('error');
  submit.disabled = true;
  submit.textContent = 'Başvuru gönderiliyor…';
  try {
    if (!remoteDataStore) throw new Error('Başvuru hizmetine ulaşılamadı.');
    const result = await remoteDataStore.submitSchoolApplication(values);
    if (result?.status === 'PENDING_REVIEW') {
      message.textContent = result.message || 'Başvurunuz henüz onay aşamasında.';
      message.classList.remove('error');
      message.classList.remove('is-hidden');
      return;
    }
    if (result?.status === 'REGISTERED_SCHOOL') {
      message.textContent = result.message || 'Bu e-posta adresiyle kayıtlı bir futbol okulu vardır. Lütfen farklı bir e-posta adresiyle başvuru yapın.';
      message.classList.add('error');
      message.classList.remove('is-hidden');
      return;
    }
    if (result?.status === 'REGISTERED_SCHOOL_NAME') {
      message.textContent = result.message || 'Bu isimle kayıtlı bir futbol okulu bulunmaktadır. Lütfen okul adını kontrol edin veya farklı bir okul adıyla başvuru yapın.';
      message.classList.add('error');
      message.classList.remove('is-hidden');
      return;
    }
    if (result?.status === 'IGNORED') return;
    form.reset();
    message.textContent = '';
    message.classList.add('is-hidden');
    message.classList.remove('error');
    const dialog = form.closest('dialog');
    if (dialog?.open) dialog.close();
    window.setTimeout(() => showRecordCreated('İnceleme sonrasında e-posta adresiniz üzerinden bilgilendirileceksiniz.', {
      title: 'Başvurunuz alındı',
      duration: 5000
    }), 0);
  } catch (error) {
    message.textContent = error.message || 'Başvuru gönderilemedi.';
    message.classList.add('error');
    message.classList.remove('is-hidden');
  } finally {
    submit.disabled = false;
    submit.textContent = 'Başvuruyu gönder';
  }
});

adminMfaForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!pendingAdminMfa || adminMfaSubmitButton.disabled) return;
  const code = adminMfaCode.value.replace(/\D/g, '');
  if (!/^\d{6}$/.test(code)) {
    showAdminMfaMessage('Lütfen 6 haneli doğrulama kodunu girin.', true);
    return;
  }
  adminMfaSubmitButton.disabled = true;
  adminMfaSubmitButton.textContent = 'Doğrulanıyor…';
  showAdminMfaMessage();
  const { data: challenge, error: challengeError } = await supabaseClient.auth.mfa.challenge({
    factorId: pendingAdminMfa.factorId
  });
  if (challengeError || !challenge?.id) {
    adminMfaSubmitButton.disabled = false;
    adminMfaSubmitButton.textContent = 'Doğrula ve devam et';
    showAdminMfaMessage(`Doğrulama başlatılamadı: ${challengeError?.message || 'Geçici bağlantı hatası'}`, true);
    return;
  }
  const { error: verifyError } = await supabaseClient.auth.mfa.verify({
    factorId: pendingAdminMfa.factorId,
    challengeId: challenge.id,
    code
  });
  if (verifyError) {
    adminMfaSubmitButton.disabled = false;
    adminMfaSubmitButton.textContent = 'Doğrula ve devam et';
    const errorDetail = verifyError.code || verifyError.message || 'Kod geçersiz';
    showAdminMfaMessage(`Kod doğrulanamadı (${errorDetail}). Telefonunuzun tarih ve saat ayarının otomatik olduğunu kontrol edip yeni kodu deneyin.`, true);
    return;
  }
  finishAdminMfa(true);
});

adminMfaCopySecretButton.addEventListener('click', async () => {
  const secret = adminMfaSecret.textContent.trim();
  if (!secret) return;
  try {
    await navigator.clipboard.writeText(secret);
    showAdminMfaMessage('Kurulum anahtarı kopyalandı. Authenticator uygulamasına boşluksuz olarak yapıştırın.');
  } catch (error) {
    showAdminMfaMessage('Kurulum anahtarı kopyalanamadı. Anahtarın üzerine basılı tutarak kopyalayın.', true);
  }
});

document.querySelector('#adminMfaCancelButton').addEventListener('click', async () => {
  if (!pendingAdminMfa) return;
  const { factorId, enrolledNow } = pendingAdminMfa;
  if (enrolledNow) await supabaseClient.auth.mfa.unenroll({ factorId });
  finishAdminMfa(false);
  signedOutMessage = 'İki aşamalı doğrulama tamamlanmadığı için oturum kapatıldı.';
  await supabaseClient.auth.signOut();
});

document.querySelector('#logoutButton').addEventListener('click', logout);
document.querySelector('#pendingAccessLogoutButton')?.addEventListener('click', logout);
globalBackButton.addEventListener('click', requestAppBack);
appContent.addEventListener('touchstart', event => {
  if (event.touches.length !== 1 || !window.matchMedia('(max-width: 820px)').matches || isMobileTabSwipeBlocked(event.target)) {
    mobileTabSwipeStart = null;
    return;
  }
  const touch = event.touches[0];
  const edgeInset = 28;
  if (touch.clientX <= edgeInset || touch.clientX >= window.innerWidth - edgeInset) {
    mobileTabSwipeStart = null;
    return;
  }
  mobileTabSwipeStart = { x: touch.clientX, y: touch.clientY, time: performance.now(), cancelled: false };
}, { passive: true });
appContent.addEventListener('touchmove', event => {
  if (!mobileTabSwipeStart || event.touches.length !== 1) return;
  const touch = event.touches[0];
  const deltaX = touch.clientX - mobileTabSwipeStart.x;
  const deltaY = touch.clientY - mobileTabSwipeStart.y;
  if (Math.abs(deltaY) > 18 && Math.abs(deltaY) > Math.abs(deltaX)) mobileTabSwipeStart.cancelled = true;
}, { passive: true });
appContent.addEventListener('touchend', event => {
  const swipeStart = mobileTabSwipeStart;
  mobileTabSwipeStart = null;
  const touch = event.changedTouches[0];
  if (!swipeStart || swipeStart.cancelled || !touch) return;
  const deltaX = touch.clientX - swipeStart.x;
  const deltaY = touch.clientY - swipeStart.y;
  const elapsed = performance.now() - swipeStart.time;
  const minimumDistance = Math.max(54, window.innerWidth * .14);
  if (elapsed > 900 || Math.abs(deltaX) < minimumDistance || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return;
  if (navigateMobileTabBySwipe(deltaX < 0 ? 1 : -1)) mobileTabSwipeSuppressClickUntil = performance.now() + 450;
}, { passive: true });
appContent.addEventListener('touchcancel', () => { mobileTabSwipeStart = null; }, { passive: true });
document.addEventListener('click', event => {
  if (performance.now() >= mobileTabSwipeSuppressClickUntil) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);
window.addEventListener('popstate', event => {
  if (!state.userId || appShell.classList.contains('is-hidden')) return;
  if (restoreBrowserNavigation(event.state)) return;
  if (state.page !== 'dashboard') goBack();
});
document.querySelector('#menuButton').addEventListener('click', () => document.querySelector('#sidebar').classList.add('open'));
document.querySelector('#sidebarScrim').addEventListener('click', () => document.querySelector('#sidebar').classList.remove('open'));
document.querySelector('#schoolSelect').addEventListener('change', async event => {
  const previousSchoolId = state.schoolId;
  const changed = await switchSchool(event.target.value);
  if (!changed) event.target.value = previousSchoolId;
});
document.querySelector('#rolePreviewSelect').addEventListener('change', event => {
  if (!isActualSuperAdmin()) return;
  const previewRole = String(event.target.value || 'super_admin');
  if (!roleNames[previewRole]) return;
  state.role = previewRole;
  state.page = 'dashboard';
  state.pageHistory = [];
  state.selectedStudentId = null;
  state.selectedParentStudentId = state.students[0]?.id || null;
  state.notificationComposeOpen = false;
  initializeBrowserNavigation();
  render();
  showToast(previewRole === 'super_admin'
    ? 'Süper Admin ekranına dönüldü.'
    : `${roleNames[previewRole]} ekranı önizleniyor; gerçek yetkiniz değişmedi.`);
});

document.addEventListener('click', async event => {
  const dialogCloseButton = event.target.closest('[data-dialog-close]');
  if (dialogCloseButton) { const dialog = document.querySelector(`#${dialogCloseButton.dataset.dialogClose}`); if (dialog?.open) dialog.close(); dialog?.querySelector('form')?.reset(); if (dialog?.id === 'studentDialog') { state.editingStudentId = null; resetStudentPhotoEditor(); } if (dialog?.id === 'trainingDialog') state.editingTrainingId = null; if (dialog?.id === 'accountingDialog') state.editingAccountingEntryId = null; if (dialog?.id === 'schoolAdminDialog') state.invitingSchoolId = null; if (dialog?.id === 'schoolEditDialog') state.editingSchoolId = null; if (dialog?.id === 'subscriptionDialog') state.editingSubscriptionSchoolId = null; if (dialog?.id === 'feePaymentDialog') render(); return; }
  const pageButton = event.target.closest('[data-page]');
  if (pageButton && appShell.contains(pageButton)) {
    if (pageButton.dataset.page === 'schools' && state.role === 'super_admin') {
      try { await refreshSchools(); } catch (error) { showToast(`Okul özeti yenilenemedi: ${error.message || 'Bağlantı hatası'}`); }
    }
    if (pageButton.dataset.page === 'applications' && state.role === 'super_admin') {
      try { state.schoolApplications = await remoteDataStore.listSchoolApplications(); } catch (error) { showToast(`Başvurular yüklenemedi: ${error.message || 'Bağlantı hatası'}`); }
    }
    if (pageButton.dataset.page === 'subscriptionPayments' && state.role === 'super_admin') {
      try { state.subscriptionPaymentReports = await remoteDataStore.listSubscriptionPaymentReports(); } catch (error) { showToast(`Ödeme bildirimleri yüklenemedi: ${error.message || 'Bağlantı hatası'}`); }
    }
    navigateToPage(pageButton.dataset.page, pageButton.dataset.page === 'fees' ? { feeFilter: 'all' } : {});
    return;
  }
  const actionButton = event.target.closest('[data-action]');
  if (!actionButton) {
    closeLedgerActions();
    return;
  }
  const action = actionButton.dataset.action;
  if (action === 'request-application-info' && state.role === 'super_admin') {
    const applicationId = actionButton.dataset.id;
    const customerMessage = window.prompt('Başvuru sahibinden istenecek bilgi / mesaj:');
    if (customerMessage === null) return;
    const internalNote = window.prompt('İç not (isteğe bağlı):') || '';
    const saved = await runRemoteMutation(() => remoteDataStore.reviewSchoolApplication({ applicationId, status: 'INFO_REQUESTED', customerMessage, internalNote }));
    if (!saved) return;
    state.schoolApplications = await remoteDataStore.listSchoolApplications();
    render();
    showToast('Ek bilgi isteği kaydedildi.');
  }
  else if (action === 'reject-application' && state.role === 'super_admin') {
    const applicationId = actionButton.dataset.id;
    if (!window.confirm('Bu başvuru reddedilsin mi?')) return;
    const customerMessage = window.prompt('Başvuru sahibine iletilecek mesaj (isteğe bağlı):') || '';
    const internalNote = window.prompt('İç not (isteğe bağlı):') || '';
    const saved = await runRemoteMutation(() => remoteDataStore.reviewSchoolApplication({ applicationId, status: 'REJECTED', customerMessage, internalNote }));
    if (!saved) return;
    state.schoolApplications = await remoteDataStore.listSchoolApplications();
    render();
    showToast('Başvuru reddedildi.');
  }
  else if (action === 'approve-application' && state.role === 'super_admin') {
    const application = state.schoolApplications.find(item => item.id === actionButton.dataset.id);
    if (!application || !window.confirm(`${application.school_name} başvurusu onaylansın mı? Okul ve ilk Admin hesabı oluşturulacak.`)) return;
    const saved = await runRemoteMutation(() => remoteDataStore.approveSchoolApplication(application.id));
    if (!saved) return;
    state.schoolApplications = await remoteDataStore.listSchoolApplications();
    await refreshSchools();
    render();
    showToast(saved.invitationSent ? 'Başvuru onaylandı; şifre oluşturma daveti gönderildi.' : 'Başvuru onaylandı; mevcut kullanıcı okul Admini olarak bağlandı.');
  }
  else if (action === 'review-payment-report' && state.role === 'super_admin') {
    const approved = actionButton.dataset.approved === 'true';
    const note = window.prompt(approved ? 'Onay notu (isteğe bağlı):' : 'İptal nedeni (isteğe bağlı):') || '';
    const saved = await runRemoteMutation(() => remoteDataStore.reviewSubscriptionPaymentReport({ reportId: actionButton.dataset.id, approved, note }));
    if (!saved) return;
    if (approved && saved.reported_by) {
      await invokePushFunction({
        action: 'create-and-send',
        schoolId: saved.school_id || state.schoolId,
        audience: 'Abonelik işlemi',
        recipientUserIds: [saved.reported_by],
        title: 'Aboneliğiniz etkinleşti',
        message: 'Ödeme bildiriminiz onaylandı. SASA-F aboneliğiniz etkinleştirildi.',
        notification: {
          audience: 'Abonelik işlemi',
          title: 'Aboneliğiniz etkinleşti',
          body: 'Ödeme bildiriminiz onaylandı. SASA-F aboneliğiniz etkinleştirildi.'
        }
      }).catch(error => console.error('Ödeme onay bildirimi gönderilemedi:', error));
    }
    state.subscriptionPaymentReports = await remoteDataStore.listSubscriptionPaymentReports();
    await refreshSchools();
    render();
    showToast(approved ? 'Ödeme onaylandı ve abonelik dönemi işlendi.' : 'Ödeme bildirimi iptal edildi.');
  }
  else if (action === 'start-school-trial' && state.role === 'admin') {
    const saved = await runRemoteMutation(() => remoteDataStore.startSchoolTrial());
    if (!saved) return;
    state.onboarding = saved;
    state.schoolSubscriptionPlan = 'standard';
    state.schoolSubscriptionStatus = 'trial';
    state.schoolSubscriptionEndsOn = localDateAfterMonths(localDateValue(), 3);
    render();
    showToast('3 aylık ücretsiz deneme başlatıldı.');
    return;
  }
  else if (action === 'open-subscription-purchase' && state.role === 'admin') {
    state.onboardingPurchaseOpen = true;
    render();
    return;
  }
  else if (action === 'report-subscription-payment' && state.role === 'admin') {
    const billingPeriod = document.querySelector('#onboardingBillingPeriod')?.value || 'monthly';
    const note = String(document.querySelector('#onboardingPayerName')?.value || '').trim().replace(/\s+/g, ' ');
    if (note.length < 2) {
      showToast('Lütfen havaleyi gönderen kişinin adını ve soyadını yazın.');
      return;
    }
    const saved = await runRemoteMutation(() => remoteDataStore.createSubscriptionPaymentReport({ billingPeriod, note }));
    if (!saved) return;
    const paymentPeriod = subscriptionPeriodLabel(billingPeriod);
    await invokePushFunction({
      action: 'create-and-send',
      schoolId: saved.school_id || state.schoolId,
      audience: 'Süper Admin',
      title: 'Yeni abonelik ödeme bildirimi',
      message: `${state.schoolName || 'Bir okul'} ${paymentPeriod} abonelik ödemesi yaptığını bildirdi.`,
      notification: {
        audience: 'Süper Admin',
        title: 'Yeni abonelik ödeme bildirimi',
        body: `${state.schoolName || 'Bir okul'} ${paymentPeriod} abonelik ödemesi yaptığını bildirdi.`
      }
    }).catch(error => console.error('Süper Admin ödeme bildirimi gönderilemedi:', error));
    state.onboarding = { ...state.onboarding, status: 'PAYMENT_PENDING' };
    try { state.subscriptionHistory = await remoteDataStore.listMySubscriptionHistory(); } catch (error) { console.warn('Abonelik geçmişi güncellenemedi:', error); }
    state.onboardingPurchaseOpen = false;
    render();
    showToast('Ödeme bildiriminiz incelemeye gönderildi.');
    return;
  }
  else if (action === 'complete-onboarding' && state.role === 'admin') {
    if (adminMustChooseSubscription()) {
      state.page = 'onboarding';
      state.pageHistory = [];
      state.onboardingPurchaseOpen = false;
      render();
      showToast('Yönetim ekranına geçmeden önce ücretsiz denemeyi başlatın veya satın alma bildirimi oluşturun.');
      return;
    }
    state.page = 'dashboard';
    state.pageHistory = [];
    render();
    return;
  }
  if (action === 'add-bank-account' && isAdminRole()) {
    const form = actionButton.closest('#schoolBankSettingsForm, #subscriptionBankSettingsForm');
    const list = form?.querySelector('.bank-account-settings-list');
    const accountCount = list?.querySelectorAll('.bank-account-settings-card').length || 0;
    if (!form || !list || accountCount >= 4) return;
    appendSafeHtml(list, bankAccountSettingsCardMarkup({}, accountCount, accountCount + 1, true));
    syncBankAccountFormControls(form);
    list.querySelector('.bank-account-settings-card:last-child input')?.focus();
  }
  else if (action === 'remove-bank-account' && isAdminRole()) {
    const form = actionButton.closest('#schoolBankSettingsForm, #subscriptionBankSettingsForm');
    const cards = form ? [...form.querySelectorAll('.bank-account-settings-card')] : [];
    if (!form || cards.length <= 1) return;
    actionButton.closest('.bank-account-settings-card')?.remove();
    syncBankAccountFormControls(form);
  }
  else if (action === 'parent-payment' && state.role === 'parent') {
    const month = String(actionButton.dataset.month || '');
    const student = currentParentStudent();
    if (!student || !unpaidFeePeriods(student).includes(month)) {
      showToast('Bu aidat için ödeme işlemi başlatılamıyor.');
      return;
    }
    state.selectedParentPaymentMonth = month;
    navigateToPage('parentPayment');
  }
  else if (action === 'copy-parent-iban' && state.role === 'parent') {
    const accountIndex = Number(actionButton.dataset.accountIndex || 0);
    const iban = normalizeIban(state.schoolBankAccounts?.[accountIndex]?.iban);
    if (!iban) {
      showToast('Kulübün doğrulanmış IBAN bilgisi henüz tanımlanmadı.');
      return;
    }
    try {
      await navigator.clipboard.writeText(iban);
      showToast('IBAN kopyalandı.');
    } catch (error) {
      showToast('IBAN kopyalanamadı. Lütfen tekrar deneyin.');
    }
  }
  else if (action === 'copy-subscription-iban' && state.role === 'admin') {
    const accountIndex = Number(actionButton.dataset.accountIndex || 0);
    const iban = normalizeIban(state.subscriptionBankAccounts?.[accountIndex]?.iban);
    if (!iban) {
      showToast('Abonelik için doğrulanmış IBAN bilgisi henüz tanımlanmadı.');
      return;
    }
    try {
      await navigator.clipboard.writeText(iban);
      showToast('IBAN kopyalandı.');
    } catch (error) {
      showToast('IBAN kopyalanamadı. Lütfen tekrar deneyin.');
    }
  }
  else if (action === 'send-subscription-reminder-test-email' && state.role === 'super_admin') {
    actionButton.disabled = true;
    try {
      const result = await remoteDataStore.sendSubscriptionReminderTestEmail('00vetmaster00+iskelefb@gmail.com');
      showToast(result?.emailCount ? 'Deneme maili ve bildirimi gönderildi.' : 'Deneme maili ve bildirimi gönderilemedi.');
    } catch (error) {
      showToast(`Deneme maili ve bildirimi gönderilemedi: ${error.message || 'Bağlantı hatası'}`);
    } finally {
      actionButton.disabled = false;
    }
  }
  else if (action === 'select-school' && state.role === 'super_admin') {
    await switchSchool(actionButton.dataset.id);
  }
  else if (action === 'invite-school-admin' && isAdminRole()) {
    const school = state.role === 'super_admin'
      ? state.schools.find(item => item.id === actionButton.dataset.id)
      : state.schools.find(item => item.id === state.schoolId);
    if (!school?.active) return;
    state.invitingSchoolId = school.id;
    state.schoolInviteConfirmation = null;
    const form = document.querySelector('#schoolAdminForm');
    form.reset();
    const formMessage = document.querySelector('#schoolAdminFormMessage');
    formMessage.textContent = '';
    formMessage.classList.add('is-hidden');
    form.elements.schoolId.value = school.id;
    form.elements.role.value = state.role === 'super_admin' ? 'admin' : 'coach';
    const roleField = document.querySelector('#schoolAdminRoleField');
    roleField.classList.toggle('is-hidden', state.role !== 'super_admin');
    form.elements.role.disabled = state.role !== 'super_admin';
    document.querySelector('#schoolAdminDialogDescription').textContent = state.role === 'super_admin'
      ? `${school.name} için Admin veya Antrenör yetkisi eklenir.`
      : `${school.name} için Antrenör yetkisi gönderilir.`;
    document.querySelector('#schoolAdminDialog').showModal();
    window.setTimeout(() => form.elements.fullName.focus(), 0);
  }
  else if (action === 'rename-school' && state.role === 'super_admin') {
    const school = state.schools.find(item => item.id === actionButton.dataset.id);
    if (!school) return;
    state.editingSchoolId = school.id;
    const form = document.querySelector('#schoolEditForm');
    form.reset();
    form.elements.schoolId.value = school.id;
    form.elements.schoolName.value = school.name;
    document.querySelector('#schoolEditDialog').showModal();
    window.setTimeout(() => form.elements.schoolName.focus(), 0);
  }
  else if (action === 'toggle-school-status' && state.role === 'super_admin') {
    const school = state.schools.find(item => item.id === actionButton.dataset.id);
    if (!school) return;
    const nextActive = !school.active;
    if (!nextActive && !window.confirm(`“${school.name}” pasife alınsın mı? Veriler silinmeyecek.`)) return;
    const updated = await runRemoteMutation(() => remoteDataStore.updateSchool({ id: school.id, name: school.name, active: nextActive }));
    if (!updated) return;
    school.active = updated.is_active !== false;
    render();
    showToast(school.active ? 'Okul yeniden aktifleştirildi.' : 'Okul pasife alındı; verileri korunuyor.');
  }
  else if (action === 'delete-school' && state.role === 'super_admin') {
    const school = state.schools.find(item => item.id === actionButton.dataset.id);
    if (!school) return;
    if (Number(school.studentCount || 0) > 0 || Number(school.adminCount || 0) > 0) {
      showToast('Öğrencisi veya yetkili kullanıcısı olan okullar silinemez. Okulu pasife alabilirsiniz.');
      return;
    }
    const confirmed = window.confirm(`“${school.name}” kalıcı olarak silinsin mi? Bu işlem geri alınamaz.`);
    if (!confirmed) return;
    const deleted = await runRemoteMutation(() => remoteDataStore.deleteSchool(school.id));
    if (!deleted) return;
    const deletedActiveSchool = school.id === state.schoolId;
    await refreshSchools();
    if (deletedActiveSchool) {
      const replacementSchool = state.schools.find(item => item.active) || state.schools[0];
      if (replacementSchool) await switchSchool(replacementSchool.id, { navigate: false });
      else {
        stopRealtimeSync();
        clearSensitiveState();
        render();
      }
    } else {
      render();
    }
    showRecordCreated(`${school.name} ve okula bağlı kayıtlar silindi.`);
  }
  else if (action === 'edit-subscription' && state.role === 'super_admin') {
    const school = state.schools.find(item => item.id === actionButton.dataset.id);
    if (!school) return;
    state.editingSubscriptionSchoolId = school.id;
    const form = document.querySelector('#subscriptionForm');
    form.reset();
    form.elements.schoolId.value = school.id;
    form.elements.status.value = school.subscriptionStatus || 'trial';
    if (form.elements.trialMode) form.elements.trialMode.value = 'time_limited';
    form.elements.billingPeriod.value = school.subscriptionBillingPeriod || 'monthly';
    form.elements.periodPrice.value = school.subscriptionStatus === 'trial' ? 0 : subscriptionPrice('standard', form.elements.billingPeriod.value);
    form.elements.startsOn.value = school.subscriptionStartsOn || '';
    form.elements.endsOn.value = school.subscriptionEndsOn || '';
    syncTrialSubscriptionFields();
    document.querySelector('#subscriptionDialogSchoolName').textContent = school.name;
    document.querySelector('#subscriptionDialog').showModal();
  }
  else if (action === 'extend-subscription' && state.role === 'super_admin') {
    const school = state.schools.find(item => item.id === actionButton.dataset.id);
    if (!school || school.subscriptionStatus !== 'active') return;
    const form = ensureSubscriptionExtensionDialog();
    const today = localDateValue();
    const currentEnd = school.subscriptionEndsOn || today;
    const baseDate = currentEnd >= today ? currentEnd : today;
    form.reset();
    form.elements.schoolId.value = school.id;
    form.elements.billingPeriod.value = school.subscriptionBillingPeriod || 'yearly';
    form.elements.currentEndsOn.value = currentEnd;
    form.elements.startsOn.value = baseDate;
    syncSubscriptionExtensionFields();
    document.querySelector('#subscriptionExtensionSchoolName').textContent = school.name;
    document.querySelector('#subscriptionExtensionDialog').showModal();
  }
  else if (action === 'select-fee-student') {
    const student = state.students.find(item => item.id === Number(actionButton.dataset.id));
    if (!student) return;
    const form = document.querySelector('#feeDefinitionForm');
    form.elements.studentSearch.value = `${student.name} · ${student.group} · ${studentBirthYearLabel(student)}`;
    form.elements.studentId.value = student.id;
    document.querySelector('#feeDefinitionStudentResults').classList.add('is-hidden');
    form.elements.studentSearch.setAttribute('aria-expanded', 'false');
  }
  else if (action === 'select-accounting-student') {
    const student = state.students.find(item => item.id === Number(actionButton.dataset.id));
    if (!student) return;
    const form = document.querySelector('#accountingForm');
    form.elements.studentSearch.value = `${student.name} · ${student.group} · ${studentBirthYearLabel(student)}`;
    form.elements.studentId.value = String(student.id);
    form.elements.studentSearch.setAttribute('aria-expanded', 'false');
    document.querySelector('#accountingStudentResults').classList.add('is-hidden');
    document.querySelector('#accountingFeeMonths').textContent = 'Aidat dönemleri yükleniyor…';
    try {
      const months = upcomingFeeMonths();
      const rows = await remoteDataStore.loadFeePeriods({ from: months[0], to: months.at(-1), studentId: student.id });
      if (Number(form.elements.studentId.value) !== student.id || !form.closest('dialog')?.open) return;
      applyFeeRows(rows);
      showAccountingFeeMonths(student, rows);
    } catch (error) {
      form.elements.studentId.value = '';
      document.querySelector('#accountingFeeMonths').replaceChildren();
      showToast(`Aidat dönemleri yüklenemedi: ${error.message || 'Bağlantı hatası'}`);
    }
  }
  else if (action === 'edit-accounting-fee-price') {
    const row = actionButton.closest('.accounting-fee-month-row');
    const input = row?.querySelector('[data-accounting-fee-price-input]');
    if (!row || !input) return;
    if (!row.classList.contains('is-editing')) {
      row.classList.add('is-editing');
      row.querySelector('.accounting-fee-price').classList.add('is-hidden');
      input.classList.remove('is-hidden');
      actionButton.textContent = '✓';
      actionButton.setAttribute('aria-label', 'Yeni aidat tutarını kaydet');
      input.focus();
      input.select();
      return;
    }
    const amount = Number(input.value);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 99999999.99) {
      showToast('Geçerli bir aidat tutarı girin.');
      input.focus();
      return;
    }
    row.dataset.amount = String(Math.round(amount * 100) / 100);
    row.classList.remove('is-editing');
    row.querySelector('.accounting-fee-price').textContent = formatCurrency(Number(row.dataset.amount));
    row.querySelector('.accounting-fee-price').classList.remove('is-hidden');
    input.classList.add('is-hidden');
    actionButton.textContent = '✎';
    actionButton.setAttribute('aria-label', 'Aidat tutarını düzenle');
    updateAccountingFeeSummary();
  }
  else if (action === 'add-student' && ['super_admin', 'admin'].includes(state.role)) openStudentDialog();
  else if (action === 'send-student-notification' && isAdminRole()) {
    const student = state.students.find(item => item.id === Number(actionButton.dataset.id));
    if (!student) return;
    const form = document.querySelector('#studentNotificationForm');
    form.reset();
    form.elements.studentId.value = student.id;
    document.querySelector('#studentNotificationTitle').textContent = `${student.name} için bildirim gönder`;
    document.querySelector('#studentNotificationDescription').textContent = student.parent ? `${student.parent} adlı veliye bildirim gönderilir.` : 'Veli hesabı tanımlıysa bildirim gönderilir.';
    document.querySelector('#studentNotificationDialog').showModal();
  }
  else if (action === 'edit-profile' && ['super_admin', 'admin', 'coach'].includes(state.role)) { const student = state.students.find(item => item.id === Number(state.selectedStudentId)); if (student) openStudentDialog(student); }
  else if (action === 'player-card') {
    const student = accessiblePlayerCardStudent(actionButton.dataset.id);
    if (student) openPlayerCardDialog(student);
  }
  else if (action === 'edit-player-card' && isAdminRole()) {
    const form = document.querySelector('#playerCardForm');
    form.classList.remove('is-hidden');
    actionButton.classList.add('is-hidden');
    form.elements.overall.focus();
  }
  else if (action === 'cancel-player-card-edit' && isAdminRole()) {
    const form = document.querySelector('#playerCardForm');
    const student = accessiblePlayerCardStudent(form.elements.studentId.value);
    if (student) {
      fillPlayerCardForm(student);
      setSafeHtml(document.querySelector('#playerCardPreview'), playerCardMarkup(student));
    }
    form.classList.add('is-hidden');
    document.querySelector('#playerCardEditToggle').classList.remove('is-hidden');
  }
  else if (action === 'new-training' && ['super_admin', 'admin', 'coach'].includes(state.role)) openTrainingDialog();
  else if (action === 'edit-training' && ['super_admin', 'admin', 'coach'].includes(state.role)) { const training = state.trainings.find(item => item.id === Number(actionButton.dataset.id)); if (training) openTrainingDialog(training); }
  else if (action === 'delete-training' && ['super_admin', 'admin', 'coach'].includes(state.role)) {
    const training = state.trainings.find(item => item.id === Number(state.editingTrainingId));
    if (training && window.confirm(`“${training.title}” antrenmanı silinsin mi? Bu antrenmana ait yoklama kayıtları da silinecektir.`)) {
      const saved = await runRemoteMutation(() => remoteDataStore.deleteTraining(training.id));
      if (!saved) return;
      state.trainings = state.trainings.filter(item => item.id !== training.id);
      state.attendanceRecords = state.attendanceRecords.filter(record => Number(record.trainingId) !== Number(training.id));
      state.editingTrainingId = null;
      persistLocalData();
      document.querySelector('#trainingDialog').close();
      render();
      if (state.role === 'coach') {
        showRecordCreated('Antrenman silindi. İptal bildirimini okul yöneticisi gönderebilir.');
        return;
      }
      try {
        const pushResult = await saveAndSendNotification({
          audience: `${training.group} velileri`,
          title: `${training.group} grubu · Antrenman iptal edildi`,
          body: `${formatTrainingDateLong(training.date)} saat ${training.time}’de yapılması planlanan ${training.title} antrenmanı iptal edilmiştir. Saha: ${training.field}.`
        });
        render();
        showRecordCreated(pushResult.sent > 0
          ? `Antrenman silindi ve ${pushResult.sent} telefona iptal bildirimi gönderildi.`
          : 'Antrenman silindi; bu grupta bildirimi açık telefon bulunamadı.');
      } catch (error) {
        render();
        showRecordCreated(`Antrenman silindi ancak iptal bildirimi gönderilemedi: ${error.message || 'Bağlantı hatası'}`);
      }
    }
  }
  else if (action === 'new-entry' && isAdminRole()) openAccountingDialog();
  else if (action === 'collect-fee' && ['super_admin', 'admin'].includes(state.role)) openFeeDefinitionDialog();
  else if (action === 'accounting-period') {
    state.accountingPeriod = 'today';
    state.accountingDateRangeStart = '';
    state.accountingDateRangeEnd = '';
    window.localStorage.setItem('sporx_accounting_period', state.accountingPeriod);
    render();
    loadPageData(state.page, { force: true }).then(render).catch(error => console.error('Bugünkü muhasebe yüklenemedi:', error));
  }
  else if (action === 'accounting-date-range') openAccountingDateRangeDialog();
  else if (action === 'accounting-entries') navigateToPage('accountingEntries', { accountingFilter: actionButton.dataset.kind || 'all' });
  else if (action === 'pending-fees') navigateToPage('fees', { feeFilter: 'pending' });
  else if (action === 'scroll-profile-fees') document.querySelector('#monthlyFeeSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  else if (action === 'toggle-student-timeline') { const studentId = Number(actionButton.dataset.id); state.expandedTimelineStudentId = Number(state.expandedTimelineStudentId) === studentId ? null : studentId; render(); }
  else if (action === 'fee-filter') { state.feeFilter = actionButton.dataset.filter || 'all'; render(); }
  else if (action === 'dismiss-dashboard-notifications') {
    window.localStorage.setItem(PUSH_PROMPT_DISMISS_STORAGE_KEY, '1');
    render();
  }
  else if (action === 'toggle-phone-notifications' || action === 'enable-dashboard-notifications') {
    if (state.pushBusy) return;
    state.pushBusy = true;
    render();
    try {
      if (action === 'toggle-phone-notifications' && state.pushStatus === 'enabled') {
        await disablePhoneNotifications();
        showToast('Bu telefondaki bildirimler kapatıldı.');
      } else {
        await enablePhoneNotifications();
        window.localStorage.removeItem(PUSH_PROMPT_DISMISS_STORAGE_KEY);
        showToast('Telefon bildirimleri açıldı.');
      }
    } catch (error) {
      await refreshPushStatus();
      showToast(error.message || 'Bildirim ayarı tamamlanamadı.');
    } finally {
      state.pushBusy = false;
      render();
    }
  }
  else if (action === 'delete-notification' && isAdminRole()) {
    const notification = state.notifications.find(item => Number(item.id) === Number(actionButton.dataset.id));
    if (!notification) return;
    if (!window.confirm(`“${notification.title}” bildirimi silinsin mi?`)) return;
    const saved = await runRemoteMutation(() => remoteDataStore.deleteNotification(notification.id));
    if (!saved) return;
    state.notifications = state.notifications.filter(item => Number(item.id) !== Number(notification.id));
    persistLocalData();
    render();
    showRecordCreated('Bildirim silindi.');
  }
  else if (action === 'edit-group' && ['super_admin', 'admin'].includes(state.role)) {
    state.editingGroupName = String(actionButton.dataset.group || '');
    render();
    window.setTimeout(() => document.querySelector('#editGroupName')?.focus(), 0);
  }
  else if (action === 'cancel-edit-group' && ['super_admin', 'admin'].includes(state.role)) {
    state.editingGroupName = null;
    render();
  }
  else if (action === 'delete-group' && ['super_admin', 'admin'].includes(state.role)) {
    const groupName = String(actionButton.dataset.group || '');
    if (GROUPS.length <= 1) { showToast('Okuldaki son grup silinemez.'); return; }
    const studentCount = state.students.filter(student => student.group === groupName).length;
    const trainingCount = state.trainings.filter(training => training.group === groupName).length;
    if (studentCount || trainingCount) {
      showToast('Bu grup kullanımda. Önce öğrenci ve antrenman kayıtlarını başka gruba taşıyın.');
      return;
    }
    if (!window.confirm(`“${groupName}” grubu silinsin mi?`)) return;
    const saved = await runRemoteMutation(() => remoteDataStore.deleteGroup(groupName));
    if (!saved) return;
    GROUPS = GROUPS.filter(group => group !== groupName);
    syncGroupOptions();
    render();
    showRecordCreated('Grup silindi.');
  }
  else if (action === 'edit-training-type' && ['super_admin', 'admin'].includes(state.role)) {
    state.editingTrainingTypeName = String(actionButton.dataset.type || '');
    state.trainingTypeSettingsOpen = true;
    render();
    window.setTimeout(() => document.querySelector('#editTrainingTypeName')?.focus(), 0);
  }
  else if (action === 'cancel-edit-training-type' && ['super_admin', 'admin'].includes(state.role)) {
    state.editingTrainingTypeName = null;
    state.trainingTypeSettingsOpen = true;
    render();
  }
  else if (action === 'delete-training-type' && ['super_admin', 'admin'].includes(state.role)) {
    const trainingTypeName = String(actionButton.dataset.type || '');
    if (state.trainingTypes.length <= 1) { showToast('Okuldaki son antrenman türü silinemez.'); return; }
    if (!trainingTypeName || !window.confirm(`“${trainingTypeName}” antrenman ismi önerilerden kaldırılsın mı? Geçmiş antrenman kayıtları değişmeyecek.`)) return;
    const saved = await runRemoteMutation(() => remoteDataStore.deleteTrainingType(trainingTypeName));
    if (!saved) return;
    state.trainingTypes = state.trainingTypes.filter(type => type !== trainingTypeName);
    state.editingTrainingTypeName = null;
    state.trainingTypeSettingsOpen = true;
    syncTrainingTypeOptions();
    render();
    showRecordCreated('Antrenman ismi kaldırıldı.');
  }
  else if (action === 'edit-training-coach' && ['super_admin', 'admin'].includes(state.role)) {
    state.editingTrainingCoachName = String(actionButton.dataset.coach || '');
    state.trainingCoachSettingsOpen = true;
    render();
    window.setTimeout(() => document.querySelector('#editTrainingCoachName')?.focus(), 0);
  }
  else if (action === 'cancel-edit-training-coach' && ['super_admin', 'admin'].includes(state.role)) {
    state.editingTrainingCoachName = null;
    state.trainingCoachSettingsOpen = true;
    render();
  }
  else if (action === 'delete-training-coach' && ['super_admin', 'admin'].includes(state.role)) {
    const coachName = String(actionButton.dataset.coach || '');
    if (state.trainingCoaches.length <= 1) { showToast('Okuldaki son antrenör silinemez.'); return; }
    if (!coachName || !window.confirm(`“${coachName}” antrenör listesinden kaldırılsın mı? Geçmiş antrenman kayıtları değişmeyecek.`)) return;
    const saved = await runRemoteMutation(() => remoteDataStore.deleteTrainingCoach(coachName));
    if (!saved) return;
    state.trainingCoaches = state.trainingCoaches.filter(coach => coach !== coachName);
    state.editingTrainingCoachName = null;
    state.trainingCoachSettingsOpen = true;
    syncTrainingCoachOptions();
    render();
    showRecordCreated('Antrenör listeden kaldırıldı.');
  }
  else if (action === 'edit-training-field' && ['super_admin', 'admin'].includes(state.role)) {
    state.editingTrainingFieldName = String(actionButton.dataset.field || '');
    state.trainingFieldSettingsOpen = true;
    render();
    window.setTimeout(() => document.querySelector('#editTrainingFieldName')?.focus(), 0);
  }
  else if (action === 'cancel-edit-training-field' && ['super_admin', 'admin'].includes(state.role)) {
    state.editingTrainingFieldName = null;
    state.trainingFieldSettingsOpen = true;
    render();
  }
  else if (action === 'delete-training-field' && ['super_admin', 'admin'].includes(state.role)) {
    const fieldName = String(actionButton.dataset.field || '');
    if (state.trainingFields.length <= 1) { showToast('Okuldaki son saha silinemez.'); return; }
    if (!fieldName || !window.confirm(`“${fieldName}” saha listesinden kaldırılsın mı? Geçmiş antrenman kayıtları değişmeyecek.`)) return;
    const saved = await runRemoteMutation(() => remoteDataStore.deleteTrainingField(fieldName));
    if (!saved) return;
    state.trainingFields = state.trainingFields.filter(field => field !== fieldName);
    state.editingTrainingFieldName = null;
    state.trainingFieldSettingsOpen = true;
    syncTrainingFieldOptions();
    render();
  }
  else if (action === 'student-sort') { const key = actionButton.dataset.sortKey; if (state.studentSortKey === key) state.studentSortDirection = state.studentSortDirection === 'asc' ? 'desc' : 'asc'; else { state.studentSortKey = key; state.studentSortDirection = key === 'enrollmentDate' ? 'desc' : 'asc'; } updateStudentsTable(); updateStudentSortHeaders(); }
  else if (action === 'monthly-fee-sort') {
    const key = actionButton.dataset.sortKey;
    if (state.monthlyFeeSortKey === key) state.monthlyFeeSortDirection = state.monthlyFeeSortDirection === 'asc' ? 'desc' : 'asc';
    else {
      state.monthlyFeeSortKey = key;
      state.monthlyFeeSortDirection = ['period', 'due'].includes(key) ? 'desc' : 'asc';
    }
    render();
  }
  else if (action === 'fee-list-sort') {
    const key = actionButton.dataset.sortKey;
    if (state.feeListSortKey === key) state.feeListSortDirection = state.feeListSortDirection === 'asc' ? 'desc' : 'asc';
    else {
      state.feeListSortKey = key;
      state.feeListSortDirection = ['period', 'due'].includes(key) ? 'desc' : 'asc';
    }
    render();
  }
  else if (action === 'approve-user' && isAdminRole()) {
    const request = state.accessRequests.find(item => item.id === Number(actionButton.dataset.id));
    const roleControl = document.querySelector(`#approval-role-${actionButton.dataset.id}`);
    if (!request || !roleControl) return;
    if (!actionButton.checked) return;
    if (state.role !== 'super_admin' && (request.requestedRole !== 'parent' || roleControl.value !== 'parent')) {
      actionButton.checked = false;
      showToast('Okul adminleri yalnızca veli kayıtlarını onaylayabilir.');
      return;
    }
    if (!request.emailVerifiedAt) {
      actionButton.checked = false;
      showToast('E-posta adresi doğrulanmadan kullanıcı onaylanamaz.');
      return;
    }
    const saved = await runRemoteMutation(() => remoteDataStore.approveAccessRequest(request.id, roleControl.value));
    if (!saved) {
      actionButton.checked = false;
      return;
    }
    request.status = 'approved';
    request.requestedRole = roleControl.value;
    request.reviewedAt = new Date().toISOString();
    render();
    showToast(`${request.fullName} kullanıcısı onaylandı.`);
  }
  else if (action === 'revoke-user-approval' && state.role === 'super_admin') {
    const request = state.accessRequests.find(item => item.id === Number(actionButton.dataset.id));
    if (!request || request.status !== 'approved') return;
    if (actionButton.checked) return;
    if (!window.confirm(`“${request.fullName}” kullanıcısının uygulama erişimi kaldırılsın mı?`)) {
      actionButton.checked = true;
      return;
    }
    const saved = await runRemoteMutation(() => remoteDataStore.revokeAccessRequestApproval(request.id));
    if (!saved) {
      actionButton.checked = true;
      return;
    }
    request.status = 'pending';
    request.reviewedAt = null;
    render();
    showRecordCreated(`${request.fullName} kullanıcısının onayı kaldırıldı.`);
  }
  else if (action === 'toggle-entry-actions') toggleLedgerActions(actionButton.closest('.ledger-entry'));
  else if (action === 'edit-entry') { const entry = state.accountingEntries.find(item => item.id === Number(actionButton.dataset.id)); closeLedgerActions(); if (entry) openAccountingDialog(entry); }
  else if (action === 'delete-entry') {
    const entry = state.accountingEntries.find(item => item.id === Number(actionButton.dataset.id));
    const feeReferenceMatch = entry?.source === 'fee' ? String(entry.reference || '').match(/^fee:(\d+):(\d{4}-\d{2})$/) : null;
    const confirmationMessage = feeReferenceMatch
      ? `“${entry.title}” tahsilatı silinsin mi? İlgili aidat Ödenmedi durumuna dönecek.`
      : `“${entry?.title || ''}” işlemi silinsin mi?`;
    if (entry && window.confirm(confirmationMessage)) {
      const saved = await runRemoteMutation(() => remoteDataStore.deleteAccounting(entry.id));
      if (!saved) return;
      if (feeReferenceMatch) {
        const student = state.students.find(item => Number(item.id) === Number(feeReferenceMatch[1]));
        if (student) setMonthlyFeeStatus(student, feeReferenceMatch[2], 'late');
      }
      state.accountingEntries = state.accountingEntries.filter(item => item.id !== entry.id);
      persistLocalData();
      render();
      showRecordCreated(feeReferenceMatch ? 'Tahsilat silindi; ilgili aidat Ödenmedi durumuna alındı.' : `${entry.type} kaydı silindi.`);
    }
  }
  else if (action === 'attendance') await openAttendance(actionButton.dataset.id);
  else if (action === 'profile') { const studentDialog = document.querySelector('#studentDialog'); const attendanceDialog = document.querySelector('#attendanceDialog'); if (studentDialog.open) studentDialog.close(); if (attendanceDialog.open) attendanceDialog.close(); navigateToPage('studentProfile', { selectedStudentId: Number(actionButton.dataset.id), expandedTimelineStudentId: null }); }
  else showToast('Bu işlem sonraki geliştirme adımında açılacak.');
});

appContent.addEventListener('input', event => {
  if (event.target.matches('[data-bank-field="iban"]')) {
    const cursorAtEnd = event.target.selectionStart === event.target.value.length;
    const formatted = formatTurkishIbanEntry(event.target.value);
    event.target.value = formatted.value;
    const prefix = event.target.closest('.iban-prefix-control')?.querySelector('.iban-prefix');
    if (prefix) prefix.hidden = formatted.hasExplicitPrefix;
    if (cursorAtEnd) event.target.setSelectionRange(event.target.value.length, event.target.value.length);
    return;
  }
  if (event.target.closest('#notificationForm')) {
    if (event.target.name === 'audience') state.notificationDraft.audience = event.target.value;
    if (event.target.name === 'title') state.notificationDraft.title = event.target.value;
    if (event.target.name === 'message') state.notificationDraft.body = event.target.value;
    return;
  }
  if (event.target.id === 'feeSearch') {
    state.feeSearchQuery = event.target.value;
    const cursorPosition = event.target.selectionStart ?? state.feeSearchQuery.length;
    render();
    const feeSearch = document.querySelector('#feeSearch');
    feeSearch?.focus();
    feeSearch?.setSelectionRange(cursorPosition, cursorPosition);
    return;
  }
  if (event.target.id === 'schoolSearch') {
    state.schoolSearchQuery = event.target.value;
    const cursorPosition = event.target.selectionStart ?? state.schoolSearchQuery.length;
    render();
    const schoolSearch = document.querySelector('#schoolSearch');
    schoolSearch?.focus();
    schoolSearch?.setSelectionRange(cursorPosition, cursorPosition);
    return;
  }
  if (event.target.id === 'applicationSearch') {
    state.applicationSearchQuery = event.target.value;
    const cursorPosition = event.target.selectionStart ?? state.applicationSearchQuery.length;
    render();
    const applicationSearch = document.querySelector('#applicationSearch');
    applicationSearch?.focus();
    applicationSearch?.setSelectionRange(cursorPosition, cursorPosition);
    return;
  }
  if (event.target.id === 'subscriptionPaymentSearch') {
    state.subscriptionPaymentSearchQuery = event.target.value;
    const cursorPosition = event.target.selectionStart ?? state.subscriptionPaymentSearchQuery.length;
    render();
    const paymentSearch = document.querySelector('#subscriptionPaymentSearch');
    paymentSearch?.focus();
    paymentSearch?.setSelectionRange(cursorPosition, cursorPosition);
    return;
  }
  if (event.target.id === 'subscriptionSearch') {
    state.subscriptionSearchQuery = event.target.value;
    const cursorPosition = event.target.selectionStart ?? state.subscriptionSearchQuery.length;
    render();
    const subscriptionSearch = document.querySelector('#subscriptionSearch');
    subscriptionSearch?.focus();
    subscriptionSearch?.setSelectionRange(cursorPosition, cursorPosition);
    return;
  }
  if (event.target.id === 'accessRequestSearch') {
    state.accessRequestSearchQuery = event.target.value;
    const cursorPosition = event.target.selectionStart ?? state.accessRequestSearchQuery.length;
    render();
    const accessRequestSearch = document.querySelector('#accessRequestSearch');
    accessRequestSearch?.focus();
    accessRequestSearch?.setSelectionRange(cursorPosition, cursorPosition);
    return;
  }
  if (!['studentSearch', 'groupFilter', 'activeStudentsOnlyFilter', 'debtStudentsOnlyFilter'].includes(event.target.id)) return;
  if (event.target.id === 'activeStudentsOnlyFilter') state.activeStudentsOnly = event.target.checked;
  if (event.target.id === 'debtStudentsOnlyFilter') state.debtStudentsOnly = event.target.checked;
  updateStudentsTable();
});

appContent.addEventListener('change', async event => {
  if (event.target.id === 'onboardingBillingPeriod') {
    const amount = document.querySelector('#onboardingPaymentAmount');
    if (amount) amount.innerHTML = onboardingPaymentAmountMarkup(event.target.value);
    return;
  }
  if (event.target.id === 'accountingMonthFilter') {
    state.accountingMonth = event.target.value;
    state.accountingDateRangeStart = '';
    state.accountingDateRangeEnd = '';
    state.accountingPeriod = state.accountingMonth ? 'month' : 'today';
    render();
    loadPageData(state.page, { force: true }).then(render).catch(error => console.error('Muhasebe dönemi yüklenemedi:', error));
    return;
  }
  if (event.target.closest('#notificationForm') && event.target.name === 'audience') {
    state.notificationDraft.audience = event.target.value;
    return;
  }
  if (event.target.id === 'parentStudentSelect') {
    state.selectedParentStudentId = Number(event.target.value) || null;
    state.selectedParentPaymentMonth = null;
    state.expandedTimelineStudentId = null;
    persistNavigationState();
    render();
    return;
  }
  if (event.target.id === 'accessRequestRoleFilter') {
    state.accessRequestRoleFilter = ['all', 'admin', 'coach', 'parent'].includes(event.target.value) ? event.target.value : 'all';
    render();
    return;
  }
  if (event.target.id === 'accessRequestSortOrder') {
    state.accessRequestSortOrder = ['name_asc', 'approved_desc', 'approved_asc'].includes(event.target.value) ? event.target.value : 'name_asc';
    render();
    return;
  }
  if (event.target.id === 'applicationStatusFilter') {
    state.applicationStatusFilter = ['all', 'pending', 'approved', 'rejected'].includes(event.target.value) ? event.target.value : 'all';
    render();
    return;
  }
  if (event.target.id === 'applicationSortOrder') {
    state.applicationSortOrder = ['name_asc', 'name_desc', 'created_desc', 'created_asc'].includes(event.target.value) ? event.target.value : 'created_desc';
    render();
    return;
  }
  if (event.target.id === 'schoolSortOrder') {
    state.schoolSortOrder = ['name_asc', 'name_desc', 'created_desc', 'created_asc'].includes(event.target.value) ? event.target.value : 'created_desc';
    render();
    return;
  }
  if (event.target.id === 'schoolStatusFilter') {
    state.schoolStatusFilter = ['all', 'active', 'inactive'].includes(event.target.value) ? event.target.value : 'all';
    render();
    return;
  }
  if (event.target.id === 'subscriptionPaymentStatusFilter') {
    state.subscriptionPaymentStatusFilter = ['all', 'pending', 'approved', 'rejected'].includes(event.target.value) ? event.target.value : 'all';
    render();
    return;
  }
  if (event.target.id === 'subscriptionPaymentSortOrder') {
    state.subscriptionPaymentSortOrder = ['created_desc', 'created_asc'].includes(event.target.value) ? event.target.value : 'created_desc';
    render();
    return;
  }
  if (event.target.id === 'subscriptionSortOrder') {
    state.subscriptionSortOrder = ['name_asc', 'name_desc', 'end_asc', 'end_desc'].includes(event.target.value) ? event.target.value : 'name_asc';
    render();
    return;
  }
  if (event.target.id === 'monthlyFeeUnpaidOnlyFilter') {
    state.monthlyFeeUnpaidOnly = event.target.checked;
    render();
    return;
  }
  if (event.target.id === 'feeUnpaidOnlyFilter') {
    state.feeFilter = event.target.checked ? 'pending' : 'all';
    persistNavigationState();
    render();
    return;
  }
  if (event.target.id === 'studentAttendanceMonthFilter') {
    state.studentAttendanceMonth = event.target.value;
    render();
    loadPageData('studentAttendanceHistory', { force: true }).then(render).catch(error => console.error('Yoklama dönemi yüklenemedi:', error));
    return;
  }
  if (event.target.id === 'studentAttendanceShowAllFilter') {
    state.studentAttendanceShowAll = event.target.checked;
    render();
    loadPageData('studentAttendanceHistory', { force: true }).then(render).catch(error => console.error('Yoklama geçmişi yüklenemedi:', error));
    return;
  }
  if (event.target.id === 'showPastTrainingsFilter') {
    state.showPastTrainings = event.target.checked;
    render();
    loadPageData('trainings', { force: true }).then(render).catch(error => console.error('Antrenman takvimi yüklenemedi:', error));
    return;
  }
  if (event.target.id === 'showPastAttendanceFilter') {
    state.showPastAttendance = event.target.checked;
    render();
    loadPageData('attendance', { force: true }).then(render).catch(error => console.error('Yoklama antrenmanları yüklenemedi:', error));
    return;
  }
  if (event.target.id === 'trainingSortSelect') {
    state.trainingSortDirection = event.target.value === 'desc' ? 'desc' : 'asc';
    render();
    return;
  }
  if (event.target.id === 'attendanceSortSelect') {
    state.attendanceSortDirection = event.target.value === 'asc' ? 'asc' : 'desc';
    persistNavigationState();
    render();
    return;
  }
  const statusControl = event.target.closest('[data-monthly-fee-status]');
  if (statusControl && ['super_admin', 'admin'].includes(state.role)) {
    const student = state.students.find(item => item.id === Number(statusControl.dataset.id));
    if (!student) return;
    const saved = await runRemoteMutation(() => remoteDataStore.saveFeeStatus(student, statusControl.dataset.month, statusControl.value, monthlyFeeAmount(student, statusControl.dataset.month)));
    if (!saved) { render(); return; }
    setMonthlyFeeStatus(student, statusControl.dataset.month, statusControl.value);
    persistLocalData();
    render();
    if (statusControl.value === 'late') showToast('Aidat borç bakiyesine eklendi.');
    else showRecordCreated('Bu dönem için aidat kaldırıldı.');
    return;
  }
  const paymentControl = event.target.closest('[data-monthly-fee]');
  if (!paymentControl || !['super_admin', 'admin'].includes(state.role)) return;
  const student = state.students.find(item => item.id === Number(paymentControl.dataset.id));
  if (!student) return;
  if (paymentControl.checked) {
    openFeePaymentDialog(student, paymentControl.dataset.month);
    return;
  }
  const status = paymentControl.checked ? 'paid' : 'late';
  const saved = await runRemoteMutation(() => remoteDataStore.saveFeeStatus(student, paymentControl.dataset.month, status, monthlyFeeAmount(student, paymentControl.dataset.month)));
  if (!saved) { render(); return; }
  setMonthlyFeeStatus(student, paymentControl.dataset.month, status);
  persistLocalData();
  render();
  showRecordCreated('Ödeme kaldırıldı; aidat borç bakiyesine geri eklendi.');
});

document.querySelector('#studentPrepaymentMonths').addEventListener('change', updateStudentPrepaymentSummary);
document.querySelector('#studentForm').addEventListener('input', event => {
  if (event.target.name === 'studentMonthlyFeeAmount') updateStudentPrepaymentSummary();
});
function handleStudentPhotoSelection(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if ((file.type && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) || file.size > 10 * 1024 * 1024) {
    event.target.value = '';
    showToast(file.size > 10 * 1024 * 1024
      ? 'Fotoğrafın boyutu 10 MB’tan küçük olmalıdır.'
      : 'Fotoğraf JPEG, PNG veya WebP biçiminde olmalıdır.');
    return;
  }
  releaseStudentPhotoPreview();
  state.studentPhotoRemoveRequested = false;
  const otherInput = event.target.id === 'studentCameraInput'
    ? document.querySelector('#studentGalleryInput')
    : document.querySelector('#studentCameraInput');
  if (otherInput) otherInput.value = '';
  state.studentPhotoPreviewUrl = URL.createObjectURL(file);
  showStudentPhotoPreview(state.studentPhotoPreviewUrl);
}
document.querySelector('#studentCameraInput').addEventListener('change', handleStudentPhotoSelection);
document.querySelector('#studentGalleryInput').addEventListener('change', handleStudentPhotoSelection);
document.querySelector('#studentPhotoRemoveButton').addEventListener('click', () => {
  releaseStudentPhotoPreview();
  state.studentPhotoRemoveRequested = true;
  document.querySelector('#studentCameraInput').value = '';
  document.querySelector('#studentGalleryInput').value = '';
  showStudentPhotoPreview();
});
document.querySelector('#schoolAdminForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!isAdminRole()) return;
  const form = event.currentTarget;
  const formMessage = document.querySelector('#schoolAdminFormMessage');
  const submitButton = form.querySelector('button[type="submit"]');
  const data = new FormData(form);
  const schoolId = String(data.get('schoolId') || '');
  const fullName = String(data.get('fullName') || '').trim();
  const email = String(data.get('email') || '').trim().toLowerCase();
  const role = state.role === 'super_admin' ? String(data.get('role') || '') : 'coach';
  if (!state.schools.some(school => school.id === schoolId && school.active) || !fullName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !['admin', 'coach'].includes(role) || (state.role !== 'super_admin' && (schoolId !== state.schoolId || role !== 'coach'))) {
    formMessage.textContent = 'Kullanıcı adı, e-posta adresi ve rolü kontrol edin.';
    formMessage.classList.remove('is-hidden');
    return;
  }
  formMessage.textContent = '';
  formMessage.classList.add('is-hidden');
  submitButton.disabled = true;
  const confirmation = state.schoolInviteConfirmation;
  const confirmMultipleSchool = Boolean(confirmation
    && confirmation.schoolId === schoolId
    && confirmation.email === email
    && confirmation.role === role);
  submitButton.textContent = confirmMultipleSchool ? 'Yetki ekleniyor…' : 'Davet gönderiliyor…';
  try {
    const result = await remoteDataStore.inviteSchoolAdmin({ schoolId, fullName, email, role, confirmMultipleSchool });
    if (result.status === 'confirmation_required') {
      state.schoolInviteConfirmation = { schoolId, email, role };
      const existingAuthority = (result.existingSchools || []).map(item => `${item.schoolName || 'Başka bir okul'} (${roleNames[item.role] || item.role})`).join(', ');
      formMessage.textContent = `Bu kullanıcı şu anda ${existingAuthority} okulunda yetkili. Bu okula da ${roleNames[role]} olarak eklemek için tekrar onaylayın.`;
      formMessage.classList.remove('is-hidden');
      submitButton.textContent = 'Yine de yetki ver';
      return;
    }
    state.schoolInviteConfirmation = null;
    state.invitingSchoolId = null;
    document.querySelector('#schoolAdminDialog').close();
    form.reset();
    const roleLabel = roleNames[role];
    showRecordCreated(result.status === 'invited' ? `${roleLabel} daveti ${email} adresine gönderildi.` : `Mevcut kullanıcı ${roleLabel} olarak yetkilendirildi.`);
    try {
      await refreshSchools();
      render();
    } catch (refreshError) {
      console.error('Davet sonrası okul listesi yenilenemedi:', refreshError);
    }
  } catch (error) {
    formMessage.textContent = `Davet gönderilemedi: ${error.message || 'Bağlantı hatası'}`;
    formMessage.classList.remove('is-hidden');
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = state.schoolInviteConfirmation ? 'Yine de yetki ver' : 'Daveti gönder';
  }
});
document.querySelector('#schoolAdminForm').addEventListener('input', event => {
  if (!state.schoolInviteConfirmation) return;
  if (event.target.name === 'fullName') return;
  state.schoolInviteConfirmation = null;
  const formMessage = document.querySelector('#schoolAdminFormMessage');
  formMessage.textContent = '';
  formMessage.classList.add('is-hidden');
  event.currentTarget.querySelector('button[type="submit"]').textContent = 'Daveti gönder';
});
document.querySelector('#schoolEditForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (state.role !== 'super_admin') return;
  const form = event.currentTarget;
  const data = new FormData(form);
  const school = state.schools.find(item => item.id === String(data.get('schoolId') || ''));
  const name = String(data.get('schoolName') || '').trim();
  if (!school || !name || name.length > 120) {
    showToast('Geçerli bir okul adı girin.');
    return;
  }
  if (name === school.name) {
    state.editingSchoolId = null;
    document.querySelector('#schoolEditDialog').close();
    return;
  }
  const updated = await runRemoteMutation(() => remoteDataStore.updateSchool({ id: school.id, name, active: school.active }));
  if (!updated) return;
  school.name = updated.name || name;
  if (school.id === state.schoolId) state.schoolName = school.name;
  state.editingSchoolId = null;
  document.querySelector('#schoolEditDialog').close();
  form.reset();
  render();
  showToast('Okul adı güncellendi.');
});
function localDateAfterMonths(value, months) {
  const date = value ? new Date(`${value}T12:00:00`) : new Date();
  date.setMonth(date.getMonth() + months);
  return localDateValue(date);
}

function syncTrialSubscriptionFields() {
  const form = document.querySelector('#subscriptionForm');
  const isTrial = form.elements.status.value === 'trial';
  const trialMode = form.elements.trialMode?.value || 'time_limited';
  document.querySelector('#subscriptionTrialModeField')?.classList.toggle('is-hidden', !isTrial);
  document.querySelector('#subscriptionBillingPeriodField')?.classList.toggle('is-hidden', isTrial);
  document.querySelector('#subscriptionPeriodPriceField')?.classList.toggle('is-hidden', isTrial);
  form.elements.billingPeriod.disabled = isTrial;
  if (form.elements.trialMode) form.elements.trialMode.disabled = !isTrial;
  form.elements.startsOn.readOnly = false;
  form.elements.endsOn.readOnly = false;
  if (isTrial) {
    const startsOn = form.elements.startsOn.value || localDateValue();
    form.elements.startsOn.value = startsOn;
    form.elements.endsOn.value = localDateAfterMonths(startsOn, 1);
    form.elements.periodPrice.value = 0;
    const formHint = document.querySelector('#subscriptionFormHint');
    if (formHint) formHint.textContent = 'Süreli deneme ücretsizdir; başlangıç ve bitiş tarihlerini düzenleyebilirsiniz.';
    return;
  }
  const billingPeriod = form.elements.billingPeriod.value || 'monthly';
  const periodMonths = { monthly: 1, quarterly: 3, yearly: 12 }[billingPeriod] || 1;
  const startsOn = form.elements.startsOn.value || localDateValue();
  form.elements.startsOn.value = startsOn;
  form.elements.endsOn.value = localDateAfterMonths(startsOn, periodMonths);
  form.elements.periodPrice.value = subscriptionPrice('standard', billingPeriod);
  const formHint = document.querySelector('#subscriptionFormHint');
  if (formHint) formHint.textContent = 'Dönem ücreti ödeme dönemine göre otomatik belirlenir.';
}
const subscriptionForm = document.querySelector('#subscriptionForm');
if (subscriptionForm) {
  subscriptionForm.elements.status.addEventListener('change', syncTrialSubscriptionFields);
  subscriptionForm.elements.trialMode?.addEventListener('change', syncTrialSubscriptionFields);
  subscriptionForm.elements.billingPeriod.addEventListener('change', syncTrialSubscriptionFields);
  subscriptionForm.elements.startsOn.addEventListener('change', event => {
    if (event.currentTarget.form.elements.status.value !== 'trial') syncTrialSubscriptionFields();
  });
}

function syncSubscriptionExtensionFields() {
  const form = document.querySelector('#subscriptionExtensionForm');
  const period = form.elements.billingPeriod.value || 'monthly';
  const months = { monthly: 1, quarterly: 3, yearly: 12 }[period] || 1;
  const startsOn = form.elements.startsOn.value || localDateValue();
  form.elements.startsOn.value = startsOn;
  form.elements.endsOn.value = localDateAfterMonths(startsOn, months);
  form.elements.periodPrice.value = subscriptionPrice('standard', period);
}

function ensureSubscriptionExtensionDialog() {
  let form = document.querySelector('#subscriptionExtensionForm');
  if (form) return form;
  document.body.insertAdjacentHTML('beforeend', `<dialog id="subscriptionExtensionDialog"><form method="dialog" class="dialog-form" id="subscriptionExtensionForm"><div class="dialog-heading"><div><span class="eyebrow">ABONELİK YENİLEME</span><h2 id="subscriptionExtensionSchoolName">Aboneliği uzat</h2><p>Mevcut bitiş tarihinin üzerine yeni dönem eklenir.</p></div><button class="icon-button" type="button" data-dialog-close="subscriptionExtensionDialog">×</button></div><input name="schoolId" type="hidden"><div class="form-grid"><label>Mevcut bitiş tarihi<input name="currentEndsOn" type="date" readonly></label><label>Yeni ödeme dönemi<select name="billingPeriod" required><option value="monthly">1 aylık</option><option value="quarterly">3 aylık</option><option value="yearly">Yıllık</option></select></label><label>Yeni dönemin başlangıcı<input name="startsOn" type="date" readonly></label><label>Yeni bitiş / yenileme tarihi<input name="endsOn" type="date" readonly></label><label>Dönem ücreti (₺)<input name="periodPrice" type="number" readonly></label></div><small class="form-hint">Uzunluk, mevcut bitiş tarihinden itibaren hesaplanır.</small><div class="dialog-actions"><button class="secondary-button" type="button" data-dialog-close="subscriptionExtensionDialog">Vazgeç</button><button class="primary-button" type="submit">Süreyi uzat</button></div></form></dialog>`);
  form = document.querySelector('#subscriptionExtensionForm');
  bindSubscriptionExtensionForm(form);
  return form;
}

function bindSubscriptionExtensionForm(form) {
  if (!form || form.dataset.bound === 'true') return;
  form.dataset.bound = 'true';
  form.elements.billingPeriod.addEventListener('change', syncSubscriptionExtensionFields);
  form.addEventListener('submit', async event => {
  event.preventDefault();
  if (state.role !== 'super_admin') return;
  const form = event.currentTarget;
  const school = state.schools.find(item => item.id === String(form.elements.schoolId.value));
  const billingPeriod = String(form.elements.billingPeriod.value || '');
  const startsOn = String(form.elements.startsOn.value || '');
  const endsOn = String(form.elements.endsOn.value || '');
  if (!school || school.subscriptionStatus !== 'active' || !SUBSCRIPTION_PERIODS[billingPeriod] || !startsOn || !endsOn || endsOn <= startsOn) {
    showToast('Süre uzatma bilgilerini kontrol edin.');
    return;
  }
  const saved = await runRemoteMutation(() => remoteDataStore.updateSchoolSubscription({
    schoolId: school.id,
    status: 'active',
    trialMode: null,
    billingPeriod,
    startsOn: school.subscriptionStartsOn || startsOn,
    endsOn
  }));
  if (!saved) return;
  await refreshSchools();
  if (school.id === state.schoolId) {
    state.schoolSubscriptionStatus = 'active';
    state.schoolSubscriptionTrialMode = null;
  }
  document.querySelector('#subscriptionExtensionDialog').close();
  render();
  showToast(`Abonelik ${subscriptionPeriodLabel(billingPeriod).toLocaleLowerCase('tr-TR')} uzatıldı.`);
  });
}
bindSubscriptionExtensionForm(document.querySelector('#subscriptionExtensionForm'));
subscriptionForm?.addEventListener('submit', async event => {
  event.preventDefault();
  if (state.role !== 'super_admin') return;
  const form = event.currentTarget;
  const data = new FormData(form);
  const schoolId = String(data.get('schoolId') || '');
  const status = String(data.get('status') || '');
  const trialMode = status === 'trial' ? String(data.get('trialMode') || '') : null;
  const billingPeriod = String(data.get('billingPeriod') || '');
  const periodPrice = status === 'trial' ? 0 : subscriptionPrice('standard', billingPeriod);
  const startsOn = String(data.get('startsOn') || '');
  const endsOn = String(data.get('endsOn') || '');
  if (!state.schools.some(school => school.id === schoolId) || !SUBSCRIPTION_STATUSES[status] || (status === 'trial' && !TRIAL_MODES[trialMode]) || (status !== 'trial' && !SUBSCRIPTION_PERIODS[billingPeriod]) || !Number.isFinite(periodPrice) || periodPrice < 0) {
    showToast('Abonelik bilgilerini kontrol edin.');
    return;
  }
  if (startsOn && endsOn && endsOn < startsOn) {
    showToast('Bitiş tarihi başlangıç tarihinden önce olamaz.');
    return;
  }
  const saved = await runRemoteMutation(() => remoteDataStore.updateSchoolSubscription({ schoolId, status, trialMode, billingPeriod: status === 'trial' ? 'monthly' : billingPeriod, startsOn: startsOn || null, endsOn: endsOn || null }));
  if (!saved) return;
  await refreshSchools();
  if (schoolId === state.schoolId) {
    state.schoolSubscriptionPlan = 'standard';
    state.schoolSubscriptionStatus = status;
    state.schoolSubscriptionTrialMode = trialMode;
  }
  state.editingSubscriptionSchoolId = null;
  document.querySelector('#subscriptionDialog').close();
  form.reset();
  render();
  showToast('Abonelik bilgileri güncellendi.');
});
document.querySelector('#playerCardForm').addEventListener('input', event => {
  const form = event.currentTarget;
  const student = accessiblePlayerCardStudent(form.elements.studentId.value);
  const playerCard = playerCardFromForm(form);
  if (student && playerCard) setSafeHtml(document.querySelector('#playerCardPreview'), playerCardMarkup(student, playerCard));
});
document.querySelector('#playerCardForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!isAdminRole()) {
    showToast('Oyuncu kartını yalnızca yöneticiler düzenleyebilir.');
    return;
  }
  const form = event.currentTarget;
  const student = accessiblePlayerCardStudent(form.elements.studentId.value);
  const playerCard = playerCardFromForm(form);
  if (!student || !playerCard) {
    showToast('Oyuncu kartı puanlarını 0 ile 99 arasında girin.');
    return;
  }
  const saved = await runRemoteMutation(() => remoteDataStore.saveStudentPlayerCard(student.id, playerCard));
  if (!saved) return;
  student.playerCard = playerCard;
  persistLocalData();
  document.querySelector('#playerCardDialog').close();
  form.reset();
  render();
  showRecordCreated('Oyuncu kartı güncellendi.');
});
document.querySelector('#studentForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!['super_admin', 'admin', 'coach'].includes(state.role)) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  const wasEditing = Boolean(state.editingStudentId);
  const existingStudent = wasEditing ? state.students.find(item => item.id === Number(state.editingStudentId)) : null;
  if (isCoachRole()) {
    if (!wasEditing || !existingStudent) return;
    const active = data.get('studentActiveStatus') !== 'inactive';
    const saved = await runRemoteMutation(() => remoteDataStore.setStudentActiveStatus(existingStudent.id, active));
    if (!saved) return;
    existingStudent.active = active;
    state.editingStudentId = null;
    form.reset();
    document.querySelector('#studentDialog').close();
    persistLocalData();
    render();
    showRecordCreated(active ? 'Oyuncu aktif duruma alındı.' : 'Oyuncu pasif duruma alındı.');
    return;
  }
  const cameraPhoto = data.get('studentCameraPhoto');
  const galleryPhoto = data.get('studentGalleryPhoto');
  const selectedPhoto = cameraPhoto instanceof File && cameraPhoto.size ? cameraPhoto : galleryPhoto;
  const studentMonthlyFeeAmount = Number(data.get('studentMonthlyFeeAmount'));
  if (!Number.isFinite(studentMonthlyFeeAmount) || studentMonthlyFeeAmount <= 0) {
    showToast('Geçerli bir aylık aidat tutarı girin.');
    return;
  }
  let preparedPhoto = null;
  if (selectedPhoto instanceof File && selectedPhoto.size) {
    try {
      preparedPhoto = await prepareStudentPhoto(selectedPhoto);
    } catch (error) {
      showToast(error.message || 'Öğrenci fotoğrafı hazırlanamadı.');
      return;
    }
  }
  const studentData = { name: data.get('studentName').trim(), birth: formatStudentBirthDate(data.get('birthDate')), group: data.get('group'), position: data.get('position'), parent: data.get('parentName').trim(), phone: data.get('phone').trim(), email: data.get('email').trim(), address: data.get('address').trim(), monthlyFeeAmount: studentMonthlyFeeAmount, active: data.get('studentActiveStatus') !== 'inactive' };
  const prepaymentMonths = wasEditing
    ? []
    : [...new Set(data.getAll('prepaymentMonth').map(String).filter(month => /^\d{4}-\d{2}$/.test(month)))];
  const prepaymentMethod = String(data.get('prepaymentMethod') || 'cash');
  if (prepaymentMonths.length && !PAYMENT_METHODS[prepaymentMethod]) {
    showToast('Ön ödeme yöntemini kontrol edin.');
    return;
  }
  const previousStudentEmail = existingStudent?.email || '';
  const studentEmailChanged = wasEditing && previousStudentEmail.toLocaleLowerCase('tr') !== studentData.email.toLocaleLowerCase('tr');
  const enrollmentDate = existingStudent?.enrollmentDate || localDateValue();
  const studentRecord = {
    ...(existingStudent || {}),
    ...studentData,
    enrollmentDate,
    feeTrackingStartDate: existingStudent?.feeTrackingStartDate || `${feeMonthKey()}-01`,
    feePayments: existingStudent?.feePayments || { [feeMonthKey()]: 'none' },
    feeHistory: existingStudent?.feeHistory || {},
    fee: existingStudent?.fee || 'none',
    attendance: existingStudent?.attendance ?? 100,
    photoPath: existingStudent?.photoPath || '',
    photoUrl: existingStudent?.photoUrl || ''
  };
  const saved = await runRemoteMutation(async () => {
    studentRecord.id = await remoteDataStore.saveStudent(studentRecord, !wasEditing);
  });
  if (!saved) return;
  let photoError = null;
  if (preparedPhoto) {
    try {
      const savedPhoto = await remoteDataStore.saveStudentPhoto(studentRecord.id, preparedPhoto, existingStudent?.photoPath || '');
      studentRecord.photoPath = savedPhoto.path;
      studentRecord.photoUrl = savedPhoto.url;
    } catch (error) {
      photoError = error;
    }
  } else if (wasEditing && state.studentPhotoRemoveRequested && existingStudent?.photoPath) {
    try {
      await remoteDataStore.deleteStudentPhoto(studentRecord.id, existingStudent.photoPath);
      studentRecord.photoPath = '';
      studentRecord.photoUrl = '';
    } catch (error) {
      photoError = error;
    }
  }
  if (wasEditing) {
    Object.assign(existingStudent, studentRecord);
    if (previousStudentEmail && studentRecord.email && previousStudentEmail.toLocaleLowerCase('tr') !== studentRecord.email.toLocaleLowerCase('tr')) {
      state.accessRequests.forEach(request => {
        if (request.requestedRole === 'parent' && String(request.email || '').toLocaleLowerCase('tr') === previousStudentEmail.toLocaleLowerCase('tr')) {
          request.email = studentRecord.email;
          request.emailVerifiedAt = null;
        }
      });
    }
  } else {
    state.students.unshift(studentRecord);
  }
  const savedPrepaymentMonths = [];
  const failedPrepaymentMonths = [];
  if (!wasEditing && prepaymentMonths.length) {
    for (const month of prepaymentMonths) {
      const paymentDetails = {
        amount: studentMonthlyFeeAmount,
        paymentDate: localDateValue(),
        paymentMethod: prepaymentMethod
      };
      try {
        await remoteDataStore.saveFeeStatus(studentRecord, month, 'paid', studentMonthlyFeeAmount, paymentDetails);
        setMonthlyFeeStatus(studentRecord, month, 'paid', paymentDetails);
        savedPrepaymentMonths.push(month);
      } catch {
        failedPrepaymentMonths.push(month);
      }
    }
  }
  let guardianInviteResult = null;
  let guardianInviteError = null;
  if (!wasEditing || studentEmailChanged) {
    try {
      guardianInviteResult = await remoteDataStore.inviteGuardian(studentRecord.id, previousStudentEmail);
    } catch (error) {
      guardianInviteError = error;
    }
  }
  state.editingStudentId = null;
  resetStudentPhotoEditor();
  persistLocalData();
  document.querySelector('#studentDialog').close();
  form.reset();
  state.page = wasEditing ? 'studentProfile' : 'students';
  render();
  if (photoError) {
    const recordLabel = wasEditing ? 'Öğrenci profili güncellendi' : 'Öğrenci kaydedildi';
    showToast(`${recordLabel} ancak fotoğraf kaydedilemedi: ${photoError.message || 'Bağlantı hatası'}`, 'info', 5200);
    return;
  }
  if (wasEditing) {
    if (studentEmailChanged && guardianInviteError) {
      showToast(`Öğrenci profili güncellendi ancak yeni veli daveti gönderilemedi: ${guardianInviteError.message || 'Bağlantı hatası'}`);
    } else if (studentEmailChanged && guardianInviteResult?.status === 'invited') {
      showToast(`Öğrenci profili güncellendi. Doğrulama daveti ${studentRecord.email} adresine gönderildi.`);
    } else {
      showToast('Öğrenci profili güncellendi.');
    }
  } else if (failedPrepaymentMonths.length) {
    showRecordCreated(`Öğrenci kaydedildi; ${savedPrepaymentMonths.length}/${prepaymentMonths.length} aylık ön ödeme işlendi. Kaydedilemeyen dönemleri profilden tekrar tanımlayın.`);
  } else if (guardianInviteError) {
    showRecordCreated(`Öğrenci kaydedildi${savedPrepaymentMonths.length ? ` ve ${savedPrepaymentMonths.length} aylık ön ödeme işlendi` : ''}; veli daveti gönderilemedi: ${guardianInviteError.message || 'Bağlantı hatası'}`);
  } else if (guardianInviteResult?.status === 'invited') {
    showRecordCreated(`Öğrenci kaydedildi${savedPrepaymentMonths.length ? ` ve ${savedPrepaymentMonths.length} aylık ön ödeme işlendi` : ''}. Veli daveti ${studentRecord.email} adresine gönderildi.`);
  } else if (guardianInviteResult?.status === 'pending_approval') {
    showRecordCreated(`Öğrenci kaydedildi${savedPrepaymentMonths.length ? ` ve ${savedPrepaymentMonths.length} aylık ön ödeme işlendi` : ''}. Veli hesabı Süper Admin onayı bekliyor.`);
  } else {
    showRecordCreated(`Öğrenci kaydedildi${savedPrepaymentMonths.length ? ` ve ${savedPrepaymentMonths.length} aylık ön ödeme işlendi` : ''}; mevcut veli hesabına bağlandı.`);
  }
});
document.querySelector('#attendanceList').addEventListener('change', event => {
  const input = event.target.closest('[data-attendance-status]');
  if (!input) return;
  const row = input.closest('.attendance-item');
  if (!row) return;
  const otherInput = row.querySelector(`[data-attendance-status="${input.dataset.attendanceStatus === 'present' ? 'absent' : 'present'}"]`);
  if (input.checked && otherInput) otherInput.checked = false;
  updateAttendanceSubmitState();
});

document.querySelector('#attendanceStudentSearch').addEventListener('input', event => filterAttendanceStudents(event.currentTarget.value));

document.querySelector('#attendanceForm').addEventListener('submit', async event => {
  event.preventDefault();
  const attendanceRows = [...document.querySelectorAll('#attendanceList .attendance-item[data-student-id]')];
  if (!attendanceRows.length || attendanceRows.some(row => !row.querySelector('[data-attendance-status]:checked'))) {
    showToast('Yoklamayı kaydetmek için her sporcu için geldi veya gelmedi seçin.');
    updateAttendanceSubmitState();
    return;
  }
  const presentStudentIds = attendanceRows
    .filter(row => row.querySelector('[data-attendance-status="present"]:checked'))
    .map(row => Number(row.dataset.studentId));
  const training = state.trainings.find(item => Number(item.id) === Number(state.activeTrainingId));
  const allStudentIds = attendanceRows.map(row => Number(row.dataset.studentId));
  let sessionId;
  const saved = await runRemoteMutation(async () => {
    sessionId = await remoteDataStore.saveAttendance(state.activeTrainingId, allStudentIds, presentStudentIds);
  });
  if (!saved) return;
  state.attendanceRecords = state.attendanceRecords.filter(record => Number(record.trainingId) !== Number(state.activeTrainingId));
  state.attendanceRecords.unshift({ id: sessionId, trainingId: state.activeTrainingId, date: new Date().toISOString(), presentStudentIds });
  persistLocalData();
  document.querySelector('#attendanceDialog').close();
  render();
  showRecordCreated('Yoklama kaydedildi.');
});
document.querySelector('#trainingForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!['super_admin', 'admin', 'coach'].includes(state.role)) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  const group = data.get('group');
  const trainingData = {
    date: data.get('date'),
    time: data.get('time'),
    duration: Number(data.get('duration')),
    group,
    title: data.get('title').trim(),
    coach: data.get('coach').trim(),
    field: data.get('field').trim()
  };
  const wasEditing = Boolean(state.editingTrainingId);
  const existingTraining = wasEditing ? state.trainings.find(item => item.id === Number(state.editingTrainingId)) : null;
  const trainingRecord = { ...(existingTraining || {}), ...trainingData };
  let pushResult = null;
  const saved = await runRemoteMutation(async () => {
    if (wasEditing) {
      trainingRecord.id = await remoteDataStore.saveTraining(trainingRecord, false);
    } else {
      pushResult = await createTrainingAndSendNotification(trainingRecord);
      trainingRecord.id = pushResult.trainingId;
    }
  });
  if (!saved) return;
  if (wasEditing) {
    Object.assign(existingTraining, trainingRecord);
  } else {
    state.trainings.push(trainingRecord);
  }
  state.editingTrainingId = null;
  persistLocalData();
  document.querySelector('#trainingDialog').close();
  form.reset();
  state.page = 'trainings';
  render();
  if (wasEditing) {
    showToast('Antrenman Supabase’de güncellendi.');
    return;
  }
});
document.querySelector('#feeDefinitionStatus').addEventListener('change', updateFeePaymentFields);
document.querySelector('#feeDefinitionStudentSearch').addEventListener('input', updateFeeDefinitionStudentResults);
document.querySelector('#accountingStudentSearch').addEventListener('input', updateAccountingStudentResults);
document.querySelector('#accountingForm [name="kind"]').addEventListener('change', syncAccountingKindFields);
document.querySelector('#accountingFeeMonths').addEventListener('change', updateAccountingFeeSummary);
document.querySelector('#accountingFeeMonths').addEventListener('input', updateAccountingFeeSummary);
document.querySelector('#feePaymentDialog').addEventListener('cancel', () => window.setTimeout(render, 0));
document.querySelector('#feePaymentForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!['super_admin', 'admin'].includes(state.role)) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  const student = state.students.find(item => item.id === Number(data.get('studentId')));
  const month = String(data.get('period') || '');
  const paymentDate = String(data.get('paymentDate') || '');
  const paymentMethod = String(data.get('paymentMethod') || '');
  if (!student || !/^\d{4}-\d{2}$/.test(month) || !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate) || !PAYMENT_METHODS[paymentMethod]) {
    showToast('Öğrenci, dönem, ödeme tarihi veya tahsilat tipi bilgisini kontrol edin.');
    return;
  }
  const paymentDetails = { paymentDate, paymentMethod };
  const amount = monthlyFeeAmount(student, month);
  const saved = await runRemoteMutation(() => remoteDataStore.saveFeeStatus(student, month, 'paid', amount, paymentDetails));
  if (!saved) { render(); return; }
  setMonthlyFeeStatus(student, month, 'paid', paymentDetails);
  persistLocalData();
  document.querySelector('#feePaymentDialog').close();
  form.reset();
  render();
  showRecordCreated(`Aidat ${PAYMENT_METHODS[paymentMethod]} olarak tahsil edildi ve muhasebeye eklendi.`);
});
document.querySelector('#feeDefinitionForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!['super_admin', 'admin'].includes(state.role)) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  const student = state.students.find(item => item.id === Number(data.get('studentId')));
  const month = String(data.get('period') || '');
  const status = data.get('status') === 'paid' ? 'paid' : 'late';
  const amount = Number(data.get('amount'));
  if (!student) {
    showToast('Arama sonuçlarından geçerli bir öğrenci seçin.');
    return;
  }
  if (!/^\d{4}-\d{2}$/.test(month) || !Number.isFinite(amount) || amount <= 0) {
    showToast('Dönem ve aidat tutarı bilgilerini kontrol edin.');
    return;
  }
  const paymentDetails = status === 'paid'
    ? {
        amount,
        paymentDate: String(data.get('paymentDate') || ''),
        paymentMethod: String(data.get('paymentMethod') || '')
      }
    : { amount };
  if (status === 'paid' && (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDetails.paymentDate) || !PAYMENT_METHODS[paymentDetails.paymentMethod])) {
    showToast('Ödeme tarihi ve ödeme yöntemini kontrol edin.');
    return;
  }
  const saved = await runRemoteMutation(() => remoteDataStore.saveFeeStatus(student, month, status, amount, paymentDetails));
  if (!saved) return;
  setMonthlyFeeStatus(student, month, status, paymentDetails);
  persistLocalData();
  document.querySelector('#feeDefinitionDialog').close();
  form.reset();
  render();
  showRecordCreated(status === 'paid' ? 'Aidat ödendi olarak kaydedildi ve muhasebeye eklendi.' : 'Aidat ödenmedi olarak tanımlandı.');
});
document.querySelector('#accountingForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!isAdminRole()) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  const kind = data.get('kind');
  if (kind === 'fee') {
    const student = state.students.find(item => item.id === Number(data.get('studentId')));
    const selectedRows = [...form.querySelectorAll('input[name="feeMonth"]:checked')].map(input => input.closest('.accounting-fee-month-row'));
    const months = selectedRows.map(row => row.dataset.month);
    const amounts = selectedRows.map(accountingFeeRowAmount);
    const paymentDate = String(data.get('date') || '');
    const paymentMethod = String(data.get('paymentMethod') || '');
    if (!student || !months.length || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(paymentDate) || !PAYMENT_METHODS[paymentMethod]) {
      showToast('Öğrenciyi ve ödeme alınacak en az bir aidat ayını seçin.');
      return;
    }
    if (amounts.some(amount => !Number.isFinite(amount) || amount <= 0 || amount > 99999999.99)) {
      showToast('Seçilen ayların aidat tutarlarını kontrol edin.');
      return;
    }
    const recorded = await runRemoteMutation(() => remoteDataStore.recordAccountingFeePayments(student.id, months, amounts, paymentDate, paymentMethod));
    if (!recorded) return;
    recorded.forEach(item => {
      setMonthlyFeeStatus(student, item.month, 'paid', { amount: Number(item.amount), paymentDate, paymentMethod });
      const entry = state.accountingEntries.find(row => row.reference === feeAccountingReference(student, item.month));
      if (entry) entry.id = Number(item.accountingId);
    });
    persistLocalData();
    document.querySelector('#accountingDialog').close();
    form.reset();
    if (state.page !== 'accountingEntries') state.page = 'accounting';
    render();
    showRecordCreated(`${recorded.length} aylık aidat öğrenciye ve muhasebeye işlendi.`);
    return;
  }
  const entryData = {
    date: data.get('date'),
    title: data.get('title').trim(),
    type: kind === 'income' ? 'Gelir' : 'Gider',
    amount: Number(data.get('amount')),
    paymentMethod: data.get('paymentMethod'),
    kind
  };
  const wasEditing = Boolean(state.editingAccountingEntryId);
  const existingEntry = wasEditing ? state.accountingEntries.find(item => item.id === Number(state.editingAccountingEntryId)) : null;
  const entryRecord = { ...(existingEntry || {}), ...entryData };
  const saved = await runRemoteMutation(async () => {
    entryRecord.id = await remoteDataStore.saveAccounting(entryRecord, !wasEditing);
  });
  if (!saved) return;
  if (wasEditing) Object.assign(existingEntry, entryRecord);
  else state.accountingEntries.unshift(entryRecord);
  state.editingAccountingEntryId = null;
  persistLocalData();
  document.querySelector('#accountingDialog').close();
  form.reset();
  if (state.page !== 'accountingEntries') state.page = 'accounting';
  if (wasEditing) showToast('Muhasebe işlemi Supabase’de güncellendi.');
  else showRecordCreated(`${entryRecord.type} kaydı oluşturuldu.`);
  render();
});
document.querySelector('#accountingDateRangeForm').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  const startDate = String(form.elements.startDate.value || '');
  const endDate = String(form.elements.endDate.value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate) {
    showToast('Geçerli bir başlangıç ve bitiş tarihi seçin.');
    return;
  }
  state.accountingPeriod = 'range';
  state.accountingDateRangeStart = startDate;
  state.accountingDateRangeEnd = endDate;
  document.querySelector('#accountingDateRangeDialog').close();
  render();
  loadPageData(state.page, { force: true }).then(render).catch(error => console.error('Muhasebe aralığı yüklenemedi:', error));
});
document.querySelector('#studentNotificationForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!isAdminRole()) return;
  const form = event.currentTarget;
  const studentId = Number(form.elements.studentId.value);
  const student = state.students.find(item => item.id === studentId);
  const title = String(form.elements.title.value || '').trim();
  const body = String(form.elements.message.value || '').trim();
  if (!student || !title || !body) return;
  try {
    const result = await saveAndSendNotification({ audience: `${student.name} velisi`, title, body, studentId });
    document.querySelector('#studentNotificationDialog').close();
    form.reset();
    render();
    showRecordCreated(result.sent > 0 ? 'Bildirim veliye gönderildi.' : 'Bildirim kaydedildi ancak velinin açık bildirim izni olan cihazı bulunamadı.');
  } catch (error) {
    showToast(`Bildirim gönderilemedi: ${error.message || 'Bağlantı hatası'}`);
  }
});

appContent.addEventListener('toggle', event => {
  const details = event.target;
  if (!details.matches?.('.group-settings-panel')) return;
  if (!details.isConnected) return;
  if (details.classList.contains('approval-section-panel')) {
    if (!details.open) refreshUserApprovalsOnResume();
    return;
  }
  if (details.classList.contains('training-type-settings-panel')) {
    state.trainingTypeSettingsOpen = details.open;
    return;
  }
  if (details.classList.contains('training-coach-settings-panel')) {
    state.trainingCoachSettingsOpen = details.open;
    return;
  }
  if (details.classList.contains('training-field-settings-panel')) {
    state.trainingFieldSettingsOpen = details.open;
    return;
  }
  state.groupSettingsOpen = details.open;
  if (!details.open) {
    state.newestGroupPinned = false;
    state.newestGroupName = '';
  }
}, true);
appContent.addEventListener('submit', async event => {
  if (event.target.id === 'schoolCreateForm' && state.role === 'super_admin') {
    event.preventDefault();
    const data = new FormData(event.target);
    const name = String(data.get('schoolName') || '').trim();
    const slug = String(data.get('schoolSlug') || '').trim().toLowerCase();
    const monthlyFeeAmount = Number(data.get('monthlyFeeAmount'));
    if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !Number.isFinite(monthlyFeeAmount) || monthlyFeeAmount <= 0) {
      showToast('Okul adı, okul kodu ve aidat tutarını kontrol edin.');
      return;
    }
    const created = await runRemoteMutation(() => remoteDataStore.createSchool({ name, slug, monthlyFeeAmount }));
    if (!created) return;
    await refreshSchools();
    event.target.reset();
    render();
    showRecordCreated(`${name} oluşturuldu ve listeye eklendi.`);
    return;
  }
  if (event.target.matches('.group-rename-form')) {
    event.preventDefault();
    if (!['super_admin', 'admin'].includes(state.role)) return;
    const currentName = String(event.target.dataset.originalGroup || '');
    const groupName = String(new FormData(event.target).get('groupName') || '').trim().replace(/\s+/g, ' ');
    if (!/^[\p{L}\p{N} .:()\-/]{1,60}$/u.test(groupName)) {
      showToast('Geçerli bir grup adı girin.');
      return;
    }
    if (GROUPS.some(group => group !== currentName && group.localeCompare(groupName, 'tr-TR', { sensitivity: 'base' }) === 0)) {
      showToast('Bu grup zaten kayıtlı.');
      return;
    }
    if (groupName === currentName) {
      state.editingGroupName = null;
      render();
      return;
    }
    const updatedGroup = await runRemoteMutation(() => remoteDataStore.updateGroup(currentName, groupName));
    if (!updatedGroup) return;
    GROUPS = GROUPS.map(group => group === currentName ? updatedGroup.name : group);
    state.students.forEach(student => { if (student.group === currentName) student.group = updatedGroup.name; });
    state.trainings.forEach(training => { if (training.group === currentName) training.group = updatedGroup.name; });
    state.editingGroupName = null;
    syncGroupOptions();
    persistLocalData();
    render();
    showToast('Grup adı güncellendi.');
    return;
  }
  if (event.target.matches('.training-type-rename-form')) {
    event.preventDefault();
    if (!['super_admin', 'admin'].includes(state.role)) return;
    const currentName = String(event.target.dataset.originalType || '');
    const trainingTypeName = String(new FormData(event.target).get('trainingTypeName') || '').trim().replace(/\s+/g, ' ');
    if (!/^[\p{L}\p{N} .:()\-/]{1,60}$/u.test(trainingTypeName)) {
      showToast('Geçerli bir antrenman adı girin.');
      return;
    }
    if (state.trainingTypes.some(type => type !== currentName && type.localeCompare(trainingTypeName, 'tr-TR', { sensitivity: 'base' }) === 0)) {
      showToast('Bu antrenman adı zaten kayıtlı.');
      return;
    }
    if (trainingTypeName === currentName) {
      state.editingTrainingTypeName = null;
      state.trainingTypeSettingsOpen = true;
      render();
      return;
    }
    const saved = await runRemoteMutation(() => remoteDataStore.updateTrainingType(currentName, trainingTypeName));
    if (!saved) return;
    state.trainingTypes = state.trainingTypes.map(type => type === currentName ? trainingTypeName : type);
    state.editingTrainingTypeName = null;
    state.trainingTypeSettingsOpen = true;
    syncTrainingTypeOptions();
    render();
    showToast('Antrenman ismi güncellendi.');
    return;
  }
  if (event.target.id === 'trainingTypeSettingsForm') {
    event.preventDefault();
    if (!['super_admin', 'admin'].includes(state.role)) return;
    const trainingTypeName = String(new FormData(event.target).get('trainingTypeName') || '').trim().replace(/\s+/g, ' ');
    if (!/^[\p{L}\p{N} .:()\-/]{1,60}$/u.test(trainingTypeName)) {
      showToast('Geçerli bir antrenman adı girin.');
      return;
    }
    if (state.trainingTypes.some(type => type.localeCompare(trainingTypeName, 'tr-TR', { sensitivity: 'base' }) === 0)) {
      showToast('Bu antrenman adı zaten kayıtlı.');
      return;
    }
    const saved = await runRemoteMutation(() => remoteDataStore.saveTrainingType(trainingTypeName));
    if (!saved) return;
    state.trainingTypes = [...state.trainingTypes, trainingTypeName];
    state.trainingTypeSettingsOpen = true;
    syncTrainingTypeOptions();
    event.target.reset();
    render();
    showRecordCreated('Yeni antrenman ismi eklendi.');
    return;
  }
  if (event.target.matches('.training-coach-rename-form')) {
    event.preventDefault();
    if (!['super_admin', 'admin'].includes(state.role)) return;
    const currentName = String(event.target.dataset.originalCoach || '');
    const coachName = String(new FormData(event.target).get('trainingCoachName') || '').trim().replace(/\s+/g, ' ');
    if (!/^[\p{L} .()'\-]{2,80}$/u.test(coachName)) {
      showToast('Geçerli bir antrenör adı ve soyadı girin.');
      return;
    }
    if (state.trainingCoaches.some(coach => coach !== currentName && coach.localeCompare(coachName, 'tr-TR', { sensitivity: 'base' }) === 0)) {
      showToast('Bu antrenör zaten kayıtlı.');
      return;
    }
    if (coachName === currentName) {
      state.editingTrainingCoachName = null;
      state.trainingCoachSettingsOpen = true;
      render();
      return;
    }
    const saved = await runRemoteMutation(() => remoteDataStore.updateTrainingCoach(currentName, coachName));
    if (!saved) return;
    state.trainingCoaches = state.trainingCoaches.map(coach => coach === currentName ? coachName : coach);
    state.editingTrainingCoachName = null;
    state.trainingCoachSettingsOpen = true;
    syncTrainingCoachOptions();
    render();
    showToast('Antrenör adı güncellendi.');
    return;
  }
  if (event.target.id === 'trainingCoachSettingsForm') {
    event.preventDefault();
    if (!['super_admin', 'admin'].includes(state.role)) return;
    const coachName = String(new FormData(event.target).get('trainingCoachName') || '').trim().replace(/\s+/g, ' ');
    if (!/^[\p{L} .()'\-]{2,80}$/u.test(coachName)) {
      showToast('Geçerli bir antrenör adı ve soyadı girin.');
      return;
    }
    if (state.trainingCoaches.some(coach => coach.localeCompare(coachName, 'tr-TR', { sensitivity: 'base' }) === 0)) {
      showToast('Bu antrenör zaten kayıtlı.');
      return;
    }
    const saved = await runRemoteMutation(() => remoteDataStore.saveTrainingCoach(coachName));
    if (!saved) return;
    state.trainingCoaches = [...state.trainingCoaches, coachName];
    state.trainingCoachSettingsOpen = true;
    syncTrainingCoachOptions();
    event.target.reset();
    render();
    showRecordCreated('Yeni antrenör eklendi.');
    return;
  }
  if (event.target.matches('.training-field-rename-form')) {
    event.preventDefault();
    if (!['super_admin', 'admin'].includes(state.role)) return;
    const currentName = String(event.target.dataset.originalField || '');
    const fieldName = String(new FormData(event.target).get('trainingFieldName') || '').trim().replace(/\s+/g, ' ');
    if (!/^[\p{L}\p{N} .:()'\/\-]{1,80}$/u.test(fieldName)) {
      showToast('Geçerli bir saha adı girin.');
      return;
    }
    if (state.trainingFields.some(field => field !== currentName && field.localeCompare(fieldName, 'tr-TR', { sensitivity: 'base' }) === 0)) {
      showToast('Bu saha zaten kayıtlı.');
      return;
    }
    if (fieldName === currentName) {
      state.editingTrainingFieldName = null;
      state.trainingFieldSettingsOpen = true;
      render();
      return;
    }
    const saved = await runRemoteMutation(() => remoteDataStore.updateTrainingField(currentName, fieldName));
    if (!saved) return;
    state.trainingFields = state.trainingFields.map(field => field === currentName ? fieldName : field);
    state.editingTrainingFieldName = null;
    state.trainingFieldSettingsOpen = true;
    syncTrainingFieldOptions();
    render();
    showToast('Saha adı güncellendi.');
    return;
  }
  if (event.target.id === 'trainingFieldSettingsForm') {
    event.preventDefault();
    if (!['super_admin', 'admin'].includes(state.role)) return;
    const fieldName = String(new FormData(event.target).get('trainingFieldName') || '').trim().replace(/\s+/g, ' ');
    if (!/^[\p{L}\p{N} .:()'\/\-]{1,80}$/u.test(fieldName)) {
      showToast('Geçerli bir saha adı girin.');
      return;
    }
    if (state.trainingFields.some(field => field.localeCompare(fieldName, 'tr-TR', { sensitivity: 'base' }) === 0)) {
      showToast('Bu saha zaten kayıtlı.');
      return;
    }
    const saved = await runRemoteMutation(() => remoteDataStore.saveTrainingField(fieldName));
    if (!saved) return;
    state.trainingFields = [...state.trainingFields, fieldName];
    state.trainingFieldSettingsOpen = true;
    syncTrainingFieldOptions();
    event.target.reset();
    render();
    return;
  }
  if (event.target.id === 'groupSettingsForm') {
    event.preventDefault();
    if (!['super_admin', 'admin'].includes(state.role)) return;
    const groupName = String(new FormData(event.target).get('groupName') || '').trim().replace(/\s+/g, ' ');
    if (!groupName) {
      showToast('Geçerli bir grup adı girin.');
      return;
    }
    if (!/^[\p{L}\p{N} .:()\-/]{1,60}$/u.test(groupName)) {
      showToast('Grup adında desteklenmeyen karakterler var.');
      return;
    }
    if (GROUPS.some(group => group.localeCompare(groupName, 'tr-TR', { sensitivity: 'base' }) === 0)) {
      showToast('Bu grup zaten kayıtlı.');
      return;
    }
    state.newestGroupPinned = true;
    state.newestGroupName = groupName;
    const savedGroup = await runRemoteMutation(() => remoteDataStore.saveGroup(groupName));
    if (!savedGroup) {
      state.newestGroupPinned = false;
      state.newestGroupName = '';
      return;
    }
    GROUPS = [savedGroup.name, ...GROUPS.filter(group => group !== savedGroup.name)];
    state.groupSettingsOpen = true;
    state.newestGroupName = savedGroup.name;
    syncGroupOptions();
    event.target.reset();
    render();
    showRecordCreated('Yeni grup eklendi.');
    return;
  }
  if (event.target.id === 'accountingSettingsForm') {
    event.preventDefault();
    if (!isAdminRole()) return;
    const amount = Number(new FormData(event.target).get('monthlyFeeAmount'));
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast('Geçerli bir aylık aidat tutarı girin.');
      return;
    }
    const savedAmount = await runRemoteMutation(() => remoteDataStore.saveSchoolSettings(amount));
    if (!savedAmount) return;
    state.monthlyFeeAmount = Number(savedAmount);
    render();
    showToast('Aylık aidat tutarı kaydedildi.');
    return;
  }
  if (event.target.id === 'subscriptionBankSettingsForm') {
    event.preventDefault();
    if (state.role !== 'super_admin') return;
    const data = new FormData(event.target);
    const accountCount = event.target.querySelectorAll('.bank-account-settings-card').length;
    const accounts = Array.from({ length: accountCount }, (_, index) => ({
      bankName: String(data.get(`bankName${index}`) || '').trim().replace(/\s+/g, ' '),
      accountHolder: String(data.get(`accountHolder${index}`) || '').trim().replace(/\s+/g, ' '),
      iban: normalizeTurkishIbanEntry(data.get(`iban${index}`))
    })).filter(account => account.bankName || account.accountHolder || account.iban);
    if (!accounts.length || accounts.some(account => !account.bankName || !account.accountHolder || !isValidTurkishIban(account.iban))) {
      showToast('Her hesap için banka adı, hesap sahibi ve doğrulanabilir bir TR IBAN bilgisini birlikte girin.');
      return;
    }
    if (new Set(accounts.map(account => account.iban)).size !== accounts.length) {
      showToast('Aynı IBAN birden fazla kez eklenemez.');
      return;
    }
    showDataSaveLoading();
    const savedAccounts = await runRemoteMutation(() => remoteDataStore.saveSubscriptionBankAccounts(accounts));
    if (!savedAccounts) return;
    state.subscriptionBankAccounts = savedAccounts;
    render();
    showToast(`${accounts.length} abonelik havale hesabı kaydedildi.`);
    return;
  }
  if (event.target.id === 'schoolBankSettingsForm') {
    event.preventDefault();
    if (!isAdminRole()) return;
    const data = new FormData(event.target);
    const accountCount = event.target.querySelectorAll('.bank-account-settings-card').length;
    const accounts = Array.from({ length: accountCount }, (_, index) => {
      const iban = normalizeTurkishIbanEntry(data.get(`iban${index}`));
      return {
        bankName: String(data.get(`bankName${index}`) || '').trim().replace(/\s+/g, ' '),
        accountHolder: String(data.get(`accountHolder${index}`) || '').trim().replace(/\s+/g, ' '),
        iban
      };
    }).filter(account => account.bankName || account.accountHolder || account.iban);
    if (!accounts.length) {
      showToast('Kaydetmek için banka adı, hesap sahibi ve geçerli bir TR IBAN bilgisi girin.');
      return;
    }
    if (accounts.some(account => !account.bankName || !account.accountHolder || !isValidTurkishIban(account.iban))) {
      showToast('Her hesap için banka adı, hesap sahibi ve doğrulanabilir bir TR IBAN bilgisini birlikte girin.');
      return;
    }
    if (new Set(accounts.map(account => account.iban)).size !== accounts.length) {
      showToast('Aynı IBAN birden fazla kez eklenemez.');
      return;
    }
    showDataSaveLoading();
    const savedAccounts = await runRemoteMutation(() => remoteDataStore.saveSchoolBankDetails(accounts));
    if (!savedAccounts) return;
    state.schoolBankAccounts = savedAccounts;
    render();
    if (accounts.length) showToast(`${accounts.length} havale hesabı kaydedildi.`);
    else showRecordCreated('Havale bilgileri kaldırıldı.');
    return;
  }
  if (event.target.id !== 'notificationForm') return;
  event.preventDefault();
  if (!['super_admin', 'admin'].includes(state.role)) return;
  const audienceField = document.querySelector('#notificationAudience');
  const titleField = document.querySelector('#notificationTitle');
  const messageField = document.querySelector('#notificationMessage');
  try {
    const result = await saveAndSendNotification({
      audience: audienceField?.value || state.notificationDraft.audience,
      title: titleField?.value || state.notificationDraft.title,
      body: messageField?.value || state.notificationDraft.body
    });
    state.notificationComposeOpen = false;
    state.notificationDraft = { audience: 'Tüm kullanıcılar', title: '', body: '' };
    skipNextNotificationDraftCapture = true;
    event.target.reset();
    render();
    markAllNotificationsRead();
    showRecordCreated(result.sent > 0
      ? `Bildirim ${result.sent} telefona yüksek öncelikle gönderildi.`
      : 'Bildirim kaydedildi ancak açık bildirimi olan telefon bulunamadı.');
  } catch (error) {
    showToast(`Bildirim gönderilemedi: ${error.message || 'Bağlantı hatası'}`);
  }
});

appContent.addEventListener('toggle', event => {
  if (!event.target.matches('.notification-compose-disclosure')) return;
  state.notificationComposeOpen = event.target.open;
}, true);

async function handleAuthStateChange(event, session) {
  if (event === 'PASSWORD_RECOVERY') authMode = 'set-password';

  if (hasExpiredAuthLink) {
    if (!expiredAuthLinkSessionCleared) {
      expiredAuthLinkSessionCleared = true;
      await supabaseClient?.auth.signOut({ scope: 'local' }).catch(() => undefined);
    }
    showExpiredPasswordLinkScreen();
    return;
  }

  if (!session?.user) {
    stopRealtimeSync();
    clearSensitiveState();
    const message = signedOutMessage;
    signedOutMessage = '';
    if (message === 'SUBSCRIPTION_STOPPED') {
      showSubscriptionBlockedScreen();
      return;
    }
    if (authMode === 'set-password') {
      authMode = 'login';
      showLoginScreen('Davet veya şifre yenileme bağlantısının süresi dolmuş. Lütfen yeni bağlantı isteyin.', true);
    } else {
      showLoginScreen(message);
    }
    return;
  }

  if (state.userId === session.user.id && !appShell.classList.contains('is-hidden')) {
    return;
  }

  if (authMode === 'set-password') {
    showPasswordSetupScreen();
    return;
  }

  await showAuthenticatedApp(session.user);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.userId && !appShell.classList.contains('is-hidden')) {
    handleAppResume();
  } else if (document.visibilityState === 'hidden') {
    stopVisiblePageRefreshGuard();
  }
});

let userApprovalsResumeRefreshTimer = null;
let userApprovalsRefreshInFlight = false;
let userApprovalsAndroidRefreshInterval = null;
let userApprovalsEmptyRetryTimer = null;
async function refreshUserApprovalsData({ force = false } = {}) {
  if (state.page !== 'userApprovals' || !state.userId || appShell.classList.contains('is-hidden')) return;
  if (userApprovalsPanelsOpen()) return;
  if (userApprovalsRefreshInFlight) return;
  if (!force && state.accessRequestsLoadedAt) return;
  window.clearTimeout(userApprovalsEmptyRetryTimer);
  userApprovalsRefreshInFlight = true;
  state.accessRequestsLoading = true;
  if (!state.accessRequests.length) render();
  try {
    const rows = await remoteDataStore.loadAccessRequests();
    const updatedRows = setAccessRequestsFromRows(rows, { preserveEmpty: force });
    if (force && !rows.length && updatedRows.length) {
      userApprovalsEmptyRetryTimer = window.setTimeout(() => {
        refreshUserApprovalsData({ force: true });
      }, 1500);
    }
    loadedPageData.set(pageDataCacheKey('userApprovals'), true);
    if (state.page === 'userApprovals') render();
  } catch (error) {
    console.error('Kullanıcı onayları yenilenemedi:', error);
    if (state.page === 'userApprovals') showToast(`Kullanıcı onayları yüklenemedi: ${error.message || 'Bağlantı hatası'}`);
  } finally {
    state.accessRequestsLoading = false;
    userApprovalsRefreshInFlight = false;
    if (state.page === 'userApprovals') render();
  }
}

function refreshUserApprovalsOnResume() {
  if (state.page !== 'userApprovals' || !state.userId || appShell.classList.contains('is-hidden')) return;
  if (userApprovalsPanelsOpen()) return;
  window.clearTimeout(userApprovalsResumeRefreshTimer);
  userApprovalsResumeRefreshTimer = window.setTimeout(() => {
    refreshUserApprovalsData({ force: true });
  }, 350);
}

function startAndroidUserApprovalsRefreshGuard() {
  // See refreshUserApprovalsOnResume.
}

startAndroidUserApprovalsRefreshGuard();

window.addEventListener('focus', handleAppResume);
window.addEventListener('pageshow', handleAppResume);

configureAuthForm(authMode);
if (!supabaseClient) {
  showLoginScreen('Güvenli giriş hizmeti yüklenemedi. İnternet bağlantınızı kontrol edip sayfayı yenileyin.', true);
} else {
  supabaseClient.auth.onAuthStateChange((event, session) => {
    window.setTimeout(() => handleAuthStateChange(event, session), 0);
  });
}
