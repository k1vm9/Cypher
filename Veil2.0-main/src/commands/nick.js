/**
 * DAVID V1 — /nick v5 — قفل الكنيات (Lock Mode)
 * Copyright © 2025 DJAMEL
 * ✦ يقفل كنية كل عضو ويمنع أي شخص من تغييرها إلا أدمن البوت
 * ✦ يراقب عبر onEvent ويعيد الكنية فوراً عند تغييرها
 * ✦ تأخير عشوائي 3.5–5 ثوانٍ بين كل كنية
 * ✦ مؤقت دوري اختياري لإعادة تطبيق الكنيات (r للعشوائي)
 */
"use strict";
const fs   = require("fs-extra");
const path = require("path");

const DATA = path.join(process.cwd(), "database/data/nickLocks.json");
const sleep = ms => new Promise(r => setTimeout(r, ms));

function load()  { try { if (fs.existsSync(DATA)) return JSON.parse(fs.readFileSync(DATA, "utf8")); } catch (_) {} return {}; }
function save(d) { fs.ensureDirSync(path.dirname(DATA)); fs.writeFileSync(DATA, JSON.stringify(d, null, 2)); }

function isBotAdmin(id) {
  const cfg = global.GoatBot?.config || {};
  const sid = String(id);
  const own = Array.isArray(cfg.ownerID) ? cfg.ownerID : (cfg.ownerID ? [cfg.ownerID] : []);
  return [...own, ...(cfg.superAdminBot || []), ...(cfg.adminBot || [])]
    .filter(Boolean).map(String).includes(sid);
}

function randDelay() { return 3500 + Math.random() * 1500; } // 3.5–5 ثانية

function _parseRandRange(str) {
  if (!str || !str.trim()) return { min: 300, max: 900 };
  const m = String(str).trim().match(/^([0-9.]+)(s|m)?-([0-9.]+)(s|m)?$/i);
  if (!m) return null;
  const toSec = (v, u) => { const n = parseFloat(v); if (isNaN(n) || n <= 0) return null; return u && u.toLowerCase() === "m" ? Math.round(n * 60) : Math.round(n); };
  const mn = toSec(m[1], m[2]), mx = toSec(m[3], m[4]);
  if (!mn || !mx || mn < 5 || mx <= mn) return null;
  return { min: mn, max: mx };
}

// ── Global state ──────────────────────────────────────────────────────────────
if (!global._nickLocks)     global._nickLocks     = {}; // tid → { active, globalName, perUser:{uid:name}, timerMin, timerMax }
if (!global._nickQueue)     global._nickQueue     = {}; // tid → قيد التطبيق
if (!global._nickRestoring) global._nickRestoring = {}; // tid:uid → true (منع التكرار)
if (!global._nickTimers)    global._nickTimers    = {}; // tid → setTimeout handle

// ── استعادة من الملف ──────────────────────────────────────────────────────────
function restoreAll(api) {
  if (global._nickRestored) return;
  global._nickRestored = true;
  const d = load();
  for (const [tid, data] of Object.entries(d)) {
    if (data.active) {
      global._nickLocks[tid] = data;
      if ((data.timerMin || 0) > 0) startNickTimer(api, tid);
    }
  }
}

// ── المؤقت الدوري ─────────────────────────────────────────────────────────────
function stopNickTimer(tid) {
  clearTimeout(global._nickTimers[tid]);
  delete global._nickTimers[tid];
}

function startNickTimer(api, tid) {
  stopNickTimer(tid);
  const lock = global._nickLocks[tid];
  if (!lock?.active) return;
  const mn = lock.timerMin || 0;
  const mx = lock.timerMax || mn;
  if (!mn) return;
  const secs = mn === mx ? mn : mn + Math.random() * (mx - mn);
  global._nickTimers[tid] = setTimeout(() => {
    delete global._nickTimers[tid];
    const cur = global._nickLocks[tid];
    if (cur?.active) {
      applyAll(api, tid).catch(() => {});
      startNickTimer(api, tid);
    }
  }, Math.round(secs * 1000));
}

// ── تطبيق كنية لشخص واحد ──────────────────────────────────────────────────────
async function applyNick(api, tid, uid, name) {
  const key = `${tid}:${uid}`;
  if (global._nickRestoring[key]) return;
  global._nickRestoring[key] = true;
  try {
    await api.changeNickname(name || "", tid, uid);
  } catch (_) {}
  await sleep(randDelay());
  delete global._nickRestoring[key];
}

// ── تطبيق كنيات على جميع الأعضاء (عند التفعيل أو المؤقت) ───────────────────
async function applyAll(api, tid) {
  if (global._nickQueue[tid]) return;
  global._nickQueue[tid] = true;
  try {
    const info = await new Promise((res, rej) => api.getThreadInfo(tid, (e, d) => e ? rej(e) : res(d)));
    const members = (info?.participantIDs || []).filter(id => String(id) !== String(global.GoatBot?.botID));
    const lock    = global._nickLocks[tid] || {};
    for (const uid of members) {
      if (!lock.active) break;
      const name = lock.perUser?.[uid] ?? lock.globalName ?? "";
      if (name) await applyNick(api, tid, uid, name);
    }
  } catch (_) {}
  global._nickQueue[tid] = false;
}

// ── Module ────────────────────────────────────────────────────────────────────
module.exports = {
  config: {
    name: "nick", aliases: ["كنيات", "nickname"], version: "5.1", author: "DJAMEL",
    countDown: 3, role: 2, category: "management",
    description: "قفل كنيات الأعضاء ومنع تغييرها",
    guide: {
      en: "{pn} [اسم] — قفل كنية عامة للكل\n" +
          "{pn} set [uid] [اسم] — قفل كنية لشخص محدد\n" +
          "{pn} off — إيقاف القفل\n" +
          "{pn} status — الحالة\n" +
          "{pn} حدف — حذف جميع الكنيات\n" +
          "{pn} time [min] [max] — مؤقت إعادة التطبيق (بالثواني)\n" +
          "{pn} time r [نطاق] — مؤقت عشوائي (مثال: r 60-300)\n" +
          "{pn} time off — تعطيل المؤقت"
    }
  },

  onStart: async function({ api, event, args, message }) {
    const tid = String(event.threadID);
    restoreAll(api);
    const sub = (args[0] || "").toLowerCase();

    // ── off ───────────────────────────────────────────────────────────────────
    if (sub === "off" || sub === "إيقاف") {
      stopNickTimer(tid);
      if (global._nickLocks[tid]) global._nickLocks[tid].active = false;
      const d = load(); if (d[tid]) { d[tid].active = false; save(d); }
      return message.reply("✅ تم إيقاف قفل الكنيات.");
    }

    // ── status ────────────────────────────────────────────────────────────────
    if (sub === "status" || sub === "حالة") {
      const lock = global._nickLocks[tid];
      if (!lock?.active) return message.reply("💤 قفل الكنيات غير نشط.");
      const perCount = Object.keys(lock.perUser || {}).length;
      const mn = lock.timerMin || 0;
      const mx = lock.timerMax || mn;
      const timerStr = mn
        ? (mn === mx ? `${mn}s` : `🎲 ${mn}–${mx}s`)
        : "بدون مؤقت";
      return message.reply(
        `🔒 قفل الكنيات نشط\n` +
        `📝 الاسم العام: ${lock.globalName || "—"}\n` +
        `👤 كنيات فردية: ${perCount}\n` +
        `⏱ مؤقت إعادة التطبيق: ${timerStr}`
      );
    }

    // ── time [min] [max] | time r [range] | time off ──────────────────────────
    if (sub === "time") {
      const rawTime = args.slice(1).join(" ").trim();

      if (!rawTime) return message.reply(
        "⏱ ضبط مؤقت إعادة تطبيق الكنيات:\n" +
        "/nick time [min] [max] — بالثواني\n" +
        "/nick time r — عشوائي 300-900s\n" +
        "/nick time r 60-300 — نطاق مخصص\n" +
        "/nick time off — تعطيل المؤقت"
      );

      if (rawTime.toLowerCase() === "off") {
        stopNickTimer(tid);
        if (global._nickLocks[tid]) { global._nickLocks[tid].timerMin = 0; global._nickLocks[tid].timerMax = 0; }
        const d = load(); if (d[tid]) { d[tid].timerMin = 0; d[tid].timerMax = 0; save(d); }
        return message.reply("✅ تم تعطيل مؤقت إعادة التطبيق.");
      }

      let timerMin, timerMax;
      if (rawTime.toLowerCase().startsWith("r")) {
        const range = _parseRandRange(rawTime.slice(1).trim());
        if (!range) return message.reply(
          "⚠️ صيغة خاطئة. أمثلة:\n/nick time r\n/nick time r 60-300\n/nick time r 1m-5m\n(الحد الأدنى 5s، الأكبر > الأصغر)"
        );
        timerMin = range.min; timerMax = range.max;
      } else {
        timerMin = parseInt(args[1]) || 300;
        timerMax = Math.max(parseInt(args[2]) || timerMin, timerMin);
      }

      if (!global._nickLocks[tid]) global._nickLocks[tid] = { active: false, globalName: "", perUser: {} };
      global._nickLocks[tid].timerMin = timerMin;
      global._nickLocks[tid].timerMax = timerMax;
      const d = load(); if (!d[tid]) d[tid] = {}; d[tid].timerMin = timerMin; d[tid].timerMax = timerMax; save(d);
      if (global._nickLocks[tid].active) startNickTimer(api, tid);
      const isRandom = timerMin !== timerMax;
      return message.reply(`${isRandom ? "🎲 مؤقت عشوائي" : "✅ مؤقت ثابت"}: ${timerMin}–${timerMax} ثانية`);
    }

    // ── حدف / reset ───────────────────────────────────────────────────────────
    if (sub === "حدف" || sub === "reset") {
      message.reply("🗑 جاري حذف جميع الكنيات…");
      try {
        const info = await new Promise((res, rej) => api.getThreadInfo(tid, (e, d) => e ? rej(e) : res(d)));
        const members = (info?.participantIDs || []).filter(id => String(id) !== String(global.GoatBot?.botID));
        for (const uid of members) {
          try { await api.changeNickname("", tid, uid); } catch (_) {}
          await sleep(randDelay());
        }
        if (global._nickLocks[tid]) global._nickLocks[tid].perUser = {};
        return message.reply("✅ تم حذف جميع الكنيات.");
      } catch (e) { return message.reply("❌ خطأ: " + e.message); }
    }

    // ── set [uid] [name] ──────────────────────────────────────────────────────
    if (sub === "set") {
      const uid  = args[1];
      const name = args.slice(2).join(" ").trim();
      if (!uid || !name) return message.reply("❌ الاستخدام: /nick set [uid] [اسم]");
      if (!global._nickLocks[tid]) global._nickLocks[tid] = { active: true, globalName: "", perUser: {} };
      global._nickLocks[tid].perUser = global._nickLocks[tid].perUser || {};
      global._nickLocks[tid].perUser[uid] = name;
      global._nickLocks[tid].active = true;
      const d = load(); d[tid] = global._nickLocks[tid]; save(d);
      await applyNick(api, tid, uid, name);
      return message.reply(`✅ تم قفل كنية ${uid} على "${name}"`);
    }

    // ── [name] — قفل عام ──────────────────────────────────────────────────────
    const name = args.join(" ").trim();
    if (!name) return message.reply("❌ اكتب الاسم.\nمثال: /nick DJAMEL");

    global._nickLocks[tid] = {
      active: true,
      globalName: name,
      perUser: global._nickLocks[tid]?.perUser || {},
      timerMin: global._nickLocks[tid]?.timerMin || 0,
      timerMax: global._nickLocks[tid]?.timerMax || 0,
    };
    const d = load(); d[tid] = global._nickLocks[tid]; save(d);

    const mn = global._nickLocks[tid].timerMin;
    const mx = global._nickLocks[tid].timerMax;
    const timerStr = mn
      ? (mn === mx ? `⏱ مؤقت: ${mn}s` : `⏱ مؤقت عشوائي: 🎲 ${mn}–${mx}s`)
      : "";

    message.reply(`🔒 تم تفعيل قفل الكنيات\n📝 الاسم: "${name}"\n⏱ تأخير 3.5–5s بين كل كنية\n👁 يراقب أي تغيير ويعيده${timerStr ? "\n" + timerStr : ""}`);
    if (mn) startNickTimer(api, tid);
    applyAll(api, tid).catch(() => {});
  },

  // ── onEvent: مراقبة تغييرات الكنيات ──────────────────────────────────────────
  onEvent: async function({ api, event }) {
    if (event.logMessageType !== "log:user-nickname") return;
    const tid    = String(event.threadID);
    const lock   = global._nickLocks[tid];
    if (!lock?.active) return;

    const changerID = String(event.author || event.senderID || "");
    if (isBotAdmin(changerID)) return;

    const targetID = String(event.logMessageData?.participant_id || event.logMessageData?.userId || "");
    if (!targetID) return;

    const locked = lock.perUser?.[targetID] ?? lock.globalName;
    if (!locked) return;

    setTimeout(() => applyNick(api, tid, targetID, locked), 500);
  }
};
