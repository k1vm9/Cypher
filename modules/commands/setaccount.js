const fs = require("fs-extra");
const path = require("path");

module.exports = {
  config: {
    name: "setaccount",
    version: "1.0",
    hasPermssion: 2,
    credits: "ZAO",
    description: "تحديث بيانات تسجيل الدخول من المحادثة — أدمن البوت فقط",
    commandCategory: "admin",
    usages: "[email] [password] | status | clear",
    cooldowns: 5,
    prefix: true
  },
  run: async function ({ api, event, args }) {
    const { senderID, messageID, threadID } = event;
    const adminIDs = (global.config.ADMINBOT || []).map(String);
    if (!adminIDs.includes(String(senderID))) return;
    const action = (args[0] || "").toLowerCase();

    if (action === "status") {
      const hasEmail = !!(global.config.EMAIL || "").trim();
      const hasPass  = !!(global.config.PASSWORD || "").trim();
      return api.sendMessage(`🔐 حالة الحساب\n📧 البريد: ${hasEmail ? "✅" : "❌"}\n🔑 كلمة المرور: ${hasPass ? "✅" : "❌"}\n${hasEmail && hasPass ? "✅ سيتم إعادة تسجيل الدخول تلقائياً." : "⚠️ لا توجد بيانات. استخدم: setaccount [email] [password]"}`, threadID);
    }

    if (action === "clear") {
      global.config.EMAIL = ""; global.config.PASSWORD = "";
      try { api.unsendMessage(messageID); } catch (_) {}
      return api.sendMessage("✅ تم مسح البيانات.", threadID);
    }

    const email = args[0], password = args.slice(1).join(" ");
    if (!email || !password) {
      try { api.unsendMessage(messageID); } catch (_) {}
      return api.sendMessage("❌ الاستخدام: setaccount [email] [password]\n⚠️ استخدمه في محادثة خاصة فقط!", threadID);
    }

    try { api.unsendMessage(messageID); } catch (_) {}
    global.config.EMAIL = email.trim(); global.config.PASSWORD = password.trim();
    return api.sendMessage("✅ تم حفظ البيانات!\n📧 البريد: ✅\n🔑 كلمة المرور: ✅\n⚠️ رسالتك الأصلية تم حذفها للأمان.", threadID);
  }
};
