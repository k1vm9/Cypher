'use strict';

const fs   = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(process.cwd(), 'DB', 'divelSettings.json');
const DEFAULT_TIME_MS = 5 * 60 * 1000;
const DEFAULT_MESSAGE = '👋 أهلاً، هل من أحد هنا؟';

function loadSettings() {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) return {};
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
  } catch (_) { return {}; }
}

function saveSettings() {
  try {
    const toSave = {};
    for (const [tid, cfg] of Object.entries(global.divelMonitor || {})) {
      toSave[tid] = { enabled: cfg.enabled, message: cfg.message, timeMs: cfg.timeMs, botSentLast: cfg.botSentLast };
    }
    const dir = path.dirname(SETTINGS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(toSave, null, 2), 'utf-8');
  } catch (_) {}
}

function getCfg(threadID) {
  if (!global.divelMonitor) global.divelMonitor = {};
  if (!global.divelMonitor[threadID]) {
    global.divelMonitor[threadID] = { enabled: false, message: DEFAULT_MESSAGE, timeMs: DEFAULT_TIME_MS, timer: null, botSentLast: true };
  }
  return global.divelMonitor[threadID];
}

function clearTimer(cfg) {
  if (cfg.timer) { clearTimeout(cfg.timer); cfg.timer = null; }
}

function startTimer(api, threadID, cfg) {
  clearTimer(cfg);
  cfg.timer = setTimeout(async () => {
    cfg.timer = null;
    if (!cfg.enabled || cfg.botSentLast) return;
    try { await api.sendMessage(cfg.message, threadID); cfg.botSentLast = true; saveSettings(); } catch (_) {}
  }, cfg.timeMs);
}

module.exports.config = {
  name: 'divel',
  version: '2.0',
  hasPermssion: 2,
  credits: 'DJAMEL',
  description: 'مراقب النشاط — يرسل رسالة مُعدّة عند صمت المجموعة',
  commandCategory: 'النظام',
  usages: 'on | off | change <نص> | time <ثوانٍ> | status',
  cooldowns: 3,
  prefix: true
};

module.exports.onLoad = function () {
  global.divelMonitor = global.divelMonitor || {};
  const saved = loadSettings();
  for (const [tid, data] of Object.entries(saved)) {
    global.divelMonitor[tid] = { enabled: data.enabled ?? false, message: data.message || DEFAULT_MESSAGE, timeMs: data.timeMs || DEFAULT_TIME_MS, timer: null, botSentLast: true };
  }
};

module.exports.handleEvent = async function ({ api, event }) {
  try {
    const { threadID, senderID, type } = event;
    if (type !== 'message' && type !== 'message_reply') return;
    const cfg = global.divelMonitor?.[threadID];
    if (!cfg || !cfg.enabled) return;
    const botID = String(api.getCurrentUserID());
    if (String(senderID) === botID) return;
    cfg.botSentLast = false;
    startTimer(api, threadID, cfg);
  } catch (_) {}
};

module.exports.run = async function ({ api, event }) {
  const { threadID, messageID, senderID } = event;
  const rawBody = event.body || '';
  const args = rawBody.trim().split(/\s+/).slice(1);
  const sub = (args[0] || '').toLowerCase();
  const ADMINBOT = (global.config?.ADMINBOT || []).map(String);
  if (!ADMINBOT.includes(String(senderID))) return api.sendMessage('⛔ هذا الأمر خاص بأدمن البوت فقط.', threadID, messageID);
  const cfg = getCfg(threadID);

  if (sub === 'on') {
    if (cfg.enabled) return api.sendMessage('✅ المراقب مُفعَّل مسبقاً.', threadID, messageID);
    cfg.enabled = true; cfg.botSentLast = true; clearTimer(cfg); saveSettings();
    return api.sendMessage(`✅ تم تفعيل مراقب النشاط.\n⏱ المدة: ${Math.round(cfg.timeMs / 1000)} ثانية\n📝 الرسالة: ${cfg.message}`, threadID, messageID);
  }
  if (sub === 'off') {
    if (!cfg.enabled) return api.sendMessage('⚠️ المراقب غير مُفعَّل أصلاً.', threadID, messageID);
    cfg.enabled = false; clearTimer(cfg); saveSettings();
    return api.sendMessage('🔴 تم إيقاف مراقب النشاط.', threadID, messageID);
  }
  if (sub === 'change') {
    const newMsg = args.slice(1).join(' ').trim();
    if (!newMsg) return api.sendMessage('📝 استخدام: divel change <نص الرسالة>', threadID, messageID);
    cfg.message = newMsg; saveSettings();
    return api.sendMessage(`✅ تم تحديث الرسالة:\n\n${newMsg}`, threadID, messageID);
  }
  if (sub === 'time') {
    const secs = parseInt(args[1], 10);
    if (!secs || secs < 10 || secs > 86400) return api.sendMessage('⏱ استخدام: divel time <ثوانٍ> (10-86400)', threadID, messageID);
    cfg.timeMs = secs * 1000;
    if (cfg.enabled && !cfg.botSentLast) startTimer(api, threadID, cfg);
    saveSettings();
    return api.sendMessage(`✅ تم تحديث مدة الصمت: ${secs} ثانية.`, threadID, messageID);
  }
  if (sub === 'status') {
    const state = cfg.enabled ? '✅ مُفعَّل' : '🔴 موقوف';
    const mins = (cfg.timeMs / 1000 / 60).toFixed(1);
    return api.sendMessage(`📊 إعدادات مراقب النشاط\n\nالحالة: ${state}\nالمدة: ${Math.round(cfg.timeMs / 1000)} ثانية (${mins} دقيقة)\nالرسالة:\n${cfg.message}`, threadID, messageID);
  }
  return api.sendMessage('📖 أوامر divel:\n.divel on — تفعيل\n.divel off — إيقاف\n.divel change <نص> — تحديد الرسالة\n.divel time <ثوانٍ> — مدة الصمت\n.divel status — الإعدادات', threadID, messageID);
};
