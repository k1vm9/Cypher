module.exports.config = {
  name: "اوامر",
  version: "2.0.0",
  hasPermssion: 0,
  credits: "Cypher",
  description: "عرض قائمة الأوامر المتاحة",
  commandCategory: "معلومات",
  usages: "اوامر [اسم الأمر]",
  cooldowns: 3,
  prefix: true
};

module.exports.languages = { "vi": {}, "en": {} };
module.exports.onLoad = () => {};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID } = event;
  const { commands } = global.client;
  const threadSetting = global.data?.threadData?.get(threadID) || {};
  const prefix = threadSetting.PREFIX || global.config?.PREFIX || "!";

  // Show info about a specific command
  if (args[0] && isNaN(args[0])) {
    const cmd = commands.get(args[0].toLowerCase());
    if (!cmd) return api.sendMessage(`❌ الأمر "${args[0]}" غير موجود.`, threadID, messageID);
    const msg = [
      `⍆ ㍿⏤͟͟͞͞ 👁️‍🗨️ 𝕭҉𝛐ȶ ꭖ↴☢️٭ꞌ Ꮯyp︩︪hꬴr 𖤌`,
      "",
      `⌯ ‹ ${cmd.config.name} › ¦ ﹟ ${cmd.config.description || "—"}`,
      "",
      `طريقة الاستخدام:`,
      `${prefix}${cmd.config.name} ${cmd.config.usages || ""}`
    ].join("\n");
    return api.sendMessage(msg, threadID, messageID);
  }

  // Paginated list
  const page = parseInt(args[0]) || 1;
  const perPage = 10;
  const allNames = [...commands.keys()].sort();
  const totalPage = Math.ceil(allNames.length / perPage);
  const start = (page - 1) * perPage;
  const list = allNames.slice(start, start + perPage);

  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  let msg = `⍆ ㍿⏤͟͟͞͞ 👁️‍🗨️ 𝕭҉𝛐ȶ ꭖ↴☢️٭ꞌ Ꮯyp︩︪hꬴr 𖤌 — ${time}\n\n`;
  for (const name of list) {
    const cmd = commands.get(name);
    msg += `⌯ ‹ ${name} › ¦ ﹟ ${cmd?.config?.description || "—"}\n\n`;
  }
  msg += `صفحة ${page}/${totalPage} | عدد الأوامر: ${allNames.length}`;

  return api.sendMessage(msg, threadID, messageID);
};
