/**
 * Legal Agenda & Case Manager - app.js
 * Application logic, IndexedDB storage, interactive calendar, and notification scheduler.
 * Customized for Ministry of Justice Experts (خبراء وزارة العدل).
 * Implements editable comboboxes for Lawsuit Types and Procedure Types.
 */

// ==========================================
// 1. DATABASE MODULE (IndexedDB Wrapper)
// ==========================================
class CaseDatabase {
  constructor() {
    this.dbName = 'LegalAgendaDB';
    this.dbVersion = 1;
    this.db = null;
  }

  // Initialize DB connection
  init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = (event) => {
        console.error('Database failed to open:', event.target.error);
        reject(event.target.error);
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        console.log('Database initialized successfully');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('cases')) {
          const store = db.createObjectStore('cases', { keyPath: 'id', autoIncrement: true });
          // Indexes for quick queries
          store.createIndex('dateTime', 'dateTime', { unique: false });
          store.createIndex('dateOnly', 'dateOnly', { unique: false });
        }
      };
    });
  }

  // Get all cases (missions)
  getAllCases() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['cases'], 'readonly');
      const store = transaction.objectStore('cases');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  // Get cases (missions) for a specific day (dateStr format: YYYY-MM-DD)
  getCasesByDate(dateStr) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['cases'], 'readonly');
      const store = transaction.objectStore('cases');
      const index = store.index('dateOnly');
      const request = index.getAll(dateStr);

      request.onsuccess = () => {
        // Sort cases on the same day by time
        const sorted = request.result.sort((a, b) => {
          return new Date(a.dateTime) - new Date(b.dateTime);
        });
        resolve(sorted);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  // Save new case
  addCase(caseData) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['cases'], 'readwrite');
      const store = transaction.objectStore('cases');
      const request = store.add(caseData);

      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  // Edit/Update case
  updateCase(caseData) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['cases'], 'readwrite');
      const store = transaction.objectStore('cases');
      const request = store.put(caseData);

      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  // Delete case
  deleteCase(id) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['cases'], 'readwrite');
      const store = transaction.objectStore('cases');
      const request = store.delete(Number(id));

      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  // Set notified = true
  markAsNotified(id) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['cases'], 'readwrite');
      const store = transaction.objectStore('cases');

      const getReq = store.get(Number(id));
      getReq.onerror = (e) => reject(e.target.error);
      getReq.onsuccess = () => {
        const data = getReq.result;
        if (data) {
          data.notified = true;
          const putReq = store.put(data);
          putReq.onsuccess = () => resolve(true);
          putReq.onerror = (e) => reject(e.target.error);
        } else {
          resolve(false);
        }
      };
    });
  }
}

// Global App State
const state = {
  db: new CaseDatabase(),
  currentDate: new Date(), // For calendar navigation
  selectedDateStr: '',    // Format: YYYY-MM-DD
  casesList: [],          // Cases & appointments for currently selected date
  allCases: [],           // All items in system (for event indicators)
  currentFilter: 'all',   // 'all' | 'case' | 'appointment'
  notificationsEnabled: localStorage.getItem('notificationsEnabled') === 'true',
  holidayShiftEnabled: localStorage.getItem('holidayShiftEnabled') !== 'false', // Default: true (مفعل أساسياً)
  theme: localStorage.getItem('appTheme') || 'dark',
  googleHolidays: loadAndNormalizeStoredGoogleHolidays(),
  swRegistration: null
};

// ==========================================
// THEME SWITCHER (Dark / Light Theme)
// ==========================================
function applyTheme(themeName) {
  const isLight = themeName === 'light';
  const effectiveTheme = isLight ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', effectiveTheme);
  if (document.body) {
    document.body.setAttribute('data-theme', effectiveTheme);
  }
  state.theme = effectiveTheme;
  localStorage.setItem('appTheme', effectiveTheme);

  const themeToggle = document.getElementById('themeToggle');
  const themeIcon = document.getElementById('themeIcon');
  const themeLabelText = document.getElementById('themeLabelText');
  const themeDescText = document.getElementById('themeDescText');

  if (themeToggle) {
    themeToggle.checked = isLight;
  }
  if (themeIcon) {
    themeIcon.className = isLight ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    themeIcon.style.color = isLight ? '#f59e0b' : 'var(--accent-blue)';
  }
  if (themeLabelText) {
    themeLabelText.textContent = 'المظهر النهاري';
  }
  if (themeDescText) {
    themeDescText.textContent = isLight ? 'الوضع النهاري مفعّل (المظهر الفاتح)' : 'الوضع الداكن مفعّل (المظهر الأساسي)';
  }

  // Update mobile status bar theme color
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) {
    themeMeta.setAttribute('content', isLight ? '#f8fafc' : '#111827');
  }
}
window.applyTheme = applyTheme;

// ==========================================
// UTILITY & SANITIZATION HELPERS
// ==========================================

// Helper: Safe HTML Escaping (XSS Prevention)
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Helper: Unified entryType resolution for legacy and new records
function getEntryType(item) {
  return (item && item.entryType) ? item.entryType : 'case';
}

// Helper: Parse YYYY-MM-DD safely into a local Date without UTC offset shift
function parseLocalDate(dateStr) {
  if (!dateStr) return new Date();
  if (dateStr instanceof Date) return dateStr;
  const parts = String(dateStr).split('T')[0].split('-').map(Number);
  if (parts.length >= 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
  }
  return new Date(dateStr);
}

// Helper: load stored Google holidays and guarantee Arabic translations
function loadAndNormalizeStoredGoogleHolidays() {
  try {
    const raw = JSON.parse(localStorage.getItem('googleHolidays') || '{}');
    const normalized = {};
    for (const [dStr, rawTitle] of Object.entries(raw)) {
      normalized[dStr] = normalizeHolidayNameToArabic(rawTitle, dStr);
    }
    return normalized;
  } catch (e) {
    return {};
  }
}

// Egyptian Public Holidays Data (2025 - 2027) in Arabic
const FIXED_HOLIDAYS_ARABIC = {
  '01-07': 'عيد الميلاد المجيد',
  '01-25': 'عيد ثورة 25 يناير وعيد الشرطة',
  '04-25': 'عيد تحرير سيناء',
  '05-01': 'عيد العمال',
  '06-30': 'ثورة 30 يونيو',
  '07-23': 'عيد ثورة 23 يوليو',
  '10-06': 'عيد القوات المسلحة (٦ أكتوبر)'
};

const MOVABLE_HOLIDAYS_ARABIC = {
  // 2025
  '2025-03-30': 'عيد الفطر المبارك',
  '2025-03-31': 'عيد الفطر المبارك',
  '2025-04-01': 'عيد الفطر المبارك',
  '2025-04-21': 'شم النسيم',
  '2025-06-05': 'وقفة عرفات',
  '2025-06-06': 'عيد الأضحى المبارك',
  '2025-06-07': 'عيد الأضحى المبارك',
  '2025-06-08': 'عيد الأضحى المبارك',
  '2025-06-09': 'عيد الأضحى المبارك',
  '2025-06-26': 'رأس السنة الهجرية',
  '2025-09-04': 'المولد النبوي الشريف',
  // 2026
  '2026-03-20': 'عيد الفطر المبارك',
  '2026-03-21': 'عيد الفطر المبارك',
  '2026-03-22': 'عيد الفطر المبارك',
  '2026-04-13': 'شم النسيم',
  '2026-05-26': 'وقفة عرفات',
  '2026-05-27': 'عيد الأضحى المبارك',
  '2026-05-28': 'عيد الأضحى المبارك',
  '2026-05-29': 'عيد الأضحى المبارك',
  '2026-05-30': 'عيد الأضحى المبارك',
  '2026-06-16': 'رأس السنة الهجرية',
  '2026-08-25': 'المولد النبوي الشريف',
  // 2027
  '2027-03-09': 'عيد الفطر المبارك',
  '2027-03-10': 'عيد الفطر المبارك',
  '2027-03-11': 'عيد الفطر المبارك',
  '2027-05-03': 'شم النسيم',
  '2027-05-16': 'وقفة عرفات',
  '2027-05-17': 'عيد الأضحى المبارك',
  '2027-05-18': 'عيد الأضحى المبارك',
  '2027-05-19': 'عيد الأضحى المبارك',
  '2027-05-20': 'عيد الأضحى المبارك',
  '2027-06-06': 'رأس السنة الهجرية',
  '2027-08-14': 'المولد النبوي الشريف',
  // 2028 (تواريخ هجرية متوقعة فلكياً وفق حسابات المعهد القومي للبحوث الفلكية والجيوفيزيقية NRIAG)
  '2028-02-27': 'عيد الفطر المبارك', // متوقع فلكياً (١ شوال ١٤٤٩هـ)
  '2028-02-28': 'عيد الفطر المبارك', // متوقع فلكياً
  '2028-02-29': 'عيد الفطر المبارك', // متوقع فلكياً
  '2028-04-17': 'شم النسيم',          // الفصح الشرقي
  '2028-05-04': 'وقفة عرفات',        // متوقع فلكياً (٩ ذو الحجة ١٤٤٩هـ)
  '2028-05-05': 'عيد الأضحى المبارك', // متوقع فلكياً (١٠ ذو الحجة ١٤٤٩هـ)
  '2028-05-06': 'عيد الأضحى المبارك', // متوقع فلكياً
  '2028-05-07': 'عيد الأضحى المبارك', // متوقع فلكياً
  '2028-05-08': 'عيد الأضحى المبارك', // متوقع فلكياً
  '2028-05-25': 'رأس السنة الهجرية',   // متوقع فلكياً (١ محرم ١٤٥٠هـ)
  '2028-08-03': 'المولد النبوي الشريف'  // متوقع فلكياً (١٢ ربيع الأول ١٤٥٠هـ)
};

// Aliases for compatibility
const fixedHolidays = FIXED_HOLIDAYS_ARABIC;
const movableHolidays = MOVABLE_HOLIDAYS_ARABIC;

// Official Egyptian Public Holidays by law
const OFFICIAL_EGYPTIAN_HOLIDAY_NAMES = new Set([
  'عيد الميلاد المجيد',
  'عيد ثورة 25 يناير وعيد الشرطة',
  'عيد تحرير سيناء',
  'عيد العمال',
  'شم النسيم',
  'وقفة عرفات',
  'عيد الأضحى المبارك',
  'رأس السنة الهجرية',
  'ثورة 30 يونيو',
  'عيد ثورة 23 يوليو',
  'المولد النبوي الشريف',
  'عيد القوات المسلحة (٦ أكتوبر)',
  'عيد الفطر المبارك'
]);

// Official Egyptian Holidays subject to Prime Minister Decree 1249/2020 for shifting to Thursday
const SHIFTABLE_EGYPTIAN_HOLIDAY_NAMES = new Set([
  'عيد ثورة 25 يناير وعيد الشرطة',
  'عيد تحرير سيناء',
  'عيد العمال',
  'ثورة 30 يونيو',
  'عيد ثورة 23 يوليو',
  'عيد القوات المسلحة (٦ أكتوبر)',
  'المولد النبوي الشريف',
  'رأس السنة الهجرية'
]);

function isShiftableEgyptianHoliday(name) {
  if (!name) return false;
  for (const item of SHIFTABLE_EGYPTIAN_HOLIDAY_NAMES) {
    if (name === item || name.includes(item)) return true;
  }
  return false;
}

function isOfficialEgyptianHoliday(name) {
  if (!name) return false;
  for (const item of OFFICIAL_EGYPTIAN_HOLIDAY_NAMES) {
    if (name === item || name.includes(item)) return true;
  }
  return false;
}

// Normalize any holiday title (Arabic or English from Google Calendar) to standard formal Arabic
function normalizeHolidayNameToArabic(rawName, dateStr = '') {
  if (!rawName && dateStr) {
    const md = dateStr.substring(5);
    if (FIXED_HOLIDAYS_ARABIC[md]) return FIXED_HOLIDAYS_ARABIC[md];
    if (MOVABLE_HOLIDAYS_ARABIC[dateStr]) return MOVABLE_HOLIDAYS_ARABIC[dateStr];
  }
  if (!rawName) return '';
  const lower = String(rawName).toLowerCase().trim();

  // Religious & social observances that are NOT official public days off in Egypt
  if (lower.includes('ramadan') || lower.includes('رمضان')) {
    return 'بداية شهر رمضان المبارك';
  }
  if (lower.includes('qadr') || lower.includes('القدر')) {
    return 'ليلة القدر المباركة';
  }
  if (lower.includes("mother's day") || lower.includes('mothers day') || lower.includes('عيد الأم') || lower.includes('عيد الام')) {
    return 'عيد الأم';
  }
  if (lower.includes('orphan') || lower.includes('اليتيم')) {
    return 'يوم اليتيم';
  }

  // 1. Specific Religious & Traditional Holidays (Highest Priority)
  // Arafat Day
  if (lower.includes('arafat') || lower.includes('عرفات') || lower.includes('عرفة') || lower.includes('وقفة عرف')) {
    return 'وقفة عرفات';
  }
  // Eid Al-Adha (Feast of Sacrifice)
  if (lower.includes('adha') || lower.includes('أضحى') || lower.includes('اضحى') || lower.includes('نحر')) {
    return 'عيد الأضحى المبارك';
  }
  // Eid Al-Fitr
  if (lower.includes('fitr') || lower.includes('فطر')) {
    return 'عيد الفطر المبارك';
  }
  // Prophet's Birthday / Mawlid
  if (lower.includes('prophet') || lower.includes('mawlid') || lower.includes('مولد نبوي') || lower.includes('المولد النبوي') || lower.includes('المولد')) {
    return 'المولد النبوي الشريف';
  }
  // Islamic / Hijri New Year
  if (lower.includes('islamic new year') || lower.includes('hijri new year') || lower.includes('رأس السنة الهجرية') || lower.includes('السنة الهجرية') || (lower.includes('hijri') && lower.includes('new year'))) {
    return 'رأس السنة الهجرية';
  }
  // Sham El-Nessim (Spring festival)
  if (lower.includes('nessim') || lower.includes('نسيم') || lower.includes('spring day') || lower.includes('easter monday')) {
    return 'شم النسيم';
  }
  // Coptic Christmas (January 7)
  if (lower.includes('coptic christmas') || lower.includes('eastern christmas') || lower.includes('ميلاد مجيد') || lower.includes('الميلاد المجيد') || (lower.includes('christmas') && (lower.includes('7') || lower.includes('jan')))) {
    return 'عيد الميلاد المجيد';
  }

  // 2. Specific Egyptian National & Civic Holidays
  // Labour Day (May 1)
  if (lower.includes('labour') || lower.includes('labor') || lower.includes('عمال')) {
    return 'عيد العمال';
  }
  // Sinai Liberation Day (April 25)
  if (lower.includes('sinai') || lower.includes('سيناء')) {
    return 'عيد تحرير سيناء';
  }
  // 6 October / Armed Forces Day
  if (lower.includes('armed forces') || (lower.includes('قوات') && lower.includes('مسلح')) || (lower.includes('october') && lower.includes('6')) || (lower.includes('أكتوبر') && lower.includes('6')) || (lower.includes('اكتوبر') && lower.includes('6')) || lower.includes('حرب أكتوبر') || lower.includes('نصر أكتوبر') || lower.includes('6 oct')) {
    return 'عيد القوات المسلحة (٦ أكتوبر)';
  }
  // 30 June Revolution
  if ((lower.includes('30') && (lower.includes('june') || lower.includes('يونيو'))) || lower.includes('ثورة 30 يونيو') || lower.includes('30 يونيو')) {
    return 'ثورة 30 يونيو';
  }
  // 23 July Revolution
  if ((lower.includes('23') && (lower.includes('july') || lower.includes('يوليو'))) || lower.includes('ثورة 23 يوليو') || lower.includes('23 يوليو')) {
    return 'عيد ثورة 23 يوليو';
  }
  // 25 January Revolution & Police Day
  if ((lower.includes('25') && (lower.includes('jan') || lower.includes('يناير'))) || lower.includes('police') || lower.includes('شرطة') || (lower.includes('revolution') && lower.includes('2011')) || lower.includes('ثورة 25 يناير') || lower.includes('25 يناير')) {
    return 'عيد ثورة 25 يناير وعيد الشرطة';
  }

  // 3. Fallback: clean up standard prefixes/suffixes
  let cleaned = String(rawName)
    .replace(/^Day off for\s+/i, '')
    .replace(/^عطلة بمناسبة\s+/i, '')
    .replace(/\s*\(Observed\)/i, '')
    .replace(/\s*\(مرحل\)/i, '')
    .replace(/^[-•*–—\s]+|[-•*–—\s]+$/g, '')
    .trim();

  if (dateStr) {
    const md = dateStr.substring(5);
    if (FIXED_HOLIDAYS_ARABIC[md]) return FIXED_HOLIDAYS_ARABIC[md];
    if (MOVABLE_HOLIDAYS_ARABIC[dateStr]) return MOVABLE_HOLIDAYS_ARABIC[dateStr];
  }

  return cleaned || rawName;
}

// Comprehensive Holiday Status Evaluator:
// Distinguishes with 100% precision between:
// 1. 'actual_day_off' (RED): Official public day off (shifted to Thursday or fixed).
// 2. 'original_work_day' (GREEN): Sunday-Wednesday original dates of shifted holidays (courts open / working days).
// 3. 'observance' (BLUE): Social & religious observances that are NOT official days off (courts open / working days).
function getHolidayStatus(dateStr) {
  const parts = dateStr.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const targetDate = new Date(year, month, day);
  const dayOfWeek = targetDate.getDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  const md = dateStr.substring(5);

  // 1. Non-Shiftable Fixed Holiday: Christmas (Jan 7) -> ALWAYS RED
  if (md === '01-07') {
    return {
      type: 'actual_day_off',
      name: 'عيد الميلاد المجيد',
      badgeText: 'عطلة رسمية بمصر: عيد الميلاد المجيد'
    };
  }

  // Non-Shiftable Movable Holidays: Eid Al-Fitr, Eid Al-Adha, Sham El-Nessim -> ALWAYS RED
  if (MOVABLE_HOLIDAYS_ARABIC[dateStr]) {
    const mName = MOVABLE_HOLIDAYS_ARABIC[dateStr];
    if (mName.includes('الفطر') || mName.includes('الأضحى') || mName.includes('عرفات') || mName.includes('النسيم')) {
      return {
        type: 'actual_day_off',
        name: mName,
        badgeText: `عطلة رسمية بمصر: ${mName}`
      };
    }
  }

  const gEvent = state.googleHolidays ? state.googleHolidays[dateStr] : null;
  const isShiftActive = state.holidayShiftEnabled !== false;

  // Direct holiday on this exact date (if any)
  let directHolidayName = null;
  if (gEvent) {
    const norm = normalizeHolidayNameToArabic(gEvent, dateStr);
    if (isShiftableEgyptianHoliday(norm) || isOfficialEgyptianHoliday(norm)) {
      directHolidayName = norm;
    }
  } else if (FIXED_HOLIDAYS_ARABIC[md] && md !== '01-07') {
    directHolidayName = FIXED_HOLIDAYS_ARABIC[md];
  } else if (MOVABLE_HOLIDAYS_ARABIC[dateStr]) {
    const mName = MOVABLE_HOLIDAYS_ARABIC[dateStr];
    if (mName.includes('الهجرية') || mName.includes('النبوي')) {
      directHolidayName = mName;
    }
  }

  // Case A: Holiday Shifting is DISABLED by user -> Holiday stays on exact date as day off
  if (!isShiftActive) {
    if (directHolidayName) {
      return {
        type: 'actual_day_off',
        name: directHolidayName,
        badgeText: `عطلة رسمية بمصر: ${directHolidayName} (في موعدها الأصلي بدون ترحيل)`
      };
    }
  } else {
    // Case B: Holiday Shifting is ENABLED (Default according to Prime Minister Decree 1249/2020)
    // 2. Sunday (0), Monday (1), Tuesday (2), or Wednesday (3):
    if (dayOfWeek >= 0 && dayOfWeek <= 3) {
      if (directHolidayName && isShiftableEgyptianHoliday(directHolidayName)) {
        const offsetToThu = 4 - dayOfWeek;
        const thuDate = new Date(year, month, day + offsetToThu);
        const thuDay = thuDate.getDate();
        const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
        const thuMonthName = monthNames[thuDate.getMonth()];
        return {
          type: 'original_work_day',
          name: directHolidayName,
          thuDateFormatted: `${thuDay} ${thuMonthName}`,
          badgeText: `تاريخ المناسبة الرسمي: ${directHolidayName} • (يوم عمل بالمحاكم - الإجازة الرسمية مرحّلة إلى الخميس ${thuDay} ${thuMonthName})`
        };
      }
    }

    // 3. Thursday (day 4):
    // The official day off for shifted holidays -> ALWAYS RED (actual_day_off)!
    if (dayOfWeek === 4) {
      // Check if direct holiday falls on Thursday
      if (directHolidayName) {
        return {
          type: 'actual_day_off',
          name: directHolidayName,
          badgeText: `عطلة رسمية بمصر: ${directHolidayName}`
        };
      }

      // Look back at earlier days of this week (Sunday to Wednesday)
      for (let offset = 1; offset <= 4; offset++) {
        const cDate = new Date(year, month, day - offset);
        const cYear = cDate.getFullYear();
        const cMonth = String(cDate.getMonth() + 1).padStart(2, '0');
        const cDay = String(cDate.getDate()).padStart(2, '0');
        const cDateStr = `${cYear}-${cMonth}-${cDay}`;
        const cMd = `${cMonth}-${cDay}`;

        let foundName = null;
        if (state.googleHolidays && state.googleHolidays[cDateStr]) {
          const norm = normalizeHolidayNameToArabic(state.googleHolidays[cDateStr], cDateStr);
          if (isShiftableEgyptianHoliday(norm)) {
            foundName = norm;
          }
        } else if (FIXED_HOLIDAYS_ARABIC[cMd] && cMd !== '01-07') {
          foundName = FIXED_HOLIDAYS_ARABIC[cMd];
        } else if (MOVABLE_HOLIDAYS_ARABIC[cDateStr]) {
          const m = MOVABLE_HOLIDAYS_ARABIC[cDateStr];
          if (m.includes('الهجرية') || m.includes('النبوي')) {
            foundName = m;
          }
        }

        if (foundName && isShiftableEgyptianHoliday(foundName)) {
          return {
            type: 'actual_day_off',
            name: `${foundName} (مرحّلة بقرار مجلس الوزراء)`,
            badgeText: `عطلة رسمية بمصر: ${foundName} (مرحّلة بقرار مجلس الوزراء)`
          };
        }
      }
    }
  }

  // 4. Weekend holidays (Friday or Saturday) -> RED
  if (dayOfWeek === 5 || dayOfWeek === 6) {
    if (directHolidayName) {
      return {
        type: 'actual_day_off',
        name: directHolidayName,
        badgeText: `عطلة رسمية بمصر: ${directHolidayName}`
      };
    }
  }

  // 5. Social & Religious Observances (e.g. Ramadan start, Mother's Day, Laylat al-Qadr) -> BLUE (Working day in courts)
  if (gEvent) {
    const norm = normalizeHolidayNameToArabic(gEvent, dateStr);
    if (!isOfficialEgyptianHoliday(norm) && !isShiftableEgyptianHoliday(norm)) {
      return {
        type: 'observance',
        name: norm,
        badgeText: `مناسبة: ${norm} • (يوم عمل طبيعي بالمحاكم)`
      };
    }
  }

  return null;
}

// Backward-compatible wrappers
function getEgyptianHoliday(dateStr) {
  const status = getHolidayStatus(dateStr);
  return status && status.type === 'actual_day_off' ? status.name : null;
}

function getOriginalHolidayShiftNotice(dateStr) {
  const status = getHolidayStatus(dateStr);
  return status && status.type === 'original_work_day' ? status : null;
}

// Datalist Comboboxes default choices (customizable in settings)
const DEFAULT_LAWSUIT_TYPES = ['استئناف', 'قضاء إداري', 'مدني', 'جنح'];
const DEFAULT_PROCEDURE_TYPES = ['معاينة ميدانية', 'جلسة مناقشة خصوم', 'دراسة ملف وفحص مستندات', 'إيداع / تسليم التقرير', 'جلسة استكمال مناقشة', 'معاينة تكميلية'];
const DEFAULT_APPOINTMENT_TYPES = [
  'اجتماع عمل',
  'مهمة إدارية ومكتبية',
  'موعد خارجي',
  'موعد شخصي'
];

// Helper to get current year in Arabic/Eastern digits (e.g. ٢٠٢٦)
function getCurrentYearArabic() {
  const currentYear = new Date().getFullYear();
  return String(currentYear).replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
}

// In-memory options list for custom autocompletes
const customAutocompleteData = {
  caseType: [],
  court: [],
  procedureType: [],
  appointmentType: []
};

function setupCustomAutocomplete(inputId, dropdownId, dataKey) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  if (!input || !dropdown) return;

  const wrapper = input.closest('.custom-autocomplete-wrapper');

  function updatePosition() {
    const inputRect = input.getBoundingClientRect();
    // Get viewport height considering virtual keyboard via visualViewport if available
    const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const spaceBelow = viewportHeight - inputRect.bottom;
    const spaceAbove = inputRect.top;

    // If space below is less than 210px and space above is greater, open upward
    if (spaceBelow < 210 && spaceAbove > spaceBelow) {
      dropdown.classList.add('open-upward');
      const maxH = Math.min(220, Math.max(120, spaceAbove - 20));
      dropdown.style.maxHeight = `${maxH}px`;
    } else {
      dropdown.classList.remove('open-upward');
      const maxH = Math.min(220, Math.max(120, spaceBelow - 20));
      dropdown.style.maxHeight = `${maxH}px`;
    }
  }

  function renderList(query = '') {
    const list = customAutocompleteData[dataKey] || [];
    const trimmed = query.trim().toLowerCase();
    const filtered = trimmed
      ? list.filter(item => item.toLowerCase().includes(trimmed))
      : list;

    dropdown.innerHTML = '';

    if (filtered.length === 0) {
      if (trimmed) {
        const emptyEl = document.createElement('div');
        emptyEl.className = 'custom-autocomplete-empty';
        emptyEl.textContent = 'لا توجد مقترحات مطابقة (سيتم حفظ ما تكتبه)';
        dropdown.appendChild(emptyEl);
        updatePosition();
        dropdown.classList.add('show');
        if (wrapper) wrapper.classList.add('is-open');
      } else {
        dropdown.classList.remove('show');
        if (wrapper) wrapper.classList.remove('is-open');
      }
      return;
    }

    filtered.forEach(item => {
      const itemEl = document.createElement('div');
      itemEl.className = 'custom-autocomplete-item';

      if (trimmed) {
        // Highlight matching portion
        const idx = item.toLowerCase().indexOf(trimmed);
        if (idx !== -1) {
          const before = item.substring(0, idx);
          const match = item.substring(idx, idx + trimmed.length);
          const after = item.substring(idx + trimmed.length);
          itemEl.innerHTML = `${before}<span class="match-highlight">${match}</span>${after}`;
        } else {
          itemEl.textContent = item;
        }
      } else {
        itemEl.textContent = item;
      }

      // Use pointerdown/mousedown so it fires before input blur
      itemEl.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        input.value = item;
        closeAllAutocompletes();
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });

      dropdown.appendChild(itemEl);
    });

    updatePosition();
    dropdown.classList.add('show');
    if (wrapper) wrapper.classList.add('is-open');
  }

  // Open & filter on focus / click with smooth scroll into view
  input.addEventListener('focus', () => {
    closeAllAutocompletes(dropdown);
    renderList(input.value);
    // Smoothly ensure input is nicely visible when keyboard pops up
    setTimeout(() => {
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      updatePosition();
    }, 280);
  });

  input.addEventListener('click', () => {
    if (!dropdown.classList.contains('show')) {
      closeAllAutocompletes(dropdown);
      renderList(input.value);
    }
  });

  // Filter on input typing
  input.addEventListener('input', () => {
    renderList(input.value);
  });

  // Reposition on viewport resize (virtual keyboard toggles) or scroll
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      if (dropdown.classList.contains('show')) updatePosition();
    });
  }

  // Toggle when clicking the arrow if present
  if (wrapper) {
    const arrow = wrapper.querySelector('.custom-autocomplete-arrow');
    if (arrow) {
      arrow.addEventListener('click', (e) => {
        e.stopPropagation();
        if (dropdown.classList.contains('show')) {
          dropdown.classList.remove('show');
          wrapper.classList.remove('is-open');
        } else {
          input.focus();
          closeAllAutocompletes(dropdown);
          renderList(input.value);
        }
      });
    }
  }
}

function closeAllAutocompletes(exceptDropdown = null) {
  document.querySelectorAll('.custom-autocomplete-list').forEach(dd => {
    if (dd !== exceptDropdown) {
      dd.classList.remove('show');
      const w = dd.closest('.custom-autocomplete-wrapper');
      if (w) w.classList.remove('is-open');
    }
  });
}

// Global click outside listener to close custom dropdowns
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('.custom-autocomplete-wrapper')) {
    closeAllAutocompletes();
  }
});

function initCustomAutocompletes() {
  setupCustomAutocomplete('caseType', 'caseTypeListDropdown', 'caseType');
  setupCustomAutocomplete('court', 'courtListDropdown', 'court');
  setupCustomAutocomplete('procedureType', 'procedureTypeListDropdown', 'procedureType');
  setupCustomAutocomplete('appointmentType', 'appointmentTypeListDropdown', 'appointmentType');
}

function updateDatalists() {
  const lawsuitVal = localStorage.getItem('lawsuitTypes') || '';
  const procedureVal = localStorage.getItem('procedureTypes') || '';
  const appointmentVal = localStorage.getItem('appointmentTypes') || '';

  const lawsuitList = lawsuitVal.split(',').map(s => s.trim()).filter(Boolean);
  const procedureList = procedureVal.split(',').map(s => s.trim()).filter(Boolean);
  const appointmentList = appointmentVal.split(',').map(s => s.trim()).filter(Boolean);

  // Collect all unique courts previously entered in cases/missions
  const courtsFromCases = (state.allCases || [])
    .filter(c => c.entryType === 'case' || !c.entryType)
    .map(c => c.court && c.court.trim())
    .filter(Boolean);

  // Also get saved courts from localStorage
  const savedCourtVal = localStorage.getItem('courtList') || '';
  const savedCourts = savedCourtVal.split(',').map(s => s.trim()).filter(Boolean);

  // Merge and deduplicate
  const allCourts = [...new Set([...courtsFromCases, ...savedCourts])];

  // If new courts were found in cases that aren't yet in localStorage, persist them
  if (courtsFromCases.length > 0 && allCourts.length !== savedCourts.length) {
    localStorage.setItem('courtList', allCourts.join(', '));
  }

  // Update in-memory data for custom dropdowns
  customAutocompleteData.caseType = lawsuitList;
  customAutocompleteData.procedureType = procedureList;
  customAutocompleteData.appointmentType = appointmentList;
  customAutocompleteData.court = allCourts;

  // Keep compatibility with legacy datalist if still present
  const lawsuitDatalist = document.getElementById('caseTypeList');
  const procedureDatalist = document.getElementById('procedureTypeList');
  const appointmentDatalist = document.getElementById('appointmentTypeList');
  const courtDatalist = document.getElementById('courtList');

  if (lawsuitDatalist) {
    lawsuitDatalist.innerHTML = '';
    lawsuitList.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item;
      lawsuitDatalist.appendChild(opt);
    });
  }

  if (procedureDatalist) {
    procedureDatalist.innerHTML = '';
    procedureList.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item;
      procedureDatalist.appendChild(opt);
    });
  }

  if (appointmentDatalist) {
    appointmentDatalist.innerHTML = '';
    appointmentList.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item;
      appointmentDatalist.appendChild(opt);
    });
  }

  if (courtDatalist) {
    courtDatalist.innerHTML = '';
    allCourts.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item;
      courtDatalist.appendChild(opt);
    });
  }

  const courtTextarea = document.getElementById('settingsCourtList');
  if (courtTextarea && document.activeElement !== courtTextarea) {
    courtTextarea.value = allCourts.join(', ');
  }
}


// ==========================================
// 2. INTERACTIVE CALENDAR CONTROLLER
// ==========================================
const calendar = {
  monthsAr: [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ],

  init() {
    state.selectedDateStr = this.formatDateStr(state.currentDate);
    this.render();

    // Bind navigation buttons
    document.getElementById('prevMonth').addEventListener('click', () => this.changeMonth(-1));
    document.getElementById('nextMonth').addEventListener('click', () => this.changeMonth(1));

    // Bind swipe gestures (touch on mobile & drag on desktop)
    this.bindSwipeNavigation();
  },

  // Helper to format date as YYYY-MM-DD locally without timezone shift
  formatDateStr(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  changeMonth(direction) {
    state.currentDate.setMonth(state.currentDate.getMonth() + direction);
    this.render();
  },

  bindSwipeNavigation() {
    const calendarCard = document.querySelector('.calendar-card');
    if (!calendarCard) return;

    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;
    let isTracking = false;
    let suppressClick = false;

    const minSwipeDistance = 45; // Minimum horizontal px to register a swipe
    const maxPerpendicularDistance = 80; // Max vertical deviation

    // Prevent day selection if a swipe/drag just occurred
    calendarCard.addEventListener('click', (e) => {
      if (suppressClick) {
        e.stopPropagation();
        e.preventDefault();
        suppressClick = false;
      }
    }, true);

    const onStart = (clientX, clientY) => {
      startX = clientX;
      startY = clientY;
      currentX = clientX;
      currentY = clientY;
      isTracking = true;
    };

    const onMove = (clientX, clientY) => {
      if (!isTracking) return;
      currentX = clientX;
      currentY = clientY;
    };

    const onEnd = () => {
      if (!isTracking) return;
      isTracking = false;

      const diffX = currentX - startX;
      const diffY = currentY - startY;

      // Check if gesture is primarily horizontal and exceeds threshold
      if (Math.abs(diffX) >= minSwipeDistance &&
        Math.abs(diffY) <= maxPerpendicularDistance &&
        Math.abs(diffX) > Math.abs(diffY) * 1.2) {

        // Suppress accidental day-cell clicks following a swipe
        suppressClick = true;
        setTimeout(() => { suppressClick = false; }, 300);

        if (diffX < 0) {
          // Swiped Left (finger moved right to left) -> Next Month (فوري بدون أنيميشن)
          this.changeMonth(1);
        } else {
          // Swiped Right (finger moved left to right) -> Previous Month (فوري بدون أنيميشن)
          this.changeMonth(-1);
        }
      }
    };

    // Touch Event Listeners for Mobile (Android WebView & iOS)
    calendarCard.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        onStart(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    calendarCard.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) {
        onMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    calendarCard.addEventListener('touchend', () => {
      onEnd();
    }, { passive: true });

    calendarCard.addEventListener('touchcancel', () => {
      isTracking = false;
    }, { passive: true });

    // Mouse Drag Listeners for Desktop / Browser Testing
    let isMouseDown = false;
    calendarCard.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('.nav-arrow')) return;
      isMouseDown = true;
      onStart(e.clientX, e.clientY);
    });

    window.addEventListener('mousemove', (e) => {
      if (!isMouseDown) return;
      onMove(e.clientX, e.clientY);
    });

    window.addEventListener('mouseup', () => {
      if (!isMouseDown) return;
      isMouseDown = false;
      onEnd();
    });
  },

  async render() {
    const calendarMonthYear = document.getElementById('calendarMonthYear');
    const calendarDays = document.getElementById('calendarDays');

    const year = state.currentDate.getFullYear();
    const month = state.currentDate.getMonth(); // 0-indexed

    calendarMonthYear.textContent = `${this.monthsAr[month]} ${year}`;
    calendarDays.innerHTML = '';

    // Get first day of month aligned with week starting Saturday (0 = Saturday, 1 = Sunday, ..., 6 = Friday)
    const firstDayIndex = (new Date(year, month, 1).getDay() + 1) % 7;
    // Get last date of current month
    const totalDays = new Date(year, month + 1, 0).getDate();
    // Get last date of previous month
    const prevTotalDays = new Date(year, month, 0).getDate();

    // Fetch all cases in the background to set event dots
    state.allCases = await state.db.getAllCases();
    updateDatalists();
    const eventDates = new Set(state.allCases.map(c => c.dateOnly));

    // Today's formatted date string for highlight
    const todayStr = this.formatDateStr(new Date());

    // 1. Previous Month Overflow days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = prevTotalDays - i;
      const prevMonthDate = new Date(year, month - 1, dayNum);
      const prevDateStr = this.formatDateStr(prevMonthDate);

      const dayCell = this.createDayCell(dayNum, prevDateStr, true, eventDates.has(prevDateStr), todayStr);
      calendarDays.appendChild(dayCell);
    }

    // 2. Current Month days
    for (let dayNum = 1; dayNum <= totalDays; dayNum++) {
      const currMonthDate = new Date(year, month, dayNum);
      const currDateStr = this.formatDateStr(currMonthDate);

      const dayCell = this.createDayCell(dayNum, currDateStr, false, eventDates.has(currDateStr), todayStr);
      calendarDays.appendChild(dayCell);
    }

    // 3. Next Month Overflow days
    const totalCellsFilled = firstDayIndex + totalDays;
    const remainingCells = (7 - (totalCellsFilled % 7)) % 7;
    for (let dayNum = 1; dayNum <= remainingCells; dayNum++) {
      const nextMonthDate = new Date(year, month + 1, dayNum);
      const nextDateStr = this.formatDateStr(nextMonthDate);

      const dayCell = this.createDayCell(dayNum, nextDateStr, true, eventDates.has(nextDateStr), todayStr);
      calendarDays.appendChild(dayCell);
    }

    // Refresh cases list under the calendar
    loadDailyAgenda();
  },

  createDayCell(dayNum, dateStr, isOtherMonth, hasEvent, todayStr) {
    const cell = document.createElement('div');
    cell.classList.add('day-cell');
    cell.textContent = dayNum;
    cell.dataset.date = dateStr;

    if (isOtherMonth) cell.classList.add('other-month');
    if (dateStr === todayStr) cell.classList.add('today');
    if (dateStr === state.selectedDateStr) cell.classList.add('selected');
    if (hasEvent) cell.classList.add('has-event');

    // Check for Egyptian Public Holiday (Original Green vs Shifted Red vs Social Observance Blue)
    const holidayInfo = getHolidayStatus(dateStr);
    if (holidayInfo) {
      if (holidayInfo.type === 'actual_day_off') {
        cell.classList.add('holiday'); // RED
        cell.title = holidayInfo.badgeText;
      } else if (holidayInfo.type === 'original_work_day') {
        cell.classList.add('holiday-original'); // GREEN
        cell.title = holidayInfo.badgeText;
      } else if (holidayInfo.type === 'observance') {
        cell.classList.add('holiday-observance'); // BLUE
        cell.title = holidayInfo.badgeText;
      }
    }

    // Add Click listener
    cell.addEventListener('click', () => {
      // Remove previous selected class
      const activeCell = document.querySelector('.day-cell.selected');
      if (activeCell) activeCell.classList.remove('selected');

      cell.classList.add('selected');
      state.selectedDateStr = dateStr;

      // Update agenda title date formatted in Arabic
      updateAgendaTitle(dateStr);
      loadDailyAgenda();
    });

    return cell;
  }
};

// Update date header for the Agenda section
function updateAgendaTitle(dateStr) {
  const agendaDateTitle = document.getElementById('agendaDateTitle');
  const d = parseLocalDate(dateStr);

  // Format options: "الخميس، ٢ يوليو ٢٠٢٦"
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const formatted = new Intl.DateTimeFormat('ar-EG', options).format(d);
  agendaDateTitle.textContent = `جدول أعمال: ${formatted}`;
}

// ==========================================
// 3. CASE CRUD OPERATIONS & VIEWS
// ==========================================

// Load and display cases and appointments for the selected date
async function loadDailyAgenda() {
  const caseList = document.getElementById('caseList');
  const caseCount = document.getElementById('caseCount');

  try {
    state.casesList = await state.db.getCasesByDate(state.selectedDateStr);

    // Counts breakdown
    const totalCount = state.casesList.length;
    const caseItems = state.casesList.filter(c => (c.entryType || 'case') === 'case');
    const appointmentItems = state.casesList.filter(c => c.entryType === 'appointment');

    const countCases = caseItems.length;
    const countAppts = appointmentItems.length;

    // Update filter counts
    const fAll = document.getElementById('filterCountAll');
    const fCases = document.getElementById('filterCountCases');
    const fAppts = document.getElementById('filterCountAppts');
    if (fAll) fAll.textContent = totalCount;
    if (fCases) fCases.textContent = countCases;
    if (fAppts) fAppts.textContent = countAppts;

    // Smart Arabic title count
    if (countCases > 0 && countAppts > 0) {
      caseCount.textContent = `${countCases} مأمورية + ${countAppts} موعد`;
    } else if (countAppts > 0) {
      caseCount.textContent = `${countAppts} مواعيد أخرى`;
    } else {
      caseCount.textContent = `${countCases} مأموريات`;
    }

    // Check for Egyptian Public Holiday (Original Green vs Shifted Red)
    const holidayInfo = getHolidayStatus(state.selectedDateStr);
    let holidayBannerHtml = '';
    if (holidayInfo) {
      if (holidayInfo.type === 'actual_day_off') {
        holidayBannerHtml = `
          <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); color: #f87171; padding: 12px; border-radius: 16px; font-size: 0.82rem; text-align: center; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 12px; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.05);">
            <i class="fa-solid fa-umbrella-beach" style="color: #ef4444; font-size: 1rem;"></i>
            <span>${holidayInfo.badgeText}</span>
          </div>
        `;
      } else if (holidayInfo.type === 'original_work_day') {
        holidayBannerHtml = `
          <div style="background: rgba(34, 197, 94, 0.08); border: 1px solid rgba(34, 197, 94, 0.25); color: #4ade80; padding: 12px 14px; border-radius: 16px; font-size: 0.82rem; text-align: center; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 12px; box-shadow: 0 4px 12px rgba(34, 197, 94, 0.05);">
            <i class="fa-solid fa-flag" style="color: #22c55e; font-size: 1rem;"></i>
            <span>${holidayInfo.badgeText}</span>
          </div>
        `;
      } else if (holidayInfo.type === 'observance') {
        holidayBannerHtml = `
          <div style="background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.25); color: #38bdf8; padding: 12px 14px; border-radius: 16px; font-size: 0.82rem; text-align: center; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 12px; box-shadow: 0 4px 12px rgba(56, 189, 248, 0.05);">
            <i class="fa-solid fa-moon" style="color: #38bdf8; font-size: 1rem;"></i>
            <span>${holidayInfo.badgeText}</span>
          </div>
        `;
      }
    }

    // Filter items based on active tab
    const filteredItems = state.casesList.filter(item => {
      const isAppt = item.entryType === 'appointment';
      if (state.currentFilter === 'case') return !isAppt;
      if (state.currentFilter === 'appointment') return isAppt;
      return true;
    });

    if (filteredItems.length === 0) {
      let emptyMsg = 'لا توجد مأموريات أو مواعيد أو جلسات خبراء مجدولة لهذا اليوم.';
      if (state.currentFilter === 'case' && countAppts > 0) {
        emptyMsg = 'لا توجد مأموريات قضائية لهذا اليوم (توجد مواعيد عامة في التبويب الآخر).';
      } else if (state.currentFilter === 'appointment' && countCases > 0) {
        emptyMsg = 'لا توجد مواعيد عامة لهذا اليوم (توجد مأموريات قضائية في تبويب المأموريات).';
      }

      caseList.innerHTML = holidayBannerHtml + `
        <div class="empty-state">
          <i class="fa-solid fa-calendar-check"></i>
          <p>${emptyMsg}</p>
        </div>
      `;
      return;
    }

    caseList.innerHTML = holidayBannerHtml;
    filteredItems.forEach((c) => {
      const timeStr = formatArabicTime(c.dateTime);
      const isAppointment = c.entryType === 'appointment';

      const card = document.createElement('div');
      card.setAttribute('data-id', c.id);

      if (isAppointment) {
        // Render Appointment Card
        card.className = 'case-card appointment-card';
        card.innerHTML = `
          <div class="case-header">
            <div class="case-num-title" style="color: #38bdf8;">
              <i class="fa-solid fa-calendar-check" style="margin-left: 5px; color: #38bdf8;"></i>
              <span>${escapeHtml(c.title)}</span>
            </div>
            <span class="appointment-type-badge">${escapeHtml(c.appointmentType || 'موعد عام')}</span>
          </div>
          
          <div class="case-details-grid">
            ${c.location ? `
              <div class="detail-item">
                <i class="fa-solid fa-location-dot" style="color: #38bdf8;"></i>
                <span>${escapeHtml(c.location)}</span>
              </div>
            ` : ''}
            ${c.notes ? `
              <div class="detail-item procedure-detail" style="border-right: 2.5px solid #38bdf8;">
                <i class="fa-solid fa-note-sticky" style="color: #38bdf8;"></i>
                <span>${escapeHtml(c.notes)}</span>
              </div>
            ` : ''}
          </div>
          
          <div class="case-footer">
            <div class="case-time" style="background: rgba(56, 189, 248, 0.1); color: #38bdf8;">
              <i class="fa-regular fa-clock"></i>
              <span>${timeStr}</span>
            </div>
            
            <div class="case-actions">
              <button class="card-action-btn edit" data-id="${c.id}" title="تعديل">
                <i class="fa-solid fa-pen"></i>
              </button>
              <button class="card-action-btn delete" data-id="${c.id}" title="حذف">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          </div>
        `;
      } else {
        // Render Court Mission / Case Card
        const cardClass = getCaseCardClass(c.caseType);
        const pType = c.procedureType || 'إجراء مطلوب';
        const pDetails = c.procedureDetails || c.procedure || '';

        card.className = `case-card ${cardClass}`;
        card.innerHTML = `
          <div class="case-header">
            <div class="case-num-title">
              <i class="fa-solid fa-folder-open" style="margin-left: 5px;"></i>
              ملف رقم: <span>${escapeHtml(c.caseNumber)}</span> / <span>${escapeHtml(c.caseYear)}</span>
            </div>
            <span class="case-type-badge">${escapeHtml(c.caseType || '')}</span>
          </div>
          
          <div class="case-details-grid">
            <div class="detail-item">
              <i class="fa-solid fa-landmark"></i>
              <span>${escapeHtml(c.court)}</span>
            </div>
            <div class="detail-item procedure-detail">
              <i class="fa-solid fa-list-check"></i>
              <span>
                <b>${escapeHtml(pType)}</b>
                ${pDetails ? `<div style="font-size:0.75rem; color:var(--text-secondary); margin-top:2px; line-height:1.3;">${escapeHtml(pDetails)}</div>` : ''}
              </span>
            </div>
          </div>
          
          <div class="case-footer">
            <div class="case-time">
              <i class="fa-regular fa-clock"></i>
              <span>${timeStr}</span>
            </div>
            
            <div class="case-actions">
              <button class="card-action-btn edit" data-id="${c.id}" title="تعديل">
                <i class="fa-solid fa-pen"></i>
              </button>
              <button class="card-action-btn delete" data-id="${c.id}" title="حذف">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          </div>
        `;
      }

      // Tap on card body opens details view
      card.addEventListener('click', (e) => {
        if (e.target.closest('.card-action-btn')) return;
        showViewModal(c);
      });

      // Bind action buttons
      card.querySelector('.card-action-btn.edit').addEventListener('click', () => showAddEditModal(c.id));
      card.querySelector('.card-action-btn.delete').addEventListener('click', () => confirmDeleteCase(c.id));

      caseList.appendChild(card);
    });
  } catch (error) {
    console.error('Error loading agenda:', error);
  }
}

// Class prefix matching case types for card accents
function getCaseCardClass(type) {
  if (!type) return 'type-other';

  if (type.includes('مدني')) return 'type-civil'; // Blue border
  if (type.includes('تجاري') || type.includes('إفلاس') || type.includes('مالي')) return 'type-civil';
  if (type.includes('عمالي') || type.includes('ضرائب')) return 'type-criminal'; // Red border
  if (type.includes('تعويضات') || type.includes('إيجارات') || type.includes('زراعي')) return 'type-administrative'; // Gold border
  return 'type-other'; // Grey border
}

// Convert 24hr format time into a readable Arabic format (AM/PM)
function formatArabicTime(dateTimeStr) {
  const d = new Date(dateTimeStr);
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'مساءً' : 'صباحاً';
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 should be 12
  return `${hours}:${minutes} ${ampm}`;
}

let pendingDeleteId = null;

// Confirm and Delete Item via Custom Modal
function confirmDeleteCase(id) {
  pendingDeleteId = id;
  const confirmModalOverlay = document.getElementById('confirmModalOverlay');
  if (confirmModalOverlay) {
    confirmModalOverlay.classList.add('active');
  }
}

// Form Handlers
const caseModalOverlay = document.getElementById('caseModalOverlay');
const caseForm = document.getElementById('caseForm');

// Switch between Case and Appointment in Add/Edit modal
function setEntryType(type) {
  const entryTypeInput = document.getElementById('entryType');
  const tabCase = document.getElementById('tabCase');
  const tabAppointment = document.getElementById('tabAppointment');
  const caseFieldsGroup = document.getElementById('caseFieldsGroup');
  const appointmentFieldsGroup = document.getElementById('appointmentFieldsGroup');
  const dateTimeLabel = document.getElementById('dateTimeLabel');
  const modalTitle = document.getElementById('modalTitle');
  const isEditing = Boolean(document.getElementById('caseId').value);

  entryTypeInput.value = type;

  if (type === 'case') {
    tabCase.classList.add('active');
    tabAppointment.classList.remove('active');
    caseFieldsGroup.style.display = 'block';
    appointmentFieldsGroup.style.display = 'none';
    dateTimeLabel.textContent = 'تاريخ ووقت الإجراء (جلسة/معاينة) *';
    modalTitle.textContent = isEditing ? 'تعديل بيانات المأمورية' : 'تسجيل مأمورية قضائية جديدة';

    // Required fields for case
    document.getElementById('caseNumber').required = true;
    document.getElementById('caseYear').required = true;
    document.getElementById('caseType').required = true;
    document.getElementById('court').required = true;
    document.getElementById('procedureType').required = true;

    // Optional/disabled requirements for appointment
    document.getElementById('appointmentTitle').required = false;
    document.getElementById('appointmentType').required = false;
  } else {
    tabAppointment.classList.add('active');
    tabCase.classList.remove('active');
    caseFieldsGroup.style.display = 'none';
    appointmentFieldsGroup.style.display = 'block';
    dateTimeLabel.textContent = 'تاريخ ووقت الموعد *';
    modalTitle.textContent = isEditing ? 'تعديل بيانات الموعد' : 'تسجيل موعد جديد';

    // Optional/disabled requirements for case
    document.getElementById('caseNumber').required = false;
    document.getElementById('caseYear').required = false;
    document.getElementById('caseType').required = false;
    document.getElementById('court').required = false;
    document.getElementById('procedureType').required = false;

    // Required fields for appointment
    document.getElementById('appointmentTitle').required = true;
    document.getElementById('appointmentType').required = true;
  }
}

// ==========================================
// SCROLL & MODAL NAVIGATION HELPERS
// ==========================================
function resetScrollLocks() {
  try {
    document.body.style.overflow = '';
  } catch (e) { }
}

function closeTopmostModal() {
  const confirmModal = document.getElementById('confirmModalOverlay');
  if (confirmModal && confirmModal.classList.contains('active')) {
    confirmModal.classList.remove('active');
    pendingDeleteId = null;
    document.body.style.overflow = '';
    return true;
  }

  const caseModal = document.getElementById('caseModalOverlay');
  if (caseModal && caseModal.classList.contains('active')) {
    hideAddEditModal();
    return true;
  }

  const viewModal = document.getElementById('viewModalOverlay');
  if (viewModal && viewModal.classList.contains('active')) {
    hideViewModal();
    return true;
  }

  const searchModal = document.getElementById('searchModalOverlay');
  if (searchModal && searchModal.classList.contains('active')) {
    if (typeof searchController !== 'undefined' && searchController.hide) {
      searchController.hide();
    } else {
      searchModal.classList.remove('active');
    }
    document.body.style.overflow = '';
    return true;
  }

  const printModal = document.getElementById('printModalOverlay');
  if (printModal && printModal.classList.contains('active')) {
    if (typeof printManager !== 'undefined' && printManager.hide) {
      printManager.hide();
    } else {
      printModal.classList.remove('active');
    }
    document.body.style.overflow = '';
    return true;
  }

  const appInfoModal = document.getElementById('appInfoModalOverlay');
  if (appInfoModal && appInfoModal.classList.contains('active')) {
    hideAppInfoModal();
    return true;
  }

  const settingsPanel = document.getElementById('settingsPanel');
  const notifPanel = document.getElementById('notifPanel');
  if ((settingsPanel && settingsPanel.classList.contains('active')) ||
    (notifPanel && notifPanel.classList.contains('active'))) {
    if (typeof reminderSystem !== 'undefined' && reminderSystem.closeAllSidebars) {
      reminderSystem.closeAllSidebars();
    }
    document.body.style.overflow = '';
    return true;
  }

  document.body.style.overflow = '';
  return false;
}

window.handleAppBackButton = function () {
  return closeTopmostModal();
};

let isHandlingPopState = false;

function pushModalState(name) {
  try {
    history.pushState({ modalOpen: true, modalName: name }, '');
    document.body.style.overflow = 'hidden';
  } catch (e) { }
}

window.addEventListener('popstate', (e) => {
  if (isHandlingPopState) return;
  isHandlingPopState = true;
  closeTopmostModal();
  setTimeout(() => { isHandlingPopState = false; }, 60);
});

// Show form modal for adding or editing
async function showAddEditModal(caseId = null) {
  caseForm.reset();
  updateDatalists();

  const modalTitleEl = document.querySelector('#caseModalOverlay .modal-title span');

  if (caseId) {
    if (modalTitleEl) modalTitleEl.textContent = 'تعديل بيانات مأمورية / موعد';
    // Editing existing item
    const matched = state.allCases.find(c => c.id === Number(caseId));
    if (matched) {
      document.getElementById('caseId').value = matched.id;
      document.getElementById('dateTime').value = matched.dateTime;

      const type = matched.entryType || 'case';
      setEntryType(type);

      if (type === 'case') {
        document.getElementById('caseNumber').value = matched.caseNumber || '';
        document.getElementById('caseYear').value = matched.caseYear || '';
        document.getElementById('court').value = matched.court || '';
        document.getElementById('caseType').value = matched.caseType || '';
        document.getElementById('procedureType').value = matched.procedureType || '';
        document.getElementById('procedureDetails').value = matched.procedureDetails || matched.procedure || '';
      } else {
        document.getElementById('appointmentTitle').value = matched.title || '';
        document.getElementById('appointmentType').value = matched.appointmentType || '';
        document.getElementById('appointmentLocation').value = matched.location || '';
        document.getElementById('appointmentNotes').value = matched.notes || '';
      }
    }
  } else {
    if (modalTitleEl) modalTitleEl.textContent = 'إضافة مأمورية أو موعد جديد';
    // Creating new item
    document.getElementById('caseId').value = '';
    // Preset entry type based on active filter if relevant, otherwise default to case
    const defaultType = state.currentFilter === 'appointment' ? 'appointment' : 'case';
    setEntryType(defaultType);

    // Preset current date
    const selectedDateTimeStr = `${state.selectedDateStr}T09:00`;
    document.getElementById('dateTime').value = selectedDateTimeStr;
    const caseYearInput = document.getElementById('caseYear');
    if (caseYearInput) {
      caseYearInput.value = getCurrentYearArabic();
    }
  }

  resetScrollLocks();
  const sheet = caseModalOverlay.querySelector('.modal-sheet');
  if (sheet) sheet.scrollTop = 0;

  caseModalOverlay.classList.add('active');
  pushModalState('addEdit');
}

function hideAddEditModal() {
  caseModalOverlay.classList.remove('active');
  document.body.style.overflow = '';
}

// Submit Form Action
caseForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const id = document.getElementById('caseId').value;
  const entryType = document.getElementById('entryType').value || 'case';
  const dateTime = document.getElementById('dateTime').value; // YYYY-MM-DDTHH:MM
  const dateOnly = dateTime.split('T')[0];

  let recordObj = {
    entryType,
    dateTime,
    dateOnly,
    notified: false
  };

  if (entryType === 'case') {
    const caseNumber = document.getElementById('caseNumber').value.trim();
    const caseYear = document.getElementById('caseYear').value.trim();
    const caseType = document.getElementById('caseType').value.trim();
    const court = document.getElementById('court').value.trim();
    const procedureType = document.getElementById('procedureType').value.trim();
    const procedureDetails = document.getElementById('procedureDetails').value.trim();

    recordObj = {
      ...recordObj,
      caseNumber,
      caseYear,
      caseType,
      court,
      procedureType,
      procedureDetails,
      procedure: procedureDetails // backwards compatibility
    };

    if (court) {
      const currentCourts = (localStorage.getItem('courtList') || '').split(',').map(s => s.trim()).filter(Boolean);
      if (!currentCourts.includes(court)) {
        currentCourts.push(court);
        localStorage.setItem('courtList', currentCourts.join(', '));
      }
    }
  } else {
    const title = document.getElementById('appointmentTitle').value.trim();
    const appointmentType = document.getElementById('appointmentType').value.trim();
    const location = document.getElementById('appointmentLocation').value.trim();
    const notes = document.getElementById('appointmentNotes').value.trim();

    recordObj = {
      ...recordObj,
      title,
      appointmentType,
      location,
      notes
    };
  }

  if (id) {
    recordObj.id = Number(id);
    // Preserving notified status if datetime has not changed
    const original = state.allCases.find(c => c.id === Number(id));
    if (original && original.dateTime === dateTime) {
      recordObj.notified = original.notified;
    }
    await state.db.updateCase(recordObj);
  } else {
    await state.db.addCase(recordObj);
  }

  hideAddEditModal();
  calendar.render();
  syncNativeReminders();
});

// View Details Modal Handlers
const viewModalOverlay = document.getElementById('viewModalOverlay');
let activeViewingCase = null;

function showViewModal(itemObj) {
  activeViewingCase = itemObj;

  const isAppt = itemObj.entryType === 'appointment';
  const titleEl = document.getElementById('viewModalTitle');
  const caseContainer = document.getElementById('viewCaseContainer');
  const apptContainer = document.getElementById('viewAppointmentContainer');
  const followUpBtnText = document.getElementById('viewFollowUpBtnText');

  if (followUpBtnText) {
    followUpBtnText.textContent = isAppt
      ? 'موعد جديد'
      : 'موعد / إجراء جديد';
  }

  const d = new Date(itemObj.dateTime);
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
  const formattedDateTime = new Intl.DateTimeFormat('ar-EG', options).format(d);

  if (isAppt) {
    // Show appointment details
    titleEl.style.color = '#38bdf8';
    titleEl.innerHTML = '<i class="fa-solid fa-calendar-check" style="color: #38bdf8;"></i> <span>تفاصيل الموعد</span>';

    caseContainer.style.display = 'none';
    apptContainer.style.display = 'flex';

    document.getElementById('viewApptTitle').textContent = itemObj.title || '---';
    document.getElementById('viewApptType').textContent = itemObj.appointmentType || 'موعد عام';
    document.getElementById('viewApptDateTime').textContent = formattedDateTime;
    document.getElementById('viewApptLocation').textContent = itemObj.location || 'غير محدد';
    document.getElementById('viewApptNotes').textContent = itemObj.notes || 'لا توجد ملاحظات مسجلة';
  } else {
    // Show case details
    titleEl.style.color = 'var(--accent-gold)';
    titleEl.innerHTML = '<i class="fa-solid fa-scale-unbalanced-flip" style="color: var(--accent-gold);"></i> <span>تفاصيل مأمورية الخبير</span>';

    apptContainer.style.display = 'none';
    caseContainer.style.display = 'flex';

    document.getElementById('viewCaseNumber').textContent = itemObj.caseNumber || '---';
    document.getElementById('viewCaseYear').textContent = itemObj.caseYear || '---';
    document.getElementById('viewCaseType').textContent = itemObj.caseType || '---';
    document.getElementById('viewCaseCourt').textContent = itemObj.court || '---';
    document.getElementById('viewProcedureType').textContent = itemObj.procedureType || 'إجراء مطلوب';
    document.getElementById('viewProcedureDetails').textContent = itemObj.procedureDetails || itemObj.procedure || 'لا توجد ملاحظات أو تفاصيل مسجلة';
    document.getElementById('viewCaseDateTime').textContent = formattedDateTime;
  }

  resetScrollLocks();
  const sheet = viewModalOverlay.querySelector('.modal-sheet');
  if (sheet) sheet.scrollTop = 0;

  viewModalOverlay.classList.add('active');
  pushModalState('view');
}

function hideViewModal() {
  viewModalOverlay.classList.remove('active');
  activeViewingCase = null;
  document.body.style.overflow = '';
}

// Duplicate existing case or appointment to schedule a new procedure without retyping
function duplicateCaseForNewProcedure(sourceItem) {
  if (!sourceItem) return;

  caseForm.reset();
  updateDatalists();

  // Set caseId to EMPTY so this will save as a BRAND NEW record, never overwriting the old one!
  document.getElementById('caseId').value = '';

  const type = sourceItem.entryType || 'case';
  setEntryType(type);

  // Default date: active selected date or today at 10:00
  const defaultDateStr = state.selectedDateStr || calendar.formatDateStr(new Date());
  document.getElementById('dateTime').value = `${defaultDateStr}T10:00`;

  const modalTitleEl = document.querySelector('#caseModalOverlay .modal-title span');

  if (type === 'case') {
    // Copy all core case info
    document.getElementById('caseNumber').value = sourceItem.caseNumber || '';
    document.getElementById('caseYear').value = sourceItem.caseYear || '';
    document.getElementById('court').value = sourceItem.court || '';
    document.getElementById('caseType').value = sourceItem.caseType || '';

    // Procedure is left blank for the expert to specify the next action
    document.getElementById('procedureType').value = '';
    document.getElementById('procedureDetails').value = '';

    if (modalTitleEl) {
      modalTitleEl.textContent = `إجراء جديد للقضية (${sourceItem.caseNumber || ''} / ${sourceItem.caseYear || ''})`;
    }
  } else {
    // Copy appointment info
    document.getElementById('appointmentTitle').value = sourceItem.title || '';
    document.getElementById('appointmentType').value = sourceItem.appointmentType || '';
    document.getElementById('appointmentLocation').value = sourceItem.location || '';
    document.getElementById('appointmentNotes').value = '';

    if (modalTitleEl) {
      modalTitleEl.textContent = `موعد جديد لنفس الموضوع: ${sourceItem.title || ''}`;
    }
  }

  resetScrollLocks();
  const sheet = caseModalOverlay.querySelector('.modal-sheet');
  if (sheet) sheet.scrollTop = 0;

  caseModalOverlay.classList.add('active');
  pushModalState('addEdit');

  // Focus appropriate field
  setTimeout(() => {
    if (type === 'case') {
      const pTypeInput = document.getElementById('procedureType');
      if (pTypeInput) pTypeInput.focus();
    } else {
      const dtInput = document.getElementById('dateTime');
      if (dtInput) dtInput.focus();
    }
  }, 350);
}

const viewFollowUpBtn = document.getElementById('viewFollowUpBtn');
if (viewFollowUpBtn) {
  viewFollowUpBtn.addEventListener('click', () => {
    if (activeViewingCase) {
      const source = activeViewingCase;
      hideViewModal();
      duplicateCaseForNewProcedure(source);
    }
  });
}

document.getElementById('viewEditBtn').addEventListener('click', () => {
  if (activeViewingCase) {
    const id = activeViewingCase.id;
    hideViewModal();
    showAddEditModal(id);
  }
});

document.getElementById('viewDeleteBtn').addEventListener('click', () => {
  if (activeViewingCase) {
    confirmDeleteCase(activeViewingCase.id);
  }
});

// Custom Confirmation Modal Bindings
document.getElementById('confirmCancelBtn').addEventListener('click', () => {
  document.getElementById('confirmModalOverlay').classList.remove('active');
  pendingDeleteId = null;
});

document.getElementById('confirmOkBtn').addEventListener('click', async () => {
  if (pendingDeleteId) {
    await state.db.deleteCase(pendingDeleteId);
    calendar.render(); // Refreshes calendar event markers and lists
    hideViewModal();
    document.getElementById('confirmModalOverlay').classList.remove('active');
    pendingDeleteId = null;
    syncNativeReminders();
  }
});


// App Info & Designer Modal Handlers
const appInfoModalOverlay = document.getElementById('appInfoModalOverlay');

function showAppInfoModal() {
  if (appInfoModalOverlay) {
    const statusEl = document.getElementById('importExportStatus');
    if (statusEl) {
      statusEl.className = 'backup-status';
      statusEl.style.display = 'none';
      statusEl.textContent = '';
    }
    resetScrollLocks();
    const sheet = appInfoModalOverlay.querySelector('.modal-sheet');
    if (sheet) sheet.scrollTop = 0;
    appInfoModalOverlay.classList.add('active');
    pushModalState('appInfo');
  }
}

function hideAppInfoModal() {
  if (appInfoModalOverlay) {
    appInfoModalOverlay.classList.remove('active');
  }
  document.body.style.overflow = '';
}

// Helper: Unique Fingerprint for Deduplication
function getRecordFingerprint(item) {
  if (!item || typeof item !== 'object') return '';
  const type = item.entryType || 'case';
  const dt = (item.dateTime || '').trim();
  if (type === 'appointment') {
    const title = (item.title || '').trim().toLowerCase();
    const appType = (item.appointmentType || '').trim().toLowerCase();
    const loc = (item.location || '').trim().toLowerCase();
    return `appointment|${title}|${appType}|${loc}|${dt}`;
  } else {
    // Legal Case / Mission
    const num = (item.caseNumber || '').trim();
    const yr = (item.caseYear || '').trim();
    const court = (item.court || '').trim().toLowerCase();
    const proc = (item.procedureType || '').trim().toLowerCase();
    return `case|${num}|${yr}|${court}|${proc}|${dt}`;
  }
}

// Helper: Build Backup Payload
async function buildBackupPayload() {
  const allCases = await state.db.getAllCases();
  const notificationHistory = JSON.parse(localStorage.getItem('notificationHistory') || '[]');
  const lawsuitTypes = localStorage.getItem('lawsuitTypes') || '';
  const procedureTypes = localStorage.getItem('procedureTypes') || '';
  const appointmentTypes = localStorage.getItem('appointmentTypes') || '';
  const notificationsEnabled = localStorage.getItem('notificationsEnabled') || 'true';
  const holidayShiftEnabled = localStorage.getItem('holidayShiftEnabled') !== 'false';
  const theme = localStorage.getItem('appTheme') || state.theme || 'dark';
  const expertProfile = localStorage.getItem('expertProfile') ? JSON.parse(localStorage.getItem('expertProfile')) : null;

  return {
    appName: 'LegalAgenda',
    company: 'LexEnginuity',
    designer: 'د. م. عمرو مصطفي حامد',
    version: 'V1.1 (LexEnginuity Edition)',
    exportedAt: new Date().toISOString(),
    totalRecordsCount: allCases.length,
    cases: allCases,
    notificationHistory: notificationHistory,
    settings: {
      lawsuitTypes,
      procedureTypes,
      appointmentTypes,
      courtList: localStorage.getItem('courtList') || '',
      notificationsEnabled,
      holidayShiftEnabled,
      theme,
      expertProfile
    }
  };
}

// Helper: Generate Standard File Name
function generateBackupFileName() {
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `legal_agenda_backup_${dateStr}.json`;
}

// Callback from Android Native when file export completes
window.onBackupExportResult = function (success, message) {
  const statusEl = document.getElementById('importExportStatus');
  if (statusEl) {
    statusEl.className = success ? 'backup-status success' : 'backup-status error';
    statusEl.textContent = message || (success ? 'تم حفظ ملف النسخة الاحتياطية بنجاح!' : 'حدث خطأ أثناء حفظ الملف.');
  }
};

// 1. Export Alerts & Case Data Functionality (Save to Device)
async function exportAlertsData() {
  const statusEl = document.getElementById('importExportStatus');
  try {
    const payload = await buildBackupPayload();
    const jsonString = JSON.stringify(payload, null, 2);
    const fileName = generateBackupFileName();

    // Check if running inside Android Native App with Storage Access Framework Bridge
    if (window.AndroidBackup && typeof window.AndroidBackup.exportBackup === 'function') {
      if (statusEl) {
        statusEl.className = 'backup-status info';
        statusEl.textContent = 'جاري فتح شاشة حفظ الملف، يرجى اختيار مكان الحفظ...';
      }
      window.AndroidBackup.exportBackup(fileName, jsonString);
      return;
    }

    // Check if running inside iOS Native App (WKWebView Bridge)
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.iosShareFile) {
      if (statusEl) {
        statusEl.className = 'backup-status info';
        statusEl.textContent = 'جاري حفظ الملف عبر نظام iOS...';
      }
      window.webkit.messageHandlers.iosShareFile.postMessage({ fileName: fileName, content: jsonString });
      return;
    }

    // Web Browser Fallback (Blob download)
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (statusEl) {
      statusEl.className = 'backup-status success';
      statusEl.textContent = `تم تصدير ${payload.totalRecordsCount} مأمورية وموعد بنجاح إلى الملف (${fileName})!`;
    }
  } catch (err) {
    console.error('Export failed:', err);
    if (statusEl) {
      statusEl.className = 'backup-status error';
      statusEl.textContent = 'حدث خطأ أثناء تصدير التنبيهات والبيانات.';
    }
  }
}

// 2. Share Backup Functionality (WhatsApp, Drive, Email, etc.)
async function shareBackupData() {
  const statusEl = document.getElementById('importExportStatus');
  try {
    const payload = await buildBackupPayload();
    const jsonString = JSON.stringify(payload, null, 2);
    const fileName = generateBackupFileName();

    // A. Android Native Bridge
    if (window.AndroidBackup && typeof window.AndroidBackup.shareBackup === 'function') {
      if (statusEl) {
        statusEl.className = 'backup-status info';
        statusEl.textContent = 'جاري فتح قائمة المشاركة (واتساب / بريد / تطبيقات أخرى)...';
      }
      window.AndroidBackup.shareBackup(fileName, jsonString);
      return;
    }

    // B. iOS Native Bridge (WKWebView messageHandler)
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.iosShareFile) {
      window.webkit.messageHandlers.iosShareFile.postMessage({ fileName: fileName, content: jsonString });
      if (statusEl) {
        statusEl.className = 'backup-status success';
        statusEl.textContent = 'تم إرسال الملف لقائمة المشاركة بنظام iOS.';
      }
      return;
    }

    // C. Web Share API (if supported on modern mobile browsers)
    if (navigator.canShare) {
      const file = new File([jsonString], fileName, { type: 'application/json' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'نسخة احتياطية - أجندة الخبير',
          text: `نسخة احتياطية من تطبيق أجندة الخبير القضائي تحتوي على ${payload.totalRecordsCount} مأمورية وموعد.`
        });
        if (statusEl) {
          statusEl.className = 'backup-status success';
          statusEl.textContent = 'تمت مشاركة النسخة الاحتياطية بنجاح!';
        }
        return;
      }
    }

    // D. Desktop fallback: inform user and download file
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (statusEl) {
      statusEl.className = 'backup-status info';
      statusEl.textContent = `المتصفح لا يدعم المشاركة المباشرة، تم تنزيل الملف (${fileName}) لمشاركته يدوياً عبر واتساب.`;
    }
  } catch (err) {
    if (err.name === 'AbortError') return; // User closed share dialog
    console.error('Share failed:', err);
    if (statusEl) {
      statusEl.className = 'backup-status error';
      statusEl.textContent = 'حدث خطأ أثناء مشاركة النسخة الاحتياطية.';
    }
  }
}

// 3. Import Alerts & Case Data Functionality (With Deduplication)
async function importAlertsData(file) {
  const statusEl = document.getElementById('importExportStatus');
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      let casesToImport = [];

      if (Array.isArray(data)) {
        casesToImport = data;
      } else if (data && Array.isArray(data.cases)) {
        casesToImport = data.cases;
      } else {
        throw new Error('صيغة ملف التنبيهات غير صحيحة.');
      }

      // Existing records for deduplication
      const existingCases = await state.db.getAllCases();
      const seenKeys = new Set(existingCases.map(c => getRecordFingerprint(c)));

      let importedCount = 0;
      let skippedCount = 0;

      for (const caseItem of casesToImport) {
        if (!caseItem || typeof caseItem !== 'object') continue;
        const fp = getRecordFingerprint(caseItem);
        if (seenKeys.has(fp)) {
          skippedCount++;
          continue;
        }

        seenKeys.add(fp);
        const itemToSave = { ...caseItem };
        delete itemToSave.id;
        await state.db.addCase(itemToSave);
        importedCount++;
      }

      if (data.notificationHistory && Array.isArray(data.notificationHistory)) {
        const existingLogs = JSON.parse(localStorage.getItem('notificationHistory') || '[]');
        const mergedLogs = [...data.notificationHistory, ...existingLogs];
        const uniqueLogs = [];
        const seen = new Set();
        for (const log of mergedLogs) {
          const key = `${log.caseNumber || log.title}_${log.timestamp}`;
          if (!seen.has(key)) {
            seen.add(key);
            uniqueLogs.push(log);
          }
        }
        localStorage.setItem('notificationHistory', JSON.stringify(uniqueLogs.slice(0, 20)));
      }

      if (data.settings) {
        if (data.settings.lawsuitTypes) {
          localStorage.setItem('lawsuitTypes', data.settings.lawsuitTypes);
        }
        if (data.settings.procedureTypes) {
          localStorage.setItem('procedureTypes', data.settings.procedureTypes);
        }
        if (data.settings.appointmentTypes) {
          localStorage.setItem('appointmentTypes', data.settings.appointmentTypes);
        }
        if (data.settings.courtList) {
          localStorage.setItem('courtList', data.settings.courtList);
        }
        if (data.settings.holidayShiftEnabled !== undefined) {
          const isShift = data.settings.holidayShiftEnabled !== false && data.settings.holidayShiftEnabled !== 'false';
          localStorage.setItem('holidayShiftEnabled', String(isShift));
          state.holidayShiftEnabled = isShift;
          const holidayShiftToggle = document.getElementById('holidayShiftToggle');
          if (holidayShiftToggle) {
            holidayShiftToggle.checked = isShift;
          }
        }
        if (data.settings.theme) {
          applyTheme(data.settings.theme);
        }
        if (data.settings.expertProfile && !localStorage.getItem('expertProfile')) {
          localStorage.setItem('expertProfile', JSON.stringify(data.settings.expertProfile));
        }
        updateDatalists();
      }

      state.allCases = await state.db.getAllCases();
      await calendar.render();
      reminderSystem.renderHistory();

      // Trigger native reminders synchronization if available
      if (typeof syncNativeReminders === 'function') {
        syncNativeReminders();
      }

      if (statusEl) {
        statusEl.className = 'backup-status success';
        if (importedCount === 0 && skippedCount > 0) {
          statusEl.textContent = `تم استيراد 0 مأمورية، وتم تجاهل ${skippedCount} موجود مسبقاً (البيانات متطابقة بالفعل).`;
        } else if (importedCount > 0 && skippedCount > 0) {
          statusEl.textContent = `تم استيراد ${importedCount} مأمورية جديدة بنجاح، وتم تجاهل ${skippedCount} موجود مسبقاً!`;
        } else if (importedCount > 0 && skippedCount === 0) {
          statusEl.textContent = `تم استيراد ${importedCount} مأمورية وموعد بنجاح وإضافتها إلى البرنامج!`;
        } else {
          statusEl.textContent = 'الملف المختار لا يحتوي على أي سجلات جديدة.';
        }
      }
    } catch (err) {
      console.error('Import error:', err);
      if (statusEl) {
        statusEl.className = 'backup-status error';
        statusEl.textContent = 'عذراً، فشل استيراد الملف. تأكد من أن الملف بصيغة JSON صحيحة.';
      }
    }
  };

  reader.readAsText(file);
}

// UI Bindings
document.getElementById('addCaseBtn').addEventListener('click', () => showAddEditModal());
document.getElementById('closeFormBtn').addEventListener('click', hideAddEditModal);
document.getElementById('cancelFormBtn').addEventListener('click', hideAddEditModal);
document.getElementById('closeViewBtn').addEventListener('click', hideViewModal);

// Modal Type Selector Tabs
const tabCase = document.getElementById('tabCase');
if (tabCase) tabCase.addEventListener('click', () => setEntryType('case'));

const tabAppointment = document.getElementById('tabAppointment');
if (tabAppointment) tabAppointment.addEventListener('click', () => setEntryType('appointment'));

// Agenda Filter Buttons
const filterBtns = document.querySelectorAll('.agenda-filter-btn');
filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.currentFilter = btn.dataset.filter || 'all';
    loadDailyAgenda();
  });
});

// App Info Modal & Export/Import Bindings
const appInfoBtn = document.getElementById('appInfoBtn');
if (appInfoBtn) appInfoBtn.addEventListener('click', showAppInfoModal);

const closeInfoBtn = document.getElementById('closeInfoBtn');
if (closeInfoBtn) closeInfoBtn.addEventListener('click', hideAppInfoModal);

if (appInfoModalOverlay) {
  appInfoModalOverlay.addEventListener('click', (e) => {
    if (e.target === appInfoModalOverlay) hideAppInfoModal();
  });
}

const shareBackupBtn = document.getElementById('shareBackupBtn');
if (shareBackupBtn) shareBackupBtn.addEventListener('click', shareBackupData);

const exportAlertsBtn = document.getElementById('exportAlertsBtn');
if (exportAlertsBtn) exportAlertsBtn.addEventListener('click', exportAlertsData);

const importAlertsBtn = document.getElementById('importAlertsBtn');
const importFileInput = document.getElementById('importFileInput');
if (importAlertsBtn && importFileInput) {
  importAlertsBtn.addEventListener('click', () => importFileInput.click());
  importFileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      importAlertsData(e.target.files[0]);
      e.target.value = '';
    }
  });
}

// ==========================================
// 4. NOTIFICATION & REMINDER SYSTEM
// ==========================================
const notificationBanner = document.getElementById('notificationBanner');
const bannerTitle = document.getElementById('bannerTitle');
const bannerBody = document.getElementById('bannerBody');
const notifSound = document.getElementById('notifSound');

// Native Reminders Synchronization (Android & iOS Bridge)
async function syncNativeReminders() {
  if (!window.AndroidReminders || typeof window.AndroidReminders.syncAll !== 'function') {
    return;
  }

  if (!state.notificationsEnabled) {
    window.AndroidReminders.syncAll('[]');
    return;
  }

  try {
    const allCases = await state.db.getAllCases();
    const now = Date.now();
    const reminders = [];

    for (const item of allCases) {
      if (!item.dateTime) continue;
      const eventTime = new Date(item.dateTime).getTime();
      if (isNaN(eventTime)) continue;

      const isAppt = item.entryType === 'appointment';
      const itemId = Number(item.id) || 0;
      if (itemId <= 0) continue;

      // 1. Reminder 24 hours beforehand
      const trigger24h = eventTime - (24 * 60 * 60 * 1000);
      if (trigger24h > now) {
        const title24h = isAppt
          ? `تنبيه: موعد غداً - ${item.title || ''}`
          : `تنبيه: مأمورية غداً - ملف رقم ${item.caseNumber || ''}`;
        const body24h = isAppt
          ? `التصنيف: ${item.appointmentType || 'موعد عام'}${item.location ? ' | المكان: ' + item.location : ''}`
          : `الجهة: ${item.court || ''} | الإجراء: ${item.procedureType || ''}${item.procedureDetails ? ' - ' + item.procedureDetails : ''}`;

        reminders.push({
          id: itemId * 10 + 1,
          triggerAtMillis: trigger24h,
          title: title24h,
          body: body24h,
          caseId: itemId
        });
      }

      // 2. Reminder 2 hours beforehand
      const trigger2h = eventTime - (2 * 60 * 60 * 1000);
      if (trigger2h > now) {
        const title2h = isAppt
          ? `تنبيه: اقتراب موعد بعد ساعتين - ${item.title || ''}`
          : `تنبيه: اقتراب مأمورية بعد ساعتين - ملف رقم ${item.caseNumber || ''}`;
        const body2h = isAppt
          ? `التصنيف: ${item.appointmentType || 'موعد عام'}${item.location ? ' | المكان: ' + item.location : ''}`
          : `الجهة: ${item.court || ''} | الإجراء: ${item.procedureType || ''}${item.procedureDetails ? ' - ' + item.procedureDetails : ''}`;

        reminders.push({
          id: itemId * 10 + 2,
          triggerAtMillis: trigger2h,
          title: title2h,
          body: body2h,
          caseId: itemId
        });
      }
    }

    window.AndroidReminders.syncAll(JSON.stringify(reminders));
  } catch (e) {
    console.error('Error syncing native reminders:', e);
  }
}
window.syncNativeReminders = syncNativeReminders;

// Helper to update Native Reminders Status UI in the notifications center
function updateNativeReminderUI() {
  const statusBox = document.getElementById('nativeReminderStatusBox');
  if (!statusBox) return;

  if (!window.AndroidReminders) {
    statusBox.style.display = 'none';
    return;
  }

  statusBox.style.display = 'block';

  // 1. Notification Permission Status
  const permStatusEl = document.getElementById('notifPermStatus');
  const grantBtn = document.getElementById('grantNotifPermBtn');
  const hasPerm = typeof window.AndroidReminders.hasNotificationPermission === 'function'
    ? window.AndroidReminders.hasNotificationPermission()
    : true;

  if (permStatusEl && grantBtn) {
    if (hasPerm) {
      permStatusEl.textContent = 'مفعّل ✓';
      permStatusEl.style.color = '#34d399';
      grantBtn.style.display = 'none';
    } else {
      permStatusEl.textContent = 'غير مفعّل';
      permStatusEl.style.color = '#f87171';
      grantBtn.style.display = 'inline-block';
    }
  }

  // 2. Exact Alarm Status
  const exactStatusEl = document.getElementById('exactAlarmStatus');
  const enableExactBtn = document.getElementById('enableExactAlarmBtn');
  const canExact = typeof window.AndroidReminders.canScheduleExact === 'function'
    ? window.AndroidReminders.canScheduleExact()
    : true;

  if (exactStatusEl && enableExactBtn) {
    if (canExact) {
      exactStatusEl.textContent = 'دقيق ومحدد ✓';
      exactStatusEl.style.color = '#34d399';
      enableExactBtn.style.display = 'none';
    } else {
      exactStatusEl.textContent = 'تقريبي';
      exactStatusEl.style.color = '#fbbf24';
      enableExactBtn.style.display = 'inline-block';
    }
  }
}

// Global Callback from Android ActivityResult
window.onNotificationPermissionResult = function (isGranted) {
  updateNativeReminderUI();
  if (isGranted) {
    syncNativeReminders();
  }
};

const reminderSystem = {
  init() {
    this.setupUI();

    if (window.AndroidReminders) {
      updateNativeReminderUI();
      // On Android 13+: ask for permission on initial launch if not granted
      if (typeof window.AndroidReminders.hasNotificationPermission === 'function' && !window.AndroidReminders.hasNotificationPermission()) {
        window.AndroidReminders.requestNotificationPermission();
      }
    } else {
      this.requestPermission();
      // Poll checks every 15 seconds only on Web / fallback
      this.checkReminders();
      setInterval(() => this.checkReminders(), 15000);
    }
  },

  setupUI() {
    const toggle = document.getElementById('notificationToggle');
    if (toggle) {
      toggle.checked = state.notificationsEnabled;

      toggle.addEventListener('change', (e) => {
        state.notificationsEnabled = e.target.checked;
        localStorage.setItem('notificationsEnabled', state.notificationsEnabled);
        if (state.notificationsEnabled) {
          if (window.AndroidReminders && typeof window.AndroidReminders.hasNotificationPermission === 'function' && !window.AndroidReminders.hasNotificationPermission()) {
            window.AndroidReminders.requestNotificationPermission();
          } else {
            this.requestPermission();
          }
        }
        syncNativeReminders();
      });
    }

    const holidayShiftToggle = document.getElementById('holidayShiftToggle');
    if (holidayShiftToggle) {
      holidayShiftToggle.checked = state.holidayShiftEnabled;
      holidayShiftToggle.addEventListener('change', (e) => {
        state.holidayShiftEnabled = e.target.checked;
        localStorage.setItem('holidayShiftEnabled', String(state.holidayShiftEnabled));
        if (typeof calendar !== 'undefined' && calendar.render) {
          calendar.render();
        }
        if (typeof loadDailyAgenda === 'function') {
          loadDailyAgenda();
        }
      });
    }

    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
      themeToggle.checked = state.theme === 'light';
      applyTheme(state.theme);
      themeToggle.addEventListener('change', (e) => {
        applyTheme(e.target.checked ? 'light' : 'dark');
      });
    }

    const grantNotifPermBtn = document.getElementById('grantNotifPermBtn');
    if (grantNotifPermBtn) {
      grantNotifPermBtn.addEventListener('click', () => {
        if (window.AndroidReminders && typeof window.AndroidReminders.requestNotificationPermission === 'function') {
          window.AndroidReminders.requestNotificationPermission();
        }
      });
    }

    const enableExactAlarmBtn = document.getElementById('enableExactAlarmBtn');
    if (enableExactAlarmBtn) {
      enableExactAlarmBtn.addEventListener('click', () => {
        if (window.AndroidReminders && typeof window.AndroidReminders.openExactAlarmSettings === 'function') {
          window.AndroidReminders.openExactAlarmSettings();
        }
      });
    }

    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) settingsBtn.addEventListener('click', () => this.toggleSettings(true));

    const notifBellBtn = document.getElementById('notifBellBtn');
    if (notifBellBtn) notifBellBtn.addEventListener('click', () => this.toggleNotifs(true));

    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', () => this.toggleSettings(false));

    const closeNotifBtn = document.getElementById('closeNotifBtn');
    if (closeNotifBtn) closeNotifBtn.addEventListener('click', () => this.toggleNotifs(false));

    const sidebarOverlay = document.getElementById('sidebarOverlay');
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', () => this.closeAllSidebars());

    const clearNotifBtn = document.getElementById('clearNotifHistoryBtn');
    if (clearNotifBtn) {
      clearNotifBtn.addEventListener('click', () => {
        localStorage.removeItem('notificationHistory');
        this.renderHistory();
      });
    }

    document.getElementById('bannerClose').addEventListener('click', () => {
      notificationBanner.classList.remove('visible');
    });

    // Setup LocalStorage settings for datalist options
    const savedLawsuitTypes = localStorage.getItem('lawsuitTypes');
    if (!savedLawsuitTypes || savedLawsuitTypes.includes('تجاري') || savedLawsuitTypes.includes('قسمة وتصفية')) {
      localStorage.setItem('lawsuitTypes', DEFAULT_LAWSUIT_TYPES.join(', '));
    }
    if (!localStorage.getItem('procedureTypes')) {
      localStorage.setItem('procedureTypes', DEFAULT_PROCEDURE_TYPES.join(', '));
    }
    const savedApptTypes = localStorage.getItem('appointmentTypes');
    if (!savedApptTypes || savedApptTypes.includes('اجتماع عمل مع الخصوم') || savedApptTypes.includes('استشارة فنية')) {
      localStorage.setItem('appointmentTypes', DEFAULT_APPOINTMENT_TYPES.join(', '));
    }

    const lawsuitTextarea = document.getElementById('settingsLawsuitTypes');
    const procedureTextarea = document.getElementById('settingsProcedureTypes');
    const appointmentTextarea = document.getElementById('settingsAppointmentTypes');
    const courtTextarea = document.getElementById('settingsCourtList');

    if (lawsuitTextarea && procedureTextarea) {
      lawsuitTextarea.value = localStorage.getItem('lawsuitTypes');
      procedureTextarea.value = localStorage.getItem('procedureTypes');

      // Auto-save settings on input
      lawsuitTextarea.addEventListener('input', (e) => {
        localStorage.setItem('lawsuitTypes', e.target.value);
        updateDatalists();
      });

      procedureTextarea.addEventListener('input', (e) => {
        localStorage.setItem('procedureTypes', e.target.value);
        updateDatalists();
      });
    }

    if (appointmentTextarea) {
      appointmentTextarea.value = localStorage.getItem('appointmentTypes');
      appointmentTextarea.addEventListener('input', (e) => {
        localStorage.setItem('appointmentTypes', e.target.value);
        updateDatalists();
      });
    }

    if (courtTextarea) {
      courtTextarea.value = localStorage.getItem('courtList') || '';
      courtTextarea.addEventListener('input', (e) => {
        localStorage.setItem('courtList', e.target.value);
        updateDatalists();
      });
    }

    // Expert Profile setup (بيانات الخبير لتقرير الطباعة)
    const expertNameInput = document.getElementById('expertName');
    const expertTitleInput = document.getElementById('expertTitle');
    const expertOfficeInput = document.getElementById('expertOffice');
    const expertPhoneInput = document.getElementById('expertPhone');

    const profile = JSON.parse(localStorage.getItem('expertProfile') || '{}');
    if (expertNameInput) expertNameInput.value = profile.name || '';
    if (expertTitleInput) expertTitleInput.value = profile.title || '';
    if (expertOfficeOfficeInput = expertOfficeInput) expertOfficeInput.value = profile.office || '';
    if (expertPhoneInput) expertPhoneInput.value = profile.phone || '';

    const saveExpertProfile = () => {
      const p = {
        name: expertNameInput ? expertNameInput.value.trim() : '',
        title: expertTitleInput ? expertTitleInput.value.trim() : '',
        office: expertOfficeInput ? expertOfficeInput.value.trim() : '',
        phone: expertPhoneInput ? expertPhoneInput.value.trim() : ''
      };
      localStorage.setItem('expertProfile', JSON.stringify(p));
      // Re-render preview if print modal is currently open
      if (typeof printManager !== 'undefined' && printManager.updatePreview) {
        printManager.updatePreview();
      }
    };

    if (expertNameInput) expertNameInput.addEventListener('input', saveExpertProfile);
    if (expertTitleInput) expertTitleInput.addEventListener('input', saveExpertProfile);
    if (expertOfficeInput) expertOfficeInput.addEventListener('input', saveExpertProfile);
    if (expertPhoneInput) expertPhoneInput.addEventListener('input', saveExpertProfile);

    updateDatalists();
    this.renderHistory();
  },

  toggleSettings(show) {
    const settingsPanel = document.getElementById('settingsPanel');
    const notifPanel = document.getElementById('notifPanel');
    const overlay = document.getElementById('sidebarOverlay');
    if (show) {
      if (notifPanel) notifPanel.classList.remove('active');
      if (settingsPanel) settingsPanel.classList.add('active');
      if (overlay) overlay.classList.add('active');
      pushModalState('settings');
    } else {
      if (settingsPanel) settingsPanel.classList.remove('active');
      if (overlay && (!notifPanel || !notifPanel.classList.contains('active'))) {
        overlay.classList.remove('active');
      }
    }
  },

  toggleNotifs(show) {
    const settingsPanel = document.getElementById('settingsPanel');
    const notifPanel = document.getElementById('notifPanel');
    const overlay = document.getElementById('sidebarOverlay');
    if (show) {
      if (settingsPanel) settingsPanel.classList.remove('active');
      if (notifPanel) notifPanel.classList.add('active');
      if (overlay) overlay.classList.add('active');
      const badge = document.getElementById('notifBadge');
      if (badge) badge.classList.remove('visible');
      this.renderHistory();
      updateNativeReminderUI();
      pushModalState('notifications');
    } else {
      if (notifPanel) notifPanel.classList.remove('active');
      if (overlay && (!settingsPanel || !settingsPanel.classList.contains('active'))) {
        overlay.classList.remove('active');
      }
    }
  },

  closeAllSidebars() {
    const settingsPanel = document.getElementById('settingsPanel');
    const notifPanel = document.getElementById('notifPanel');
    const overlay = document.getElementById('sidebarOverlay');
    if (settingsPanel) settingsPanel.classList.remove('active');
    if (notifPanel) notifPanel.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
  },

  toggleSidebar(show) {
    if (show) this.toggleSettings(true);
    else this.closeAllSidebars();
  },

  async requestPermission() {
    if ('Notification' in window) {
      if (Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          console.log('Notification permission granted.');
        }
      }
    }
  },

  // Reminder Engine checking hearings / appointments 24 hours (1 day) beforehand
  async checkReminders() {
    if (!state.db.db || this.isChecking) return; // DB not loaded yet or check currently running
    this.isChecking = true;

    try {
      const cases = await state.db.getAllCases();
      const now = new Date();
      const targetDiff = 24 * 60 * 60 * 1000; // 24 hours in ms

      for (const c of cases) {
        if (c.notified) continue; // Already triggered reminder

        const hearingTime = new Date(c.dateTime);
        const timeDiff = hearingTime.getTime() - now.getTime();

        // Trigger if event is within target 24 hour window
        if (timeDiff > 0 && timeDiff <= targetDiff) {
          await this.triggerAlert(c);
        }
      }
    } finally {
      this.isChecking = false;
    }
  },

  async triggerAlert(itemObj) {
    // Mark as notified in Database
    await state.db.markAsNotified(itemObj.id);

    // Refresh current states
    state.allCases = await state.db.getAllCases();

    // Log in History
    this.logAlert(itemObj);

    // Play sound alert
    try {
      notifSound.currentTime = 0;
      notifSound.play();
    } catch (err) {
      console.warn('Audio play blocked:', err);
    }

    const isAppt = itemObj.entryType === 'appointment';

    // 1. Show Custom sliding Banner (Safe HTML Escaped)
    if (isAppt) {
      bannerTitle.textContent = 'تنبيه: اقتراب موعد هام (خلال ٢٤ ساعة)';
      bannerBody.innerHTML = `الموعد: <b>${escapeHtml(itemObj.title)}</b><br>التصنيف: ${escapeHtml(itemObj.appointmentType || 'موعد عام')}${itemObj.location ? `<br>المكان: ${escapeHtml(itemObj.location)}` : ''}`;
    } else {
      const pType = itemObj.procedureType || 'إجراء مطلوب';
      const pDetails = itemObj.procedureDetails || itemObj.procedure || '';
      bannerTitle.textContent = 'تنبيه: اقتراب موعد المأمورية (خلال ٢٤ ساعة)';
      bannerBody.innerHTML = `ملف رقم: <b>${escapeHtml(itemObj.caseNumber)}</b><br>الجهة: ${escapeHtml(itemObj.court)}<br>الإجراء: <b>${escapeHtml(pType)}</b>${pDetails ? ' - ' + escapeHtml(pDetails) : ''}`;
    }

    notificationBanner.classList.add('visible');

    // Autoclose custom banner after 10 seconds
    setTimeout(() => {
      notificationBanner.classList.remove('visible');
    }, 10000);

    // Update red dot icon on the dashboard
    document.getElementById('notifBadge').classList.add('visible');

    // 2. Trigger System Level OS Web Notification
    if (state.notificationsEnabled && 'Notification' in window && Notification.permission === 'granted') {
      const notifTitle = isAppt ? `تنبيه موعد قادم: ${itemObj.title}` : `مأمورية قادمة غداً: ملف رقم ${itemObj.caseNumber}`;
      const notifBody = isAppt
        ? `التصنيف: ${itemObj.appointmentType || 'موعد عام'}\nالمكان: ${itemObj.location || 'غير محدد'}\nالتوقيت: ${formatArabicTime(itemObj.dateTime)}`
        : `الجهة المحيلة: ${itemObj.court}\nنوع الإجراء: ${itemObj.procedureType || 'إجراء'}\nالتفاصيل: ${itemObj.procedureDetails || itemObj.procedure || ''}`;

      if (state.swRegistration && state.swRegistration.active) {
        state.swRegistration.active.postMessage({
          type: 'SHOW_NOTIFICATION',
          payload: {
            title: notifTitle,
            body: notifBody,
            data: { caseId: itemObj.id }
          }
        });
      } else if (!window.AndroidReminders) {
        new Notification(notifTitle, {
          body: notifBody,
          icon: 'assets/icon.png',
          dir: 'rtl'
        });
      }
    }
  },

  logAlert(itemObj) {
    const logs = JSON.parse(localStorage.getItem('notificationHistory') || '[]');
    const isAppt = itemObj.entryType === 'appointment';

    const newLog = {
      id: itemObj.id,
      entryType: itemObj.entryType || 'case',
      caseNumber: isAppt ? itemObj.title : itemObj.caseNumber,
      court: isAppt ? (itemObj.location || 'موعد عام') : itemObj.court,
      procedureType: isAppt ? (itemObj.appointmentType || 'موعد') : (itemObj.procedureType || 'إجراء مطلوب'),
      procedureDetails: isAppt ? (itemObj.notes || '') : (itemObj.procedureDetails || itemObj.procedure || ''),
      timestamp: new Date().toISOString()
    };

    logs.unshift(newLog); // Prepend to history
    localStorage.setItem('notificationHistory', JSON.stringify(logs.slice(0, 15))); // Keep last 15
    this.renderHistory();
  },

  renderHistory() {
    const list = document.getElementById('notifHistory');
    const logs = JSON.parse(localStorage.getItem('notificationHistory') || '[]');

    if (logs.length === 0) {
      list.innerHTML = `
        <div class="empty-state" style="padding: 15px; border-radius: 10px;">
          <i class="fa-solid fa-bell-slash" style="font-size: 1.2rem;"></i>
          <p style="font-size: 0.72rem;">لا توجد تنبيهات مرسلة بعد</p>
        </div>
      `;
      return;
    }

    list.innerHTML = '';
    logs.forEach(log => {
      const date = new Date(log.timestamp);
      const options = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
      const timeStr = new Intl.DateTimeFormat('ar-EG', options).format(date);

      const isAppt = log.entryType === 'appointment';
      const labelText = isAppt ? 'موعد' : 'مأمورية ملف رقم';

      const item = document.createElement('div');
      item.className = 'notif-history-item';
      item.innerHTML = `
        <div class="notif-time"><i class="fa-regular fa-clock"></i> ${timeStr}</div>
        <div>تنبيه ${labelText}: <b>${escapeHtml(log.caseNumber)}</b> ${log.court ? `(${escapeHtml(log.court)})` : ''}</div>
        <div style="font-size: 0.7rem; color: var(--text-secondary); margin-top: 4px; border-top: 1px dashed rgba(255,255,255,0.04); padding-top: 4px;">
          التصنيف: <b>${escapeHtml(log.procedureType)}</b> ${log.procedureDetails ? `- ${escapeHtml(log.procedureDetails)}` : ''}
        </div>
      `;
      list.appendChild(item);
    });
  }
};

// ==========================================
// 4. COMPREHENSIVE SEARCH CONTROLLER
// ==========================================
const searchController = {
  currentFilter: 'all',
  lastQuery: '',
  debounceTimer: null,

  init() {
    const searchBtn = document.getElementById('searchBtn');
    const searchModalOverlay = document.getElementById('searchModalOverlay');
    const searchCloseBtn = document.getElementById('searchCloseBtn');
    const searchInput = document.getElementById('searchInput');
    const searchClearBtn = document.getElementById('searchClearBtn');
    const searchFilterPills = document.querySelectorAll('#searchFilterPills .search-pill');

    if (searchBtn) {
      searchBtn.addEventListener('click', () => this.show());
    }

    if (searchCloseBtn) {
      searchCloseBtn.addEventListener('click', () => this.hide());
    }

    if (searchModalOverlay) {
      searchModalOverlay.addEventListener('click', (e) => {
        if (e.target === searchModalOverlay) this.hide();
      });
    }

    // Clear Button
    if (searchClearBtn) {
      searchClearBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchClearBtn.style.display = 'none';
        searchInput.focus();
        this.runSearch('');
      });
    }

    // Input Typing Handler with Debounce
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        searchClearBtn.style.display = query ? 'flex' : 'none';
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          this.runSearch(query);
        }, 120);
      });
    }

    // Quick Filter Pills
    searchFilterPills.forEach(pill => {
      pill.addEventListener('click', () => {
        searchFilterPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.currentFilter = pill.dataset.filter || 'all';
        this.runSearch(searchInput ? searchInput.value.trim() : '');
      });
    });

    // ESC Key Support
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && searchModalOverlay && searchModalOverlay.classList.contains('active')) {
        this.hide();
      }
    });
  },

  async show() {
    const searchModalOverlay = document.getElementById('searchModalOverlay');
    const searchInput = document.getElementById('searchInput');
    if (!searchModalOverlay) return;

    const sheet = searchModalOverlay.querySelector('.search-modal-sheet');
    if (sheet) sheet.scrollTop = 0;

    searchModalOverlay.classList.add('active');
    pushModalState('search');

    // Ensure all cases are loaded
    state.allCases = await state.db.getAllCases();

    if (searchInput) {
      searchInput.value = '';
      const clearBtn = document.getElementById('searchClearBtn');
      if (clearBtn) clearBtn.style.display = 'none';
      // Wait for modal slide-up animation (300ms) to finish cleanly
      setTimeout(() => {
        if (searchInput && searchModalOverlay.classList.contains('active')) {
          try {
            if (window.innerWidth > 600) {
              searchInput.focus();
            }
          } catch (e) { }
        }
      }, 350);
    }

    this.runSearch('');
  },

  hide() {
    const searchModalOverlay = document.getElementById('searchModalOverlay');
    if (searchModalOverlay) searchModalOverlay.classList.remove('active');
    document.body.style.overflow = '';
  },

  // Arabic normalizer for search matching
  normalize(str) {
    if (!str) return '';
    return String(str)
      .toLowerCase()
      .replace(/[أإآ]/g, 'ا')
      .replace(/[ة]/g, 'ه')
      .replace(/[ى]/g, 'ي')
      .replace(/[\u064B-\u065F]/g, '') // remove Arabic diacritics
      .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)) // convert Indic digits
      .trim();
  },

  async runSearch(query) {
    this.lastQuery = query;
    const resultsContainer = document.getElementById('searchResultsList');
    const resultsMeta = document.getElementById('searchResultsMeta');
    const countText = document.getElementById('searchResultsCountText');
    if (!resultsContainer) return;

    // Refresh allCases
    if (!state.allCases || state.allCases.length === 0) {
      state.allCases = await state.db.getAllCases();
    }

    const todayStr = calendar.formatDateStr(new Date());
    const normQuery = this.normalize(query);

    // Filter items based on query
    let matched = state.allCases.filter(c => {
      if (!normQuery) return true; // Show all if query is empty

      const fieldsToSearch = [
        c.caseNumber,
        c.caseYear,
        c.caseType,
        c.court,
        c.procedureType,
        c.procedureDetails,
        c.procedure,
        c.parties,
        c.title,
        c.appointmentType,
        c.location,
        c.notes,
        c.dateOnly
      ];

      return fieldsToSearch.some(field => {
        if (!field) return false;
        return this.normalize(field).includes(normQuery);
      });
    });

    // Update filter counts based on matched items
    const countAll = matched.length;
    const countUpcoming = matched.filter(c => c.dateOnly >= todayStr).length;
    const countCases = matched.filter(c => getEntryType(c) === 'case').length;
    const countAppts = matched.filter(c => getEntryType(c) === 'appointment').length;

    const elCountAll = document.getElementById('searchCountAll');
    const elCountUpcoming = document.getElementById('searchCountUpcoming');
    const elCountCases = document.getElementById('searchCountCases');
    const elCountAppts = document.getElementById('searchCountAppts');

    if (elCountAll) elCountAll.textContent = countAll;
    if (elCountUpcoming) elCountUpcoming.textContent = countUpcoming;
    if (elCountCases) elCountCases.textContent = countCases;
    if (elCountAppts) elCountAppts.textContent = countAppts;

    // Apply active quick filter pill
    if (this.currentFilter === 'upcoming') {
      matched = matched.filter(c => c.dateOnly >= todayStr);
    } else if (this.currentFilter === 'case') {
      matched = matched.filter(c => getEntryType(c) === 'case');
    } else if (this.currentFilter === 'appointment') {
      matched = matched.filter(c => getEntryType(c) === 'appointment');
    }

    // Sort items:
    // Future/today items first sorted ascending by date/time, then past items sorted descending
    matched.sort((a, b) => {
      const aIsFuture = a.dateOnly >= todayStr;
      const bIsFuture = b.dateOnly >= todayStr;
      if (aIsFuture && !bIsFuture) return -1;
      if (!aIsFuture && bIsFuture) return 1;
      if (aIsFuture && bIsFuture) {
        return (a.dateTime || a.dateOnly).localeCompare(b.dateTime || b.dateOnly);
      }
      return (b.dateTime || b.dateOnly).localeCompare(a.dateTime || a.dateOnly);
    });

    // Render results
    resultsContainer.innerHTML = '';

    if (matched.length === 0) {
      if (resultsMeta) resultsMeta.style.display = 'none';
      resultsContainer.innerHTML = `
        <div class="empty-state" style="padding: 40px 20px; border-radius: 16px;">
          <i class="fa-solid fa-magnifying-glass-chart" style="font-size: 2.2rem; color: var(--text-muted); margin-bottom: 12px;"></i>
          <h4 style="font-size: 0.95rem; color: var(--text-primary); margin-bottom: 6px;">لا توجد نتائج مطابقة</h4>
          <p style="font-size: 0.78rem; color: var(--text-muted); max-width: 280px; margin: 0 auto;">
            ${normQuery ? `لم يتم العثور على أي مأموريات أو مواعيد تطابق "${escapeHtml(query)}"` : 'لا توجد مواعيد مسجلة في الأجندة حالياً'}
          </p>
        </div>
      `;
      return;
    }

    if (resultsMeta && countText) {
      resultsMeta.style.display = 'flex';
      countText.textContent = normQuery
        ? `وجدت ${matched.length} نتيجة مطابقة لـ "${query}"`
        : `إجمالي المسجل بالأجندة: ${matched.length} مأمورية وموعد`;
    }

    matched.forEach(item => {
      const isCase = getEntryType(item) === 'case';
      const isToday = item.dateOnly === todayStr;
      const isUpcoming = item.dateOnly > todayStr;
      const timeStr = formatArabicTime(item.dateTime);

      // Status badge
      let statusBadgeHtml = '';
      if (isToday) {
        statusBadgeHtml = `<span class="search-status-badge today"><i class="fa-solid fa-circle" style="font-size: 5px;"></i> اليوم</span>`;
      } else if (isUpcoming) {
        statusBadgeHtml = `<span class="search-status-badge upcoming"><i class="fa-solid fa-circle" style="font-size: 5px;"></i> قادم</span>`;
      } else {
        statusBadgeHtml = `<span class="search-status-badge past">منتهي</span>`;
      }

      // Format date in Arabic safely without timezone shift
      let arabicDateStr = item.dateOnly;
      try {
        const parts = (item.dateOnly || '').split('-');
        if (parts.length === 3) {
          const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
          const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
          arabicDateStr = new Intl.DateTimeFormat('ar-EG', options).format(d);
        }
      } catch (err) { }

      // Card Element
      const card = document.createElement('div');
      card.className = `search-result-card ${isCase ? 'is-case' : 'is-appointment'}`;

      if (isCase) {
        const caseNumHtml = this.highlight(item.caseNumber || '', query);
        const caseYearHtml = this.highlight(item.caseYear || '', query);
        const courtHtml = this.highlight(item.court || '', query);
        const pTypeHtml = this.highlight(item.procedureType || 'إجراء مطلوب', query);
        const pDetailsHtml = this.highlight(item.procedureDetails || item.procedure || '', query);
        const caseTypeHtml = this.highlight(item.caseType || '', query);

        card.innerHTML = `
          <div class="search-card-header">
            <div class="search-card-title">
              <i class="fa-solid fa-gavel" style="color: var(--accent-gold);"></i>
              <span>ملف: ${caseNumHtml} / ${caseYearHtml}</span>
            </div>
            <div class="search-card-tags">
              <span class="search-badge case">${caseTypeHtml}</span>
              ${statusBadgeHtml}
            </div>
          </div>

          <div class="search-card-details">
            <div class="search-detail-row">
              <i class="fa-solid fa-landmark"></i>
              <span>${courtHtml}</span>
            </div>
            <div class="search-detail-row">
              <i class="fa-solid fa-list-check"></i>
              <span><b>${pTypeHtml}</b> ${pDetailsHtml ? '• ' + pDetailsHtml : ''}</span>
            </div>
          </div>

          <div class="search-card-footer">
            <div style="display: flex; align-items: center; gap: 6px;">
              <i class="fa-regular fa-calendar"></i>
              <span>${arabicDateStr} • ${timeStr}</span>
            </div>
            <span class="search-go-action">
              <span>عرض بالأجندة</span>
              <i class="fa-solid fa-arrow-left"></i>
            </span>
          </div>
        `;
      } else {
        const titleHtml = this.highlight(item.title || '', query);
        const apptTypeHtml = this.highlight(item.appointmentType || 'موعد عام', query);
        const locationHtml = this.highlight(item.location || '', query);
        const notesHtml = this.highlight(item.notes || '', query);

        card.innerHTML = `
          <div class="search-card-header">
            <div class="search-card-title">
              <i class="fa-solid fa-calendar-check" style="color: #38bdf8;"></i>
              <span>${titleHtml}</span>
            </div>
            <div class="search-card-tags">
              <span class="search-badge appt">${apptTypeHtml}</span>
              ${statusBadgeHtml}
            </div>
          </div>

          <div class="search-card-details">
            ${item.location ? `
              <div class="search-detail-row">
                <i class="fa-solid fa-location-dot" style="color: #38bdf8;"></i>
                <span>${locationHtml}</span>
              </div>
            ` : ''}
            ${item.notes ? `
              <div class="search-detail-row">
                <i class="fa-solid fa-note-sticky" style="color: #38bdf8;"></i>
                <span>${notesHtml}</span>
              </div>
            ` : ''}
          </div>

          <div class="search-card-footer">
            <div style="display: flex; align-items: center; gap: 6px;">
              <i class="fa-regular fa-calendar"></i>
              <span>${arabicDateStr} • ${timeStr}</span>
            </div>
            <span class="search-go-action">
              <span>عرض بالأجندة</span>
              <i class="fa-solid fa-arrow-left"></i>
            </span>
          </div>
        `;
      }

      // Click card to navigate to this appointment in calendar & agenda
      card.addEventListener('click', () => {
        this.navigateToItem(item);
      });

      resultsContainer.appendChild(card);
    });
  },

  highlight(text, query) {
    if (!text && text !== 0) return '';
    const rawStr = String(text);
    if (!query) return escapeHtml(rawStr);

    const normQuery = this.normalize(query).trim();
    if (!normQuery) return escapeHtml(rawStr);

    // Build character-by-character normalized text and map each normalized char index back to original string index
    const normChars = [];
    const origIndexMap = []; // origIndexMap[normIdx] = origCharIdx
    for (let i = 0; i < rawStr.length; i++) {
      const ch = rawStr[i];
      // Skip Arabic diacritics
      if (/[\u064B-\u065F]/.test(ch)) {
        continue;
      }
      let nch = ch.toLowerCase();
      if (/[أإآ]/.test(nch)) nch = 'ا';
      else if (/[ة]/.test(nch)) nch = 'ه';
      else if (/[ى]/.test(nch)) nch = 'ي';
      else if (/[٠-٩]/.test(nch)) nch = String('٠١٢٣٤٥٦٧٨٩'.indexOf(nch));

      normChars.push(nch);
      origIndexMap.push(i);
    }

    const normText = normChars.join('');
    const matchStart = normText.indexOf(normQuery);
    if (matchStart === -1) {
      return escapeHtml(rawStr);
    }

    const matchEnd = matchStart + normQuery.length - 1;
    const origStart = origIndexMap[matchStart];
    let origEnd = origIndexMap[matchEnd] + 1;

    // Include any trailing Arabic diacritics attached to the final matched character
    while (origEnd < rawStr.length && /[\u064B-\u065F]/.test(rawStr[origEnd])) {
      origEnd++;
    }

    const before = rawStr.slice(0, origStart);
    const match = rawStr.slice(origStart, origEnd);
    const after = rawStr.slice(origEnd);

    return `${escapeHtml(before)}<span class="search-highlight">${escapeHtml(match)}</span>${escapeHtml(after)}`;
  },

  async navigateToItem(item) {
    this.hide();

    // 1. Parse date of item
    const parts = item.dateOnly.split('-').map(Number);
    const targetYear = parts[0];
    const targetMonthIndex = parts[1] - 1; // 0-based

    // 2. Switch calendar month if different from current
    state.currentDate.setFullYear(targetYear);
    state.currentDate.setMonth(targetMonthIndex);

    // 3. Set selected date
    state.selectedDateStr = item.dateOnly;

    // 4. Render calendar to display the target month & day cell
    await calendar.render();

    // 5. Update agenda title & reload daily list
    updateAgendaTitle(item.dateOnly);
    await loadDailyAgenda();

    // 6. Scroll smoothly INSIDE <main> container to the agenda section and pulse the target card
    setTimeout(() => {
      const mainEl = document.querySelector('main');
      const targetCard = document.querySelector(`.case-card[data-id="${item.id}"]`);
      if (mainEl && targetCard) {
        const mainRect = mainEl.getBoundingClientRect();
        const cardRect = targetCard.getBoundingClientRect();
        const targetScroll = (cardRect.top - mainRect.top) + mainEl.scrollTop - (mainEl.clientHeight / 2) + (cardRect.height / 2);
        mainEl.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
        targetCard.classList.add('pulse-highlight');
        setTimeout(() => {
          targetCard.classList.remove('pulse-highlight');
        }, 2500);
      } else if (mainEl) {
        const agendaSection = document.querySelector('.agenda-section');
        if (agendaSection) {
          mainEl.scrollTo({ top: Math.max(0, agendaSection.offsetTop - 15), behavior: 'smooth' });
        }
      }
    }, 280);
  }
};

// ==========================================
// 5. PRINT & REPORT EXPORT CONTROLLER
// ==========================================
const printManager = {
  activePreset: 'month',
  activeType: 'both', // 'both' | 'case' | 'appointment'

  init() {
    const openPrintModalBtn = document.getElementById('openPrintModalBtn');
    const printModalOverlay = document.getElementById('printModalOverlay');
    const closePrintModalBtn = document.getElementById('closePrintModalBtn');
    const cancelPrintBtn = document.getElementById('cancelPrintBtn');
    const executePrintBtn = document.getElementById('executePrintBtn');
    const printStartDate = document.getElementById('printStartDate');
    const printEndDate = document.getElementById('printEndDate');
    const presetButtons = document.querySelectorAll('#printPresetButtons .preset-btn');
    const typeCards = document.querySelectorAll('#printTypeSelector .print-type-card');
    const togglePrintPreviewBtn = document.getElementById('togglePrintPreviewBtn');

    if (openPrintModalBtn) {
      openPrintModalBtn.addEventListener('click', () => this.openModal('month'));
    }

    if (closePrintModalBtn) {
      closePrintModalBtn.addEventListener('click', () => this.closeModal());
    }

    if (cancelPrintBtn) {
      cancelPrintBtn.addEventListener('click', () => this.closeModal());
    }

    if (printModalOverlay) {
      printModalOverlay.addEventListener('click', (e) => {
        if (e.target === printModalOverlay) this.closeModal();
      });
    }

    // Preset buttons
    presetButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        presetButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activePreset = btn.dataset.preset;
        this.applyPreset(this.activePreset);
        this.updatePreview();
      });
    });

    // Date inputs change
    if (printStartDate && printEndDate) {
      printStartDate.addEventListener('change', () => {
        presetButtons.forEach(b => b.classList.remove('active'));
        this.updatePreview();
      });
      printEndDate.addEventListener('change', () => {
        presetButtons.forEach(b => b.classList.remove('active'));
        this.updatePreview();
      });
    }

    // Type cards radio selection
    typeCards.forEach(card => {
      card.addEventListener('click', () => {
        typeCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        const radio = card.querySelector('input[type="radio"]');
        if (radio) {
          radio.checked = true;
          this.activeType = radio.value;
        }
        this.updatePreview();
      });
    });

    // Preview accordion toggle
    if (togglePrintPreviewBtn) {
      togglePrintPreviewBtn.addEventListener('click', () => {
        const body = document.getElementById('printPreviewBody');
        const chevron = document.getElementById('previewChevron');
        if (body.style.display === 'none' || !body.style.display) {
          body.style.display = 'block';
          togglePrintPreviewBtn.classList.add('open');
          if (chevron) chevron.style.transform = 'rotate(180deg)';
        } else {
          body.style.display = 'none';
          togglePrintPreviewBtn.classList.remove('open');
          if (chevron) chevron.style.transform = 'rotate(0deg)';
        }
      });
    }

    // Execute Print Button
    if (executePrintBtn) {
      executePrintBtn.addEventListener('click', () => this.executePrint());
    }

    // Open Settings from Print Warning Banner
    const openSettingsFromPrintBtn = document.getElementById('openSettingsFromPrintBtn');
    if (openSettingsFromPrintBtn) {
      openSettingsFromPrintBtn.addEventListener('click', () => {
        this.closeModal();
        reminderSystem.toggleSettings(true);
      });
    }
  },

  async openModal(preset = 'month') {
    const modal = document.getElementById('printModalOverlay');
    if (!modal) return;

    const sheet = modal.querySelector('.modal-sheet');
    if (sheet) sheet.scrollTop = 0;

    modal.classList.add('active');
    pushModalState('print');
    state.allCases = await state.db.getAllCases();

    // Check if expert profile name is empty
    const profile = JSON.parse(localStorage.getItem('expertProfile') || '{}');
    const warningEl = document.getElementById('printProfileWarning');
    if (warningEl) {
      if (!profile.name || !profile.name.trim()) {
        warningEl.style.display = 'flex';
      } else {
        warningEl.style.display = 'none';
      }
    }

    // Default preset
    const presetButtons = document.querySelectorAll('#printPresetButtons .preset-btn');
    presetButtons.forEach(b => {
      if (b.dataset.preset === preset) b.classList.add('active');
      else b.classList.remove('active');
    });

    this.applyPreset(preset);
    this.updatePreview();
  },

  closeModal() {
    const modal = document.getElementById('printModalOverlay');
    if (modal) modal.classList.remove('active');
    document.body.style.overflow = '';
  },

  hide() {
    this.closeModal();
  },

  applyPreset(preset) {
    const printStartDate = document.getElementById('printStartDate');
    const printEndDate = document.getElementById('printEndDate');
    if (!printStartDate || !printEndDate) return;

    const baseDate = state.selectedDateStr ? parseLocalDate(state.selectedDateStr) : new Date();
    const year = baseDate.getFullYear();
    const month = baseDate.getMonth(); // 0-based

    let start = '';
    let end = '';

    if (preset === 'today') {
      const today = state.selectedDateStr || calendar.formatDateStr(new Date());
      start = today;
      end = today;
    } else if (preset === 'week') {
      const d = new Date(baseDate);
      const dayOfWeek = d.getDay(); // 0 = Sunday, ..., 6 = Saturday
      // Week starts Saturday and ends Friday
      const diffToSat = (dayOfWeek + 1) % 7;
      const satDate = new Date(d);
      satDate.setDate(d.getDate() - diffToSat);
      const friDate = new Date(satDate);
      friDate.setDate(satDate.getDate() + 6); // Friday
      start = calendar.formatDateStr(satDate);
      end = calendar.formatDateStr(friDate);
    } else if (preset === 'month') {
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      start = calendar.formatDateStr(firstDay);
      end = calendar.formatDateStr(lastDay);
    } else if (preset === 'nextMonth') {
      const firstDay = new Date(year, month + 1, 1);
      const lastDay = new Date(year, month + 2, 0);
      start = calendar.formatDateStr(firstDay);
      end = calendar.formatDateStr(lastDay);
    } else if (preset === 'all') {
      if (state.allCases.length > 0) {
        const sorted = [...state.allCases].sort((a, b) => a.dateOnly.localeCompare(b.dateOnly));
        start = sorted[0].dateOnly;
        end = sorted[sorted.length - 1].dateOnly;
      } else {
        const today = calendar.formatDateStr(new Date());
        start = today;
        end = today;
      }
    }

    printStartDate.value = start;
    printEndDate.value = end;
  },

  getFilteredItems() {
    const startDate = document.getElementById('printStartDate')?.value;
    const endDate = document.getElementById('printEndDate')?.value;
    if (!startDate || !endDate) return [];

    return state.allCases.filter(c => {
      // Date range check
      if (c.dateOnly < startDate || c.dateOnly > endDate) return false;

      // Type check
      if (this.activeType === 'case' && getEntryType(c) !== 'case') return false;
      if (this.activeType === 'appointment' && getEntryType(c) !== 'appointment') return false;

      return true;
    }).sort((a, b) => {
      return (a.dateTime || a.dateOnly).localeCompare(b.dateTime || b.dateOnly);
    });
  },

  updatePreview() {
    const items = this.getFilteredItems();
    const summaryText = document.getElementById('printSummaryText');
    const previewContent = document.getElementById('printPreviewContent');

    const startDate = document.getElementById('printStartDate')?.value || '';
    const endDate = document.getElementById('printEndDate')?.value || '';

    const caseCount = items.filter(c => getEntryType(c) === 'case').length;
    const apptCount = items.filter(c => getEntryType(c) === 'appointment').length;

    if (summaryText) {
      if (items.length === 0) {
        summaryText.innerHTML = `لا توجد أي مأموريات أو مواعيد مسجلة في الفترة المحددة (${escapeHtml(startDate)} إلى ${escapeHtml(endDate)})`;
        summaryText.style.color = '#f87171';
      } else {
        summaryText.innerHTML = `تم حصر <b>${items.length}</b> بند في الفترة المحددة (<b>${caseCount}</b> مأمورية قضائية • <b>${apptCount}</b> موعد آخر)`;
        summaryText.style.color = '#a7f3d0';
      }
    }

    if (previewContent) {
      previewContent.innerHTML = this.generateReportHtml(items, startDate, endDate, true);
    }
  },

  generateReportHtml(items, startDate, endDate, isPreview = false) {
    const caseCount = items.filter(c => getEntryType(c) === 'case').length;
    const apptCount = items.filter(c => getEntryType(c) === 'appointment').length;

    let typeScopeText = 'جميع المأموريات القضائية والمواعيد الأخرى';
    if (this.activeType === 'case') typeScopeText = 'المأموريات القضائية فقط';
    if (this.activeType === 'appointment') typeScopeText = 'المواعيد والمهام الأخرى فقط';

    // Format Arabic dates safely without timezone shifting
    const formatAr = (dateStr) => {
      if (!dateStr) return '';
      try {
        const d = parseLocalDate(dateStr);
        return new Intl.DateTimeFormat('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(d);
      } catch (e) {
        return dateStr;
      }
    };

    const todayAr = new Intl.DateTimeFormat('ar-EG', { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).format(new Date());

    const profile = JSON.parse(localStorage.getItem('expertProfile') || '{}');
    const expertName = (profile.name || '').trim() || '................';
    const expertTitle = (profile.title || '').trim() || 'خبير بوزارة العدل';
    const expertOffice = (profile.office || '').trim();
    const expertPhone = (profile.phone || '').trim();

    let rowsHtml = '';
    if (items.length === 0) {
      rowsHtml = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 25px; color: #64748b; font-weight: bold;">
            لا توجد أي مأموريات أو مواعيد مسجلة في هذه الفترة
          </td>
        </tr>
      `;
    } else {
      // Group items by date while preserving chronological order
      const dateGroups = [];
      let currentGroup = null;

      items.forEach((item) => {
        const dateKey = item.dateOnly || (item.dateTime ? item.dateTime.substring(0, 10) : '');
        if (!currentGroup || currentGroup.dateKey !== dateKey) {
          currentGroup = {
            dateKey: dateKey,
            items: []
          };
          dateGroups.push(currentGroup);
        }
        currentGroup.items.push(item);
      });

      let seqIndex = 1;
      dateGroups.forEach(group => {
        const groupLen = group.items.length;
        const dateFormatted = formatAr(group.dateKey);

        group.items.forEach((item, idxInGroup) => {
          const isCase = getEntryType(item) === 'case';
          const timeFormatted = formatArabicTime(item.dateTime);

          const titleOrCase = isCase
            ? `<b>ملف: ${escapeHtml(item.caseNumber) || '—'} / ${escapeHtml(item.caseYear) || ''}</b><div style="font-size: 8pt; color: #475569;">${escapeHtml(item.caseType) || ''}</div>`
            : `<b>${escapeHtml(item.title) || 'موعد عام'}</b><div style="font-size: 8pt; color: #475569;">${escapeHtml(item.appointmentType) || ''}</div>`;

          const courtOrLoc = isCase
            ? `<b>${escapeHtml(item.court) || '—'}</b>`
            : `${escapeHtml(item.location) || '—'}`;

          const procDetails = item.procedureDetails || item.procedure || '';
          const procOrNotes = isCase
            ? `<b>${escapeHtml(item.procedureType) || ''}</b>${procDetails ? `<div>${escapeHtml(procDetails)}</div>` : ''}`
            : `${escapeHtml(item.notes) || '—'}`;

          const dateCellHtml = idxInGroup === 0
            ? `<td class="text-center group-date-cell" rowspan="${groupLen}"><b>${escapeHtml(dateFormatted)}</b></td>`
            : '';

          rowsHtml += `
            <tr>
              <td class="text-center" style="font-weight: bold;">${seqIndex++}</td>
              ${dateCellHtml}
              <td class="text-center" style="direction: ltr; font-weight: 600;">${escapeHtml(timeFormatted)}</td>
              <td>${titleOrCase}</td>
              <td>${courtOrLoc}</td>
              <td>${procOrNotes}</td>
            </tr>
          `;
        });
      });
    }

    return `
      <div class="report-document">
        <div class="print-official-header">
          <div class="header-gov-block">
            <h3>جمهورية مصر العربية</h3>
            <p>وزارة العـــــــــــــدل</p>
            <p>قطاع خبراء وزارة العدل</p>
          </div>

          <div class="header-title-block">
            <div class="header-emblem">⚖️</div>
            <h2>جدول أعمال الخبير القضائي</h2>
            <div class="report-period-text">
              الفترة من: <b>${escapeHtml(startDate)}</b> إلى: <b>${escapeHtml(endDate)}</b>
            </div>
            <div class="report-scope-tag">${escapeHtml(typeScopeText)}</div>
          </div>

          <div class="header-meta-block">
            <p><b>الخبير:</b> ${escapeHtml(expertName)}</p>
            <p><b>الصفة:</b> ${escapeHtml(expertTitle)}</p>
            ${expertOffice ? `<p><b>المكتب/الإدارة:</b> ${escapeHtml(expertOffice)}</p>` : ''}
            ${expertPhone ? `<p><b>الهاتف:</b> ${escapeHtml(expertPhone)}</p>` : ''}
            <p><b>تاريخ الاستخراج:</b> ${escapeHtml(todayAr)}</p>
          </div>
        </div>

        <div class="report-summary-bar">
          <span>إجمالي البنود المقيدة: <b>${items.length}</b></span>
          <span>المأموريات القضائية: <b>${caseCount}</b></span>
          <span>المواعيد والمهام الأخرى: <b>${apptCount}</b></span>
        </div>

        <table class="report-table">
          <thead>
            <tr>
              <th style="width: 5%;">م</th>
              <th style="width: 20%;">اليوم والتاريخ</th>
              <th style="width: 10%;">الوقت</th>
              <th style="width: 25%;">رقم الملف / الموضوع</th>
              <th style="width: 18%;">المحكمة / الجهة</th>
              <th style="width: 22%;">الإجراء والملاحظات</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        ${!isPreview ? `
          <div class="report-footer-section">
            <div class="sign-box">
              <p><b>توقيع الخبير القضائي</b></p>
              <p class="sign-dots">................................................</p>
            </div>
            <div class="sign-box">
              <p><b>خاتم المكتب / الاعتماد</b></p>
              <p class="sign-dots">................................................</p>
            </div>
          </div>

          <div class="report-system-tag">
            تم استخراج هذا البيان رسمياً بواسطة تطبيق أجندة الخبير القضائي • LexEnginuity
          </div>
        ` : ''}
      </div>
    `;
  },

  executePrint() {
    const items = this.getFilteredItems();
    if (items.length === 0) {
      alert('لا توجد أي مأموريات أو مواعيد مسجلة في الفترة المحددة للطباعة.');
      return;
    }

    const startDate = document.getElementById('printStartDate')?.value || '';
    const endDate = document.getElementById('printEndDate')?.value || '';

    // Populate the hidden printable report area
    const printArea = document.getElementById('printableReportArea');
    if (!printArea) return;

    printArea.innerHTML = this.generateReportHtml(items, startDate, endDate, false);

    // Give browser brief time to layout HTML
    setTimeout(() => {
      // 1. Check if running on iOS Native WKWebView Bridge
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.iosPrint) {
        window.webkit.messageHandlers.iosPrint.postMessage({});
        return;
      }

      // 2. Check if running on Android WebView Bridge
      if (window.AndroidPrinter && typeof window.AndroidPrinter.printPage === 'function') {
        const jobName = `جدول_أعمال_الخبير_${startDate}_${endDate}`;
        window.AndroidPrinter.printPage(jobName);
      } else {
        // Standard window.print for Desktop Web and browsers
        window.print();
      }
    }, 150);
  }
};

// ==========================================
// 6. APPLICATION INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize Database
  try {
    await state.db.init();
    state.allCases = await state.db.getAllCases();

    // Migrate expert profile once for existing users with prior data
    if (!localStorage.getItem('expertProfile') && state.allCases && state.allCases.length > 0) {
      const defaultProfile = {
        name: 'د. م. عمرو مصطفي حامد',
        title: 'خبير هندسي بوزارة العدل',
        office: '',
        phone: ''
      };
      localStorage.setItem('expertProfile', JSON.stringify(defaultProfile));
      const expertNameInput = document.getElementById('expertName');
      const expertTitleInput = document.getElementById('expertTitle');
      if (expertNameInput) expertNameInput.value = defaultProfile.name;
      if (expertTitleInput) expertTitleInput.value = defaultProfile.title;
    }

    // Initialize components
    calendar.init();
    updateAgendaTitle(calendar.formatDateStr(state.currentDate));
    reminderSystem.init();
    searchController.init();
    printManager.init();
    initCustomAutocompletes();

    // Sync native alarms / reminders with Android system
    syncNativeReminders();

  } catch (error) {
    console.error('App init failed:', error);
  }

  // Register Service Worker
  if ('serviceWorker' in navigator) {
    try {
      state.swRegistration = await navigator.serviceWorker.register('sw.js');
      console.log('Service Worker registered successfully');

      // Check for incoming parameters (caseId from notification click)
      const urlParams = new URLSearchParams(window.location.search);
      const caseId = urlParams.get('caseId');
      if (caseId) {
        navigateToSpecificCase(caseId);
      }

      // Listen for messages from service worker
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'NAVIGATE_TO_CASE') {
          navigateToSpecificCase(event.data.caseId);
        }
      });

    } catch (e) {
      console.warn('Service Worker registration failed:', e);
    }
  }
});

// Navigate to a specific case view on database load
async function navigateToSpecificCase(caseId) {
  if (!state.db.db) {
    // Retry in 100ms if db is still loading
    setTimeout(() => navigateToSpecificCase(caseId), 100);
    return;
  }

  const all = await state.db.getAllCases();
  const matched = all.find(c => c.id === Number(caseId));
  if (matched) {
    // Set active calendar month to the case's month
    const hearingDate = new Date(matched.dateTime);
    state.currentDate = new Date(hearingDate.getFullYear(), hearingDate.getMonth(), 1);
    state.selectedDateStr = calendar.formatDateStr(hearingDate);

    // Render and show
    await calendar.render();
    updateAgendaTitle(state.selectedDateStr);
    showViewModal(matched);
  }
}
window.navigateToSpecificCase = navigateToSpecificCase;

// ==========================================
// 5. GOOGLE CALENDAR (ANDROID PROVIDER) SYNC
// ==========================================
const syncCalendarBtn = document.getElementById('syncCalendarBtn');
const calendarSyncStatusText = document.getElementById('calendarSyncStatusText');

function updateCalendarSyncUI(success, count = 0, msg = '') {
  if (calendarSyncStatusText) {
    if (success) {
      calendarSyncStatusText.textContent = `تمت المزامنة محلياً بنجاح (${count} عطلة من تقويم Google)`;
      calendarSyncStatusText.style.color = '#4ade80';
    } else if (msg) {
      calendarSyncStatusText.textContent = msg;
      calendarSyncStatusText.style.color = 'var(--text-secondary)';
    }
  }
}

function syncHolidaysFromAndroidCalendar(silent = false) {
  if (window.AndroidCalendar && typeof window.AndroidCalendar.isAvailable === 'function') {
    if (window.AndroidCalendar.hasPermission()) {
      try {
        const currentYear = new Date().getFullYear();
        const jsonStr = window.AndroidCalendar.getHolidays(currentYear - 1, currentYear + 2);
        if (jsonStr && jsonStr !== '{}') {
          const rawParsed = JSON.parse(jsonStr);
          const normalized = {};
          for (const [dStr, rawTitle] of Object.entries(rawParsed)) {
            normalized[dStr] = normalizeHolidayNameToArabic(rawTitle, dStr);
          }
          state.googleHolidays = normalized;
          localStorage.setItem('googleHolidays', JSON.stringify(normalized));
          const count = Object.keys(normalized).length;
          updateCalendarSyncUI(true, count);
          if (!silent) {
            alert(`تمت مزامنة ${count} عطلة رسمية باللغة العربية بنجاح من تقويم الهاتف!`);
          }
          if (typeof calendar !== 'undefined' && calendar.render) {
            calendar.render();
          }
          return;
        } else {
          updateCalendarSyncUI(false, 0, 'لم يتم العثور على عطلات مسجلة (الترحيل التلقائي نشط)');
        }
      } catch (err) {
        console.error('Error in syncHolidaysFromAndroidCalendar:', err);
      }
    } else if (!silent) {
      window.AndroidCalendar.requestPermission();
    }
  } else {
    updateCalendarSyncUI(false, 0, 'يعمل التطبيق بقاعدة ترحيل مجلس الوزراء التلقائية المدمجة');
  }
}

window.onCalendarPermissionResult = function (isGranted) {
  if (isGranted) {
    syncHolidaysFromAndroidCalendar(false);
  } else {
    updateCalendarSyncUI(false, 0, 'تم رفض الإذن (يعمل التطبيق بترحيل مجلس الوزراء التلقائي)');
    alert('تم رفض إذن التقويم - سيعتمد التطبيق على قاعدة ترحيل مجلس الوزراء التلقائية المدمجة.');
  }
};

if (syncCalendarBtn) {
  syncCalendarBtn.addEventListener('click', () => syncHolidaysFromAndroidCalendar(false));
}

// Initial status check on load
if (state.googleHolidays && Object.keys(state.googleHolidays).length > 0) {
  updateCalendarSyncUI(true, Object.keys(state.googleHolidays).length);
} else if (window.AndroidCalendar && typeof window.AndroidCalendar.hasPermission === 'function' && window.AndroidCalendar.hasPermission()) {
  syncHolidaysFromAndroidCalendar(true);
}
