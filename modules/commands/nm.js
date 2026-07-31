const fs = require("fs-extra");
const path = require("path");

const LOCKS_FILE = path.join(process.cwd(), "data", "nm-locks.json");
const FAIL_THRESHOLD = 3;
const _failCounts = {};

function loadLocks() {
  try {
    fs.ensureDirSync(path.dirname(LOCKS_FILE));
    if (fs.existsSync(LOCKS_FILE)) {
      const obj = JSON.parse(fs.readFileSync(LOCKS_FILE, "utf8"));
      const map = new Map();
      for (const [k, v] of Object.entries(obj)) map.set(k, v);
      return map;
    }
  } catch (_) {}
  return new Map();
}

function saveLocks(locksMap) {
  try {
    fs.ensureDirSync(path.dirname(LOCKS_FILE));
    const obj = {};
    for (const [k, v] of locksMap.entries()) obj[k] = v;
    const tmp = LOCKS_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
    fs.renameSync(tmp, LOCKS_FILE);
  } catch (_) {}
}

function setTitle(api, name, threadID) {
  return new Promise((resolve, reject) => {
    try {
      const result = api.setTitle(name, threadID, (err) => { if (err) reject(err); else resolve(); });
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch (e) { reject(e); }
  });
}

function isDeadThreadError(msg) {
  const s = msg.toLowerCase();
  return s.includes("no message_thread") || s.includes("thread may not exist") || s.includes("not a participant") || s.includes("you are not a member") || s.includes("binary response received") || s.includes("json.parse error");
}

module.exports.config = {
  name: "nm",
  version: "2.1.0",
  hasPermssion: 2,
  credits: "ZAO",
  description: "قفل اسم المجموعة ومنع تغييره",
  commandCategory: "نظام",
  usages: "تفعيل [الاسم] | ايقاف | قائمة | تنظيف",
  cooldowns: 3,
  prefix: true
};

module.exports.languages = { "vi": {}, "en": {} };

module.exports.onLoad = function ({ api }) {
  global.nameLocks = loadLocks();
  if (global._nmInterval) { clearInterval(global._nmInterval); global._nmInterval = null; }
  global._nmInterval = setInterval(async () => {
    const botApi = global._botApi || api;
    if (!botApi || global.nameLocks.size === 0) return;
    for (const [threadID, lockedName] of global.nameLocks.entries()) {
      try {
        await setTitle(botApi, lockedName, threadID);
        _failCounts[threadID] = 0;
      } catch (err) {
        const msg = String(err && (err.message || err.error || (err.detail && err.detail.message) || err));
        const s = msg.toLowerCase();
        if (s.includes("mqtt") || s.includes("not connected to mqtt")) continue;
        const isBinary = !!(err && err.isBinaryResponse);
        if (isBinary || isDeadThreadError(msg)) {
          _failCounts[threadID] = (_failCounts[threadID] || 0) + 1;
          if (_failCounts[threadID] >= FAIL_THRESHOLD) {
            global.nameLocks.delete(threadID); saveLocks(global.nameLocks); delete _failCounts[threadID];
          }
        }
      }
    }
  }, 6000);
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID } = event;
  const action = args[0];
  const helpMsg = "📌 أوامر nm:\n• nm تفعيل [الاسم] — قفل اسم المجموعة\n• nm ايقاف — إيقاف القفل\n• nm قائمة — عرض المجموعات المقفولة\n• nm تنظيف — حذف جميع الأقفال";
  if (!action) return api.sendMessage(helpMsg, threadID, messageID);

  if (action === "تفعيل") {
    const name = args.slice(1).join(" ").trim();
    if (!name) return api.sendMessage("⚠️ أدخل الاسم.\nمثال: nm تفعيل اسم المجموعة", threadID, messageID);
    try { await setTitle(api, name, threadID); } catch (e) { return api.sendMessage(`❌ فشل: ${e.message || e}`, threadID, messageID); }
    global.nameLocks.set(threadID, name); _failCounts[threadID] = 0; saveLocks(global.nameLocks);
    return api.sendMessage(`🔒 تم قفل اسم المجموعة:\n"${name}"`, threadID, messageID);
  }
  if (action === "ايقاف") {
    if (!global.nameLocks.has(threadID)) return api.sendMessage("⚠️ لا يوجد قفل مفعل في هذه المجموعة.", threadID, messageID);
    global.nameLocks.delete(threadID); delete _failCounts[threadID]; saveLocks(global.nameLocks);
    return api.sendMessage("🔓 تم إيقاف قفل اسم المجموعة.", threadID, messageID);
  }
  if (action === "قائمة") {
    if (global.nameLocks.size === 0) return api.sendMessage("📋 لا توجد مجموعات مقفولة.", threadID, messageID);
    let list = "🔒 المجموعات المقفولة:\n"; let i = 1;
    for (const [tid, name] of global.nameLocks.entries()) { list += `${i}. [${tid}]: "${name}"\n`; i++; }
    return api.sendMessage(list.trim(), threadID, messageID);
  }
  if (action === "تنظيف") {
    const count = global.nameLocks.size;
    if (count === 0) return api.sendMessage("🗑️ لا توجد بيانات.", threadID, messageID);
    global.nameLocks.clear(); saveLocks(global.nameLocks);
    return api.sendMessage(`🧹 تم حذف جميع الأقفال. عدد المجموعات: ${count}`, threadID, messageID);
  }
  return api.sendMessage(helpMsg, threadID, messageID);
};
