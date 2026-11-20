# مشروع أجندة الخبير القضائي (Legal Agenda App)

مشروع تطبيقي متكامل لإدارة وتنظيم مأموريات الخبراء القضائيين ومواعيدهم والجلسات وتنبيهات الإجراءات.
* فكرة وإشراف: د. م. عمرو مصطفي حامد (الخبير الهندسي بوزارة العدل)
* تطوير وبرمجة: شركة LexEnginuity

---

## 📁 هيكل المشروع (Project Architecture)

المشروع مبني على كود ويب نظيف وموحد (Single Source of Truth) يتم حزمه وتشغيله على الويب والموبايل:

1. **`legal-agenda-app/`** (تطبيق الويب و PWA):
   - `index.html`: هيكل التطبيق وواجهات النوافذ المنبثقة (إضافة/تعديل، تفاصيل مأمورية، بحث شامل، إعدادات الطباعة، بيانات الشركة).
   - `styles.css`: التصميم المتجاوب (Dark Luxury Theme، تدرجات كحلية وذهبية، تنسيقات الموبايل والحواسيب، نمط الطباعة).
   - `app.js`: منطق التطبيق بالكامل (إدارة IndexedDB، التقويم الميلادي الشمسي، البحث والتصفية، الإشعارات، نسخ الإجراء الجديد، زر الرجوع).
   - `sw.js`: Service Worker للتخزين المؤقت والتشغيل بدون إنترنت (Offline PWA).
   - `manifest.json`: إعدادات تثبيت التطبيق على الشاشة الرئيسية للهواتف.

2. **`legal-agenda-app-android/`** (تطبيق الأندرويد Native):
   - تطبيق Android مبني بـ Kotlin و Jetpack Compose مع `AndroidView(WebView)`.
   - يحتوي على جسور تفاعل برمجية (Javascript Interfaces):
     - `AndroidCalendar`: جلب العطلات والإجازات الرسمية المصرية عبر `CalendarContract`.
     - `AndroidPrinter`: استدعاء خدمة الطباعة النظامية لأندرويد `PrintManager`.
     - `onBackPressedDispatcher`: اعتراض زر الرجوع بالنظام للرجوع للشاشة الرئيسية وإغلاق النوافذ المفتوحة.

3. **`legal-agenda-app-ios/`** (تطبيق الآيفون iOS):
   - تطبيق Xcode / SwiftUI يستخدم `WKWebView` لتشغيل حزمة الويب `www/`.
   - يدعم الوضع بدون إنترنت ومزامنة البيانات محلياً.

---

## 💾 قاعدة البيانات والتخزين (Data & Storage)

* **قاعدة البيانات الأساسية:** `IndexedDB` باسم `LegalAgendaDB` ومتجر `cases`.
* **هيكل السجل (Record Structure):**
  - المأمورية (`entryType: 'case'`):
    - `caseNumber` (رقم القضية)
    - `caseYear` (سنة القضية)
    - `caseType` (نوع الدعوى: استئناف، قضاء إداري، مدني، جنح)
    - `court` (الجهة المحيلة / المحكمة المصدرة)
    - `procedureType` (نوع الإجراء: معاينة، إيداع تقرير، جلسة مناقشة...)
    - `procedureDetails` (تفاصيل الإجراء والملاحظات)
    - `dateTime` (تاريخ ووقت الإجراء: YYYY-MM-DDTHH:MM)
    - `dateOnly` (تاريخ اليوم: YYYY-MM-DD)
  - الموعد العام (`entryType: 'appointment'`):
    - `title` (عنوان الموعد)
    - `appointmentType` (اجتماع عمل، مهمة إدارية ومكتبية، موعد خارجي، موعد شخصي)
    - `location` (المكان / المقر)
    - `notes` (ملاحظات)
    - `dateTime`, `dateOnly`
* **التخزين الإضافي:** `localStorage` لإعدادات التنبيهات، القوائم المنسدلة، وسجل الإشعارات السابقة.
* **النسخ الاحتياطي:** يدعم التصدير والاستيراد لملفات JSON من نافذة معلومات البرنامج.

---

## 🛠️ الأوامر وبناء التطبيقات (Build Commands)

* **بناء تطبيق الأندرويد APK:**
  ```powershell
  cd legal-agenda-app-android
  ./gradlew assembleDebug --no-daemon
  # الناتج: legal-agenda-app-android/app/build/outputs/apk/debug/app-debug.apk
  ```
* **تحديث ملفات الويب داخل الأندرويد والآيفون:**
  نسخ `index.html`, `app.js`, `styles.css`, `sw.js` من `legal-agenda-app/` إلى:
  - `legal-agenda-app-android/app/src/main/assets/`
  - `legal-agenda-app-ios/LegalAgenda/www/`
