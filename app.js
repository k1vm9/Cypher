(() => {
  "use strict";

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const loginGate = $("#loginGate");
  const appShell = $("#appShell");
  const accessKey = $("#accessKey");
  const loginForm = $("#loginForm");
  const loginError = $("#loginError");
  const toastRegion = $("#toastRegion");
  const icon = (name) => `<svg><use href="#i-${name}"></use></svg>`;
  let csrfToken = "";
  let currentThread = "";
  let eventStream = null;
  let currentGroupInfo = null;
  let autoScrollLogs = true;
  let currentLanguage = (() => {
    try { return localStorage.getItem("cypher-language") === "en" ? "en" : "ar"; } catch (_) { return "ar"; }
  })();

  const arabicTranslations = {
    "SECURE ACCESS": "دخول آمن",
    "Welcome to": "مرحباً بك في",
    "Bot Dashboard": "لوحة تحكم البوت",
    "Enter the access key to open the control center.": "أدخل مفتاح الدخول لفتح مركز التحكم.",
    "Access key": "مفتاح الدخول",
    "Enter your access key": "أدخل مفتاح الدخول",
    "SHOW": "إظهار",
    "HIDE": "إخفاء",
    "Enter Dashboard": "دخول لوحة التحكم",
    "Protected session · local preview": "جلسة محمية · معاينة محلية",
    "Online": "متصل",
    "Logout": "تسجيل الخروج",
    "ACTIVE INSTANCE": "النسخة النشطة",
    "Secure AI automation and messaging bot": "بوت آلي ومراسلة آمن بالذكاء الاصطناعي",
    "No session": "لا توجد جلسة",
    "Updated just now": "تم التحديث الآن",
    "Messages": "الرسائل",
    "Commands": "الأوامر",
    "Groups": "المجموعات",
    "Users": "المستخدمون",
    "Uptime": "مدة التشغيل",
    "Total commands": "إجمالي الأوامر",
    "Protection layers": "طبقات الحماية",
    "RAM usage": "استخدام الذاكرة",
    "live": "مباشر",
    "catalogued": "مفهرس",
    "catalogue": "الفهرس",
    "active": "نشط",
    "runtime": "وقت التشغيل",
    "Home": "الرئيسية",
    "Messenger": "مسنجر",
    "Cookies": "ملفات الارتباط",
    "Connected": "متصل",
    "Connected to Messenger": "متصل بمسنجر",
    "Connecting to Messenger…": "جارٍ الاتصال بمسنجر…",
    "Session stored but not connected": "الجلسة محفوظة ولكنها غير متصلة",
    "Session stored": "الجلسة محفوظة",
    "Connection stopped": "تم إيقاف الاتصال",
    "Stopped": "متوقف",
    "Auth error": "خطأ في المصادقة",
    "Dependency missing": "اعتمادية مفقودة",
    "Offline": "غير متصل",
    "Messenger rejected this session": "رفض مسنجر هذه الجلسة",
    "Messenger client is not installed": "عميل مسنجر غير مثبت",
    "Messenger connection is offline": "اتصال مسنجر غير متصل",
    "Session data is stored locally; values are never shown.": "بيانات الجلسة محفوظة محلياً ولا تظهر القيم أبداً.",
    "Messenger client unavailable until its dependency is installed": "عميل مسنجر غير متاح حتى تثبيت الاعتمادية المطلوبة",
    "Activation": "التفعيل",
    "Editor": "المحرر",
    "Protection": "الحماية",
    "Settings": "الإعدادات",
    "AI Intelligence": "ذكاء اصطناعي",
    "Files": "الملفات",
    "Admin": "المشرفون",
    "Control Center": "مركز التحكم",
    "Chat": "محادثة",
    "COMMAND DECK": "لوحة الأوامر",
    "Main Controls": "التحكم الرئيسي",
    "Operate your bot instance with confidence.": "أدر نسخة البوت بثقة.",
    "Restart Bot": "إعادة تشغيل البوت",
    "Reload the active instance": "إعادة تحميل النسخة النشطة",
    "Stop Bot": "إيقاف البوت",
    "Bring the instance offline": "إيقاف النسخة عن العمل",
    "Admin Only": "للمشرفين فقط",
    "Lock bot to administrators": "قصر البوت على المشرفين",
    "Silent Mode": "الوضع الصامت",
    "Pause non-critical replies": "إيقاف الردود غير الضرورية",
    "Refresh Data": "تحديث البيانات",
    "Sync live bot telemetry": "مزامنة بيانات البوت المباشرة",
    "Ping": "فحص الاتصال",
    "Check connection latency": "فحص زمن استجابة الاتصال",
    "Open Messenger": "فتح مسنجر",
    "View active conversations": "عرض المحادثات النشطة",
    "View Logs": "عرض السجلات",
    "Inspect system activity": "فحص نشاط النظام",
    "Latest Messages": "أحدث الرسائل",
    "Recent activity across your groups": "أحدث النشاطات في مجموعاتك",
    "View all": "عرض الكل",
    "No messages yet": "لا توجد رسائل بعد",
    "New activity will appear here in real time.": "سيظهر النشاط الجديد هنا مباشرةً.",
    "System health": "حالة النظام",
    "Dashboard online · Messenger session required": "لوحة التحكم متصلة · جلسة مسنجر مطلوبة",
    "Awaiting session": "بانتظار الجلسة",
    "Core process": "العملية الأساسية",
    "Database": "قاعدة البيانات",
    "MQTT bridge": "جسر MQTT",
    "Healthy": "سليم",
    "Waiting": "بانتظار",
    "Connect a Messenger session to begin live checks": "صل جلسة مسنجر لبدء الفحوصات المباشرة",
    "COMMUNICATIONS": "الاتصالات",
    "Keep a pulse on every active conversation.": "تابع جميع المحادثات النشطة.",
    "Conversations": "المحادثات",
    "Live Messenger threads": "محادثات مسنجر المباشرة",
    "Search threads": "البحث في المحادثات",
    "No live conversations": "لا توجد محادثات مباشرة",
    "Connect a Messenger session to load threads.": "صل جلسة مسنجر لتحميل المحادثات.",
    "No conversation selected": "لم يتم اختيار محادثة",
    "Connect Messenger to begin": "صل مسنجر للبدء",
    "Connect Messenger to begin": "صل مسنجر للبدء",
    "Write a message...": "اكتب رسالة...",
    "Connect Messenger before sending...": "صل مسنجر قبل الإرسال...",
    "Silent unavailable": "الوضع الصامت غير متاح",
    "No group selected": "لم يتم اختيار مجموعة",
    "Live group information": "معلومات المجموعة المباشرة",
    "Members": "الأعضاء",
    "Choose a live conversation.": "اختر محادثة مباشرة.",
    "SESSION SECURITY": "أمان الجلسة",
    "Import a trusted session to connect Cypher to Messenger.": "استورد جلسة موثوقة لربط Cypher بمسنجر.",
    "Sensitive": "حساس",
    "Import session data": "استيراد بيانات الجلسة",
    "Paste an appstate JSON, c3c export, or browser cookie header.": "الصق JSON لـ appstate أو تصدير c3c أو ترويسة ملفات ارتباط المتصفح.",
    "No session imported": "لم يتم استيراد جلسة",
    "Import an appstate JSON export to enable live conversations.": "استورد ملف appstate JSON لتفعيل المحادثات المباشرة.",
    "Session payload": "بيانات الجلسة",
    "Drop session file here": "أفلت ملف الجلسة هنا",
    "or browse files": "أو تصفح الملفات",
    "JSON, TXT, or cookie header · encrypted in transit": "JSON أو TXT أو ترويسة ملفات ارتباط · مشفرة أثناء النقل",
    "Import session": "استيراد الجلسة",
    "Connect session": "اتصال بالجلسة",
    "Clear stored session": "مسح الجلسة المحفوظة",
    "Session values stay on this instance and are never shown in the panel.": "تبقى بيانات الجلسة في هذه النسخة ولا تظهر في اللوحة.",
    "Before you import": "قبل الاستيراد",
    "Keep your account protected.": "حافظ على حماية حسابك.",
    "Only use sessions from an account you control.": "استخدم جلسات من حساب تملكه فقط.",
    "Never paste cookies into public chats or logs.": "لا تلصق ملفات الارتباط في المحادثات العامة أو السجلات.",
    "Importing a new session replaces the current one.": "استيراد جلسة جديدة يستبدل الجلسة الحالية.",
    "Encrypted at rest": "مشفرة أثناء التخزين",
    "Stored only for this bot instance.": "محفوظة لهذه النسخة من البوت فقط.",
    "AUTOMATION LIBRARY": "مكتبة الأتمتة",
    "Manage the commands your bot knows.": "أدر الأوامر التي يعرفها البوت.",
    "New command": "أمر جديد",
    "Search commands": "البحث في الأوامر",
    "All commands": "كل الأوامر",
    "Utility": "أدوات",
    "AI": "ذكاء اصطناعي",
    "THREAD ROUTING": "توجيه المحادثات",
    "Choose where Cypher can respond and operate.": "اختر الأماكن التي يمكن لـ Cypher الرد والعمل فيها.",
    "Save changes": "حفظ التغييرات",
    "Thread configuration": "إعدادات المحادثة",
    "Set the default activation behavior.": "حدد سلوك التفعيل الافتراضي.",
    "Thread or group ID": "معرف المحادثة أو المجموعة",
    "Connect Messenger to load threads": "صل مسنجر لتحميل المحادثات",
    "Announcement text": "نص الإعلان",
    "Optional welcome or activation message...": "رسالة ترحيب أو تفعيل اختيارية...",
    "Whitelist": "القائمة البيضاء",
    "Blacklist": "القائمة السوداء",
    "DEFENSE MATRIX": "مصفوفة الدفاع",
    "Manage the safety layers available to the bot.": "أدر طبقات الأمان المتاحة للبوت.",
    "Loading": "جارٍ التحميل",
    "INSTANCE PREFERENCES": "تفضيلات النسخة",
    "Shape the way Cypher behaves across your workspace.": "حدد طريقة عمل Cypher في مساحة العمل.",
    "Save settings": "حفظ الإعدادات",
    "General": "عام",
    "Basic bot identity and commands.": "هوية البوت وأوامره الأساسية.",
    "Bot name": "اسم البوت",
    "Command prefix": "بادئة الأمر",
    "Default language": "اللغة الافتراضية",
    "Connection": "الاتصال",
    "Keep your instance reachable.": "حافظ على إمكانية الوصول إلى نسختك.",
    "Maintain a warm connection": "الحفاظ على اتصال نشط",
    "Reconnect automatically on failure": "إعادة الاتصال تلقائياً عند الفشل",
    "Reconnect interval": "فترة إعادة الاتصال",
    "Privacy": "الخصوصية",
    "Control visibility and responses.": "تحكم في الظهور والردود.",
    "Stealth mode": "الوضع الخفي",
    "Reduce bot presence signals": "تقليل إشارات وجود البوت",
    "Allow inbox messages": "السماح برسائل الوارد",
    "Respond to direct messages": "الرد على الرسائل المباشرة",
    "Access control": "التحكم في الوصول",
    "Protect high-impact operations.": "احمِ العمليات عالية التأثير.",
    "Admin-only mode": "وضع المشرفين فقط",
    "Only admins can use commands": "المشرفون فقط يمكنهم استخدام الأوامر",
    "Dashboard password": "كلمة مرور لوحة التحكم",
    "ACTIVITY FEED": "خلاصة النشاط",
    "Review recent message events from connected threads.": "راجع أحداث الرسائل الأخيرة من المحادثات المتصلة.",
    "Filter": "تصفية",
    "Search message log": "البحث في سجل الرسائل",
    "Sender": "المرسل",
    "Thread": "المحادثة",
    "Message preview": "معاينة الرسالة",
    "Status": "الحالة",
    "Processed": "تمت المعالجة",
    "SYSTEM OUTPUT": "مخرجات النظام",
    "Terminal output and operational events.": "مخرجات الطرفية والأحداث التشغيلية.",
    "Auto-scroll": "تمرير تلقائي",
    "Clear": "مسح",
    "Download": "تنزيل",
    "LIVE": "مباشر",
    "COMMAND LABORATORY": "مختبر الأوامر",
    "Generate, test, and refine new bot capabilities.": "أنشئ واختبر وحسّن قدرات البوت.",
    "Ready": "جاهز",
    "Generate a command": "إنشاء أمر",
    "Describe what you want Cypher to automate.": "صف ما تريد من Cypher أتمتته.",
    "Generation complete": "اكتمل الإنشاء",
    "Generate": "إنشاء",
    "Ask Cypher AI": "اسأل Cypher AI",
    "Your assistant for bot operations.": "مساعدك لعمليات البوت.",
    "Reset conversation": "إعادة ضبط المحادثة",
    "INSTANCE FILESYSTEM": "نظام ملفات النسخة",
    "Browse source files and bring context into the AI lab.": "تصفح ملفات المصدر وأضف سياقاً إلى مختبر الذكاء الاصطناعي.",
    "Upload file": "رفع ملف",
    "Root": "الجذر",
    "Sensitive values are redacted": "تم إخفاء القيم الحساسة",
    "Save file": "حفظ الملف",
    "TRUSTED OPERATORS": "المشغلون الموثوقون",
    "Manage who can access high-impact bot controls.": "أدر من يمكنه الوصول إلى أدوات البوت الحساسة.",
    "Save admin list": "حفظ قائمة المشرفين",
    "Owner": "المالك",
    "One account with full control.": "حساب واحد بصلاحيات كاملة.",
    "Super admins": "المشرفون العامون",
    "Can manage settings and access.": "يمكنهم إدارة الإعدادات والوصول.",
    "Can use approved bot commands.": "يمكنهم استخدام أوامر البوت المعتمدة.",
    "Add owner": "إضافة مالك",
    "Add super admin": "إضافة مشرف عام",
    "Add admin": "إضافة مشرف",
    "AUTOMATION ORCHESTRATOR": "منسق الأتمتة",
    "Schedule messages and automate group behavior.": "جدولة الرسائل وأتمتة سلوك المجموعات.",
    "Stop all automation": "إيقاف كل الأتمتة",
    "Automatic messages": "الرسائل التلقائية",
    "Send a recurring message to a selected live group.": "إرسال رسالة متكررة إلى مجموعة مباشرة محددة.",
    "Target group": "المجموعة المستهدفة",
    "No connected groups": "لا توجد مجموعات متصلة",
    "Message": "الرسالة",
    "Connect Messenger before scheduling messages...": "صل مسنجر قبل جدولة الرسائل...",
    "Minimum interval": "الحد الأدنى للفترة",
    "Maximum interval": "الحد الأقصى للفترة",
    "Save message": "حفظ الرسالة",
    "Connect Messenger to schedule messages": "صل مسنجر لجدولة الرسائل",
    "Group name locking": "قفل اسم المجموعة",
    "Enable name protection for a selected live group.": "تفعيل حماية الاسم لمجموعة مباشرة محددة.",
    "Connect Messenger to configure protection": "صل مسنجر لإعداد الحماية",
    "Auto-restore changes": "استعادة التغييرات تلقائياً",
    "Restore the name when modified": "استعادة الاسم عند تغييره",
    "Nicknames": "الأسماء المستعارة",
    "Available after a live group is selected.": "متاح بعد اختيار مجموعة مباشرة.",
    "Add": "إضافة",
    "No live group selected.": "لم يتم اختيار مجموعة مباشرة.",
    "Switch to English": "التبديل إلى الإنجليزية",
    "Switch to Arabic": "التبديل إلى العربية",
    "Toggle appearance": "تبديل المظهر",
    "Show access key": "إظهار مفتاح الدخول",
    "Hide access key": "إخفاء مفتاح الدخول",
  };

  function translateText(value) {
    const text = String(value ?? "");
    return currentLanguage === "ar" ? (arabicTranslations[text.trim()] || text) : text;
  }

  function applyLanguage() {
    document.documentElement.lang = currentLanguage;
    document.documentElement.dir = currentLanguage === "ar" ? "rtl" : "ltr";
    document.body.dataset.language = currentLanguage;
    document.querySelectorAll("body *").forEach((element) => {
      if (element.tagName === "SCRIPT" || element.tagName === "STYLE" || element.tagName === "TEXTAREA" || element.tagName === "PRE") return;
      element.childNodes.forEach((node) => {
        if (node.nodeType !== Node.TEXT_NODE || !node.nodeValue.trim()) return;
        const raw = node.nodeValue.trim();
        const source = node.__cypherLanguageSource && raw === node.__cypherLanguageRendered
          ? node.__cypherLanguageSource
          : raw;
        node.__cypherLanguageSource = source;
        const leading = node.nodeValue.match(/^\s*/)?.[0] || "";
        const trailing = node.nodeValue.match(/\s*$/)?.[0] || "";
        const translated = currentLanguage === "ar" ? (arabicTranslations[source] || source) : source;
        node.nodeValue = `${leading}${translated}${trailing}`;
        node.__cypherLanguageRendered = translated;
      });
    });
    const translatableAttributes = ["placeholder", "aria-label", "title"];
    document.querySelectorAll(translatableAttributes.map((attribute) => `[${attribute}]`).join(",")).forEach((element) => {
      translatableAttributes.forEach((attribute) => {
        if (!element.hasAttribute(attribute)) return;
        const sourceAttribute = `data-cypher-${attribute.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-source`;
        const renderedAttribute = `data-cypher-${attribute.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-rendered`;
        const currentAttribute = element.getAttribute(attribute);
        const previousRendered = element.getAttribute(renderedAttribute);
        const source = element.getAttribute(sourceAttribute) && currentAttribute === previousRendered
          ? element.getAttribute(sourceAttribute)
          : currentAttribute;
        element.setAttribute(sourceAttribute, source);
        const translated = currentLanguage === "ar" ? (arabicTranslations[source] || source) : source;
        element.setAttribute(attribute, translated);
        element.setAttribute(renderedAttribute, translated);
      });
    });
    const toggle = $("#languageToggle");
    if (toggle) {
      const nextLanguage = currentLanguage === "ar" ? "English" : "العربية";
      toggle.querySelector(".language-code").textContent = currentLanguage === "ar" ? "EN" : "ع";
      toggle.querySelector(".language-name").textContent = nextLanguage;
      toggle.setAttribute("aria-label", currentLanguage === "ar" ? "Switch to English" : "Switch to Arabic");
      toggle.setAttribute("title", currentLanguage === "ar" ? "Switch to English" : "Switch to Arabic");
    }
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    }[character]));
  }

  async function api(path, options = {}) {
    const method = String(options.method || "GET").toUpperCase();
    const headers = { ...(options.headers || {}) };
    if (method !== "GET" && method !== "HEAD") {
      if (!csrfToken) {
        const tokenResponse = await fetch("/api/auth/csrf", { cache: "no-store" });
        const tokenData = await tokenResponse.json().catch(() => ({}));
        csrfToken = tokenData.csrf || "";
      }
      headers["Content-Type"] = "application/json";
      headers["x-csrf-token"] = csrfToken;
    }
    const response = await fetch(path, { ...options, headers, cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      showLogin();
      throw new Error(data.error || "Your session has expired.");
    }
    if (!response.ok || data.ok === false) throw new Error(data.error || "The request could not be completed.");
    return data;
  }

  function showLogin() {
    eventStream?.close();
    eventStream = null;
    appShell.classList.add("is-hidden");
    loginGate.classList.remove("is-hidden");
    document.body.classList.remove("authenticated");
    csrfToken = "";
  }

  async function showApp() {
    loginGate.classList.add("is-hidden");
    appShell.classList.remove("is-hidden");
    document.body.classList.add("authenticated");
    await loadDashboard();
    connectLiveEvents();
  }

  function syncStatus(data) {
    if (!data) return;
    const messenger = data.messenger || {};
    const status = messenger.status || data.status || "no-session";
    const statusLabels = {
      connected: "Connected",
      connecting: "Connecting",
      stored: "Session stored",
      "no-session": "No session",
      stopped: "Stopped",
      "auth-error": "Auth error",
      "dependency-missing": "Dependency missing",
      offline: "Offline",
    };
    const statusLabel = statusLabels[status] || status.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
    const connected = status === "connected";
    $$(".connection-pill").forEach((pill) => {
      const label = pill.querySelector("span:nth-child(2)");
      const latency = pill.querySelector(".connection-label");
      if (label) label.textContent = statusLabel;
      if (latency) latency.textContent = connected ? `· ${data.latency || "—"}ms` : "· waiting";
      pill.classList.toggle("is-offline", !connected);
    });
    $$(".profile-card .badge").forEach((badge) => {
      badge.innerHTML = `<span class="status-dot ${connected ? "online" : status === "connecting" ? "amber" : ""}"></span> ${statusLabel}`;
      badge.className = `badge ${connected ? "badge-success" : status === "connecting" || status === "stored" ? "badge-warning" : "badge-red"}`;
    });
    $$(".profile-card .eyebrow .status-dot").forEach((dot) => {
      dot.className = `status-dot ${connected ? "online" : status === "connecting" || status === "stored" ? "amber" : ""}`;
    });
    const stats = data.stats || {};
    const values = [
      stats.messages, stats.commands, stats.groups, Number(stats.users || 0).toLocaleString(),
      stats.uptime, stats.totalCommands?.toLocaleString(), String(stats.protections ?? "—").padStart(2, "0"), stats.ram,
    ];
    $$(".stat-card strong").forEach((value, index) => {
      if (values[index] !== undefined) value.textContent = values[index];
    });
    const profileVersion = $(".profile-copy code");
    if (profileVersion) profileVersion.textContent = `cypher-live · v${data.version || "1.2.14"}`;
    const settingsPanel = $("#panel-settings");
    if (settingsPanel) {
      const fields = $$("input", settingsPanel);
      if (fields[0] && document.activeElement !== fields[0]) fields[0].value = data.settings?.botName || "Cypher";
      if (fields[1] && document.activeElement !== fields[1]) fields[1].value = data.settings?.prefix || "!";
    }
    const activation = $("#panel-activation .segmented");
    if (activation) {
      $$(".segmented button", activation).forEach((button) => {
        button.classList.toggle("active", button.textContent.trim().toLowerCase() === data.settings?.activationMode);
      });
    }
    $("[data-action='admin'] .toggle")?.classList.toggle("active", Boolean(data.settings?.adminOnly));
    $("[data-action='silent'] .toggle")?.classList.toggle("active", Boolean(data.settings?.silentMode));
    const silentChip = $(".silent-chip");
    if (silentChip) silentChip.innerHTML = `<span class="status-dot ${data.settings?.silentMode ? "amber" : connected ? "online" : ""}"></span> Silent ${connected ? (data.settings?.silentMode ? "on" : "off") : "unavailable"}`;
    const composerInput = $(".composer-input textarea");
    const sendButton = $(".composer-input .send-btn");
    if (composerInput) {
      composerInput.disabled = !connected;
      composerInput.placeholder = connected ? "Write a message..." : "Connect Messenger before sending...";
    }
    if (sendButton) sendButton.disabled = !connected;
    const statusSummary = $("#veilStatusSummary");
    if (statusSummary) statusSummary.textContent = `${data.activeProtectionCount || 0}/${data.protectionCount || 20} safety layers active`;
    if (data.messages) renderMessages(data.messages);
    if (data.logs) renderLogs(data.logs);
    if (data.schedules) renderSchedules(data.schedules);
    $$(".toggle[data-setting]").forEach((toggle) => {
      toggle.classList.toggle("active", Boolean(data.settings?.[toggle.dataset.setting]));
    });
    $$(".toggle[aria-label]").forEach((toggle) => {
      const label = String(toggle.getAttribute("aria-label") || "").toLowerCase();
      const setting = label.includes("silent") ? "silentMode"
        : label.includes("admin") ? "adminOnly"
          : label.includes("keep-alive") ? "keepAlive"
            : label.includes("mqtt") ? "mqttReconnect"
              : label.includes("stealth") ? "stealthMode"
                : label.includes("inbox") ? "allowInbox"
                  : "";
      if (setting && data.settings?.[setting] !== undefined) toggle.classList.toggle("active", Boolean(data.settings[setting]));
    });
    $$(".toggle[data-protection]").forEach((toggle) => {
      toggle.classList.toggle("active", Boolean(data.protections?.[toggle.dataset.protection]));
      const label = toggle.closest(".protection-card")?.querySelector(".status-label");
      if (label) {
        label.className = `status-label ${data.protections?.[toggle.dataset.protection] ? "enabled" : "disabled"}`;
        label.innerHTML = `<span class="status-dot ${data.protections?.[toggle.dataset.protection] ? "online" : ""}"></span> ${data.protections?.[toggle.dataset.protection] ? "Enabled" : "Disabled"}`;
      }
    });
    renderHealth(data, status);
    syncSession(messenger);
    applyLanguage();
  }

  function renderHealth(data, status) {
    const card = $(".health-card");
    if (!card) return;
    const connected = status === "connected";
    const dependencyReady = Boolean(data.runtime?.client);
    const rows = $$(".health-row", card);
    const values = [
      [100, "Healthy"],
      [100, "Healthy"],
      [connected ? 100 : dependencyReady ? 35 : 0, connected ? "Healthy" : dependencyReady ? "Ready" : "Waiting"],
    ];
    rows.forEach((row, index) => {
      const progress = $(".progress i", row);
      const label = row.querySelector("b");
      if (progress) progress.style.width = `${values[index]?.[0] || 0}%`;
      if (label) label.textContent = values[index]?.[1] || "Waiting";
    });
    const badge = $(".card-heading .badge", card);
    if (badge) {
      badge.className = `badge ${connected ? "badge-success" : "badge-warning"}`;
      badge.textContent = connected ? "Healthy" : "Awaiting session";
    }
    const footer = $(".health-footer", card);
    if (footer) {
      footer.innerHTML = `<span class="status-dot ${connected ? "online" : ""}"></span> ${connected ? `Live bridge · ${data.runtime?.client || "Messenger"}` : dependencyReady ? "Import a Messenger session to begin live checks" : "Messenger client unavailable until its dependency is installed"}`;
    }
  }

  function syncSession(session = {}) {
    const status = session.status || "no-session";
    const labels = {
      connected: "Connected to Messenger",
      connecting: "Connecting to Messenger…",
      stored: "Session stored but not connected",
      "no-session": "No session imported",
      stopped: "Connection stopped",
      "auth-error": "Messenger rejected this session",
      "dependency-missing": "Messenger client is not installed",
      offline: "Messenger connection is offline",
    };
    const statusNode = $("#sessionStatus");
    if (statusNode) {
      statusNode.className = `session-status ${status === "connected" ? "connected" : status === "connecting" ? "connecting" : "disconnected"}`;
      statusNode.innerHTML = `<span class="status-dot ${status === "connected" ? "online" : status === "connecting" ? "amber" : ""}"></span><span><strong>${labels[status] || status}</strong><small>${session.error ? escapeHtml(session.error) : session.hasSession ? "Session data is stored locally; values are never shown." : "Import an appstate JSON export to enable live conversations."}</small></span>`;
    }
    const connect = $('[data-action="connect-session"]');
    const clear = $('[data-action="clear-session"]');
    if (connect) {
      connect.disabled = status === "connecting" || status === "connected";
      connect.textContent = status === "connected" ? "Connected" : "Connect session";
    }
    if (clear) clear.disabled = !session.hasSession || status === "connecting";
  }

  async function loadDashboard() {
    try {
      const [status, commands, protections] = await Promise.all([
        api("/api/status"),
        api("/api/commands"),
        api("/api/protections"),
      ]);
      syncStatus(status);
      renderCommands(commands.commands || []);
      renderProtections(protections.protections || []);
      renderLogs(status.logs || []);
      renderMessages(status.messages || []);
      injectVeilFeatures();
      wirePanelControls();
      renderSchedules(status.schedules || []);
      await loadThreads();
      await loadFiles();
      await loadAdmins();
      applyLanguage();
    } catch (error) {
      toast(error.message, "error");
    }
  }

  function connectLiveEvents() {
    eventStream?.close();
    eventStream = new EventSource("/api/events");
    eventStream.addEventListener("state-update", (event) => {
      try { syncStatus(JSON.parse(event.data)); } catch (_) {}
    });
    eventStream.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.threadID === currentThread) appendMessage(message, "incoming");
      } catch (_) {}
    });
    eventStream.addEventListener("log-line", (event) => {
      try { appendLog(JSON.parse(event.data)); } catch (_) {}
    });
    eventStream.onerror = () => {
      eventStream?.close();
      setTimeout(() => {
        if (!appShell.classList.contains("is-hidden")) connectLiveEvents();
      }, 5000);
    };
  }

  function appendLog(log) {
    const lines = $("#logLines");
    if (!lines || !log) return;
    $(".log-empty", lines)?.remove();
    const row = document.createElement("div");
    const level = String(log.level || "INFO").toLowerCase();
    row.innerHTML = `<time>${escapeHtml(log.time || "")}</time><b class="${level}">${escapeHtml(log.level || "INFO")}</b><span>${escapeHtml(log.text || "")} <em>${escapeHtml(log.meta || "")}</em></span>`;
    lines.prepend(row);
    while (lines.children.length > 100) lines.lastElementChild.remove();
    const count = $("#panel-logs .inline-count");
    if (count) count.textContent = String(lines.querySelectorAll(":scope > div:not(.log-empty)").length);
    if (autoScrollLogs) lines.scrollTop = 0;
    applyLanguage();
  }

  async function runAction(action, button, payload = {}) {
    if (button) button.disabled = true;
    try {
      const data = await api("/api/actions", {
        method: "POST",
        body: JSON.stringify({ action, ...payload }),
      });
      syncStatus(data.state);
      const messages = {
        restart: "Restart queued · instance will reconnect shortly",
        stop: "Cypher is offline",
        start: "Cypher is online",
        admin: "Admin-only mode updated",
        silent: "Silent mode preference updated",
        lock: "Bot lock updated",
        refresh: "Telemetry refreshed just now",
        ping: `Ping complete · ${data.state?.latency || 42}ms round trip`,
        import: "Session payload validated and ready",
        reload: "Configuration reloaded",
        "clear-logs": "Log stream cleared",
        "stop-all": "All automated jobs paused",
        "save-message": "Automatic message schedule saved",
      };
      toast(messages[action] || "Action completed");
      if (["restart", "stop", "start", "refresh"].includes(action)) await loadThreads();
      return data;
    } catch (error) {
      toast(error.message, "error");
      return null;
    } finally {
      if (button) button.disabled = false;
    }
  }

  function commandCategory(command) {
    const category = String(command.category || "").toLowerCase();
    if (/ai|ذكاء/.test(category)) return "AI";
    if (/admin|إدارة|مسؤولي/.test(category) || Number(command.role) >= 2) return "Admin";
    if (/game|لعب|ترفيه/.test(category)) return "Fun";
    return "Utility";
  }

  function renderCommands(commands) {
    const grid = $(".command-grid");
    if (!grid) return;
    grid.innerHTML = commands.map((command) => {
      const category = commandCategory(command);
      const aliases = (command.aliases || []).slice(0, 2).join(", ");
      const readonly = command.source === "veil";
      return `<article class="command-card panel live-command-card" data-category="${category}" data-command="${escapeHtml(command.name)}">
        <div class="command-top"><code>!${escapeHtml(command.name)}</code><span class="badge ${category === "AI" ? "badge-purple" : category === "Admin" ? "badge-red" : "badge-cyan"}">${category}</span></div>
        <p>${escapeHtml(command.description || "No description available.")}</p>
        <div class="command-meta"><span>${aliases ? `Alias: <code>${escapeHtml(aliases)}</code>` : `${readonly ? "Veil catalog" : "Cypher native"}`}</span><span class="permission">${icon(Number(command.role) >= 2 ? "lock" : "user")} ${Number(command.role) >= 2 ? "Admins" : "Everyone"}</span></div>
        <div class="command-bottom"><span class="status-label ${command.enabled ? "enabled" : "disabled"}"><span class="status-dot ${command.enabled ? "online" : ""}"></span> ${command.enabled ? "Enabled" : "Disabled"}</span>
          <button class="text-btn command-edit" data-command-file="${escapeHtml(command.file)}">${readonly ? "View source" : "Edit"} ${icon("arrow")}</button></div>
      </article>`;
    }).join("");
    const count = $(".inline-count", $("#panel-commands"));
    if (count) count.textContent = commands.length;
    const panel = $("#panel-commands");
    const search = $(".toolbar .search-box input", panel);
    const filters = $$(".filter-btn", panel);
    if (search && !search.dataset.bound) {
      search.dataset.bound = "true";
      const filter = () => {
        const query = search.value.toLowerCase().trim();
        const activeFilter = $(".filter-btn.active", panel)?.textContent.trim() || "All commands";
        $$(".live-command-card", grid).forEach((card) => {
          const matchesQuery = !query || card.textContent.toLowerCase().includes(query);
          const matchesCategory = activeFilter === "All commands" || card.dataset.category === activeFilter;
          card.classList.toggle("is-hidden", !(matchesQuery && matchesCategory));
        });
      };
      search.addEventListener("input", filter);
      filters.forEach((filterButton) => filterButton.addEventListener("click", () => {
        filters.forEach((item) => item.classList.remove("active"));
        filterButton.classList.add("active");
        filter();
      }));
    }
  }

  function renderLogs(logs) {
    const lines = $("#logLines");
    if (!lines) return;
    lines.innerHTML = "";
    if (logs.length) logs.slice(0, 100).reverse().forEach(appendLog);
    else lines.innerHTML = `<div class="log-empty">No log entries yet.</div>`;
    const count = $("#panel-logs .inline-count");
    if (count) count.textContent = String(logs.length);
    if (autoScrollLogs) lines.scrollTop = 0;
    applyLanguage();
  }

  function renderMessages(messages) {
    const table = $(".data-table", $("#panel-messages"));
    if (!table) return;
    const head = $(".table-head", table);
    table.innerHTML = head ? head.outerHTML : "";
    if (!messages.length) {
      table.insertAdjacentHTML("beforeend", `<div class="table-empty">No message events yet.</div>`);
    }
    messages.slice(0, 50).forEach((message) => {
      const thread = message.threadID === "thread_9204" ? "Design Systems"
        : message.threadID === "thread_1920" ? "AI Lab / prompts"
          : message.threadID === "thread_4402" ? "Ops Control" : "Nightwatch Ops";
      const row = document.createElement("div");
      row.className = "table-row";
      const status = String(message.status || "Processed");
      row.innerHTML = `<span class="person"><span class="avatar tiny blue-avatar">ME</span>${escapeHtml(message.sender || "You")}</span><span>${thread}</span><span>${escapeHtml(String(message.content || "").slice(0, 48))}</span><time>${escapeHtml(message.time || "")}</time><span class="status-label enabled">${escapeHtml(status)}</span>`;
      table.appendChild(row);
    });
    const count = $(".table-count", $("#panel-messages"));
    if (count) count.textContent = `${messages.length} event${messages.length === 1 ? "" : "s"}`;
    const preview = $(".message-preview-card");
    if (preview) {
      const content = messages.length
        ? messages.slice(0, 3).map((message) => `<div class="message-preview-row"><span class="avatar tiny blue-avatar">${escapeHtml(String(message.sender || "U").slice(0, 2).toUpperCase())}</span><span><strong>${escapeHtml(message.sender || "Unknown")}</strong><small>${escapeHtml(String(message.content || "").slice(0, 72))}</small></span><time>${escapeHtml(message.time || "")}</time></div>`).join("")
        : `<div class="empty-state compact"><div class="empty-icon">${icon("eye")}</div><strong>No messages yet</strong><span>New activity will appear here in real time.</span></div>`;
      const existing = $(".empty-state, .message-preview-list", preview);
      if (existing) {
        existing.outerHTML = `<div class="message-preview-list">${content}</div>`;
      } else {
        preview.insertAdjacentHTML("beforeend", `<div class="message-preview-list">${content}</div>`);
      }
    }
  }

  function renderSchedules(schedules) {
    const card = $("[data-automation='messages']");
    if (!card) return;
    const schedule = schedules.find((item) => item.id === "automatic-message") || schedules[0];
    const toggle = $("[data-schedule-toggle]", card);
    if (toggle) toggle.classList.toggle("active", Boolean(schedule?.enabled));
     if (!schedule) {
       if (toggle) toggle.disabled = true;
       const select = $("select", card);
       const message = $(".text-area", card);
       const fields = $$("input", card);
       if (select) select.disabled = true;
       if (message) message.value = "";
       fields.forEach((field) => { field.value = ""; field.disabled = true; });
       const nextRun = $(".next-run", card);
       if (nextRun) nextRun.textContent = "Connect Messenger to schedule messages";
       return;
     }
     if (toggle) toggle.disabled = false;
    card.dataset.scheduleId = schedule.id;
    const select = $("select", card);
    const message = $(".text-area", card);
    const fields = $$("input", card);
     if (select) select.disabled = false;
     fields.forEach((field) => { field.disabled = false; });
    if (select) select.value = schedule.threadID;
    if (message && document.activeElement !== message) message.value = schedule.message || "";
    if (fields[0] && document.activeElement !== fields[0]) fields[0].value = schedule.min;
    if (fields[1] && document.activeElement !== fields[1]) fields[1].value = schedule.max;
    const nextRun = $(".next-run", card);
    if (nextRun) {
      nextRun.textContent = schedule.lastError
        ? schedule.lastError
        : schedule.enabled ? `Next run · every ${schedule.min}–${schedule.max} min` : "Paused";
    }
  }

  async function loadFiles() {
    const list = $(".files-list", $("#panel-files"));
    if (!list) return;
    try {
      const data = await api("/api/files/tree");
      const flat = [];
      const flatten = (items, depth = 0) => items.forEach((item) => {
        if (item.type === "dir") {
          flat.push({ ...item, depth });
          flatten(item.children || [], depth + 1);
        } else flat.push({ ...item, depth });
      });
      flatten(data.tree || []);
      list.innerHTML = `<div class="file-search search-box"><svg><use href="#i-search"></use></svg><input placeholder="Filter files" aria-label="Filter files"></div>${flat.map((item) => item.type === "dir"
        ? `<div class="folder-label" data-file-name="${escapeHtml(item.name)}" style="padding-left:${10 + item.depth * 12}px">${icon("folder")}${escapeHtml(item.name)}</div>`
        : `<button class="file-row" data-file-path="${escapeHtml(item.path)}" style="padding-left:${10 + item.depth * 12}px">${icon("code")}<span>${escapeHtml(item.name)}</span><small>${item.ext || ""}</small></button>`).join("")}`;
      $(".file-search input", list)?.addEventListener("input", (event) => {
        const query = event.target.value.toLowerCase();
        $$(".file-row, .folder-label", list).forEach((row) => row.classList.toggle("is-hidden", query && !row.textContent.toLowerCase().includes(query)));
      });
      const firstFile = flat.find((item) => item.type === "file");
      if (firstFile) await loadFilePreview(firstFile.path);
    } catch (error) {
      toast(error.message, "error");
    }
  }

  async function loadFilePreview(filePath) {
    try {
      const data = await api(`/api/files/read?path=${encodeURIComponent(filePath)}`);
      const preview = $(".code-preview", $("#panel-files"));
      const title = $(".file-preview-head strong", $("#panel-files"));
      const meta = $(".file-preview-head strong + span", $("#panel-files"));
      if (title) title.textContent = filePath.split("/").pop();
      if (meta) meta.textContent = `${filePath} · ${data.size} bytes`;
      if (preview) preview.textContent = data.content;
      if (preview) preview.dataset.filePath = filePath;
      const save = $('[data-action="save-file"]', $("#panel-files"));
      if (save) save.dataset.filePath = filePath;
      $$(".file-row", $("#panel-files")).forEach((row) => row.classList.toggle("active", row.dataset.filePath === filePath));
    } catch (error) {
      toast(error.message, "error");
    }
  }

  async function loadAdmins() {
    const grid = $(".admin-grid", $("#panel-admin"));
    if (!grid) return;
    try {
      const data = await api("/api/admins");
      const roles = [
        ["owner", "Owner", "One account with full control.", "owner", "eye"],
        ["super", "Super admins", "Can manage settings and access.", "super", "shield"],
        ["admin", "Admins", "Can use approved bot commands.", "admin", "user"],
      ];
      grid.innerHTML = roles.map(([role, title, description, tone, symbol]) => {
        const members = data.admins?.[role] || [];
        return `<article class="panel admin-card ${role === "owner" ? "owner-card" : ""}"><div class="card-heading"><div><h3>${title} <span class="inline-count">${members.length}</span></h3><p>${description}</p></div><div class="role-icon ${tone}">${icon(symbol)}</div></div>
          <div class="uid-list">${members.length ? members.map((id) => `<div class="uid-row"><code>${escapeHtml(id)}</code><button class="icon-btn" data-admin-action="remove" data-admin-role="${role}" data-admin-id="${escapeHtml(id)}" aria-label="Remove ${title}">${icon("trash")}</button></div>`).join("") : `<div class="empty-state compact"><strong>No operators configured</strong><span>Add a numeric user ID below.</span></div>`}</div>
          <button class="btn btn-ghost btn-block" data-admin-action="add" data-admin-role="${role}">${icon("plus")} Add ${role === "owner" ? "owner" : role === "super" ? "super admin" : "admin"}</button></article>`;
      }).join("");
    } catch (error) {
      toast(error.message, "error");
    }
  }

  async function updateAdmin(action, role, id) {
    try {
      const data = await api("/api/admins", {
        method: action === "add" ? "POST" : "DELETE",
        body: JSON.stringify({ role, id }),
      });
      toast(action === "add" ? "Operator added" : "Operator removed");
      loadAdmins();
      return data;
    } catch (error) {
      toast(error.message, "error");
      return null;
    }
  }

  function renderProtections(protections) {
    const grid = $(".protection-grid");
    if (!grid) return;
    grid.innerHTML = protections.map((protection, index) => `<article class="protection-card panel">
      <div class="protection-top"><div class="card-icon ${protection.enabled ? "green" : "gray"}">${icon(index % 3 === 0 ? "shield" : index % 3 === 1 ? "lock" : "pulse")}</div><span class="severity ${index > 14 ? "high" : index > 7 ? "medium" : "low"}">${index > 14 ? "High" : index > 7 ? "Medium" : "Low risk"}</span></div>
      <h3>${escapeHtml(protection.name)}</h3><p>${escapeHtml(protection.description)}</p>
      <div class="protection-bottom"><span class="status-label ${protection.enabled ? "enabled" : "disabled"}"><span class="status-dot ${protection.enabled ? "online" : ""}"></span> ${protection.enabled ? "Enabled" : "Disabled"}</span>
      <button class="toggle ${protection.enabled ? "active" : ""}" data-protection="${escapeHtml(protection.id)}" aria-label="Toggle ${escapeHtml(protection.name)}"><i></i></button></div>
    </article>`).join("");
    const headingBadge = $("#panel-protection .section-heading .badge");
    if (headingBadge) headingBadge.innerHTML = `<span class="status-dot online"></span> ${protections.filter((item) => item.enabled).length} enabled`;
  }

  async function loadThreads() {
    try {
      const data = await api("/api/threads");
      const list = $(".thread-list");
      if (!list) return;
       const threads = data.threads || [];
       list.innerHTML = threads.length ? threads.map((thread, index) => `<button class="thread ${thread.id === currentThread ? "active" : ""}" data-thread-id="${escapeHtml(thread.id)}">
        <span class="avatar ${["red", "blue", "purple", "green"][index % 4]}-avatar">${escapeHtml(thread.name.slice(0, 2).toUpperCase())}</span>
        <span class="thread-copy"><strong>${escapeHtml(thread.name)}</strong><small>${thread.members} members · ${thread.type}</small></span>
         <time>${thread.unread ? `${thread.unread} new` : "active"}</time>${thread.unread ? `<i class="unread">${thread.unread}</i>` : ""}</button>`).join("")
         : `<div class="empty-state compact live-empty"><strong>No live conversations</strong><span>Connect a valid Messenger session to load threads.</span></div>`;
       const scheduleSelect = $("[data-automation='messages'] select");
       if (scheduleSelect) {
         scheduleSelect.innerHTML = threads.length
           ? threads.map((thread) => `<option value="${escapeHtml(thread.id)}">${escapeHtml(thread.name)} · ${escapeHtml(thread.id)}</option>`).join("")
           : `<option value="">No connected groups</option>`;
         scheduleSelect.disabled = !threads.length;
       }
       const activeThreads = $("#activeThreadsList");
       if (activeThreads) {
         activeThreads.innerHTML = threads.length
           ? threads.map((thread, index) => `<div class="active-thread"><span class="avatar tiny ${["red", "blue", "purple", "green"][index % 4]}-avatar">${escapeHtml(thread.name.slice(0, 2).toUpperCase())}</span><div><strong>${escapeHtml(thread.name)}</strong><code>${escapeHtml(thread.id)}</code></div><span class="badge badge-success">Live</span></div>`).join("")
           : `<div class="empty-state compact live-empty"><strong>No live threads</strong><span>Connect Messenger to load active threads.</span></div>`;
       }
       const activationId = $("#threadId");
       if (activationId) {
         activationId.disabled = !threads.length;
         activationId.placeholder = threads.length ? "Select a live thread" : "Connect Messenger to load threads";
         if (threads.length && !activationId.value) activationId.value = threads[0].id;
         if (!threads.length) activationId.value = "";
       }
       const threadSearch = $(".thread-sidebar .search-box input");
       if (threadSearch && !threadSearch.dataset.bound) {
         threadSearch.dataset.bound = "true";
         threadSearch.addEventListener("input", () => {
           const query = threadSearch.value.toLowerCase().trim();
           $$(".thread", list).forEach((thread) => thread.classList.toggle("is-hidden", query && !thread.textContent.toLowerCase().includes(query)));
         });
       }
       if (threads.length) {
         if (!threads.some((thread) => thread.id === currentThread)) currentThread = threads[0].id;
         await loadThread(currentThread);
       } else {
         currentThread = "";
         await loadThread("");
       }
    } catch (error) {
      toast(error.message, "error");
    }
  }

  async function loadThread(threadID) {
    currentThread = threadID;
    if (!threadID) {
      const body = $(".chat-body");
      if (body) body.innerHTML = `<div class="empty-state live-empty"><strong>No conversation selected</strong><span>Connect Messenger and choose a live thread to begin.</span></div>`;
      const group = $(".group-sidebar");
      if (group) {
        const name = group.querySelector(".group-copy strong");
        const id = group.querySelector(".group-copy code");
        const members = group.querySelector(".group-stat strong");
        if (name) name.textContent = "No group selected";
        if (id) id.textContent = "—";
        if (members) members.textContent = "—";
        const memberList = $(".member-list", group);
        if (memberList) memberList.innerHTML = `<div class="member-list-head"><span>Members</span></div><div class="empty-state compact"><span>Choose a live conversation.</span></div>`;
      }
      currentGroupInfo = null;
      $$(".thread").forEach((item) => item.classList.remove("active"));
      return;
    }
    try {
      const data = await api(`/api/threads/${encodeURIComponent(threadID)}/messages`);
      const thread = await api("/api/threads").then((result) => result.threads.find((item) => item.id === threadID));
      const head = $(".chat-head");
      if (head && thread) {
        const name = head.querySelector("strong");
        const sub = head.querySelector("small");
        if (name) name.textContent = thread.name;
        if (sub) sub.innerHTML = `<span class="status-dot online"></span> ${thread.members} members · Active now`;
      }
      const group = $(".group-sidebar");
      if (group && thread) {
        const name = group.querySelector(".group-copy strong");
        const id = group.querySelector(".group-copy code");
        const members = group.querySelector(".group-stat strong");
        if (name) name.textContent = thread.name;
        if (id) id.textContent = thread.id;
        if (members) members.textContent = String(thread.members || "—");
      }
      await loadThreadInfo(threadID);
      const body = $(".chat-body");
      if (body) {
        body.innerHTML = `<div class="date-separator"><span>Live thread</span></div>${(data.messages || []).map((message) => messageRow(message)).join("")}`;
        body.scrollTop = body.scrollHeight;
      }
      $$(".thread").forEach((item) => item.classList.toggle("active", item.dataset.threadId === threadID));
    } catch (error) {
      toast(error.message, "error");
    }
  }

  async function loadThreadInfo(threadID = currentThread) {
    if (!threadID) return;
    try {
      const data = await api(`/api/threads/${encodeURIComponent(threadID)}/info`);
      currentGroupInfo = data.info || null;
      const group = $(".group-sidebar");
      const memberList = $(".member-list", group);
      if (!memberList) return;
      const members = currentGroupInfo?.members || [];
      memberList.innerHTML = `<div class="member-list-head"><span>Members</span><small>${members.length}</small></div>${members.length
        ? members.slice(0, 40).map((member) => `<button class="member-row" data-group-member="${escapeHtml(member.id)}" title="Change nickname"><span class="avatar tiny blue-avatar">${escapeHtml(String(member.name || "U").slice(0, 2).toUpperCase())}</span><span><strong>${escapeHtml(member.name || member.id)}</strong><code>${escapeHtml(member.id)}</code></span></button>`).join("")
        : `<div class="empty-state compact"><span>No member details returned by Messenger.</span></div>`}`;
    } catch (error) {
      const memberList = $(".member-list", $(".group-sidebar"));
      if (memberList) memberList.innerHTML = `<div class="member-list-head"><span>Members</span></div><div class="empty-state compact"><span>${escapeHtml(error.message)}</span></div>`;
    }
  }

  function messageRow(message, forcedKind) {
    const kind = forcedKind || message.kind || (message.sender === "Cypher" ? "bot" : "incoming");
    return `<div class="message-row ${kind}"><span class="avatar tiny ${kind === "bot" ? "eye-avatar" : "blue-avatar"}">${kind === "bot" ? icon("eye") : escapeHtml(String(message.sender || "U").slice(0, 2).toUpperCase())}</span><div><small class="sender">${escapeHtml(message.sender || "Unknown")} <time>${escapeHtml(message.time || "")}</time></small><div class="bubble">${escapeHtml(message.content || "")}</div></div></div>`;
  }

  function appendMessage(message, kind = "incoming") {
    const body = $(".chat-body");
    if (!body) return;
    body.insertAdjacentHTML("beforeend", messageRow(message, kind));
    body.scrollTop = body.scrollHeight;
  }

  function injectVeilFeatures() {
    if (!$("#veilExtension")) {
      const controls = $(".control-grid", $("#panel-home"));
      controls?.insertAdjacentHTML("afterend", `<section class="panel veil-extension" id="veilExtension">
        <div class="veil-extension-head"><div><div class="eyebrow">VEIL COMPATIBILITY</div><h3>Safety & automation controls</h3><p id="veilStatusSummary">Live protection state</p></div><span class="badge badge-success">Live</span></div>
        <div class="veil-action-grid">
          <button class="veil-action" data-action="lock"><span class="card-icon amber">${icon("lock")}</span><span><strong>Bot lock</strong><small>Restrict runtime to operators</small></span></button>
          <button class="veil-action" data-tab-target="protection"><span class="card-icon green">${icon("shield")}</span><span><strong>Defense matrix</strong><small>Manage Veil safety layers</small></span></button>
          <button class="veil-action" data-tab-target="control"><span class="card-icon purple">${icon("pulse")}</span><span><strong>Automation</strong><small>Schedules and group behavior</small></span></button>
          <button class="veil-action" data-tab-target="ai"><span class="card-icon red">${icon("spark")}</span><span><strong>Image studio</strong><small>Generate an image from a prompt</small></span></button>
        </div>
      </section>`);
    }
    const aiLayout = $(".ai-layout", $("#panel-ai"));
    if (aiLayout && !$("#imageStudio")) {
      aiLayout.insertAdjacentHTML("afterend", `<section class="panel image-studio" id="imageStudio">
        <div class="card-heading"><div><h3>Image studio</h3><p>Veil-compatible image generation without storing your prompt.</p></div><div class="card-icon purple">${icon("spark")}</div></div>
        <div class="image-studio-form"><textarea id="imagePrompt" class="text-area" placeholder="Describe an image, for example: a neon city above the clouds"></textarea><button class="btn btn-primary" data-action="imagegen">${icon("spark")} Generate image</button></div>
        <div id="imageResult" class="image-result is-hidden"></div>
      </section>`);
    }
  }

  function wirePanelControls() {
    const automationCards = $$(".automation-card");
    const messageCard = automationCards[0];
    if (messageCard) {
      messageCard.dataset.automation = "messages";
      $("[aria-label='Toggle automatic messages']", messageCard)?.setAttribute("data-schedule-toggle", "automatic-message");
    }
    const nameCard = automationCards[1];
    if (nameCard) {
      $$("[aria-label*='group name locking'], [aria-label*='auto-restore']", nameCard)
        .forEach((toggle) => toggle.setAttribute("data-protection", "nameProtection"));
    }
    const filePanel = $("#panel-files");
    const fileSave = $('[data-action="save"]', filePanel);
    if (fileSave) fileSave.dataset.action = "save-file";
    $(".code-preview", filePanel)?.setAttribute("contenteditable", "true");
  }

  async function generateImage(button) {
    const prompt = $("#imagePrompt")?.value.trim();
    if (!prompt) return toast("Describe the image you want to create.", "error");
    button.disabled = true;
    try {
      const data = await api("/api/imagegen", { method: "POST", body: JSON.stringify({ prompt }) });
      const result = $("#imageResult");
      if (result) {
        result.classList.remove("is-hidden");
        result.innerHTML = `<img src="${escapeHtml(data.imageUrl)}" alt="${escapeHtml(data.prompt)}" loading="lazy"><div><strong>Generation queued</strong><span>${escapeHtml(data.prompt)}</span><a class="btn btn-ghost btn-small" href="${escapeHtml(data.imageUrl)}" target="_blank" rel="noopener">Open image</a></div>`;
      }
      toast("Image generation queued");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      button.disabled = false;
    }
  }

  function toggleLogAutoScroll(button) {
    autoScrollLogs = !autoScrollLogs;
    button?.classList.toggle("active", autoScrollLogs);
    toast(autoScrollLogs ? "Auto-scroll enabled" : "Auto-scroll disabled");
  }

  function downloadLogs() {
    const lines = $$("#logLines > div:not(.log-empty)").map((row) => row.textContent.trim()).filter(Boolean);
    if (!lines.length) return toast("There are no logs to download.", "error");
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cypher-logs-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast("Logs downloaded");
  }

  function chooseCookieFile() {
    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = ".json,.txt,.cookies,.cookie";
    picker.addEventListener("change", async () => {
      const file = picker.files?.[0];
      if (!file) return;
      try {
        const content = await file.text();
        if (!content.trim()) throw new Error("The selected file is empty.");
        const input = $("#cookieInput");
        if (!input) throw new Error("The cookie input is unavailable.");
        input.value = content;
        activateTab("cookies");
        toast(`${file.name} loaded; review it and import the session`);
      } catch (error) {
        toast(error.message || "Choose a valid session file.", "error");
      }
    });
    picker.addEventListener("cancel", () => picker.remove());
    picker.click();
  }

  async function importSession() {
    const payload = $("#cookieInput")?.value.trim();
    if (!payload) return toast("Paste or choose a session export first.", "error");
    const button = $('[data-action="import"]');
    if (button) button.disabled = true;
    try {
      const data = await api("/api/session/import", { method: "POST", body: JSON.stringify({ payload }) });
      syncStatus(data.state);
      toast(data.session?.connected ? "Session imported and connected" : "Session stored; connection needs attention", data.session?.connected ? "success" : "error");
      await loadThreads();
    } catch (error) {
      toast(error.message, "error");
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function connectSession() {
    try {
      const data = await api("/api/session/connect", { method: "POST", body: "{}" });
      syncStatus(data.state);
      toast(data.session?.connected ? "Messenger session connected" : (data.session?.error || "Messenger session could not connect"), data.session?.connected ? "success" : "error");
      await loadThreads();
    } catch (error) {
      toast(error.message, "error");
    }
  }

  async function clearSession() {
    if (!window.confirm("Clear the stored Messenger session from this instance?")) return;
    try {
      const data = await api("/api/session", { method: "DELETE", body: "{}" });
      syncStatus(data.state);
      const input = $("#cookieInput");
      if (input) input.value = "";
      await loadThreads();
      toast("Messenger session cleared");
    } catch (error) {
      toast(error.message, "error");
    }
  }

  async function manageThread(action, payload = {}) {
    if (!currentThread) return toast("Choose a live conversation first.", "error");
    try {
      const data = await api(`/api/threads/${encodeURIComponent(currentThread)}/actions`, {
        method: "POST",
        body: JSON.stringify({ action, ...payload }),
      });
      syncStatus(data.state);
      if (action === "rename") await loadThreads();
      if (action === "mark-read") toast("Conversation marked as read");
      else if (action === "rename") toast("Conversation renamed");
      else toast("Messenger group updated");
    } catch (error) {
      toast(error.message, "error");
    }
  }

  async function sendChat() {
    const input = $(".ai-composer input");
    const prompt = input?.value.trim();
    if (!prompt) return;
    try {
      const data = await api("/api/ai/chat", { method: "POST", body: JSON.stringify({ message: prompt }) });
      const history = $(".ai-history");
      history?.insertAdjacentHTML("beforeend", `<div class="ai-message user">${escapeHtml(prompt)}</div><div class="ai-message assistant"><span class="avatar tiny eye-avatar">${icon("eye")}</span><div>${escapeHtml(data.message)}</div></div>`);
      if (input) input.value = "";
      toast("Cypher AI replied");
    } catch (error) {
      toast(error.message, "error");
    }
  }

  async function openCommandSource(file) {
    try {
      const data = await api(`/api/commands/source?file=${encodeURIComponent(file)}`);
      activateTab("editor");
      const editor = $(".code-editor");
      if (editor) editor.value = data.content;
      const title = $(".code-heading span:first-child", $("#panel-editor"));
      if (title) title.innerHTML = `${icon("code")} ${escapeHtml(file)}`;
      toast(data.readonly ? "Veil source opened read-only" : "Cypher source opened in editor");
      const save = $('#panel-editor [data-action="save"]');
      if (save) save.dataset.commandFile = file;
    } catch (error) {
      toast(error.message, "error");
    }
  }

  function activateTab(tab) {
    $$(".nav-item, .mobile-nav button").forEach((item) => item.classList.toggle("active", item.dataset.tab === tab));
    $$(".tab-panel").forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === tab));
    $(`.nav-item[data-tab="${CSS.escape(tab)}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toast(message, type = "success") {
    const item = document.createElement("div");
    item.className = "toast";
    item.innerHTML = `${icon(type === "success" ? "check" : "info")}<span>${escapeHtml(translateText(message))}</span>`;
    toastRegion.appendChild(item);
    setTimeout(() => item.remove(), 3200);
  }

  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const key = accessKey.value.trim();
    if (key.length < 4) {
      loginError.textContent = "Access key must be at least 4 characters.";
      accessKey.focus();
      return;
    }
    const button = loginForm.querySelector("button[type=submit]");
    if (button) button.disabled = true;
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Invalid access key.");
      csrfToken = data.csrf || "";
      loginError.textContent = "";
      accessKey.value = "";
      await showApp();
      toast("Secure session established");
    } catch (error) {
      loginError.textContent = error.message;
    } finally {
      if (button) button.disabled = false;
    }
  });

  $("#revealKey")?.addEventListener("click", (event) => {
    const isPassword = accessKey.type === "password";
    accessKey.type = isPassword ? "text" : "password";
    event.currentTarget.textContent = isPassword ? "HIDE" : "SHOW";
    event.currentTarget.setAttribute("aria-label", isPassword ? "Hide access key" : "Show access key");
  });
  accessKey?.addEventListener("input", () => { loginError.textContent = ""; });
  $("#logoutBtn")?.addEventListener("click", async () => {
    try { await api("/api/auth/logout", { method: "POST", body: "{}" }); } catch (_) {}
    showLogin();
  });

  document.addEventListener("click", async (event) => {
    const target = event.target.closest("button, [data-action], [data-tab-target], [data-tab], [data-file-path], [data-command-file], [data-admin-action], [data-protection], [data-schedule-toggle]");
    if (!target) return;
    if (target.dataset.tab) {
      activateTab(target.dataset.tab);
      return;
    }
    if (target.dataset.tabTarget) {
      activateTab(target.dataset.tabTarget);
      return;
    }
    if (target.dataset.commandFile) {
      await openCommandSource(target.dataset.commandFile);
      return;
    }
    if (target.dataset.filePath) {
      await loadFilePreview(target.dataset.filePath);
      return;
    }
    if (target.dataset.adminAction) {
      const role = target.dataset.adminRole;
      const id = target.dataset.adminId || window.prompt(`Enter the numeric user ID for ${role}:`, "");
      if (id) await updateAdmin(target.dataset.adminAction, role, id.trim());
      return;
    }
    if (target.dataset.protection) {
      target.classList.toggle("active");
      try {
        const data = await api("/api/protections/toggle", { method: "POST", body: JSON.stringify({ id: target.dataset.protection, enabled: target.classList.contains("active") }) });
        syncStatus(data.state);
        toast("Protection layer updated");
      } catch (error) {
        target.classList.toggle("active");
        toast(error.message, "error");
      }
      return;
    }
    if (target.dataset.action === "imagegen") {
      await generateImage(target);
      return;
    }
    if (target.dataset.action === "import") {
      await importSession();
      return;
    }
    if (target.dataset.action === "connect-session") {
      await connectSession();
      return;
    }
    if (target.dataset.action === "clear-session") {
      await clearSession();
      return;
    }
    if (target.dataset.action === "group-info") {
      await loadThreadInfo();
      toast("Group information refreshed");
      return;
    }
    if (target.dataset.action === "search-chat") {
      const query = window.prompt("Search this conversation", "");
      if (query?.trim()) {
        const matches = $$(".message-row", $(".chat-body")).filter((row) => row.textContent.toLowerCase().includes(query.toLowerCase()));
        toast(`${matches.length} matching message${matches.length === 1 ? "" : "s"}`);
      }
      return;
    }
    if (target.dataset.action === "thread-menu") {
      const choice = window.prompt("Type rename, read, or add to manage this live conversation.", "");
      if (choice?.toLowerCase() === "read") await manageThread("mark-read");
      else if (choice?.toLowerCase() === "rename") {
        const title = window.prompt("New conversation name", "");
        if (title) await manageThread("rename", { title });
      } else if (choice?.toLowerCase() === "add") {
        const userID = window.prompt("Messenger user ID to add", "");
        if (userID) await manageThread("add-member", { userID: userID.trim() });
      }
      return;
    }
    if (target.dataset.groupMember) {
      const nickname = window.prompt("New nickname for this member", "");
      if (nickname) await manageThread("nickname", { userID: target.dataset.groupMember, nickname: nickname.trim() });
      return;
    }
    if (target.dataset.action === "attach") {
      toast("Attachments are not enabled by the current Messenger client.", "error");
      return;
    }
    if (target.dataset.action === "voice") {
      toast("Voice recording is not available in this browser panel.", "error");
      return;
    }
    if (target.dataset.action === "cookie-upload") {
      chooseCookieFile();
      return;
    }
    if (target.dataset.action === "file-upload") {
      toast("Source file uploads are not enabled from the dashboard.", "error");
      return;
    }
    if (target.dataset.action === "toggle-autoscroll") {
      toggleLogAutoScroll(target);
      return;
    }
    if (target.dataset.action === "download-logs") {
      downloadLogs();
      return;
    }
    if (target.dataset.scheduleToggle) {
      target.classList.toggle("active");
      const result = await runAction("schedule-toggle", target, {
        id: target.closest("[data-automation]")?.dataset.scheduleId || target.dataset.scheduleToggle,
        enabled: target.classList.contains("active"),
      });
      if (!result) target.classList.toggle("active");
      return;
    }
    if (target.dataset.action === "save" && target.dataset.commandFile) {
      const editor = $(".code-editor", $("#panel-editor"));
      try {
        await api("/api/commands/source", { method: "POST", body: JSON.stringify({ file: target.dataset.commandFile, source: editor?.value || "" }) });
        toast("Command source saved");
      } catch (error) {
        toast(error.message, "error");
      }
      return;
    }
    if (target.dataset.action === "save-file") {
      const preview = $(".code-preview", $("#panel-files"));
      const filePath = target.dataset.filePath || preview?.dataset.filePath;
      if (!filePath || !preview) return toast("Select a file before saving.", "error");
      try {
        await api("/api/files/write", {
          method: "POST",
          body: JSON.stringify({ path: filePath, content: preview.textContent || "" }),
        });
        toast("Workspace file saved");
      } catch (error) {
        toast(error.message, "error");
      }
      return;
    }
    if (target.dataset.action === "save" && target.closest("#panel-settings")) {
      const panel = target.closest("#panel-settings");
      const inputs = $$("input", panel);
      try {
        const data = await api("/api/settings", {
          method: "POST",
          body: JSON.stringify({
            botName: inputs[0]?.value,
            prefix: inputs[1]?.value,
          }),
        });
        syncStatus(data.state);
        toast("Settings saved");
      } catch (error) {
        toast(error.message, "error");
      }
      return;
    }
    if (target.dataset.action === "save" && target.closest("#panel-activation")) {
      const activeMode = $(".segmented button.active", target.closest("#panel-activation"))?.textContent.trim().toLowerCase();
      try {
        const data = await api("/api/settings", {
          method: "POST",
          body: JSON.stringify({ activationMode: activeMode === "blacklist" ? "blacklist" : "whitelist" }),
        });
        syncStatus(data.state);
        toast("Activation settings saved");
      } catch (error) {
        toast(error.message, "error");
      }
      return;
    }
    if (target.dataset.action === "save-message") {
      const card = target.closest(".automation-card");
      const fields = $$("input", card);
      await runAction("save-message", target, {
        schedule: {
          id: card.dataset.scheduleId || "automatic-message",
          threadID: $("select", card)?.value || "thread_8841",
          message: $(".text-area", card)?.value || "",
          min: fields[0]?.value || 30,
          max: fields[1]?.value || 60,
        },
      });
      return;
    }
    if (target.closest(".segmented")) {
      $$(".segmented button", target.closest(".segmented")).forEach((button) => button.classList.toggle("active", button === target));
      return;
    }
    if (target.dataset.action && !target.classList.contains("toggle")) {
      await runAction(target.dataset.action, target);
    }
    if (target.classList.contains("toggle")) {
      const setting = target.dataset.setting || (() => {
        const label = String(target.getAttribute("aria-label") || "").toLowerCase();
        if (label.includes("silent")) return "silentMode";
        if (label.includes("admin")) return "adminOnly";
        if (label.includes("keep-alive")) return "keepAlive";
        if (label.includes("stealth")) return "stealthMode";
        if (label.includes("inbox")) return "allowInbox";
        return "";
      })();
      if (!setting) return;
      target.classList.toggle("active");
      const enabled = target.classList.contains("active");
      try {
        const data = await api("/api/settings", { method: "POST", body: JSON.stringify({ [setting]: enabled }) });
        syncStatus(data.state);
        toast(`${setting} ${enabled ? "enabled" : "disabled"}`);
      } catch (error) {
        target.classList.toggle("active");
        toast(error.message, "error");
      }
    }
    if (target.dataset.threadId) await loadThread(target.dataset.threadId);
  });

  $("#navPrev")?.addEventListener("click", () => $("#featureNav")?.scrollBy({ left: -260, behavior: "smooth" }));
  $("#navNext")?.addEventListener("click", () => $("#featureNav")?.scrollBy({ left: 260, behavior: "smooth" }));
  $("#themeToggle")?.addEventListener("click", () => {
    document.body.classList.toggle("light");
    toast(document.body.classList.contains("light") ? "Light appearance enabled" : "Dark appearance enabled");
  });
  $("#languageToggle")?.addEventListener("click", () => {
    currentLanguage = currentLanguage === "ar" ? "en" : "ar";
    try { localStorage.setItem("cypher-language", currentLanguage); } catch (_) {}
    applyLanguage();
    toast(currentLanguage === "ar" ? "Arabic language enabled" : "English language enabled");
  });

  const composer = $(".composer-input textarea");
  $(".composer-input .send-btn")?.addEventListener("click", async () => {
    const message = composer?.value.trim();
    if (!message) return toast("Write a message first", "error");
    try {
      const data = await api("/api/messages", { method: "POST", body: JSON.stringify({ message, threadID: currentThread }) });
      appendMessage(data.message, "bot");
      composer.value = "";
      composer.style.height = "41px";
      syncStatus(data.state);
      toast("Message queued");
    } catch (error) {
      toast(error.message, "error");
    }
  });
  composer?.addEventListener("input", () => {
    composer.style.height = "auto";
    composer.style.height = `${Math.min(composer.scrollHeight, 100)}px`;
  });

  const generateButton = $('[data-action="generate"]');
  generateButton?.addEventListener("click", async (event) => {
    event.stopPropagation();
    const prompt = $(".ai-prompt")?.value.trim();
    if (!prompt) return toast("Describe the command you want to generate", "error");
    generateButton.disabled = true;
    try {
      const result = await api("/api/ai/generate", { method: "POST", body: JSON.stringify({ prompt }) });
      const generatedResult = $("#generatedResult");
      if (generatedResult) {
        generatedResult.querySelector("code").textContent = `!${result.name}`;
        generatedResult.querySelector("pre").textContent = result.code;
        generatedResult.querySelector("p").textContent = result.description;
        generatedResult.classList.remove("is-hidden");
        generatedResult.classList.add("is-visible");
      }
      toast("Command scaffold generated");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      generateButton.disabled = false;
    }
  });
  $(".ai-composer .send-btn")?.addEventListener("click", sendChat);
  $(".ai-composer input")?.addEventListener("keydown", (event) => { if (event.key === "Enter") sendChat(); });
  $("#fileInput")?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) toast(`${file.name} selected for upload`);
  });

  applyLanguage();

  (async function init() {
    try {
      const session = await fetch("/api/auth/session", { cache: "no-store" }).then((response) => response.json());
      if (session.authenticated) {
        const token = await fetch("/api/auth/csrf", { cache: "no-store" }).then((response) => response.json());
        csrfToken = token.csrf || "";
        await showApp();
      } else {
        showLogin();
      }
    } catch (error) {
      showLogin();
      toast("Dashboard is unavailable", "error");
    }
  })();
})();