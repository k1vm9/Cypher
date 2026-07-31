/**
 * refresh.js — Hot-reload bot commands
 * Fixed: global.client.events is a Map, not an Array.
 */
const fs   = require("fs");
const path = require("path");

module.exports.config = {
  name: "ريفرش",
  version: "3.1.0",
  hasPermssion: 2,
  credits: "Yassin",
  description: "تحديث الأوامر + قراءة الجديد + حذف المحذوف",
  commandCategory: "system",
  usages: "[command name]",
  cooldowns: 3,
  prefix: true
};

function unregisterCommand(cmdName) {
  global.client.commands.delete(cmdName);
  const idx = (global.client.eventRegistered || []).indexOf(cmdName);
  if (idx !== -1) global.client.eventRegistered.splice(idx, 1);
}

function registerCommand(command) {
  const name = command.config.name;
  global.client.commands.set(name, command);
  if (typeof command.handleEvent === "function") {
    if (!global.client.eventRegistered.includes(name)) global.client.eventRegistered.push(name);
  }
}

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID } = event;
  const commandsPath = path.join(__dirname);

  try {
    const files = fs.readdirSync(commandsPath).filter(f => f.endsWith(".js"));
    const fileNames = files.map(f => f.replace(".js", ""));

    // Remove stale commands
    for (const [name, cmd] of global.client.commands) {
      if (cmd && cmd.__filename && !fileNames.includes(cmd.__filename)) {
        unregisterCommand(name);
      }
    }

    const targetName = args[0];

    // Reload a single command
    if (targetName) {
      const filePath = path.join(commandsPath, targetName + ".js");
      if (!fs.existsSync(filePath)) return api.sendMessage("❌ الأمر غير موجود: " + targetName, threadID, messageID);
      delete require.cache[require.resolve(filePath)];
      const command = require(filePath);
      command.__filename = targetName;
      unregisterCommand(command.config.name);
      registerCommand(command);
      return api.sendMessage(`✅ تم تحديث الأمر: ${command.config.name}`, threadID, messageID);
    }

    // Reload all
    let success = 0, failed = 0, added = 0;
    for (const file of files) {
      try {
        const filePath = path.join(commandsPath, file);
        delete require.cache[require.resolve(filePath)];
        const command = require(filePath);
        command.__filename = file.replace(".js", "");
        const isNew = !global.client.commands.has(command.config.name);
        unregisterCommand(command.config.name);
        registerCommand(command);
        if (isNew) added++;
        success++;
      } catch (err) {
        console.error(`❌ ${file}:`, err.message);
        failed++;
      }
    }
    api.sendMessage(`🔄 تم التحديث\n✅ نجاح: ${success}\n🆕 جديد: ${added}\n❌ فشل: ${failed}`, threadID, messageID);
  } catch (err) {
    api.sendMessage("⚠️ خطأ أثناء التحديث: " + (err.message || err), threadID, messageID);
  }
};
