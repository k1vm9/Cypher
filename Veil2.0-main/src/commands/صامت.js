"use strict";

module.exports = {
  config: {
    name: "صامت",
    aliases: ["silent", "silentmode", "وضع_صامت", "كتم"],
    version: "1.0.0",
    author: "ZAO Team",
    countDown: 3,
    role: 2,
    category: "management",
    description: "تفعيل/إيقاف وضع الصمت — البوت ينفذ الأوامر دون إرسال ردود للمحادثة",
    guide: { en: "{pn} on/off — تفعيل/إيقاف وضع الصمت" },
  },

  onStart: async function({ api, event, args }) {
    const { threadID, messageID } = event;
    const arg = (args[0] || "").toLowerCase().trim();

    if (arg === "on" || arg === "تفعيل" || arg === "1") {
      global._silentMode = true;
      return api.sendMessage(
        "🔇 وضع الصمت مُفعَّل\n\nالبوت سيُنفِّذ الأوامر دون إرسال أي ردود للمحادثة.\nالردود ستظهر فقط في الكونسول.\n\nأرسل " + (global.GoatBot?.config?.prefix || "/") + "صامت off للإيقاف.",
        threadID, messageID
      );
    }

    if (arg === "off" || arg === "إيقاف" || arg === "0") {
      global._silentMode = false;
      return api.sendMessage(
        "🔊 وضع الصمت مُوقَف\n\nالبوت يعمل بشكل طبيعي الآن.",
        threadID, messageID
      );
    }

    global._silentMode = !global._silentMode;
    const state = global._silentMode;
    return api.sendMessage(
      state
        ? "🔇 وضع الصمت مُفعَّل\n\nالبوت سيُنفِّذ الأوامر دون إرسال ردود للمحادثة.\n\nأرسل " + (global.GoatBot?.config?.prefix || "/") + "صامت off للإيقاف."
        : "🔊 وضع الصمت مُوقَف\n\nالبوت يعمل بشكل طبيعي الآن.",
      threadID, messageID
    );
  },
};
