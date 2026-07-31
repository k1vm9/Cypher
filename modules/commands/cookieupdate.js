/**
 * cookieupdate.js — تحديث AppState (الكوكيز) من محتوى مرسل في المحادثة
 * Fixed: uses global.config.APPSTATEPATH instead of hardcoded ZAO-STATE.json
 */
const fs   = require("fs-extra");
const path = require("path");

module.exports.config = {
  name: "تحديث-كوكيز",
  version: "1.0.0",
  hasPermssion: 2,
  credits: "ZAO",
  description: "تحديث AppState بكوكيز جديدة",
  commandCategory: "إدارة البوت",
  usages: "تحديث-كوكيز [AppState JSON]",
  cooldowns: 10,
  prefix: true
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID, senderID } = event;
  const adminList = (global.config?.ADMINBOT || []).map(String);
  if (!adminList.includes(String(senderID))) {
    return api.sendMessage("⛔ هذا الأمر خاص بأدمن البوت فقط.", threadID, messageID);
  }

  const body = event.body || "";
  const prefixLen = (event.body || "").indexOf("تحديث-كوكيز") + "تحديث-كوكيز".length;
  const raw = body.slice(prefixLen).trim();

  if (!raw) {
    return api.sendMessage("📌 الاستخدام:\nتحديث-كوكيز [AppState JSON]\n\n⚠️ أرسل محتوى AppState JSON بعد الأمر.", threadID, messageID);
  }

  let parsed;
  try { parsed = JSON.parse(raw); } catch (_) {
    return api.sendMessage("❌ التنسيق غير صحيح. تأكد من أن AppState هو JSON صحيح.", threadID, messageID);
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return api.sendMessage("❌ AppState يجب أن يكون مصفوفة JSON صحيحة.", threadID, messageID);
  }

  const statePath = global.config?.APPSTATEPATH
    || process.env.APPSTATEPATH
    || path.join(process.cwd(), "appstate.json");

  try {
    await fs.ensureDir(path.dirname(statePath));
    await fs.writeFile(statePath, JSON.stringify(parsed, null, 2), "utf8");
    api.sendMessage(
      `✅ تم تحديث AppState بنجاح!\n📁 المسار: ${statePath}\n🍪 الملفات: ${parsed.length}\n\n🔄 أعد تشغيل البوت لتطبيق التغييرات.`,
      threadID, messageID
    );
  } catch (e) {
    api.sendMessage("❌ فشل حفظ الملف: " + (e.message || e), threadID, messageID);
  }
};
