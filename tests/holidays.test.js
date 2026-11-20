// legal-agenda-app/tests/holidays.test.js
// Test suite for Egyptian Public Holidays normalization logic

const assert = require('assert');

// Extraction of normalization logic matching legal-agenda-app/app.js
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
  // 2028 (تواريخ هجرية متوقعة فلكياً)
  '2028-02-27': 'عيد الفطر المبارك',
  '2028-02-28': 'عيد الفطر المبارك',
  '2028-02-29': 'عيد الفطر المبارك',
  '2028-04-17': 'شم النسيم',
  '2028-05-04': 'وقفة عرفات',
  '2028-05-05': 'عيد الأضحى المبارك',
  '2028-05-06': 'عيد الأضحى المبارك',
  '2028-05-07': 'عيد الأضحى المبارك',
  '2028-05-08': 'عيد الأضحى المبارك',
  '2028-05-25': 'رأس السنة الهجرية',
  '2028-08-03': 'المولد النبوي الشريف'
};

function normalizeHolidayNameToArabic(rawName, dateStr = '') {
  if (!rawName && dateStr) {
    const md = dateStr.substring(5);
    if (FIXED_HOLIDAYS_ARABIC[md]) return FIXED_HOLIDAYS_ARABIC[md];
    if (MOVABLE_HOLIDAYS_ARABIC[dateStr]) return MOVABLE_HOLIDAYS_ARABIC[dateStr];
  }
  if (!rawName) return '';
  const lower = String(rawName).toLowerCase().trim();

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

// Test cases list: 24 realistic holiday titles from Google Calendar (Arabic & English)
const testCases = [
  // 1. Revolution Day July 23
  { input: 'Revolution Day July 23', expected: 'عيد ثورة 23 يوليو' },
  { input: '23 July Revolution', expected: 'عيد ثورة 23 يوليو' },
  { input: 'ثورة 23 يوليو', expected: 'عيد ثورة 23 يوليو' },
  
  // 2. June 30 Revolution
  { input: 'June 30 Revolution', expected: 'ثورة 30 يونيو' },
  { input: '30 June Day', expected: 'ثورة 30 يونيو' },
  { input: 'ثورة 30 يونيو', expected: 'ثورة 30 يونيو' },

  // 3. 25 January & Police Day
  { input: 'January 25 Revolution and Police Day', expected: 'عيد ثورة 25 يناير وعيد الشرطة' },
  { input: 'Police Day', expected: 'عيد ثورة 25 يناير وعيد الشرطة' },
  { input: 'عيد الشرطة وثورة 25 يناير', expected: 'عيد ثورة 25 يناير وعيد الشرطة' },

  // 4. Sinai Liberation Day
  { input: 'Sinai Liberation Day', expected: 'عيد تحرير سيناء' },
  { input: 'عيد تحرير سيناء', expected: 'عيد تحرير سيناء' },

  // 5. Sham El Nessim
  { input: 'Sham El Nessim', expected: 'شم النسيم' },
  { input: 'Spring Day (Sham El Nessim)', expected: 'شم النسيم' },
  { input: 'شم النسيم', expected: 'شم النسيم' },

  // 6. Eid al-Adha & Arafat
  { input: 'Arafat Day', expected: 'وقفة عرفات' },
  { input: 'وقفة عرفات', expected: 'وقفة عرفات' },
  { input: 'Eid al-Adha (Day 2)', expected: 'عيد الأضحى المبارك' },
  { input: 'Eid al-Adha Holiday', expected: 'عيد الأضحى المبارك' },
  { input: 'عيد الأضحى المبارك (اليوم الثاني)', expected: 'عيد الأضحى المبارك' },

  // 7. Eid al-Fitr
  { input: 'Eid al-Fitr', expected: 'عيد الفطر المبارك' },
  { input: 'Eid al-Fitr Holiday', expected: 'عيد الفطر المبارك' },
  { input: 'عيد الفطر المبارك', expected: 'عيد الفطر المبارك' },

  // 8. Prophet's Birthday
  { input: "Prophet Muhammad's Birthday", expected: 'المولد النبوي الشريف' },
  { input: 'Mawlid al-Nabi', expected: 'المولد النبوي الشريف' },
  { input: 'المولد النبوي الشريف', expected: 'المولد النبوي الشريف' },

  // 9. Armed Forces Day
  { input: 'Armed Forces Day', expected: 'عيد القوات المسلحة (٦ أكتوبر)' },
  { input: '6th of October Victory', expected: 'عيد القوات المسلحة (٦ أكتوبر)' },
  { input: 'عيد القوات المسلحة', expected: 'عيد القوات المسلحة (٦ أكتوبر)' },

  // 10. Labour Day
  { input: 'Labour Day', expected: 'عيد العمال' },
  { input: 'عيد العمال العالمي', expected: 'عيد العمال' },

  // 11. Coptic Christmas
  { input: 'Coptic Christmas Day', expected: 'عيد الميلاد المجيد' },
  { input: 'عيد الميلاد المجيد', expected: 'عيد الميلاد المجيد' },

  // 12. Islamic New Year
  { input: 'Islamic New Year', expected: 'رأس السنة الهجرية' },
  { input: 'Hijri New Year', expected: 'رأس السنة الهجرية' },
  { input: 'رأس السنة الهجرية المباركة', expected: 'رأس السنة الهجرية' }
];

console.log(`Running ${testCases.length} holiday normalization tests...\n`);
let passed = 0;
let failed = 0;

testCases.forEach((tc, idx) => {
  const result = normalizeHolidayNameToArabic(tc.input);
  try {
    assert.strictEqual(result, tc.expected);
    console.log(`[PASS] Test ${idx + 1}: "${tc.input}" -> "${result}"`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] Test ${idx + 1}: "${tc.input}" -> Got: "${result}", Expected: "${tc.expected}"`);
    failed++;
  }
});

console.log(`\n========================================`);
console.log(`Results: ${passed} passed, ${failed} failed out of ${testCases.length} tests.`);
console.log(`========================================\n`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('All holiday tests PASSED perfectly!');
}
