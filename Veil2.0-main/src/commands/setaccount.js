const fs = require("fs-extra");
const path = require("path");
const { atomicWriteJsonSync } = require("../utils/atomicWrite");

module.exports = {
  config: {
    name: "setaccount",
    version: "1.0",
    author: "ZAO",
    cooldowns: 5,
    hasPermssion: 2,
    description: "Update the bot's Facebook login credentials from chat. Bot admins only.",
    commandCategory: "admin",
    guide: "  {pn} [email] [password]\n"
         + "  {pn} status  — check if credentials are saved\n"
         + "  {pn} clear   — remove saved credentials\n\n"
         + "⚠️  Use this in a PRIVATE conversation with the bot only!",
    usePrefix: true
  },

  run: async function ({ api, event, args }) {
    const { senderID, messageID, threadID } = event;
    const adminIDs = (global.config?.adminBot || global.config?.ADMINBOT || []).map(String);
    if (!adminIDs.includes(String(senderID))) return;

    const action = (args[0] || "").toLowerCase();

    const configPath = path.join(process.cwd(), "config.json");

    function _readConfig() {
      try { return fs.readJsonSync(configPath); } catch (_) { return {}; }
    }
    function _writeConfig(obj) {
      try { atomicWriteJsonSync(configPath, obj, { spaces: 2 }); } catch (_) {}
      if (global.config?.facebookAccount) {
        global.config.facebookAccount.email    = obj.facebookAccount?.email    || "";
        global.config.facebookAccount.password = obj.facebookAccount?.password || "";
      }
    }

    if (action === "status") {
      const email    = global.config?.facebookAccount?.email    || "";
      const password = global.config?.facebookAccount?.password || "";
      const hasEmail = !!(email.trim());
      const hasPass  = !!(password.trim());

      return api.sendMessage(
        "🔐 Account Credentials Status\n"
        + "━━━━━━━━━━━━━━━\n"
        + `📧 Email: ${hasEmail ? "✅ Saved (hidden)" : "❌ Not set"}\n`
        + `🔑 Password: ${hasPass ? "✅ Saved (hidden)" : "❌ Not set"}\n`
        + "━━━━━━━━━━━━━━━\n"
        + (hasEmail && hasPass
          ? "✅ Bot will auto re-login when session expires."
          : "⚠️ No credentials set. Use: /setaccount [email] [password]"),
        threadID
      );
    }

    if (action === "clear") {
      const obj = _readConfig();
      if (!obj.facebookAccount) obj.facebookAccount = {};
      obj.facebookAccount.email    = "";
      obj.facebookAccount.password = "";
      _writeConfig(obj);
      try { api.unsendMessage(messageID); } catch (_) {}
      return api.sendMessage("✅ Credentials cleared from config.json.", threadID);
    }

    const email    = args[0];
    const password = args.slice(1).join(" ");

    if (!email || !password) {
      try { api.unsendMessage(messageID); } catch (_) {}
      return api.sendMessage(
        "❌ Usage: /setaccount [email] [password]\n\n"
        + "Example:\n/setaccount example@gmail.com mypassword\n\n"
        + "⚠️ Use this in a PRIVATE chat with the bot only!",
        threadID
      );
    }

    try { api.unsendMessage(messageID); } catch (_) {}

    const obj = _readConfig();
    if (!obj.facebookAccount) obj.facebookAccount = {};
    obj.facebookAccount.email    = email.trim();
    obj.facebookAccount.password = password.trim();
    _writeConfig(obj);

    return api.sendMessage(
      "✅ Credentials saved to config.json!\n"
      + "━━━━━━━━━━━━━━━\n"
      + "📧 Email: saved ✅\n"
      + "🔑 Password: saved ✅\n"
      + "━━━━━━━━━━━━━━━\n"
      + "🔄 The bot will auto re-login when the next session expires.\n\n"
      + "⚠️ Your original message was deleted for security.",
      threadID
    );
  }
};
