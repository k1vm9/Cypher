const fs   = require("fs-extra");
const path = require("path");

const REPEAT_FILE = path.join(process.cwd(), "data", "nkrar-state.json");

function loadState() {
  try {
    fs.ensureDirSync(path.dirname(REPEAT_FILE));
    if (fs.existsSync(REPEAT_FILE)) return JSON.parse(fs.readFileSync(REPEAT_FILE, "utf8"));
  } catch (_) {}
  return {};
}

function saveState(map) {
  try {
    fs.ensureDirSync(path.dirname(REPEAT_FILE));
    const obj = {};
    for (const [k, v] of Object.entries(map)) obj[k] = { message: v.message, times: v.times, intervalMs: v.intervalMs };
    const tmp = REPEAT_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
    fs.renameSync(tmp, REPEAT_FILE);
  } catch (_) {}
}

function start(api, threadID, cfg) {
  if (!global._nkrar) global._nkrar = {};
  _stop(threadID);
  const state = { active: true, sent: 0, intervalId: null, ...cfg };
  global._nkrar[threadID] = state;
  state.intervalId = setInterval(() => {
    if (!state.active) { clearInterval(state.intervalId); return; }
    if (state.times > 0 && state.sent >= state.times) { _stop(threadID); return; }
    const botApi = global._botApi || api;
    try { botApi.sendMessage(state.message, threadID); state.sent++; } catch (_) {}
  }, state.intervalMs);
}

function _stop(threadID) {
  const s = global._nkrar?.[threadID];
  if (s) { s.active = false; if (s.intervalId) { clearInterval(s.intervalId); s.intervalId = null; } delete global._nkrar[threadID]; }
}

module.exports.config = {
  name: "نكرار",
  version: "1.0.0",
  hasPermssion: 2,
  credits: "ZAO",
  description: "تكرار رسالة لعدد مرات أو بشكل مستمر",
  commandCategory: "أدوات",
  usages: "نكرار [رسالة] [عدد المرات / ∞] [الوقت: 30s|1m]",
  cooldowns: 3,
  prefix: true
};

module.exports.onLoad = function ({ api }) {
  global._nkrar = {};
  const saved = loadState();
  for (const [threadID, cfg] of Object.entries(saved)) {
    if (cfg && cfg.message && cfg.intervalMs) start(api, threadID, { ...cfg, sent: 0 });
  }
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID } = event;

  if (args[0] === "ايقاف") {
    if (!global._nkrar?.[threadID]?.active) return api.sendMessage("⚠️ لا يوجد تكرار نشط.", threadID, messageID);
    _stop(threadID);
    const state = loadState(); delete state[threadID]; saveState(state);
    return api.sendMessage("🛑 تم إيقاف التكرار.", threadID, messageID);
  }

  if (args.length < 2) return api.sendMessage("📌 الاستخدام:\nنكرار [رسالة] [عدد / ∞] [30s | 1m]\nنكرار ايقاف — للإيقاف", threadID, messageID);

  const msg = args[0];
  const timesRaw = args[1];
  const timeRaw  = args[2] || "10s";

  let times = 0;
  if (timesRaw !== "∞" && timesRaw !== "inf") {
    times = parseInt(timesRaw, 10);
    if (isNaN(times) || times < 1) return api.sendMessage("⚠️ حدد عدداً صحيحاً أو ∞ للتكرار المستمر.", threadID, messageID);
  }

  let intervalMs = 10000;
  if (timeRaw.endsWith("s")) intervalMs = parseFloat(timeRaw) * 1000;
  else if (timeRaw.endsWith("m")) intervalMs = parseFloat(timeRaw) * 60000;
  if (intervalMs < 5000) intervalMs = 5000;

  const cfg = { message: msg, times, intervalMs };
  start(api, threadID, cfg);
  const saved = loadState(); saved[threadID] = cfg; saveState(saved);

  const timesLabel = times === 0 ? "∞ مرة" : `${times} مرة`;
  return api.sendMessage(`✅ تم بدء التكرار\n📝 "${msg}"\n🔢 ${timesLabel}\n⏱ كل ${intervalMs / 1000}s`, threadID, messageID);
};
