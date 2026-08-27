/**
 * Veil — Unified Event Handler
 */
"use strict";

const rateLimit = require("../protection/rateLimit");

// ─── ZAO compatibility bridge ────────────────────────────────────────────────
if (!global.client) global.client = {};
// Keep client.commands in sync
Object.defineProperty(global.client, 'commands', {
  get: () => global.GoatBot?.commands,
  configurable: true, enumerable: true,
});
// handleReply array bridge (ZAO uses array, Veil uses Map)
if (!global.client.handleReply) global.client.handleReply = [];

// ─── Anti-Duplicate Guard ────────────────────────────────────────────────────
const _processed = new Map();
const DEDUP_TTL  = 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [k, ts] of _processed) {
    if (now - ts > DEDUP_TTL) _processed.delete(k);
  }
}, 30 * 1000);

function isDuplicate(msgID) {
  if (!msgID) return false;
  if (_processed.has(msgID)) return true;
  _processed.set(msgID, Date.now());
  return false;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getRole(senderID) {
  const cfg    = global.GoatBot?.config || {};
  const sid    = String(senderID);
  const ownerIDs = Array.isArray(cfg.ownerID) ? cfg.ownerID : (cfg.ownerID ? [cfg.ownerID] : []);
  const supers = [...(cfg.superAdminBot || []), ...ownerIDs].filter(Boolean).map(String);
  const admins = (cfg.adminBot || []).map(String);
  if (supers.includes(sid)) return 3;
  if (admins.includes(sid)) return 2;
  return 0;
}

function isAdmin(senderID) { return getRole(senderID) >= 2; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function buildMessage(api, event) {
  return {
    reply: async (msg, cb) => {
      try {
        const text = typeof msg === "string" ? msg : msg?.body || "";
        const delay = global.utils?.calcHumanTypingDelay?.(text) || 1000;
        await global.utils?.simulateTyping?.(api, event.threadID, delay);
      } catch (_) {}
      return api.sendMessage(msg, event.threadID, cb);
    },
    unsend:  (mid, cb)        => { try { api.unsendMessage(mid || event.messageID, cb); } catch (_) {} },
    react:   (emoji, mid, cb) => { try { api.setMessageReaction(emoji, mid || event.messageID, () => {}, true); } catch (_) {} },
    send:    (msg, tid, cb)   => api.sendMessage(msg, tid || event.threadID, cb),
  };
}

// ─── Silent-mode API wrapper ─────────────────────────────────────────────────
function makeSilentApi(api, threadID) {
  const silent = Object.create(api);
  const noop = (msg, tid, cb) => {
    const t = tid || threadID;
    const body = typeof msg === "string" ? msg.slice(0, 80) : "[attachment]";
    console.log(`[SILENT] tid=${t} → ${body}`);
    if (typeof cb === "function") setTimeout(() => cb(null, { messageID: "silent_" + Date.now() }), 10);
    return Promise.resolve({ messageID: "silent_" + Date.now() });
  };
  silent.sendMessage = noop;
  return silent;
}

// ─── Flood / Spam ─────────────────────────────────────────────────────────────
function checkFlood(tid, sid) {
  const cfg = global.GoatBot?.config?.rateLimit || {};
  const key = `flood:${tid}:${sid}`;
  return rateLimit.check(key, cfg.maxMessagesPerWindow || 8, cfg.windowMs || 6000).exceeded;
}
function checkSpam(sid) {
  return rateLimit.check(`spam:${sid}`, 20, 30000).exceeded;
}

// ─── Per-user-per-command cooldown ───────────────────────────────────────────
const _cooldowns = new Map();
const _cdClean = setInterval(() => {
  const cut = Date.now() - 300_000;
  for (const [k, ts] of _cooldowns) if (ts < cut) _cooldowns.delete(k);
}, 60_000);
if (typeof _cdClean.unref === "function") _cdClean.unref();

function checkCooldown(cmdName, senderID, seconds) {
  if (!seconds || seconds <= 0) return null;
  const key = `${cmdName}:${senderID}`;
  const last = _cooldowns.get(key) || 0;
  const rem  = seconds - (Date.now() - last) / 1000;
  if (rem > 0) return Math.ceil(rem);
  _cooldowns.set(key, Date.now());
  return null;
}

// ─── Group admin check (for hasPermssion: 1) ─────────────────────────────────
function getGroupRole(senderID, threadID) {
  try {
    const info = global.data?.threadInfo?.get(String(threadID));
    if (Array.isArray(info?.adminIDs)) {
      const ids = info.adminIDs.map(a => String(a?.id ?? a));
      if (ids.includes(String(senderID))) return 1;
    }
  } catch (_) {}
  return 0;
}

// ─── Concurrent execution cap (per sender) ────────────────────────────────────
const _running = new Map();
const MAX_PARALLEL = 3;
function acquireSlot(sid) {
  const n = _running.get(sid) || 0;
  if (n >= MAX_PARALLEL) return false;
  _running.set(sid, n + 1);
  return true;
}
function releaseSlot(sid) {
  const n = _running.get(sid) || 1;
  n <= 1 ? _running.delete(sid) : _running.set(sid, n - 1);
}

// ─── Command execution timeout ────────────────────────────────────────────────
const CMD_TIMEOUT = 30_000;
function withTimeout(p, ms) {
  let _t;
  const guard = new Promise((_, rej) => { _t = setTimeout(() => rej(new Error(`⌛ انتهت مهلة الأمر (${ms / 1000}s)`)), ms); });
  return Promise.race([p, guard]).finally(() => clearTimeout(_t));
}

// ─── ZAO-style handleReply array bridge ──────────────────────────────────────
async function handleZaoReply(api, event) {
  const arr = global.client?.handleReply;
  if (!Array.isArray(arr) || !arr.length) return false;
  const replyMsgID = event.messageReply?.messageID;
  if (!replyMsgID) return false;

  for (let i = 0; i < arr.length; i++) {
    const hr = arr[i];
    if (hr.messageID === replyMsgID &&
        (!hr.author || String(hr.author) === String(event.senderID))) {
      arr.splice(i, 1);
      try {
        if (typeof hr.callback === "function") {
          await hr.callback({
            api, event, message: buildMessage(api, event),
            handleReply: hr,
            args: (event.body || "").trim().split(/\s+/).filter(Boolean),
          });
        } else {
          // ZAO-style: find command with handleReply method
          const cmd = global.GoatBot?.commands?.get(String(hr.name || "").toLowerCase());
          if (cmd && typeof cmd.handleReply === "function") {
            await cmd.handleReply({
              api, event, message: buildMessage(api, event),
              handleReply: hr,
              args: (event.body || "").trim().split(/\s+/).filter(Boolean),
            });
          }
        }
      } catch (e) { global.log?.error?.("ZAO_REPLY", e.message); }
      return true;
    }
  }
  return false;
}

// ─── Veil onReply Map handler ─────────────────────────────────────────────────
async function handleReply(api, event) {
  const replyMap = global.GoatBot?.onReply;
  if (!replyMap?.size) return false;
  const replyMsgID = event.messageReply?.messageID;
  if (!replyMsgID) return false;

  for (const [key, handler] of replyMap) {
    if (handler.messageID === replyMsgID &&
        (!handler.author || String(handler.author) === String(event.senderID))) {
      replyMap.delete(key);
      try {
        await handler.callback({
          api, event, message: buildMessage(api, event),
          args: (event.body || "").trim().split(/\s+/).filter(Boolean),
        });
      } catch (e) { global.log?.error?.("REPLY_CB", e.message); }
      return true;
    }
  }
  return false;
}

// ─── Main event handler ───────────────────────────────────────────────────────
async function onEventCmds(api, event, commands) {
  if (!event || !api) return;
  global.lastMqttActivity = Date.now();

  const { type, senderID, threadID, body = "", messageID } = event;
  if (!senderID || !threadID) return;

  // تجاهل رسائل البوت لنفسه
  if (String(senderID) === String(global.GoatBot?.botID)) return;

  // منع معالجة نفس الرسالة مرتين
  if (messageID && isDuplicate(messageID)) return;

  // تتبع رسائل البشر للـ angel monitoring
  if ((type === "message" || type === "message_reply") && threadID) {
    if (!global._msgListeners) global._msgListeners = [];
    for (const fn of global._msgListeners) {
      try { fn({ threadID, senderID, ts: Date.now() }); } catch (_) {}
    }
    // ZAO motor activity tracker
    if (event.isGroup) global.lastActivity = global.lastActivity || {};
    if (event.isGroup && String(senderID) !== String(global.GoatBot?.botID)) {
      global.lastActivity[String(threadID)] = Date.now();
    }
  }

  // Dashboard stats
  try {
    if (typeof global._bufferMsg === "function") global._bufferMsg({ ...event, ts: Date.now() });
    if (typeof global._trackMsg  === "function") global._trackMsg(threadID, senderID, body);
  } catch (_) {}

  // onEvent / handleEvent (group events like join/leave/image)
  if (type !== "message" && type !== "message_reply") {
    const allCmds = commands || global.GoatBot?.commands;
    if (allCmds) {
      for (const [, cmd] of allCmds) {
        const evFn = cmd.onEvent || cmd.handleEvent;
        if (typeof evFn === "function") {
          try { await evFn.call(cmd, { api, event, message: buildMessage(api, event) }); } catch (_) {}
        }
      }
    }
    return;
  }

  // Handle reply callbacks (ZAO array style first, then Veil Map style)
  if (type === "message_reply" || event.messageReply) {
    if (await handleZaoReply(api, event)) return;
    if (await handleReply(api, event)) return;
  }

  if (type !== "message") return;
  if (!body.trim()) return;

  // DM lock
  if (global.GoatBot?.dmLocked && !event.isGroup) return;

  // ── Runtime bot lock (قفل) — when locked, only admins can use the bot ────────
  const role        = getRole(senderID);
  const groupRole   = getGroupRole(senderID, threadID);
  const effectiveRole = Math.max(role, groupRole);
  if (global._botLocked && role < 2) return;

  // Flood + Spam
  if (checkFlood(threadID, senderID)) return;
  if (checkSpam(senderID)) return;

  const prefix = global.GoatBot?.config?.prefix || "/";
  if (!body.trimStart().startsWith(prefix)) return;

  const parts   = body.trimStart().slice(prefix.length).trim().split(/\s+/);
  const cmdName = (parts[0] || "").toLowerCase();
  const args    = parts.slice(1);
  if (!cmdName) return;

  const allCmds = commands || global.GoatBot?.commands;
  const cmd     = allCmds?.get(cmdName);
  if (!cmd) return;

  // Thread-level command control
  try {
    const ctrl = require("../utils/cmdControl");
    if (!ctrl.isEnabled(threadID, cmd.config?.name || cmdName)) return;
  } catch (_) {}

  // Permission check — support both role and hasPermssion
  const required = cmd.config?.role ?? cmd.config?.hasPermssion ?? 0;
  if (effectiveRole < required) {
    const msg = required <= 1
      ? "⛔ هذا الأمر لأدمن المجموعة فقط."
      : required >= 3
        ? "⛔ هذا الأمر للمالك فقط."
        : "⛔ هذا الأمر لأدمن البوت فقط.";
    try { await api.sendMessage(msg, threadID); } catch (_) {}
    return;
  }

  // Cooldown — bypass for super admins (role 3)
  const cdSec = Number(cmd.config?.cooldowns || cmd.config?.countDown || 0);
  if (cdSec > 0) {
    if (effectiveRole < 3) {
      const rem = checkCooldown(cmdName, senderID, cdSec);
      if (rem !== null) {
        try { await api.sendMessage(`⏳ انتظر ${rem}s قبل إعادة استخدام /${cmdName}.`, threadID); } catch (_) {}
        return;
      }
    } else {
      checkCooldown(cmdName, senderID, cdSec); // register timestamp without blocking
    }
  }

  // Concurrent execution cap — no more than 3 overlapping commands per sender
  if (!acquireSlot(senderID)) {
    try { await api.sendMessage("⚠️ لديك أوامر قيد التنفيذ، انتظر قليلاً.", threadID); } catch (_) {}
    return;
  }

  // handleReply size guard — prevent unbounded growth
  if (Array.isArray(global.client?.handleReply) && global.client.handleReply.length > 200) {
    global.client.handleReply.splice(0, global.client.handleReply.length - 200);
  }

  // Active API (support ZAO tier-swap pattern)
  const activeApi = global._botApi || api;

  // Silent mode — redirect replies to console
  const execApi = global._silentMode ? makeSilentApi(activeApi, threadID) : activeApi;

  const ctx = {
    api: execApi, event, args, commandName: cmdName,
    message:    buildMessage(execApi, event),
    prefix, role: effectiveRole, senderID, threadID,
    permssion:  effectiveRole,   // ZAO compatibility
    permission: effectiveRole,
  };

  try {
    const fn = cmd.onStart || cmd.run;
    if (typeof fn === "function") await withTimeout(fn.call(cmd, ctx), CMD_TIMEOUT);
  } catch (e) {
    global.log?.error?.("CMD", `خطأ في /${cmdName}: ${e.message}`);
    try { await execApi.sendMessage(`❌ خطأ في الأمر: ${e.message}`, threadID); } catch (_) {}
  } finally {
    releaseSlot(senderID);
  }
}

module.exports = onEventCmds;
