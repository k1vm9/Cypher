/**
 * كوكيز.js — عرض AppState (الكوكيز) المستخدم حالياً
 * Ported from ZAO-CMDS — uses api.getAppState() instead of keepAlive import
 */
module.exports.config = {
  name: "كوكيز",
  version: "1.0.0",
  hasPermssion: 2,
  credits: "ZAO",
  description: "عرض AppState (كوكيز تسجيل الدخول) الخاصة بالبوت",
  commandCategory: "إدارة البوت",
  usages: "كوكيز",
  cooldowns: 10,
  prefix: true
};

module.exports.run = async function ({ api, event, permssion }) {
  const { threadID, messageID, senderID } = event;
  const adminList = (global.config?.ADMINBOT || []).map(String);
  if (!adminList.includes(String(senderID))) {
    return api.sendMessage("⛔ هذا الأمر خاص بأدمن البوت فقط.", threadID, messageID);
  }

  try {
    const appState = api.getAppState();
    if (!appState || !Array.isArray(appState) || appState.length === 0) {
      return api.sendMessage("⚠️ AppState فارغ أو غير متاح.", threadID, messageID);
    }
    const json = JSON.stringify(appState, null, 2);
    api.sendMessage(
      `🍪 AppState (${appState.length} ملف تعريف ارتباط)\n\n` +
      "⚠️ احتفظ بها بأمان — لا تشاركها مع أي أحد!\n\n" +
      `📋 كمية البيانات: ${Math.round(json.length / 1024)} كيلوبايت`,
      threadID, messageID
    );
  } catch (e) {
    api.sendMessage("❌ فشل جلب AppState: " + (e.message || e), threadID, messageID);
  }
};
