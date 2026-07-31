module.exports.config = {
  name: "معلومات",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "ZAO",
  description: "معلومات البوت والخادم",
  commandCategory: "معلومات",
  usages: "معلومات",
  cooldowns: 5,
  prefix: true
};

module.exports.run = async function ({ api, event }) {
  const { threadID, messageID } = event;
  const commands = global.client?.commands;
  const cmdCount = commands ? commands.size : 0;
  const uptime = process.uptime();
  const h = Math.floor(uptime / 3600);
  const m = Math.floor((uptime % 3600) / 60);
  const s = Math.floor(uptime % 60);
  const uptimeStr = `${h}س ${m}د ${s}ث`;
  const mem = process.memoryUsage();
  const memMB = Math.round(mem.heapUsed / 1024 / 1024);

  api.sendMessage([
    "╔═══════════════════╗",
    "║    🤖 Cypher Bot    ║",
    "╚═══════════════════╝",
    "",
    `📦 الأوامر: ${cmdCount}`,
    `⏱ وقت التشغيل: ${uptimeStr}`,
    `🧠 RAM: ${memMB} MB`,
    `🖥 Node.js: ${process.version}`,
    "",
    `🌐 البيئة: Replit`,
    `👤 المطور: Yassin`
  ].join("\n"), threadID, messageID);
};
