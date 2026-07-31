module.exports.config = {
  name: "ping",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "ZAO",
  description: "قياس زمن الاستجابة للبوت",
  commandCategory: "النظام",
  usages: "ping",
  cooldowns: 3
};

module.exports.run = async function ({ api, event }) {
  const { threadID, messageID } = event;

  const start = Date.now();

  api.sendMessage("🏓 Pong!", threadID, (err, info) => {
    if (err) return;
    const elapsed = Date.now() - start;

    const bar = elapsed < 300 ? "🟢 ممتاز"
              : elapsed < 700 ? "🟡 جيد"
              : elapsed < 1500 ? "🟠 متوسط"
              : "🔴 بطيء";

    api.sendMessage(
      `🏓 Pong!\n⏱️ الاستجابة: ${elapsed}ms\n${bar}`,
      threadID,
      messageID
    );

    try { api.unsendMessage(info.messageID); } catch (_) {}
  });
};
