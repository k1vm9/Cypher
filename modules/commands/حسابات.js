module.exports.config = {
  name: "حسابات",
  version: "1.0.0",
  hasPermssion: 2,
  credits: "ZAO",
  description: "عرض الحسابات المرتبطة بالبوت",
  commandCategory: "إدارة البوت",
  usages: "حسابات",
  cooldowns: 10,
  prefix: true
};

module.exports.run = async function ({ api, event, permssion }) {
  const { threadID, messageID } = event;
  if (permssion < 2) return api.sendMessage("⛔ هذا الأمر خاص بأدمن البوت.", threadID, messageID);

  try {
    const userID = api.getCurrentUserID();
    const info = await api.getUserInfo(userID);
    const user = info?.[userID] || {};
    const name = user.name || "—";
    api.sendMessage(
      `📋 معلومات الحساب النشط\n\n` +
      `👤 الاسم: ${name}\n` +
      `🔢 المعرف: ${userID}`,
      threadID, messageID
    );
  } catch (e) {
    api.sendMessage("❌ فشل جلب معلومات الحساب: " + (e.message || e), threadID, messageID);
  }
};
