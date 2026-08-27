/**
 * Veil — Command Loader (with ZAO compatibility)
 */
"use strict";
const fs   = require("fs-extra");
const path = require("path");
const log  = require("./logger");

function _normalizeCmd(cmd, file) {
  if (!cmd) return cmd;

  // Support both export styles:
  // ZAO:  module.exports.config + module.exports.run/onStart/handleEvent
  // Veil: module.exports = { config, onStart }
  // Legacy: module.exports = { name, run }

  // Normalize hasPermssion → role
  if (cmd.config) {
    if (cmd.config.hasPermssion !== undefined && cmd.config.role === undefined) {
      cmd.config.role = cmd.config.hasPermssion;
    }
    // Normalize commandCategory → category
    if (cmd.config.commandCategory && !cmd.config.category) {
      cmd.config.category = cmd.config.commandCategory;
    }
  }

  // handleEvent → onEvent alias (ZAO uses handleEvent, Veil uses onEvent)
  if (typeof cmd.handleEvent === "function" && typeof cmd.onEvent !== "function") {
    cmd.onEvent = cmd.handleEvent;
  }

  return cmd;
}

function loadCommands(dir) {
  const commands = new Map();
  const absDir   = path.resolve(process.cwd(), dir);
  if (!fs.existsSync(absDir)) { log.warn("LOADER", `مجلد الأوامر غير موجود: ${absDir}`); return commands; }

  const files = fs.readdirSync(absDir).filter(f => f.endsWith(".js"));
  let loaded = 0, failed = 0;

  console.log();
  console.log(`\x1b[36m  ─── Veil — تحميل الأوامر (${files.length}) ───\x1b[0m`);

  for (const file of files) {
    const absPath = path.resolve(absDir, file);
    try {
      delete require.cache[absPath];
      let cmd = require(absPath);

      if (cmd?.config?.name) {
        cmd = _normalizeCmd(cmd, file);
        const name = String(cmd.config.name).toLowerCase();
        commands.set(name, cmd);
        if (Array.isArray(cmd.config.aliases)) {
          for (const a of cmd.config.aliases) {
            if (a) commands.set(String(a).toLowerCase(), cmd);
          }
        }
        if (typeof cmd.onChat === "function" && global.GoatBot?.onChat && !global.GoatBot.onChat.includes(name))
          global.GoatBot.onChat.push(name);
        // Call onLoad if present (ZAO compatibility)
        if (typeof cmd.onLoad === "function") {
          try { cmd.onLoad(); } catch (_) {}
        }
        console.log(`  \x1b[32m✅\x1b[0m /${name}`);
        loaded++;
      } else if (cmd?.name && typeof cmd.run === "function") {
        const name = String(cmd.name).toLowerCase();
        commands.set(name, {
          config: { name, aliases: cmd.aliases||[], category: cmd.category||"other", role: 0, description: cmd.description||"" },
          onStart: ctx => cmd.run(ctx)
        });
        console.log(`  \x1b[32m✅\x1b[0m /${name} (legacy)`);
        loaded++;
      } else {
        console.log(`  \x1b[33m⚠\x1b[0m ${file}: لا يوجد config.name`);
        failed++;
      }
    } catch (e) {
      console.log(`  \x1b[31m❌\x1b[0m ${file}: ${e.message}`);
      failed++;
    }
  }
  console.log();
  log.ok("LOADER", `تم تحميل \x1b[32m${loaded}\x1b[0m أمر${failed ? ` (${failed} فشل)` : ""} ✔`);
  return commands;
}

function hotReloadCommand(absPath) {
  try {
    delete require.cache[absPath];
    let cmd = require(absPath);
    if (!cmd?.config?.name) return { ok: false, error: "config.name مفقود" };
    cmd = _normalizeCmd(cmd, absPath);
    const name = String(cmd.config.name).toLowerCase();
    if (global.GoatBot?.commands) {
      global.GoatBot.commands.set(name, cmd);
      if (cmd.config.aliases) for (const a of cmd.config.aliases||[]) if (a) global.GoatBot.commands.set(String(a).toLowerCase(), cmd);
    }
    if (typeof cmd.onLoad === "function") { try { cmd.onLoad(); } catch (_) {} }
    log.ok("HOT-CMD", `/${name} تم تحديثه بدون إعادة تشغيل ✔`);
    return { ok: true, name };
  } catch (e) { return { ok: false, error: e.message }; }
}

module.exports = { loadCommands, hotReloadCommand };
