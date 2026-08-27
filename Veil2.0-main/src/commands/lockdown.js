"use strict";
const fs   = require("fs-extra");
const path = require("path");

const SETTINGS_PATH = path.join(process.cwd(), "database/data/autoinvite_settings.json");

function loadSettings() {
  try {
    if (!fs.existsSync(SETTINGS_PATH)) return {};
    const raw = fs.readFileSync(SETTINGS_PATH, "utf8").trim();
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveSettings(data) {
  try {
    fs.ensureDirSync(path.dirname(SETTINGS_PATH));
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch (e) { console.error("[lockdown:save]", e.message); return false; }
}

module.exports = {
  config: {
    name: "lockdown",
    aliases: ["ld", "autoadd", "اضافة"],
    version: "1.0.0",
    author: "ZAO Team",
    countDown: 3,
    role: 2,
    category: "management",
    description: "تفعيل أو إيقاف إعادة الإضافة التلقائية لمن يغادر المجموعة",
    guide: { en: "{pn} on | off | status" },
  },

  onStart: async function({ api, event, args, message }) {
    const { threadID, messageID } = event;
    const action = (args[0] || "").toLowerCase().trim();
    const prefix = global.GoatBot?.config?.prefix || "/";
    const settings = loadSettings();

    if (action === "on") {
      settings[threadID] = true;
      if (!saveSettings(settings))
        return message.reply("❌ فشل حفظ الإعداد.");
      return message.reply(
        "✅ تم تفعيل إعادة الإضافة التلقائية لهذه المجموعة.\n" +
        "━━━━━━━━━━━━━━━━━━\n" +
        "🔒 أي شخص يغادر سيتم إعادته تلقائياً.\n" +
        "⚠️ تأكد أن البوت لديه صلاحية إضافة الأعضاء."
      );
    }

    if (action === "off") {
      settings[threadID] = false;
      if (!saveSettings(settings))
        return message.reply("❌ فشل حفظ الإعداد.");
      return message.reply(
        "🔓 تم إيقاف إعادة الإضافة التلقائية لهذه المجموعة.\n" +
        "━━━━━━━━━━━━━━━━━━\n" +
        "✅ يمكن للأعضاء المغادرة بحرية الآن."
      );
    }

    if (action === "status") {
      const isActive = settings[threadID] === true;
      return message.reply(
        `📊 حالة إعادة الإضافة التلقائية:\n━━━━━━━━━━━━━━━━━━\n` +
        `${isActive ? "✅ مفعّلة — من يغادر يُعاد تلقائياً" : "🔓 موقوفة — يمكن للجميع المغادرة"}`
      );
    }

    return message.reply(
      `⚙️ أوامر lockdown:\n━━━━━━━━━━━━━━━━━━\n` +
      `• ${prefix}lockdown on     ─ تفعيل الإضافة التلقائية\n` +
      `• ${prefix}lockdown off    ─ إيقاف الإضافة التلقائية\n` +
      `• ${prefix}lockdown status ─ عرض الحالة الحالية\n\n` +
      "⚠️ يتطلب أن يكون البوت أدمناً في المجموعة."
    );
  },

  onEvent: async function({ api, event }) {
    if (event.logMessageType !== "log:unsubscribe") return;
    const tid    = String(event.threadID);
    const uid    = event.logMessageData?.leftParticipantFbId;
    if (!uid) return;

    const settings = loadSettings();
    if (!settings[tid]) return;

    // Don't re-add the bot itself
    if (String(uid) === String(global.GoatBot?.botID)) return;

    setTimeout(async () => {
      try { await api.addUserToGroup(uid, tid); } catch (_) {}
    }, 1000);
  },
};
