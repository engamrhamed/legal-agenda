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
      const store = transaction.objectStore(['cases']);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  // Get cases (missions) for a specific day (dateStr format: YYYY-MM-DD)
  getCasesByDate(dateStr) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['cases'], 'readonly');
      const store = transaction.objectStore(['cases']);
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
      const store = transaction.objectStore(['cases']);
      const request = store.add(caseData);

      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  // Edit/Update case
  updateCase(caseData) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['cases'], 'readwrite');
      const store = transaction.objectStore(['cases']);
      const request = store.put(caseData);

      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  // Delete case
  deleteCase(id) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['cases'], 'readwrite');
      const store = transaction.objectStore(['cases']);
      const request = store.delete(Number(id));

      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  // Set notified = true
  markAsNotified(id) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['cases'], 'readwrite');
      const store = transaction.objectStore(['cases']);
      
      const getReq = store.get(Number(id));
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
  googleHolidays: loadAndNormalizeStoredGoogleHolidays(),
  swRegistration: null
};

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
  '2027-08-14': 'المولد النبوي الشريف'
};

// Aliases for compatibility
const fixedHolidays = FIXED_HOLIDAYS_ARABIC;
const movableHolidays = MOVABLE_HOLIDAYS_ARABIC;

// Normalize any holiday title (Arabic or English from Google Calendar) to standard formal Arabic
function normalizeHolidayNameToArabic(rawName, dateStr = '') {
  if (!rawName && dateStr) {
    const md = dateStr.substring(5);
    if (FIXED_HOLIDAYS_ARABIC[md]) return FIXED_HOLIDAYS_ARABIC[md];
    if (MOVABLE_HOLIDAYS_ARABIC[dateStr]) return MOVABLE_HOLIDAYS_ARABIC[dateStr];
  }
  if (!rawName) return '';
  const lower = String(rawName).toLowerCase();

  // 6 October / Armed Forces Day
  if (lower.includes('armed forces') || lower.includes('قوات مسلحة') || lower.includes('أكتوبر') || lower.includes('اكتوبر') || lower.includes('6 oct') || lower.includes('6th of oct')) {
    return 'عيد القوات المسلحة (٦ أكتوبر)';
  }
  // 25 January / Police Day / Revolution Day 2011
  if (lower.includes('25') || lower.includes('police') || lower.includes('شرطة') || (lower.includes('revolution') && lower.includes('2011'))) {
    return 'عيد ثورة 25 يناير وعيد الشرطة';
  }
  // Sinai Liberation (25 April)
  if (lower.includes('sinai') || lower.includes('سيناء')) {
    return 'عيد تحرير سيناء';
  }
  // Labour Day (1 May)
  if (lower.includes('labour') || lower.includes('labor') || lower.includes('عمال')) {
    return 'عيد العمال';
  }
  // June 30
  if (lower.includes('june 30') || lower.includes('30 june') || lower.includes('30 يونيو') || lower.includes('يونيو')) {
    return 'ثورة 30 يونيو';
  }
  // July 23
  if (lower.includes('july 23') || lower.includes('23 july') || lower.includes('23 يوليو') || lower.includes('يوليو') || (lower.includes('revolution') && !lower.includes('2011') && !lower.includes('30'))) {
    return 'عيد ثورة 23 يوليو';
  }
  // Christmas
  if (lower.includes('christmas') || lower.includes('ميلاد')) {
    return 'عيد الميلاد المجيد';
  }
  // Sham El-Nessim
  if (lower.includes('nessim') || lower.includes('easter monday') || lower.includes('نسيم')) {
    return 'شم النسيم';
  }
  // Arafat
  if (lower.includes('arafat') || lower.includes('عرفات') || lower.includes('وقفة')) {
    return 'وقفة عرفات';
  }
  // Eid Al-Adha
  if (lower.includes('adha') || lower.includes('أضحى') || lower.includes('اضحى')) {
    return 'عيد الأضحى المبارك';
  }
  // Eid Al-Fitr
  if (lower.includes('fitr') || lower.includes('فطر')) {
    return 'عيد الفطر المبارك';
  }
  // Islamic / Hijri New Year
  if (lower.includes('islamic new year') || lower.includes('hijri') || lower.includes('هجرية') || lower.includes('هجري')) {
    return 'رأس السنة الهجرية';
  }
  // Prophet's Birthday / Mawlid
  if (lower.includes('prophet') || lower.includes('mawlid') || lower.includes('مولد')) {
    return 'المولد النبوي الشريف';
  }

  // Fallback cleanup
  let cleaned = String(rawName)
    .replace(/^Day off for\s+/i, '')
    .replace(/^عطلة بمناسبة\s+/i, '')
    .replace(/\s*\(Observed\)/i, '')
    .replace(/\s*\(مرحل\)/i, '')
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
// 1. 'actual_day_off' (RED): Thursdays when shifted, or non-shiftable religious/national holidays.
// 2. 'original_work_day' (GREEN): Sunday-Wednesday original dates of shifted holidays (courts open / working days).
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

  // 2. Sunday (0), Monday (1), Tuesday (2), or Wednesday (3):
  // According to Prime Minister Decree 1249/2020, shiftable holidays in mid-week are SHIFTED to Thursday.
  // Therefore, this original weekday is NEVER a day off in courts -> ALWAYS GREEN (original_work_day)!
  if (dayOfWeek >= 0 && dayOfWeek <= 3) {
    let originalName = null;
    if (gEvent) {
      originalName = normalizeHolidayNameToArabic(gEvent, dateStr);
    } else if (FIXED_HOLIDAYS_ARABIC[md] && md !== '01-07') {
      originalName = FIXED_HOLIDAYS_ARABIC[md];
    } else if (MOVABLE_HOLIDAYS_ARABIC[dateStr]) {
      const mName = MOVABLE_HOLIDAYS_ARABIC[dateStr];
      if (mName.includes('الهجرية') || mName.includes('النبوي')) {
        originalName = mName;
      }
    }

    if (originalName) {
      const offsetToThu = 4 - dayOfWeek;
      const thuDate = new Date(year, month, day + offsetToThu);
      const thuDay = thuDate.getDate();
      const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
      const thuMonthName = monthNames[thuDate.getMonth()];
      return {
        type: 'original_work_day',
        name: originalName,
        thuDateFormatted: `${thuDay} ${thuMonthName}`,
        badgeText: `تاريخ المناسبة الرسمي: ${originalName} • (يوم عمل بالمحاكم - الإجازة الرسمية مرحّلة إلى الخميس ${thuDay} ${thuMonthName})`
      };
    }
  }

  // 3. Thursday (day 4):
  // The official day off for shifted holidays -> ALWAYS RED (actual_day_off)!
  if (dayOfWeek === 4) {
    // Check if Google Calendar has an event for this Thursday
    if (gEvent) {
      const arabicName = normalizeHolidayNameToArabic(gEvent, dateStr);
      return {
        type: 'actual_day_off',
        name: `${arabicName} (مرحّلة بقرار مجلس الوزراء)`,
        badgeText: `عطلة رسمية بمصر: ${arabicName} (مرحّلة بقرار مجلس الوزراء)`
      };
    }

    // Look back at earlier days of this week (Sunday to Thursday)
    for (let offset = 0; offset <= 4; offset++) {
      const cDate = new Date(year, month, day - offset);
      const cYear = cDate.getFullYear();
      const cMonth = String(cDate.getMonth() + 1).padStart(2, '0');
      const cDay = String(cDate.getDate()).padStart(2, '0');
      const cDateStr = `${cYear}-${cMonth}-${cDay}`;
      const cMd = `${cMonth}-${cDay}`;

      let foundName = null;
      if (state.googleHolidays && state.googleHolidays[cDateStr]) {
        foundName = normalizeHolidayNameToArabic(state.googleHolidays[cDateStr], cDateStr);
      } else if (FIXED_HOLIDAYS_ARABIC[cMd] && cMd !== '01-07') {
        foundName = FIXED_HOLIDAYS_ARABIC[cMd];
      } else if (MOVABLE_HOLIDAYS_ARABIC[cDateStr]) {
        const m = MOVABLE_HOLIDAYS_ARABIC[cDateStr];
        if (m.includes('الهجرية') || m.includes('النبوي')) {
          foundName = m;
        }
      }

      if (foundName) {
        if (offset === 0) {
          return {
            type: 'actual_day_off',
            name: foundName,
            badgeText: `عطلة رسمية بمصر: ${foundName}`
          };
        } else {
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
    let wName = null;
    if (gEvent) {
      wName = normalizeHolidayNameToArabic(gEvent, dateStr);
    } else if (FIXED_HOLIDAYS_ARABIC[md] && md !== '01-07') {
      wName = FIXED_HOLIDAYS_ARABIC[md];
    } else if (MOVABLE_HOLIDAYS_ARABIC[dateStr]) {
      wName = MOVABLE_HOLIDAYS_ARABIC[dateStr];
    }
    if (wName) {
      return {
        type: 'actual_day_off',
        name: wName,
        badgeText: `عطلة رسمية بمصر: ${wName}`
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
const DEFAULT_LAWSUIT_TYPES = ['مدني', 'تجاري', 'إيجارات', 'تعويضات', 'قسمة وتصفية', 'إفلاس', 'أسرة / تركات', 'عمالي', 'ضرائب'];
const DEFAULT_PROCEDURE_TYPES = ['معاينة ميدانية', 'جلسة مناقشة خصوم', 'دراسة ملف وفحص مستندات', 'إيداع / تسليم التقرير', 'جلسة استكمال مناقشة', 'معاينة تكميلية'];
const DEFAULT_APPOINTMENT_TYPES = [
  'اجتماع عمل مع الخصوم',
  'مقابلة أطراف وعملاء',
  'موعد استشارة فنية هندسية',
  'مهمة إدارية ومكتبية',
  'جلسة صلح وتفاوض ودي',
  'معاينة خاصة / ودية',
  'مراجعة مصلحة الشهر العقاري',
  'موعد خارجي',
  'موعد شخصي',
  'أخرى'
];

function updateDatalists() {
  const lawsuitVal = localStorage.getItem('lawsuitTypes') || '';
  const procedureVal = localStorage.getItem('procedureTypes') || '';
  const appointmentVal = localStorage.getItem('appointmentTypes') || '';
  
  const lawsuitList = lawsuitVal.split(',').map(s => s.trim()).filter(Boolean);
  const procedureList = procedureVal.split(',').map(s => s.trim()).filter(Boolean);
  const appointmentList = appointmentVal.split(',').map(s => s.trim()).filter(Boolean);
  
  const lawsuitDatalist = document.getElementById('caseTypeList');
  const procedureDatalist = document.getElementById('procedureTypeList');
  const appointmentDatalist = document.getElementById('appointmentTypeList');
  
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

  async render() {
    const calendarMonthYear = document.getElementById('calendarMonthYear');
    const calendarDays = document.getElementById('calendarDays');
    
    const year = state.currentDate.getFullYear();
    const month = state.currentDate.getMonth(); // 0-indexed
    
    calendarMonthYear.textContent = `${this.monthsAr[month]} ${year}`;
    calendarDays.innerHTML = '';
    
    // Get first day of month (0 = Sunday, 1 = Monday...)
    const firstDayIndex = new Date(year, month, 1).getDay();
    // Get last date of current month
    const totalDays = new Date(year, month + 1, 0).getDate();
    // Get last date of previous month
    const prevTotalDays = new Date(year, month, 0).getDate();
    
    // Fetch all cases in the background to set event dots
    state.allCases = await state.db.getAllCases();
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
    
    // Check for Egyptian Public Holiday (Original Green vs Shifted Red)
    const holidayInfo = getHolidayStatus(dateStr);
    if (holidayInfo) {
      if (holidayInfo.type === 'actual_day_off') {
        cell.classList.add('holiday'); // RED
        cell.title = holidayInfo.badgeText;
      } else if (holidayInfo.type === 'original_work_day') {
        cell.classList.add('holiday-original'); // GREEN
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
  const d = new Date(dateStr);
  
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
      
      if (isAppointment) {
        // Render Appointment Card
        card.className = 'case-card appointment-card';
        card.innerHTML = `
          <div class="case-header">
            <div class="case-num-title" style="color: #38bdf8;">
              <i class="fa-solid fa-calendar-check" style="margin-left: 5px; color: #38bdf8;"></i>
              <span>${c.title}</span>
            </div>
            <span class="appointment-type-badge">${c.appointmentType || 'موعد عام'}</span>
          </div>
          
          <div class="case-details-grid">
            ${c.location ? `
              <div class="detail-item">
                <i class="fa-solid fa-location-dot" style="color: #38bdf8;"></i>
                <span>${c.location}</span>
              </div>
            ` : ''}
            ${c.notes ? `
              <div class="detail-item procedure-detail" style="border-right: 2.5px solid #38bdf8;">
                <i class="fa-solid fa-note-sticky" style="color: #38bdf8;"></i>
                <span>${c.notes}</span>
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
              ملف رقم: <span>${c.caseNumber}</span> / <span>${c.caseYear}</span>
            </div>
            <span class="case-type-badge">${c.caseType}</span>
          </div>
          
          <div class="case-details-grid">
            <div class="detail-item">
              <i class="fa-solid fa-landmark"></i>
              <span>${c.court}</span>
            </div>
            <div class="detail-item procedure-detail">
              <i class="fa-solid fa-list-check"></i>
              <span>
                <b>${pType}</b>
                ${pDetails ? `<div style="font-size:0.75rem; color:var(--text-secondary); margin-top:2px; line-height:1.3;">${pDetails}</div>` : ''}
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

// Show form modal for adding or editing
async function showAddEditModal(caseId = null) {
  caseForm.reset();
  
  if (caseId) {
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
    // Creating new item
    document.getElementById('caseId').value = '';
    // Preset entry type based on active filter if relevant, otherwise default to case
    const defaultType = state.currentFilter === 'appointment' ? 'appointment' : 'case';
    setEntryType(defaultType);
    
    // Preset current date
    const selectedDateTimeStr = `${state.selectedDateStr}T09:00`;
    document.getElementById('dateTime').value = selectedDateTimeStr;
    const caseYearInput = document.getElementById('caseYear');
    if (!caseYearInput.value) {
      caseYearInput.value = new Date().getFullYear();
    }
  }
  
  caseModalOverlay.classList.add('active');
}

function hideAddEditModal() {
  caseModalOverlay.classList.remove('active');
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
  
  viewModalOverlay.classList.add('active');
}

function hideViewModal() {
  viewModalOverlay.classList.remove('active');
  activeViewingCase = null;
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
    appInfoModalOverlay.classList.add('active');
  }
}

function hideAppInfoModal() {
  if (appInfoModalOverlay) {
    appInfoModalOverlay.classList.remove('active');
  }
}

// Export Alerts & Case Data Functionality
async function exportAlertsData() {
  const statusEl = document.getElementById('importExportStatus');
  try {
    const allCases = await state.db.getAllCases();
    const notificationHistory = JSON.parse(localStorage.getItem('notificationHistory') || '[]');
    const lawsuitTypes = localStorage.getItem('lawsuitTypes') || '';
    const procedureTypes = localStorage.getItem('procedureTypes') || '';
    const appointmentTypes = localStorage.getItem('appointmentTypes') || '';
    const notificationsEnabled = localStorage.getItem('notificationsEnabled') || 'true';

    const exportPayload = {
      appName: 'LegalAgenda',
      company: 'LexEnginuity',
      designer: 'د. م. عمرو مصطفي حامد',
      version: 'V0 (LexEnginuity Edition)',
      exportedAt: new Date().toISOString(),
      totalRecordsCount: allCases.length,
      cases: allCases,
      notificationHistory: notificationHistory,
      settings: {
        lawsuitTypes,
        procedureTypes,
        appointmentTypes,
        notificationsEnabled
      }
    };

    const jsonString = JSON.stringify(exportPayload, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const fileName = `legal_agenda_backup_${dateStr}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (statusEl) {
      statusEl.className = 'backup-status success';
      statusEl.textContent = `تم تصدير ${allCases.length} مأمورية وموعد بنجاح إلى الملف (${fileName})!`;
    }
  } catch (err) {
    console.error('Export failed:', err);
    if (statusEl) {
      statusEl.className = 'backup-status error';
      statusEl.textContent = 'حدث خطأ أثناء تصدير التنبيهات والبيانات.';
    }
  }
}

// Import Alerts & Case Data Functionality
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

      let importedCount = 0;
      for (const caseItem of casesToImport) {
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
        updateDatalists();
      }

      state.allCases = await state.db.getAllCases();
      await calendar.render();
      reminderSystem.renderHistory();

      if (statusEl) {
        statusEl.className = 'backup-status success';
        statusEl.textContent = `تم استيراد ${importedCount} مأمورية وموعد بنجاح وإضافتها إلى البرنامج!`;
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

const sidebarAppInfoBtn = document.getElementById('sidebarAppInfoBtn');
if (sidebarAppInfoBtn) {
  sidebarAppInfoBtn.addEventListener('click', () => {
    reminderSystem.toggleSidebar(false);
    showAppInfoModal();
  });
}

const closeInfoBtn = document.getElementById('closeInfoBtn');
if (closeInfoBtn) closeInfoBtn.addEventListener('click', hideAppInfoModal);

if (appInfoModalOverlay) {
  appInfoModalOverlay.addEventListener('click', (e) => {
    if (e.target === appInfoModalOverlay) hideAppInfoModal();
  });
}

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

const reminderSystem = {
  init() {
    this.setupUI();
    this.requestPermission();
    
    // Poll checks every 15 seconds
    this.checkReminders();
    setInterval(() => this.checkReminders(), 15000);
  },

  setupUI() {
    const toggle = document.getElementById('notificationToggle');
    toggle.checked = state.notificationsEnabled;
    
    toggle.addEventListener('change', (e) => {
      state.notificationsEnabled = e.target.checked;
      localStorage.setItem('notificationsEnabled', state.notificationsEnabled);
      if (state.notificationsEnabled) {
        this.requestPermission();
      }
    });

    document.getElementById('settingsBtn').addEventListener('click', () => this.toggleSidebar(true));
    document.getElementById('notifBellBtn').addEventListener('click', () => this.toggleSidebar(true));
    document.getElementById('closeSidebar').addEventListener('click', () => this.toggleSidebar(false));
    document.getElementById('sidebarOverlay').addEventListener('click', () => this.toggleSidebar(false));
    
    document.getElementById('bannerClose').addEventListener('click', () => {
      notificationBanner.classList.remove('visible');
    });

    // Setup LocalStorage settings for datalist options
    if (!localStorage.getItem('lawsuitTypes')) {
      localStorage.setItem('lawsuitTypes', DEFAULT_LAWSUIT_TYPES.join(', '));
    }
    if (!localStorage.getItem('procedureTypes')) {
      localStorage.setItem('procedureTypes', DEFAULT_PROCEDURE_TYPES.join(', '));
    }
    if (!localStorage.getItem('appointmentTypes')) {
      localStorage.setItem('appointmentTypes', DEFAULT_APPOINTMENT_TYPES.join(', '));
    }
    
    const lawsuitTextarea = document.getElementById('settingsLawsuitTypes');
    const procedureTextarea = document.getElementById('settingsProcedureTypes');
    const appointmentTextarea = document.getElementById('settingsAppointmentTypes');
    
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

    updateDatalists();
    this.renderHistory();
  },

  toggleSidebar(show) {
    const sidebar = document.getElementById('sidebarPanel');
    const overlay = document.getElementById('sidebarOverlay');
    if (show) {
      sidebar.classList.add('active');
      overlay.classList.add('active');
      document.getElementById('notifBadge').classList.remove('visible');
      this.renderHistory();
    } else {
      sidebar.classList.remove('active');
      overlay.classList.remove('active');
    }
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
    if (!state.db.db) return; // DB not loaded yet
    
    const cases = await state.db.getAllCases();
    const now = new Date();
    const targetDiff = 24 * 60 * 60 * 1000; // 24 hours in ms
    
    cases.forEach(async (c) => {
      if (c.notified) return; // Already triggered reminder
      
      const hearingTime = new Date(c.dateTime);
      const timeDiff = hearingTime.getTime() - now.getTime();
      
      // Trigger if event is within target 24 hour window
      if (timeDiff > 0 && timeDiff <= targetDiff) {
        await this.triggerAlert(c);
      }
    });
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
    } catch(err) {
      console.warn('Audio play blocked:', err);
    }
    
    const isAppt = itemObj.entryType === 'appointment';

    // 1. Show Custom sliding Banner
    if (isAppt) {
      bannerTitle.textContent = 'تنبيه: اقتراب موعد هام (خلال ٢٤ ساعة)';
      bannerBody.innerHTML = `الموعد: <b>${itemObj.title}</b><br>التصنيف: ${itemObj.appointmentType || 'موعد عام'}${itemObj.location ? `<br>المكان: ${itemObj.location}` : ''}`;
    } else {
      const pType = itemObj.procedureType || 'إجراء مطلوب';
      const pDetails = itemObj.procedureDetails || itemObj.procedure || '';
      bannerTitle.textContent = 'تنبيه: اقتراب موعد المأمورية (خلال ٢٤ ساعة)';
      bannerBody.innerHTML = `ملف رقم: <b>${itemObj.caseNumber}</b><br>الجهة: ${itemObj.court}<br>الإجراء: <b>${pType}</b> - ${pDetails}`;
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
      
      if (state.swRegistration) {
        state.swRegistration.active.postMessage({
          type: 'SHOW_NOTIFICATION',
          payload: {
            title: notifTitle,
            body: notifBody,
            data: { caseId: itemObj.id }
          }
        });
      } else {
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
        <div>تنبيه ${labelText}: <b>${log.caseNumber}</b> ${log.court ? `(${log.court})` : ''}</div>
        <div style="font-size: 0.7rem; color: var(--text-secondary); margin-top: 4px; border-top: 1px dashed rgba(255,255,255,0.04); padding-top: 4px;">
          التصنيف: <b>${log.procedureType}</b> ${log.procedureDetails ? `- ${log.procedureDetails}` : ''}
        </div>
      `;
      list.appendChild(item);
    });
  }
};

// ==========================================
// 5. APPLICATION INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize Database
  try {
    await state.db.init();
    
    // Initialize components
    calendar.init();
    updateAgendaTitle(calendar.formatDateStr(state.currentDate));
    reminderSystem.init();
    
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
        const jsonStr = window.AndroidCalendar.getHolidays(2025, 2027);
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

window.onCalendarPermissionResult = function(isGranted) {
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
