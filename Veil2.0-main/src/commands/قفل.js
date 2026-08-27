"use strict";

module.exports = {
  config: {
    name: "قفل",
    aliases: ["lock", "botlock", "globallock"],
    version: "1.0",
    author: "Veil",
    countDown: 3,
    role: 2,
    category: "management",
    description: "قفل/فتح البوت — عند القفل يعمل للأدمن فقط",
    guide: { en: "{pn} on — قفل البوت للأدمن فقط\n{pn} off — فتح البوت للجميع\n{pn} — عرض الحالة" },
  },

  onStart: async function({ api, event, args, message }) {
    const arg = (args[0] || "").toLowerCase().trim();
    const prefix = global.GoatBot?.config?.prefix || "/";

    if (arg === "on" || arg === "تفعيل" || arg === "1") {
      global._botLocked = true;
      return message.reply(
        "🔒 تم قفل البوت\n\nالبوت الآن متاح للأدمن فقط.\n\nأرسل " + prefix + "قفل off لفتحه للجميع."
      );
    }

    if (arg === "off" || arg === "إيقاف" || arg === "0" || arg === "فتح") {
      global._botLocked = false;
      return message.reply(
        "🔓 تم فتح البوت\n\nالبوت الآن متاح للجميع."
      );
    }

    const state = global._botLocked;
    return message.reply(
      `🔒 حالة القفل: ${state ? "🔴 مقفول (للأدمن فقط)" : "🟢 مفتوح (للجميع)"}\n\n` +
      `• ${prefix}قفل on — قفل للأدمن\n` +
      `• ${prefix}قفل off — فتح للجميع`
    );
  },
};
