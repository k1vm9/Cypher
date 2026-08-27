"use strict";

module.exports = {
  config: {
    name: "احصائيات",
    aliases: ["stats", "systems", "انظمة", "نظام", "sysinfo", "sysstat"],
    version: "1.0.0",
    author: "ZAO Team",
    countDown: 10,
    role: 2,
    category: "info",
    description: "إحصائيات شاملة لجميع أنظمة البوت",
    guide: { en: "{pn} — إحصائيات شاملة" },
  },

  onStart: async function({ api, event, message }) {
    const { threadID } = event;
    const cfg = global.GoatBot?.config || global.config || {};

    const lines = [];
    const sep  = () => lines.push("━━━━━━━━━━━━━━━━━━━━━━━");
    const head = (t) => lines.push(`\n${t}`);

    function _fmtMem(bytes) {
      if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + " GB";
      return (bytes / 1048576).toFixed(0) + " MB";
    }

    function _fmtUptime(ms) {
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      const h = Math.floor(m / 60);
      const d = Math.floor(h / 24);
      if (d > 0) return `${d}ي ${h % 24}س ${m % 60}د`;
      if (h > 0) return `${h}س ${m % 60}د`;
      if (m > 0) return `${m}د ${s % 60}ث`;
      return `${s}ث`;
    }

    function _ago(ts) {
      if (!ts) return "—";
      const diff = Date.now() - ts;
      const s = Math.floor(diff / 1000);
      const m = Math.floor(s / 60);
      const h = Math.floor(m / 60);
      if (h > 0) return `${h}س ${m % 60}د مضى`;
      if (m > 0) return `${m}د ${s % 60}ث مضى`;
      return `${s}ث مضى`;
    }

    // ── 1. RUNTIME ────────────────────────────────────────────────────────────
    head("📊 إحصائيات النظام الكاملة");
    sep();

    const mem     = process.memoryUsage();
    const heapPct = Math.round(mem.heapUsed / mem.heapTotal * 100);
    const uptimeMs = Date.now() - (global.GoatBot?.startTime || Date.now());
    lines.push(`⏱  مدة التشغيل   : ${_fmtUptime(uptimeMs)}`);
    lines.push(`⚙️  Node.js       : ${process.version} | PID ${process.pid}`);
    lines.push(`💾 Heap Used     : ${_fmtMem(mem.heapUsed)} / ${_fmtMem(mem.heapTotal)} (${heapPct}%)`);
    lines.push(`📦 RSS           : ${_fmtMem(mem.rss)}`);

    const os = require("os");
    lines.push(`🌐 المنصة        : ${os.platform()} ${os.release()}`);

    // ── 2. SESSION / COOKIE ───────────────────────────────────────────────────
    head("🔑 الجلسة والكوكيز");
    sep();

    const accountPath = require("path").join(process.cwd(), "account.txt");
    try {
      const raw = require("fs").readFileSync(accountPath, "utf8");
      const arr = JSON.parse(raw);
      const count = Array.isArray(arr) ? arr.length : 0;
      const sizeKB = Math.round(require("fs").statSync(accountPath).size / 1024 * 10) / 10;
      lines.push(`🟢 Account       : ${count} كوكي — ${sizeKB} KB`);
    } catch (_) { lines.push("⚫ Account       : غير موجود"); }

    const botID = global.GoatBot?.botID;
    lines.push(`🤖 Bot ID        : ${botID || "—"}`);
    lines.push(`📡 Connected     : ${global.GoatBot?.fcaApi ? "✅ نعم" : "❌ لا"}`);

    // ── 3. MQTT ───────────────────────────────────────────────────────────────
    head("📡 MQTT");
    sep();

    const lastMqtt = global.lastMqttActivity || 0;
    const mqttAgo  = Date.now() - lastMqtt;
    const mqttIcon = mqttAgo < 600000 ? "🟢" : mqttAgo < 1800000 ? "🟡" : "🔴";
    lines.push(`${mqttIcon} آخر نشاط MQTT : ${lastMqtt ? _ago(lastMqtt) : "لم يُسجَّل"}`);
    lines.push(`   جاهز          : ${global._mqttReady ? "✅" : "⏳"}`);

    // ── 4. BOT LOCK / SILENT ──────────────────────────────────────────────────
    head("🔒 الأنظمة الحالية");
    sep();

    lines.push(`🔐 قفل البوت    : ${global._botLocked ? "🔴 مقفول (أدمن فقط)" : "🟢 مفتوح (الجميع)"}`);
    lines.push(`🔇 وضع صامت     : ${global._silentMode ? "✅ مُفعَّل" : "❌ متوقف"}`);

    // AutoLock
    const alActive = !!global.lockBot;
    lines.push(`🔐 AutoLock     : ${alActive ? "🔴 مقفل" : "🟢 مفتوح"}`);

    // ── 5. MOTORS & LOCKS ─────────────────────────────────────────────────────
    head("⚙️ المحركات والأقفال");
    sep();

    let motor1Active = 0, motor2Active = 0;
    try { motor1Active = Object.values(global.motorData  || {}).filter(d => d?.status).length; } catch (_) {}
    try { motor2Active = Object.values(global.motorData2 || {}).filter(d => d?.status).length; } catch (_) {}

    let nameLockCount = 0, nickLockCount = 0, imgLockCount = 0;
    try { nameLockCount = require("../engine/nameLocks").getLocks().size; } catch (_) {}
    try { nickLockCount = require("../engine/nicknameLocks").getLocks().size; } catch (_) {}
    try { imgLockCount  = require("../engine/groupImgLocks").getLocks().size; } catch (_) {}

    lines.push(`🔁 Motor 1 نشط  : ${motor1Active} مجموعة`);
    lines.push(`🔁 Motor 2 نشط  : ${motor2Active} مجموعة`);
    lines.push(`📛 Name Locks   : ${nameLockCount} مجموعة`);
    lines.push(`🏷️  Nick Locks   : ${nickLockCount} مجموعة`);
    lines.push(`🖼️  Img Locks    : ${imgLockCount} مجموعة`);

    // ── 6. DASHBOARD STATS ────────────────────────────────────────────────────
    head("📈 إحصائيات الاستخدام");
    sep();

    const totalMsgs = global._dashStats?.totalMessages || 0;
    const totalCmds = global._dashStats?.totalCommands || 0;
    lines.push(`✉️  الرسائل الكلية : ${totalMsgs}`);
    lines.push(`⚡ الأوامر الكلية  : ${totalCmds}`);
    lines.push(`📦 الأوامر المحملة : ${global.GoatBot?.commands?.size || 0}`);

    // ── 7. BOT INFO ───────────────────────────────────────────────────────────
    head("🤖 معلومات البوت");
    sep();

    const botName = cfg.botName || cfg.BOTNAME || "Veil";
    const prefix  = cfg.prefix  || cfg.PREFIX  || "/";
    const ownerID = cfg.ownerID || cfg.OWNER   || "—";
    const adminCt = [...(cfg.adminBot || []), ...(cfg.superAdminBot || [])].length;
    lines.push(`📛 الاسم   : ${botName}`);
    lines.push(`🔣 البادئة : ${prefix}`);
    lines.push(`👑 الأدمن  : ${adminCt} مدير`);
    lines.push(`🔑 المالك  : ${ownerID}`);

    return message.reply(lines.join("\n"));
  },
};
