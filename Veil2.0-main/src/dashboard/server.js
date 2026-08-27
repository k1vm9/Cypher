/**
 * DAVID V1 — Dashboard Server (Express + Socket.io)
 * Copyright © 2025 DJAMEL
 * Features: Password auth, Live logs, Hot-reload config, Command editor
 */
"use strict";

const express    = require("express");
const http       = require("http");
const socketio   = require("socket.io");
const path       = require("path");
const fs         = require("fs-extra");
const bodyParser = require("body-parser");
const chalk      = require("chalk");
const crypto     = require("crypto");
const os         = require("os");

const ROOT         = path.join(__dirname, "../../");
const ACCOUNT_PATH = path.join(ROOT, "account.txt");
const CONFIG_PATH  = path.join(ROOT, "config.json");
const CMDS_DIR     = path.join(ROOT, "src/commands");

let _io      = null;
let _server  = null;
let _logBuf  = [];          // circular log buffer (last 500 lines)
const MAX_LOG_BUF = 500;

const stats = {
  totalMessages: 0,
  totalCommands: 0,
  activeThreads: new Set(),
  activeUsers:   new Set(),
  msgLog:        [],
};

const _threadMsgs    = new Map();
const _threadLastMsg = new Map();

function _addBotMsg(threadID, body, attachments) {
  const tid = String(threadID || "");
  if (!tid) return;
  if (!_threadMsgs.has(tid)) _threadMsgs.set(tid, []);
  const msgs = _threadMsgs.get(tid);
  const botID = String(global.GoatBot?.botID || "bot");
  const msgObj = {
    messageID: null,
    body: body || "",
    senderID: botID,
    senderName: global.GoatBot?.config?.botName || "DAVID",
    ts: Date.now(),
    attachments: attachments || [],
    isFromBot: true,
  };
  msgs.push(msgObj);
  if (msgs.length > 300) msgs.shift();
  _threadLastMsg.set(tid, { body: body || "", ts: Date.now(), senderID: botID, isFromBot: true });
  if (_io) _io.emit("messenger-msg", { ...msgObj, tid });
}
global._addBotMsg = _addBotMsg;

// ── Token store (simple, in-memory) ──────────────────────────────────────────
const _tokens = new Map();   // token → expiry
function genToken() {
  const tok = crypto.randomBytes(24).toString("hex");
  _tokens.set(tok, Date.now() + 8 * 3600 * 1000);  // 8 hours
  return tok;
}
function validToken(tok) {
  const exp = _tokens.get(tok);
  if (!exp) return false;
  if (Date.now() > exp) { _tokens.delete(tok); return false; }
  return true;
}
function getDashPwd() {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    return cfg.dashboard?.password || "david2025";
  } catch (_) { return "david2025"; }
}

// ── Live log interceptor ──────────────────────────────────────────────────────
function interceptLogs() {
  const origWrite = process.stdout.write.bind(process.stdout);
  const errWrite  = process.stderr.write.bind(process.stderr);
  const push = (data) => {
    const line = String(data).replace(/\x1b\[[0-9;]*m/g, "").trimEnd();
    if (!line) return;
    if (_logBuf.length >= MAX_LOG_BUF) _logBuf.shift();
    _logBuf.push({ ts: Date.now(), line });
    if (_io) _io.emit("log-line", { ts: Date.now(), line });
  };
  process.stdout.write = function(chunk, ...args) { push(chunk); return origWrite(chunk, ...args); };
  process.stderr.write = function(chunk, ...args) { push(chunk); return errWrite(chunk, ...args); };
}

function getIO()  { return _io; }

function _bufferMsg(event) {
  stats.totalMessages++;
  const tid = event.threadID ? String(event.threadID) : null;
  if (tid) stats.activeThreads.add(tid);
  if (event.senderID) stats.activeUsers.add(String(event.senderID));
  if (stats.msgLog.length >= 60) stats.msgLog.shift();
  stats.msgLog.push({ body: (event.body || "").slice(0, 100), ts: Date.now(), tid: event.threadID, sid: event.senderID });

  if (tid && (event.body || (event.attachments && event.attachments.length))) {
    if (!_threadMsgs.has(tid)) _threadMsgs.set(tid, []);
    const msgs = _threadMsgs.get(tid);
    const msgObj = {
      messageID: event.messageID || null,
      body: event.body || "",
      senderID: String(event.senderID || ""),
      senderName: event.senderName || "",
      ts: Date.now(),
      attachments: (event.attachments || []).map(a => ({ type: a.type, url: a.url, filename: a.filename })),
      isFromBot: false,
    };
    msgs.push(msgObj);
    if (msgs.length > 300) msgs.shift();
    _threadLastMsg.set(tid, { body: event.body || "", ts: Date.now(), senderID: event.senderID, isFromBot: false });
    if (_io) _io.emit("messenger-msg", { ...msgObj, tid });
  }

  if (_io) _io.emit("stats-update", getStats());
}
function _trackMsg(tid, uid, body) {
  const px = global.GoatBot?.config?.prefix || "/";
  if (body?.trimStart().startsWith(px)) stats.totalCommands++;
}
global._bufferMsg = _bufferMsg;
global._trackMsg  = _trackMsg;

function getStats() {
  const upMs = Date.now() - (global.GoatBot?.startTime || Date.now());
  const mem  = process.memoryUsage();
  return {
    uptime:        upMs,
    totalMessages: stats.totalMessages,
    totalCommands: stats.totalCommands,
    activeThreads: stats.activeThreads.size,
    activeUsers:   stats.activeUsers.size,
    commands:      global.GoatBot?.commands ? (() => { let n = 0; for (const [k, v] of global.GoatBot.commands) if (v?.config?.name?.toLowerCase() === k) n++; return n; })() : 0,
    botID:         global.GoatBot?.botID  || null,
    botName:       global.GoatBot?.config?.botName || "Veil",
    memMB:         +(mem.heapUsed / 1048576).toFixed(1),
    prefix:        global.GoatBot?.config?.prefix || "/",
    protection:    20,
    online:        !!global.GoatBot?.fcaApi && !!global.GoatBot?.botID,
  };
}

// ── Auth middleware ─────────────────────────────────────────────────────────────
function auth(req, res, next) {
  const tok = req.headers["x-david-token"] || req.query.token;
  if (tok && validToken(tok)) return next();
  res.status(401).json({ ok: false, error: "Unauthorized" });
}

// ── Dashboard server ──────────────────────────────────────────────────────────
function startDashboard(port = 5000) {
  const app   = express();
  _server     = http.createServer(app);
  _io         = socketio(_server, { cors: { origin: "*" } });

  app.use(bodyParser.json({ limit: "5mb" }));
  app.use(bodyParser.urlencoded({ extended: true, limit: "5mb" }));
  app.use(express.static(path.join(__dirname, "public")));

  // ── Health check (Railway / Render / Heroku) ─────────────────────────────────
  app.get("/health", (_, res) => res.json({ ok: true, status: "running", ts: Date.now() }));
  app.get("/ping",   (_, res) => res.send("pong"));

  // ── CORS & headers ──────────────────────────────────────────────────────────
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });

  // ── Auth ────────────────────────────────────────────────────────────────────
  app.post("/api/login", (req, res) => {
    const { password } = req.body;
    if (password === getDashPwd()) {
      const tok = genToken();
      res.json({ ok: true, token: tok });
    } else {
      res.json({ ok: false, error: "كلمة السر خاطئة" });
    }
  });
  app.post("/api/logout", auth, (req, res) => {
    const tok = req.headers["x-david-token"] || req.query.token;
    _tokens.delete(tok);
    res.json({ ok: true });
  });
  app.get("/api/auth-check", auth, (_, res) => res.json({ ok: true }));

  // ── Stats ───────────────────────────────────────────────────────────────────
  app.get("/api/stats",  auth, (_, res) => res.json(getStats()));
  app.get("/api/status", auth, (_, res) => {
    const online = !!global.GoatBot?.fcaApi && !!global.GoatBot?.botID;
    res.json({ ok: true, online, botID: global.GoatBot?.botID || null, botName: global.GoatBot?.config?.botName || "Veil" });
  });

  // ── Config ──────────────────────────────────────────────────────────────────
  app.get("/api/config", auth, (_, res) => {
    try {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
      if (cfg.facebookAccount) cfg.facebookAccount.password = "";
      res.json({ ok: true, config: cfg });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });
  app.post("/api/config", auth, (req, res) => {
    try {
      const old = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
      const updated = Object.assign({}, old, req.body);
      global._selfWriteConfig = true;
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2));
      setTimeout(() => { global._selfWriteConfig = false; }, 3000);
      // Hot-apply immediately
      if (global.GoatBot) global.GoatBot.config = updated;
      global.config = updated;
      global.commandPrefix = updated.prefix || "/";
      if (_io) _io.emit("config-reloaded", { ts: Date.now() });
      res.json({ ok: true });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  // ── Cookies ─────────────────────────────────────────────────────────────────
  app.post("/api/cookies", auth, (req, res) => {
    const raw = req.body?.cookies;
    if (!raw) return res.json({ ok: false, error: "لا توجد بيانات" });
    try {
      const DjamelFCA = require("../../Djamel-fca");
      const parsed    = DjamelFCA.parseCookieInput(raw);
      const cookies   = parsed.cookies;
      if (!cookies.length) return res.json({ ok: false, error: "صيغة الكوكيز غير معروفة" });
      if (!DjamelFCA.hasMandatory(cookies)) return res.json({ ok: false, error: "كوكيز ناقصة (c_user أو xs مفقود)" });
      global._selfWrite = true;
      fs.writeFileSync(ACCOUNT_PATH, JSON.stringify(cookies, null, 2));
      setTimeout(() => { global._selfWrite = false; }, 6000);
      res.json({ ok: true, count: cookies.length });
      setTimeout(() => { try { global.startBot?.(); } catch (_) {} }, 1500);
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  // ── Admins Management ────────────────────────────────────────────────────────
  // (granular add/remove endpoints are registered later in this file)

  // ── Bot Control ──────────────────────────────────────────────────────────────
  app.post("/api/control", auth, (req, res) => {
    const { action } = req.body;
    if (action === "restart") {
      res.json({ ok: true });
      setTimeout(() => { try { global.startBot?.(); } catch (_) {} }, 400);
    } else if (action === "stop") {
      res.json({ ok: true });
      setTimeout(() => process.exit(0), 400);
    } else {
      res.json({ ok: false, error: "action غير معروف" });
    }
  });

  // ── Bot lock / silent mode toggles ───────────────────────────────────────────
  app.post("/api/bot-lock", auth, (req, res) => {
    const { state } = req.body;
    global._botLocked = typeof state === "boolean" ? state : !global._botLocked;
    res.json({ ok: true, locked: !!global._botLocked });
  });

  app.get("/api/bot-lock", auth, (_, res) => {
    res.json({ ok: true, locked: !!global._botLocked, silent: !!global._silentMode });
  });

  app.post("/api/silent-mode", auth, (req, res) => {
    const { state } = req.body;
    global._silentMode = typeof state === "boolean" ? state : !global._silentMode;
    res.json({ ok: true, silent: !!global._silentMode });
  });

  // ── Admins — granular CRUD ────────────────────────────────────────────────────
  const { atomicWriteJsonSync: _awjs } = require("../utils/atomicWrite");

  // Normalize ownerID field: always returns an array of UID strings
  function _ownerArr(cfg) {
    const o = cfg.ownerID;
    if (Array.isArray(o)) return o.map(String).filter(Boolean);
    return o ? [String(o)] : [];
  }
  function _syncField(field, val) {
    if (global.config)          global.config[field]          = val;
    if (global.GoatBot?.config) global.GoatBot.config[field]  = val;
  }
  function _saveCfg(cfg) {
    _awjs(CONFIG_PATH, cfg, { spaces: 2 });
    if (global.config)          global.config          = cfg;
    if (global.GoatBot?.config) global.GoatBot.config  = cfg;
  }

  // READ — single endpoint, ownerID always returned as array
  app.get("/api/admins", auth, (_, res) => {
    const cfg = global.GoatBot?.config || global.config || {};
    res.json({
      ok:            true,
      adminBot:      (cfg.adminBot      || []).map(String),
      superAdminBot: (cfg.superAdminBot || []).map(String),
      ownerID:       _ownerArr(cfg),
    });
  });

  // BULK SAVE — replaces entire adminBot, superAdminBot, and ownerID at once
  app.post("/api/admins/bulk", auth, (req, res) => {
    try {
      const { ownerID, adminBot, superAdminBot } = req.body;
      const cfg = fs.readJsonSync(CONFIG_PATH);
      if (ownerID !== undefined) {
        cfg.ownerID = ownerID ? [String(ownerID)] : [];
      }
      if (Array.isArray(adminBot)) {
        cfg.adminBot = [...new Set(adminBot.map(String).filter(Boolean))];
      }
      if (Array.isArray(superAdminBot)) {
        cfg.superAdminBot = [...new Set(superAdminBot.map(String).filter(Boolean))];
      }
      _saveCfg(cfg);
      res.json({ ok: true, adminBot: cfg.adminBot, superAdminBot: cfg.superAdminBot, ownerID: _ownerArr(cfg) });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  // ── adminBot add / remove ────────────────────────────────────────────────────
  app.post("/api/admins/add", auth, (req, res) => {
    const uid = String(req.body?.uid || "").trim();
    if (!uid || !/^\d{5,}$/.test(uid))
      return res.json({ ok: false, error: "UID غير صالح — أرقام فقط (5+ خانات)" });
    try {
      const cfg  = fs.readJsonSync(CONFIG_PATH);
      const list = [...new Set([...(cfg.adminBot || []).map(String), uid])];
      cfg.adminBot = list;
      _saveCfg(cfg);
      res.json({ ok: true, adminBot: list });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  app.post("/api/admins/remove", auth, (req, res) => {
    const uid = String(req.body?.uid || "").trim();
    if (!uid) return res.json({ ok: false, error: "UID مفقود" });
    try {
      const cfg  = fs.readJsonSync(CONFIG_PATH);
      const list = (cfg.adminBot || []).map(String).filter(id => id !== uid);
      if (!list.length) return res.json({ ok: false, error: "لا يمكن حذف آخر أدمن" });
      cfg.adminBot = list;
      _saveCfg(cfg);
      res.json({ ok: true, adminBot: list });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  // ── ownerID add / remove ─────────────────────────────────────────────────────
  app.post("/api/admins/owner/add", auth, (req, res) => {
    const uid = String(req.body?.uid || "").trim();
    if (!uid || !/^\d{5,}$/.test(uid))
      return res.json({ ok: false, error: "UID غير صالح" });
    try {
      const cfg  = fs.readJsonSync(CONFIG_PATH);
      const list = [...new Set([..._ownerArr(cfg), uid])];
      cfg.ownerID = list;
      _saveCfg(cfg);
      res.json({ ok: true, ownerID: list });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  app.post("/api/admins/owner/remove", auth, (req, res) => {
    const uid = String(req.body?.uid || "").trim();
    if (!uid) return res.json({ ok: false, error: "UID مفقود" });
    try {
      const cfg  = fs.readJsonSync(CONFIG_PATH);
      const list = _ownerArr(cfg).filter(id => id !== uid);
      cfg.ownerID = list;
      _saveCfg(cfg);
      res.json({ ok: true, ownerID: list });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  // ── superAdminBot add / remove ───────────────────────────────────────────────
  app.post("/api/admins/super/add", auth, (req, res) => {
    const uid = String(req.body?.uid || "").trim();
    if (!uid || !/^\d{5,}$/.test(uid))
      return res.json({ ok: false, error: "UID غير صالح" });
    try {
      const cfg  = fs.readJsonSync(CONFIG_PATH);
      const list = [...new Set([...(cfg.superAdminBot || []).map(String), uid])];
      cfg.superAdminBot = list;
      _saveCfg(cfg);
      res.json({ ok: true, superAdminBot: list });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  app.post("/api/admins/super/remove", auth, (req, res) => {
    const uid = String(req.body?.uid || "").trim();
    if (!uid) return res.json({ ok: false, error: "UID مفقود" });
    try {
      const cfg  = fs.readJsonSync(CONFIG_PATH);
      const list = (cfg.superAdminBot || []).map(String).filter(id => id !== uid);
      cfg.superAdminBot = list;
      _saveCfg(cfg);
      res.json({ ok: true, superAdminBot: list });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  // ── Commands list ────────────────────────────────────────────────────────────
  app.get("/api/commands", auth, (_, res) => {
    const list = [];
    for (const [name, cmd] of (global.GoatBot?.commands || new Map())) {
      if (cmd?.config?.name?.toLowerCase() === name) {
        list.push({
          name:        cmd.config.name,
          aliases:     cmd.config.aliases || [],
          category:    cmd.config.category  || "other",
          role:        cmd.config.role       ?? 2,
          description: cmd.config.description || "",
          version:     cmd.config.version    || "1.0",
        });
      }
    }
    res.json({ ok: true, commands: list });
  });

  // ── Command source (editor) ──────────────────────────────────────────────────
  app.get("/api/commands/:name/source", auth, (req, res) => {
    const name = req.params.name.toLowerCase().replace(/[^a-z0-9_-]/g, "");
    const file = path.join(CMDS_DIR, `${name}.js`);
    if (!fs.existsSync(file)) return res.json({ ok: false, error: "الأمر غير موجود" });
    try {
      const code = fs.readFileSync(file, "utf8");
      res.json({ ok: true, name, code });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  app.post("/api/commands/:name/source", auth, (req, res) => {
    const name = req.params.name.toLowerCase().replace(/[^a-z0-9_-]/g, "");
    const { code } = req.body;
    if (!code) return res.json({ ok: false, error: "الكود فارغ" });
    const file = path.join(CMDS_DIR, `${name}.js`);
    try {
      // Syntax check
      new Function(code);
    } catch (syntaxErr) {
      return res.json({ ok: false, error: "خطأ في الكود: " + syntaxErr.message });
    }
    try {
      fs.writeFileSync(file, code, "utf8");
      // Hot-reload
      const absPath = require.resolve(file);
      delete require.cache[absPath];
      const cmd = require(file);
      if (cmd?.config?.name) {
        const n = cmd.config.name.toLowerCase();
        global.GoatBot.commands.set(n, cmd);
        if (cmd.config.aliases) {
          for (const a of cmd.config.aliases) {
            if (a) global.GoatBot.commands.set(String(a).toLowerCase(), cmd);
          }
        }
        if (_io) _io.emit("command-updated", { name: n });
        res.json({ ok: true, message: `✅ تم تحديث /${n} بدون إعادة تشغيل` });
      } else {
        res.json({ ok: false, error: "config.name مفقود في الأمر" });
      }
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  // ── Thread command control ──────────────────────────────────────────────────
  app.get("/api/thread-commands", auth, (_, res) => {
    try {
      const ctrl = require("../utils/cmdControl");
      ctrl.reload();
      res.json({ ok: true, data: ctrl.getAll() });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  app.get("/api/thread-commands/:tid", auth, (req, res) => {
    try {
      const ctrl = require("../utils/cmdControl");
      res.json({ ok: true, config: ctrl.getThreadConfig(req.params.tid) });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  app.post("/api/thread-commands/:tid", auth, (req, res) => {
    try {
      const ctrl = require("../utils/cmdControl");
      const { mode, commands: cmds } = req.body;
      if (!["blacklist","whitelist"].includes(mode)) return res.json({ ok: false, error: "mode يجب أن يكون blacklist أو whitelist" });
      ctrl.setThreadConfig(req.params.tid, { mode, commands: Array.isArray(cmds) ? cmds : [] });
      res.json({ ok: true });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  app.delete("/api/thread-commands/:tid", auth, (req, res) => {
    try {
      const ctrl = require("../utils/cmdControl");
      ctrl.resetThread(req.params.tid);
      res.json({ ok: true });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  // ── Threads list (known threads from bot) ───────────────────────────────────
  app.get("/api/threads", auth, (_, res) => {
    try {
      const threads = [];
      const allData = global.GoatBot?.allThreadData || {};
      for (const [tid, data] of Object.entries(allData)) {
        threads.push({ tid, name: data?.threadName || data?.name || `غروب ${tid}`, type: data?.isGroup ? "group" : "dm" });
      }
      const ctrl = require("../utils/cmdControl");
      const ctrlTids = ctrl.getAllThreads();
      for (const tid of ctrlTids) {
        if (!threads.find(t => t.tid === tid)) threads.push({ tid, name: `غروب ${tid}`, type: "group" });
      }
      res.json({ ok: true, threads });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  // ── Command quick-update (rename / aliases / description) ───────────────────
  app.post("/api/commands/:name/update-meta", auth, (req, res) => {
    const nameParam = req.params.name.toLowerCase().replace(/[^a-z0-9_-]/g, "");
    const { newName, aliases, description, role, guide } = req.body;
    const file = path.join(CMDS_DIR, `${nameParam}.js`);
    if (!fs.existsSync(file)) return res.json({ ok: false, error: "الأمر غير موجود" });
    try {
      let code = fs.readFileSync(file, "utf8");
      if (newName && newName !== nameParam) {
        code = code.replace(/name:\s*["']([^"']+)["']/, `name: "${newName}"`);
      }
      if (Array.isArray(aliases)) {
        code = code.replace(/aliases:\s*\[([^\]]*)\]/, `aliases: ${JSON.stringify(aliases)}`);
      }
      if (description) {
        code = code.replace(/description:\s*["']([^"']*)["']/, `description: "${description.replace(/"/g,'\\"')}"`);
      }
      if (role !== undefined) {
        code = code.replace(/role:\s*\d/, `role: ${parseInt(role) || 2}`);
      }
      if (guide) {
        code = code.replace(/guide:\s*\{[^}]*\}/, `guide: { en: "${guide.replace(/"/g,'\\"').replace(/\n/g,'\\n')}" }`);
      }
      fs.writeFileSync(file, code, "utf8");
      const absPath = require.resolve(file);
      delete require.cache[absPath];
      const cmd = require(file);
      const finalName = (cmd?.config?.name || nameParam).toLowerCase();
      if (global.GoatBot?.commands) {
        if (newName && newName !== nameParam) global.GoatBot.commands.delete(nameParam);
        global.GoatBot.commands.set(finalName, cmd);
        if (cmd.config.aliases) for (const a of cmd.config.aliases||[]) if (a) global.GoatBot.commands.set(String(a).toLowerCase(), cmd);
      }
      if (_io) _io.emit("command-updated", { name: finalName });
      res.json({ ok: true, name: finalName, message: `✅ تم تحديث /${finalName}` });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  // ── Messages log ─────────────────────────────────────────────────────────────
  app.get("/api/messages", auth, (_, res) => {
    res.json({ ok: true, messages: [...stats.msgLog].reverse().slice(0, 30) });
  });

  // ── Live logs ────────────────────────────────────────────────────────────────
  app.get("/api/logs", auth, (_, res) => {
    res.json({ ok: true, logs: _logBuf.slice(-200) });
  });

  // ── WebSocket ─────────────────────────────────────────────────────────────────
  _io.on("connection", socket => {
    const tok = socket.handshake.query?.token;
    if (!validToken(tok)) { socket.disconnect(); return; }

    socket.emit("stats-update", getStats());
    socket.emit("bot-status", {
      status:  global.GoatBot?.fcaApi ? "online" : "offline",
      uid:     global.GoatBot?.botID  || null,
      botName: global.GoatBot?.config?.botName || "Veil",
    });
    // Send last 100 log lines
    socket.emit("log-history", _logBuf.slice(-100));

    socket.on("ping-bot", () => socket.emit("pong-bot", { ts: Date.now() }));
  });

  // ── Messenger: thread list ──────────────────────────────────────────────────
  app.get("/api/messenger/threads", auth, (_, res) => {
    try {
      const allData = global.GoatBot?.allThreadData || {};
      const threads = [];
      for (const [tid, data] of Object.entries(allData)) {
        const last = _threadLastMsg.get(String(tid));
        threads.push({
          tid: String(tid),
          name: data?.threadName || data?.name || `غروب ${tid}`,
          type: data?.isGroup ? "group" : "dm",
          memberCount: data?.participantIDs?.length || 0,
          lastBody: last?.body || "",
          lastTs: last?.ts || 0,
          lastIsFromBot: last?.isFromBot || false,
        });
      }
      // Also include threads we have messages for but not in allThreadData
      for (const [tid, msgs] of _threadMsgs.entries()) {
        if (!allData[tid] && msgs.length) {
          const last = _threadLastMsg.get(tid);
          threads.push({ tid, name: `غروب ${tid}`, type: "group", memberCount: 0, lastBody: last?.body || "", lastTs: last?.ts || 0 });
        }
      }
      threads.sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0));
      res.json({ ok: true, threads });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  // ── Messenger: messages for a thread ────────────────────────────────────────
  app.get("/api/messenger/thread/:tid/messages", auth, (req, res) => {
    const tid = req.params.tid;
    const msgs = _threadMsgs.get(tid) || [];
    res.json({ ok: true, messages: msgs.slice(-100) });
  });

  // ── Messenger: thread info ──────────────────────────────────────────────────
  function _getThreadInfoHandler(req, res) {
    const api = global.GoatBot?.fcaApi;
    if (!api) return res.json({ ok: false, error: "البوت غير متصل" });
    const tid = req.params.tid;
    const fn  = api.getThreadInfo || api.getThreadInfoByID;
    if (!fn) return res.json({ ok: false, error: "getThreadInfo غير مدعوم" });
    fn.call(api, tid, (err, info) => {
      if (err) return res.json({ ok: false, error: err.message });
      res.json({ ok: true, info });
    });
  }
  app.get("/api/messenger/thread/:tid/info", auth, _getThreadInfoHandler);
  app.get("/api/messenger/thread-info/:tid",   auth, _getThreadInfoHandler);

  // ── Messenger: send file with optional caption ───────────────────────────────
  app.post("/api/messenger/send-with-caption", auth, async (req, res) => {
    const api = global.GoatBot?.fcaApi;
    if (!api) return res.json({ ok: false, error: "البوت غير متصل" });
    const { threadID, data, mimetype, filename, caption } = req.body;
    if (!threadID || !data) return res.json({ ok: false, error: "threadID و data مطلوبان" });
    const tmpPath = path.join(os.tmpdir(), `david-${Date.now()}-${filename || "file"}`);
    try {
      fs.writeFileSync(tmpPath, Buffer.from(data, "base64"));
      const stream = fs.createReadStream(tmpPath);
      stream.path = filename || tmpPath;
      const msg = caption ? { body: String(caption), attachment: stream } : { attachment: stream };
      api.sendMessage(msg, String(threadID), (err, info) => {
        try { fs.unlinkSync(tmpPath); } catch (_) {}
        if (err) return res.json({ ok: false, error: err.message });
        _addBotMsg(threadID, caption || `[ملف: ${filename || "file"}]`);
        res.json({ ok: true, messageID: info?.messageID });
      });
    } catch (e) {
      try { fs.unlinkSync(tmpPath); } catch (_) {}
      res.json({ ok: false, error: e.message });
    }
  });

  // ── Messenger: send text message ─────────────────────────────────────────────
  app.post("/api/messenger/send", auth, (req, res) => {
    const api = global.GoatBot?.fcaApi;
    if (!api) return res.json({ ok: false, error: "البوت غير متصل" });
    const { threadID, body, silent } = req.body;
    if (!threadID || !body) return res.json({ ok: false, error: "threadID و body مطلوبان" });
    const msg = { body: String(body) };
    if (silent) msg.noNotif = true;
    api.sendMessage(msg, String(threadID), (err, info) => {
      if (err) return res.json({ ok: false, error: err.message });
      _addBotMsg(threadID, body);
      res.json({ ok: true, messageID: info?.messageID });
    });
  });

  // ── Messenger: send file (base64) ────────────────────────────────────────────
  app.post("/api/messenger/send-file", auth, async (req, res) => {
    const api = global.GoatBot?.fcaApi;
    if (!api) return res.json({ ok: false, error: "البوت غير متصل" });
    const { threadID, data, mimetype, filename } = req.body;
    if (!threadID || !data) return res.json({ ok: false, error: "threadID و data مطلوبان" });
    const tmpPath = path.join(os.tmpdir(), `david-${Date.now()}-${filename || "file"}`);
    try {
      fs.writeFileSync(tmpPath, Buffer.from(data, "base64"));
      const stream = fs.createReadStream(tmpPath);
      stream.path = filename || tmpPath;
      api.sendMessage({ attachment: stream }, String(threadID), (err, info) => {
        try { fs.unlinkSync(tmpPath); } catch (_) {}
        if (err) return res.json({ ok: false, error: err.message });
        _addBotMsg(threadID, `[ملف: ${filename || "file"}]`);
        res.json({ ok: true, messageID: info?.messageID });
      });
    } catch (e) {
      try { fs.unlinkSync(tmpPath); } catch (_) {}
      res.json({ ok: false, error: e.message });
    }
  });

  // ── Messenger: set thread title ──────────────────────────────────────────────
  app.post("/api/messenger/set-title", auth, (req, res) => {
    const api = global.GoatBot?.fcaApi;
    if (!api) return res.json({ ok: false, error: "البوت غير متصل" });
    const { threadID, title } = req.body;
    if (!threadID || !title) return res.json({ ok: false, error: "threadID و title مطلوبان" });
    api.setTitle(String(title), String(threadID), (err) => {
      if (err) return res.json({ ok: false, error: err.message });
      const allData = global.GoatBot?.allThreadData || {};
      if (allData[threadID]) allData[threadID].threadName = title;
      res.json({ ok: true });
    });
  });

  // ── Messenger: set nickname ──────────────────────────────────────────────────
  app.post("/api/messenger/set-nick", auth, (req, res) => {
    const api = global.GoatBot?.fcaApi;
    if (!api) return res.json({ ok: false, error: "البوت غير متصل" });
    const { threadID, userID, nickname } = req.body;
    if (!threadID || !userID) return res.json({ ok: false, error: "threadID و userID مطلوبان" });
    api.changeNickname(String(nickname || ""), String(threadID), String(userID), (err) => {
      if (err) return res.json({ ok: false, error: err.message });
      res.json({ ok: true });
    });
  });

  // ── Messenger: change bot nickname in ALL known threads ──────────────────────
  app.post("/api/messenger/set-bot-nick-all", auth, async (req, res) => {
    const api = global.GoatBot?.fcaApi;
    if (!api) return res.json({ ok: false, error: "البوت غير متصل" });
    const { nickname } = req.body;
    if (typeof nickname === "undefined") return res.json({ ok: false, error: "nickname مطلوب" });
    let botID;
    try { botID = api.getCurrentUserID(); } catch (_) { botID = null; }
    if (!botID) return res.json({ ok: false, error: "تعذر الحصول على ID البوت" });
    const threads = [..._threadMsgs.keys()];
    if (!threads.length) return res.json({ ok: false, error: "لا توجد غروبات مسجلة بعد" });
    let success = 0, failed = 0;
    for (const tid of threads) {
      try {
        await new Promise((resolve) => {
          api.changeNickname(String(nickname), String(tid), String(botID), (err) => {
            if (err) failed++; else success++;
            resolve();
          });
        });
        await new Promise(r => setTimeout(r, 200)); // small delay to avoid rate limit
      } catch (_) { failed++; }
    }
    res.json({ ok: true, total: threads.length, success, failed });
  });

  // ── Messenger: set thread image (base64) ─────────────────────────────────────
  app.post("/api/messenger/set-image", auth, async (req, res) => {
    const api = global.GoatBot?.fcaApi;
    if (!api) return res.json({ ok: false, error: "البوت غير متصل" });
    const { threadID, data, filename } = req.body;
    if (!threadID || !data) return res.json({ ok: false, error: "threadID و data مطلوبان" });
    const tmpPath = path.join(os.tmpdir(), `david-img-${Date.now()}.jpg`);
    try {
      fs.writeFileSync(tmpPath, Buffer.from(data, "base64"));
      const stream = fs.createReadStream(tmpPath);
      const fn = api.changeGroupImage || api.setGroupImage;
      if (!fn) return res.json({ ok: false, error: "changeGroupImage غير مدعوم" });
      fn.call(api, stream, String(threadID), (err) => {
        try { fs.unlinkSync(tmpPath); } catch (_) {}
        if (err) return res.json({ ok: false, error: err.message });
        res.json({ ok: true });
      });
    } catch (e) {
      try { fs.unlinkSync(tmpPath); } catch (_) {}
      res.json({ ok: false, error: e.message });
    }
  });

  // ── Messenger: kick member ──────────────────────────────────────────────────
  app.post("/api/messenger/kick", auth, (req, res) => {
    const api = global.GoatBot?.fcaApi;
    if (!api) return res.json({ ok: false, error: "البوت غير متصل" });
    const { threadID, userID } = req.body;
    if (!threadID || !userID) return res.json({ ok: false, error: "threadID و userID مطلوبان" });
    api.removeUserFromGroup(String(userID), String(threadID), (err) => {
      if (err) return res.json({ ok: false, error: err.message });
      res.json({ ok: true });
    });
  });

  // ── Messenger: add member ──────────────────────────────────────────────────
  app.post("/api/messenger/add-member", auth, (req, res) => {
    const api = global.GoatBot?.fcaApi;
    if (!api) return res.json({ ok: false, error: "البوت غير متصل" });
    const { threadID, userID } = req.body;
    if (!threadID || !userID) return res.json({ ok: false, error: "threadID و userID مطلوبان" });
    api.addUserToGroup(String(userID), String(threadID), (err) => {
      if (err) return res.json({ ok: false, error: err.message });
      res.json({ ok: true });
    });
  });

  // ── File Browser ─────────────────────────────────────────────────────────────
  const ALLOWED_EXTS = new Set([".js",".json",".txt",".md",".html",".css",".env",".toml",".yml",".yaml"]);
  const SKIP_DIRS    = new Set(["node_modules",".git","android","mobile",".cache","dist","build"]);

  function buildTree(dir, maxDepth = 4, depth = 0) {
    if (depth > maxDepth) return [];
    const items = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.name.startsWith(".") && depth === 0 && e.name !== ".github") continue;
        if (e.name.startsWith(".") && e.name !== ".github") continue;
        if (e.isDirectory()) {
          if (SKIP_DIRS.has(e.name)) continue;
          const children = buildTree(path.join(dir, e.name), maxDepth, depth + 1);
          items.push({ name: e.name, type: "dir", path: path.relative(ROOT, path.join(dir, e.name)), children });
        } else {
          const ext = path.extname(e.name).toLowerCase();
          if (!ALLOWED_EXTS.has(ext)) continue;
          items.push({ name: e.name, type: "file", path: path.relative(ROOT, path.join(dir, e.name)), ext });
        }
      }
    } catch (_) {}
    return items.sort((a,b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  app.get("/api/files/tree", auth, (_, res) => {
    try {
      const tree = buildTree(ROOT);
      res.json({ ok: true, tree });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  app.get("/api/files/read", auth, (req, res) => {
    try {
      const rel = req.query.path || "";
      if (!rel || rel.includes("..")) return res.json({ ok: false, error: "مسار غير صالح" });
      const full = path.join(ROOT, rel);
      if (!full.startsWith(ROOT)) return res.json({ ok: false, error: "مسار خارج النطاق" });
      const ext = path.extname(full).toLowerCase();
      if (!ALLOWED_EXTS.has(ext)) return res.json({ ok: false, error: "نوع ملف غير مسموح" });
      if (!fs.existsSync(full)) return res.json({ ok: false, error: "الملف غير موجود" });
      const stat = fs.statSync(full);
      if (stat.size > 512 * 1024) return res.json({ ok: false, error: "الملف كبير جداً (>512KB)" });
      const content = fs.readFileSync(full, "utf8");
      res.json({ ok: true, content, path: rel, size: stat.size });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  app.post("/api/files/write", auth, (req, res) => {
    try {
      const { path: rel, content } = req.body;
      if (!rel || rel.includes("..")) return res.json({ ok: false, error: "مسار غير صالح" });
      const full = path.join(ROOT, rel);
      if (!full.startsWith(ROOT)) return res.json({ ok: false, error: "مسار خارج النطاق" });
      const ext = path.extname(full).toLowerCase();
      if (!ALLOWED_EXTS.has(ext)) return res.json({ ok: false, error: "نوع ملف غير مسموح" });
      fs.ensureDirSync(path.dirname(full));
      fs.writeFileSync(full, content || "", "utf8");
      // Hot-reload if command file
      if (full.startsWith(CMDS_DIR) && ext === ".js") {
        try {
          const absPath = require.resolve(full);
          delete require.cache[absPath];
          const cmd = require(full);
          if (cmd?.config?.name) {
            const n = cmd.config.name.toLowerCase();
            if (global.GoatBot?.commands) {
              global.GoatBot.commands.set(n, cmd);
              if (cmd.config.aliases) for (const a of cmd.config.aliases||[]) if (a) global.GoatBot.commands.set(String(a).toLowerCase(), cmd);
            }
            if (_io) _io.emit("command-updated", { name: n });
          }
        } catch (_) {}
      }
      res.json({ ok: true });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  app.post("/api/files/new", auth, (req, res) => {
    try {
      const { path: rel, isDir } = req.body;
      if (!rel || rel.includes("..")) return res.json({ ok: false, error: "مسار غير صالح" });
      const full = path.join(ROOT, rel);
      if (!full.startsWith(ROOT)) return res.json({ ok: false, error: "مسار خارج النطاق" });
      if (isDir) { fs.ensureDirSync(full); }
      else { fs.ensureDirSync(path.dirname(full)); fs.writeFileSync(full, "", "utf8"); }
      res.json({ ok: true });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  app.delete("/api/files/delete", auth, (req, res) => {
    try {
      const rel = req.query.path || "";
      if (!rel || rel.includes("..")) return res.json({ ok: false, error: "مسار غير صالح" });
      const full = path.join(ROOT, rel);
      if (!full.startsWith(ROOT)) return res.json({ ok: false, error: "مسار خارج النطاق" });
      if (!fs.existsSync(full)) return res.json({ ok: false, error: "الملف غير موجود" });
      fs.removeSync(full);
      res.json({ ok: true });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  // ── Claude AI — توليد الأوامر ──────────────────────────────────────────────────
  app.post("/api/ai/generate", auth, async (req, res) => {
    try {
      const { description, contextFiles } = req.body;
      if (!description) return res.json({ ok: false, error: "الوصف مطلوب" });

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return res.json({ ok: false, error: "ANTHROPIC_API_KEY غير مُعيَّن — أضفه من الإعدادات" });

      const Anthropic = require("@anthropic-ai/sdk");
      const client = new Anthropic.default({ apiKey });

      // قراءة ملفات السياق
      let contextContent = "";
      if (Array.isArray(contextFiles) && contextFiles.length) {
        for (const rel of contextFiles.slice(0, 5)) {
          try {
            const full = path.join(ROOT, rel);
            if (full.startsWith(ROOT) && fs.existsSync(full)) {
              const content = fs.readFileSync(full, "utf8");
              contextContent += `\n\n// === الملف: ${rel} ===\n${content.slice(0, 3000)}`;
            }
          } catch (_) {}
        }
      }

      // قراءة مثال أمر للسياق
      const exampleCmd = path.join(CMDS_DIR, "uptime.js");
      let exampleContent = "";
      try { exampleContent = fs.readFileSync(exampleCmd, "utf8"); } catch (_) {}

      const systemPrompt = `أنت مطور بوت فيسبوك ماسنجر خبير بـ Veil Engine. مهمتك كتابة أوامر Node.js للبوت.

بنية الأمر الأساسية:
\`\`\`js
"use strict";
module.exports = {
  config: {
    name: "اسم_الأمر",
    aliases: [],
    version: "1.0",
    author: "DJAMEL",
    countDown: 5,
    role: 0,  // 0=الجميع 2=أدمن 3=مالك
    category: "fun",  // fun/management/media/info/utility
    description: "وصف مختصر",
    guide: { en: "{pn} [نص]" }
  },
  onStart: async function({ api, event, args, message, prefix }) {
    // الكود هنا
    // message.reply("رسالة") لإرسال ردّ
    // api.sendMessage("نص", event.threadID) لإرسال رسالة
    // message.react("✅", event.messageID) لإضافة ردّ فعل
  }
};
\`\`\`

متغيرات مفيدة في البوت:
- global.GoatBot.config: إعدادات البوت
- event.senderID: معرّف المرسل
- event.threadID: معرّف الغروب
- event.body: نص الرسالة
- args: مصفوفة الحجج

مثال أمر حقيقي:
${exampleContent}

${contextContent ? `سياق إضافي:${contextContent}` : ""}`;

      const msg = await client.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 2000,
        messages: [
          { role: "user", content: `اكتب أمر Veil بالمواصفات التالية:\n\n${description}\n\nاكتب فقط كود JavaScript بدون أي شرح. ابدأ بـ "use strict";` }
        ],
        system: systemPrompt,
      });

      let code = msg.content[0]?.text || "";
      // استخراج الكود من markdown إذا كان مُغلَّفاً
      const match = code.match(/```(?:javascript|js)?\n?([\s\S]+?)```/);
      if (match) code = match[1].trim();

      res.json({ ok: true, code });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  app.post("/api/ai/chat", auth, async (req, res) => {
    try {
      const { message: userMsg, history } = req.body;
      if (!userMsg) return res.json({ ok: false, error: "الرسالة مطلوبة" });

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return res.json({ ok: false, error: "ANTHROPIC_API_KEY غير مُعيَّن" });

      const Anthropic = require("@anthropic-ai/sdk");
      const client = new Anthropic.default({ apiKey });

      const msgs = [];
      if (Array.isArray(history)) {
        for (const h of history.slice(-10)) {
          if (h.role && h.content) msgs.push({ role: h.role, content: h.content });
        }
      }
      msgs.push({ role: "user", content: userMsg });

      const resp = await client.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 1000,
        messages: msgs,
        system: "أنت مساعد ذكي خبير في بوتات فيسبوك ماسنجر ونظام Veil. أجب باختصار ووضوح باللغة العربية.",
      });

      res.json({ ok: true, reply: resp.content[0]?.text || "" });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  app.post("/api/ai/save-command", auth, (req, res) => {
    try {
      const { name, code } = req.body;
      if (!name || !code) return res.json({ ok: false, error: "name و code مطلوبان" });
      const safeName = name.toLowerCase().replace(/[^a-z0-9_-]/g,"");
      if (!safeName) return res.json({ ok: false, error: "اسم غير صالح" });
      const file = path.join(CMDS_DIR, `${safeName}.js`);
      fs.writeFileSync(file, code, "utf8");
      try {
        delete require.cache[require.resolve(file)];
        const cmd = require(file);
        if (cmd?.config?.name && global.GoatBot?.commands) {
          const n = cmd.config.name.toLowerCase();
          global.GoatBot.commands.set(n, cmd);
          if (cmd.config.aliases) for (const a of cmd.config.aliases||[]) if (a) global.GoatBot.commands.set(String(a).toLowerCase(), cmd);
          if (_io) _io.emit("command-updated", { name: n });
        }
      } catch (_) {}
      res.json({ ok: true, message: `✅ تم حفظ الأمر /${safeName}` });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // ── Control Panel: Message Requests ──────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════════

  app.get("/api/ctrlpanel/message-requests", auth, async (req, res) => {
    const api = global.GoatBot?.fcaApi;
    if (!api) return res.json({ ok: false, error: "البوت غير متصل", requests: [] });

    function fetchFolder(tag) {
      return new Promise((resolve) => {
        const fn = api.getThreadList;
        if (typeof fn !== "function") return resolve([]);
        const timer = setTimeout(() => resolve([]), 15000);
        try {
          fn.call(api, 30, null, [tag], (e, d) => {
            clearTimeout(timer);
            resolve(Array.isArray(d) ? d : []);
          });
        } catch (_) { clearTimeout(timer); resolve([]); }
      });
    }

    try {
      const [pendingList, otherList] = await Promise.all([
        fetchFolder("PENDING"),
        fetchFolder("OTHER"),
      ]);

      const seen = new Set();
      const combined = [];
      for (const [list, folder] of [[pendingList, "PENDING"], [otherList, "OTHER"]]) {
        for (const t of list) {
          const key = String(t.threadID);
          if (seen.has(key)) continue;
          seen.add(key);
          combined.push({
            tid:      key,
            name:     t.name || t.threadName || `#${key}`,
            snippet:  t.snippet || t.lastMessageSnippet || "",
            ts:       t.timestamp || 0,
            isGroup:  !!(t.isGroup),
            folder,
          });
        }
      }

      res.json({ ok: true, requests: combined });
    } catch (e) { res.json({ ok: false, error: e.message, requests: [] }); }
  });

  app.post("/api/ctrlpanel/message-requests/accept", auth, async (req, res) => {
    const api = global.GoatBot?.fcaApi;
    if (!api) return res.json({ ok: false, error: "البوت غير متصل" });
    const { tid } = req.body;
    if (!tid) return res.json({ ok: false, error: "tid مطلوب" });
    try {
      // Mark as read first — this signals to Facebook that we're engaging with the thread
      // and moves it out of the PENDING/OTHER inbox before we send
      if (typeof api.markAsRead === "function") {
        await new Promise(r => api.markAsRead(String(tid), true, r)).catch(() => {});
      }
      await new Promise((resolve, reject) => {
        api.sendMessage(".", String(tid), (e) => e ? reject(e) : resolve());
      });
      // Second markAsRead after sending to fully confirm acceptance
      if (typeof api.markAsRead === "function") {
        await new Promise(r => api.markAsRead(String(tid), true, r)).catch(() => {});
      }
      res.json({ ok: true });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  app.post("/api/ctrlpanel/message-requests/decline", auth, (req, res) => {
    const api = global.GoatBot?.fcaApi;
    if (!api) return res.json({ ok: false, error: "البوت غير متصل" });
    const { tid } = req.body;
    if (!tid) return res.json({ ok: false, error: "tid مطلوب" });
    try {
      const fn = api.deleteThread || api.muteThread;
      if (!fn) return res.json({ ok: true, note: "تم التجاهل (deleteThread غير مدعوم)" });
      fn.call(api, String(tid), (e) => {
        if (e) return res.json({ ok: false, error: e.message });
        res.json({ ok: true });
      });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  app.post("/api/ctrlpanel/message-requests/accept-all", auth, async (req, res) => {
    const api = global.GoatBot?.fcaApi;
    if (!api) return res.json({ ok: false, error: "البوت غير متصل" });

    function fetchFolder(tag) {
      return new Promise((resolve) => {
        const fn = api.getThreadList;
        if (typeof fn !== "function") return resolve([]);
        const timer = setTimeout(() => resolve([]), 15000);
        try {
          fn.call(api, 30, null, [tag], (e, d) => { clearTimeout(timer); resolve(Array.isArray(d) ? d : []); });
        } catch (_) { clearTimeout(timer); resolve([]); }
      });
    }

    try {
      const [pendingList, otherList] = await Promise.all([fetchFolder("PENDING"), fetchFolder("OTHER")]);
      const seen = new Set();
      const all = [];
      for (const t of [...pendingList, ...otherList]) {
        const key = String(t.threadID);
        if (!seen.has(key)) { seen.add(key); all.push(t); }
      }
      let ok = 0, fail = 0;
      for (const t of all) {
        try {
          if (typeof api.markAsRead === "function") {
            await new Promise(r => api.markAsRead(String(t.threadID), true, r)).catch(() => {});
          }
          await new Promise((res, rej) => api.sendMessage(".", String(t.threadID), e => e ? rej(e) : res()));
          if (typeof api.markAsRead === "function") {
            await new Promise(r => api.markAsRead(String(t.threadID), true, r)).catch(() => {});
          }
          ok++;
        } catch (_) { fail++; }
        await new Promise(r => setTimeout(r, 300));
      }
      res.json({ ok: true, accepted: ok, failed: fail });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  app.post("/api/ctrlpanel/message-requests/decline-all", auth, async (req, res) => {
    const api = global.GoatBot?.fcaApi;
    if (!api) return res.json({ ok: false, error: "البوت غير متصل" });

    function fetchFolder(tag) {
      return new Promise((resolve) => {
        const fn = api.getThreadList;
        if (typeof fn !== "function") return resolve([]);
        const timer = setTimeout(() => resolve([]), 15000);
        try {
          fn.call(api, 30, null, [tag], (e, d) => { clearTimeout(timer); resolve(Array.isArray(d) ? d : []); });
        } catch (_) { clearTimeout(timer); resolve([]); }
      });
    }

    try {
      const [pendingList, otherList] = await Promise.all([fetchFolder("PENDING"), fetchFolder("OTHER")]);
      const seen = new Set();
      const all = [];
      for (const t of [...pendingList, ...otherList]) {
        const key = String(t.threadID);
        if (!seen.has(key)) { seen.add(key); all.push(t); }
      }
      const fn = api.deleteThread;
      if (!fn) return res.json({ ok: true, note: "تم التجاهل (deleteThread غير مدعوم)", declined: 0 });
      let ok = 0, fail = 0;
      for (const t of all) {
        try { await new Promise((res, rej) => fn.call(api, String(t.threadID), e => e ? rej(e) : res())); ok++; }
        catch (_) { fail++; }
        await new Promise(r => setTimeout(r, 200));
      }
      res.json({ ok: true, declined: ok, failed: fail });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  // ── Control Panel: Group list ─────────────────────────────────────────────────
  app.get("/api/ctrlpanel/groups", auth, async (req, res) => {
    const api = global.GoatBot?.fcaApi;

    const seen   = new Set();
    const groups = [];

    function addGroup(tid, name, memberCount) {
      const key = String(tid);
      if (!key || seen.has(key)) return;
      seen.add(key);
      groups.push({ tid: key, name: name || `غروب ${key}`, memberCount: memberCount || 0 });
    }

    // ── 1. Pull from motorData / nmLocks / nickLocks (always available) ──────
    for (const [tid, d] of Object.entries(global.motorData  || {})) addGroup(tid, d?.threadName || d?.name, 0);
    for (const [tid, d] of Object.entries(global.motorData2 || {})) addGroup(tid, d?.threadName || d?.name, 0);
    for (const [tid, d] of Object.entries(global._nmLocks   || {})) addGroup(tid, d?.threadName || d?.name, 0);
    for (const [tid, d] of Object.entries(global._nickLocks || {})) addGroup(tid, d?.threadName || d?.name, 0);

    // ── 2. Live fetch from FCA API if bot is connected ───────────────────────
    if (api && typeof api.getThreadList === "function") {
      try {
        const threads = await new Promise((resolve) => {
          const timer = setTimeout(() => resolve([]), 12000);
          try {
            api.getThreadList(50, null, ["INBOX"], (e, d) => {
              clearTimeout(timer);
              resolve(Array.isArray(d) ? d : []);
            });
          } catch (_) { clearTimeout(timer); resolve([]); }
        });
        for (const t of threads) {
          if (!t.isGroup) continue;
          addGroup(
            t.threadID,
            t.name || t.threadName || `غروب ${t.threadID}`,
            (t.participantIDs || []).length
          );
        }
      } catch (_) {}
    }

    if (!groups.length && !api) {
      return res.json({ ok: false, error: "البوت غير متصل ولا توجد غروبات محفوظة", groups: [] });
    }

    groups.sort((a, b) => a.name.localeCompare(b.name));
    res.json({ ok: true, groups });
  });

  // ── Control Panel: Group feature state ───────────────────────────────────────
  app.get("/api/ctrlpanel/groups/:tid", auth, (req, res) => {
    const tid   = String(req.params.tid);
    const m1    = (global.motorData  || {})[tid] || {};
    const m2    = (global.motorData2 || {})[tid] || {};
    const nm    = (global._nmLocks   || {})[tid] || {};
    const nk    = (global._nickLocks || {})[tid] || {};
    const botID = String(global.GoatBot?.botID || "");
    const puAll = nk.perUser || {};
    const perUserPublic = {};
    for (const [k, v] of Object.entries(puAll)) {
      if (k !== botID) perUserPublic[k] = v;
    }
    res.json({
      ok: true,
      motor:  { status: !!m1.status,  message: m1.message || "", time: m1.time || null, randomTime: !!m1.randomTime, randomRange: m1.randomRange || null },
      motor2: { status: !!m2.status,  message: m2.message || "", time: m2.time || null, randomTime: !!m2.randomTime, randomRange: m2.randomRange || null },
      nm:     { active: !!nm.active,  name: nm.name || "", minDelay: nm.minDelay || 30, maxDelay: nm.maxDelay || 90 },
      nick:   {
        active:     !!nk.active,
        globalName: nk.globalName || "",
        botName:    botID ? (puAll[botID] || "") : "",
        perUser:    perUserPublic,
        timerMin:   nk.timerMin || 30,
        timerMax:   nk.timerMax || 90,
      },
    });
  });

  // ── Control Panel: Motor (محرك) control ──────────────────────────────────────
  app.post("/api/ctrlpanel/groups/:tid/motor", auth, async (req, res) => {
    const tid = String(req.params.tid);
    const { action, message, time, randomMin, randomMax } = req.body;
    try {
      global.motorData = global.motorData || {};
      if (!global.motorData[tid]) global.motorData[tid] = { status: false, message: null, time: null, randomTime: false, randomRange: null, interval: null };
      const d = global.motorData[tid];
      if (action === "stop") {
        d.status = false;
        try { clearInterval(d.interval); clearTimeout(d.interval); } catch (_) {}
        d.interval = null;
        try { require("../engine/motorSafeSend").stopMotorLoop(tid); } catch (_) {}
      } else if (action === "start") {
        if (message) d.message = String(message);
        if (randomMin && randomMax) {
          const rMin = parseFloat(randomMin), rMax = parseFloat(randomMax);
          d.randomTime  = true;
          d.randomRange = { min: Math.round(rMin), max: Math.round(rMax) };
          d.time        = Math.round((rMin + rMax) / 2);
        } else if (time) {
          d.time        = parseFloat(time) || d.time;
          d.randomTime  = false;
          d.randomRange = null;
        }
        d.status = true;
        try { clearTimeout(d.interval); clearInterval(d.interval); } catch (_) {}
        d.interval = null;
        const liveApi = global._botApi || global.GoatBot?.fcaApi;
        if (liveApi) {
          const { scheduleMotorLoop } = require("../engine/motorSafeSend");
          scheduleMotorLoop({
            api: liveApi, threadID: tid,
            getData: () => global.motorData[tid],
            onDisable: () => { try { require("../engine/motorPersist").motor1.persistAll(global.motorData); } catch (_) {} }
          });
        }
      } else if (action === "set-message") {
        d.message = String(message || "");
      } else if (action === "set-time") {
        if (randomMin && randomMax) {
          const rMin = parseFloat(randomMin), rMax = parseFloat(randomMax);
          d.randomTime = true; d.randomRange = { min: Math.round(rMin), max: Math.round(rMax) };
          d.time = Math.round((rMin + rMax) / 2);
        } else if (time) {
          d.time = parseFloat(time) || null; d.randomTime = false; d.randomRange = null;
        }
      }
      try { require("../engine/motorPersist").motor1.persistAll(global.motorData); } catch (_) {}
      const m = global.motorData[tid] || {};
      res.json({ ok: true, status: !!m.status, message: m.message, time: m.time, randomTime: !!m.randomTime, randomRange: m.randomRange || null });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  // ── Control Panel: Motor2 control ────────────────────────────────────────────
  app.post("/api/ctrlpanel/groups/:tid/motor2", auth, async (req, res) => {
    const tid = String(req.params.tid);
    const { action, message, time, randomMin, randomMax } = req.body;
    try {
      global.motorData2 = global.motorData2 || {};
      if (!global.motorData2[tid]) global.motorData2[tid] = { status: false, message: null, time: null, randomTime: false, randomRange: null, interval: null };
      const d = global.motorData2[tid];
      if (action === "stop") {
        d.status = false;
        try { clearInterval(d.interval); clearTimeout(d.interval); } catch (_) {}
        d.interval = null;
        try { require("../engine/motorSafeSend").stopMotorLoop(tid); } catch (_) {}
      } else if (action === "start") {
        if (message) d.message = String(message);
        if (randomMin && randomMax) {
          const rMin = parseFloat(randomMin), rMax = parseFloat(randomMax);
          d.randomTime  = true;
          d.randomRange = { min: Math.round(rMin), max: Math.round(rMax) };
          d.time        = Math.round((rMin + rMax) / 2);
        } else if (time) {
          d.time        = parseFloat(time) || d.time;
          d.randomTime  = false;
          d.randomRange = null;
        }
        d.status = true;
        d.shouldSend = function () {
          const lastActive = (global.lastActivity || {})[tid];
          if (!lastActive) return false;
          return (Date.now() - lastActive) < (Number(d.time) || 0) * 2;
        };
        try { clearTimeout(d.interval); clearInterval(d.interval); } catch (_) {}
        d.interval = null;
        const liveApi = global._botApi || global.GoatBot?.fcaApi;
        if (liveApi) {
          const { scheduleMotorLoop } = require("../engine/motorSafeSend");
          scheduleMotorLoop({
            api: liveApi, threadID: tid,
            getData: () => global.motorData2[tid],
            onDisable: () => { try { require("../engine/motorPersist").motor2.persistAll(global.motorData2); } catch (_) {} }
          });
        }
      } else if (action === "set-message") {
        d.message = String(message || "");
      } else if (action === "set-time") {
        if (randomMin && randomMax) {
          const rMin = parseFloat(randomMin), rMax = parseFloat(randomMax);
          d.randomTime = true; d.randomRange = { min: Math.round(rMin), max: Math.round(rMax) };
          d.time = Math.round((rMin + rMax) / 2);
        } else if (time) {
          d.time = parseFloat(time) || null; d.randomTime = false; d.randomRange = null;
        }
      }
      try { require("../engine/motorPersist").motor2.persistAll(global.motorData2); } catch (_) {}
      const m = global.motorData2[tid] || {};
      res.json({ ok: true, status: !!m.status, message: m.message, time: m.time, randomTime: !!m.randomTime, randomRange: m.randomRange || null });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  // ── Control Panel: NM control ─────────────────────────────────────────────────
  app.post("/api/ctrlpanel/groups/:tid/nm", auth, (req, res) => {
    const tid = String(req.params.tid);
    const { action, name, minDelay, maxDelay } = req.body;
    const api = global.GoatBot?.fcaApi;
    try {
      global._nmLocks  = global._nmLocks  || {};
      global._nmTimers = global._nmTimers || {};
      if (!global._nmLocks[tid]) global._nmLocks[tid] = { active: false, name: "", minDelay: 30, maxDelay: 90 };
      const d = global._nmLocks[tid];
      if (action === "stop") {
        d.active = false;
        clearTimeout(global._nmTimers[tid]); global._nmTimers[tid] = null;
      } else if (action === "start") {
        if (name)     d.name     = String(name);
        if (minDelay) d.minDelay = parseFloat(minDelay) || d.minDelay;
        if (maxDelay) d.maxDelay = parseFloat(maxDelay) || d.maxDelay;
        d.active = true;
        // Kick off a cycle if api is available
        if (api && d.name) {
          const _setNm = () => {
            const cur = (global._nmLocks || {})[tid];
            if (!cur?.active || !cur?.name) return;
            try { api.setTitle(cur.name, tid); } catch (_) {}
            const ms = ((cur.minDelay || 30) + Math.random() * ((cur.maxDelay || 90) - (cur.minDelay || 30))) * 1000;
            global._nmTimers[tid] = setTimeout(_setNm, Math.round(ms));
          };
          clearTimeout(global._nmTimers[tid]);
          global._nmTimers[tid] = setTimeout(_setNm, 3000);
        }
      } else if (action === "set-name") {
        d.name = String(name || "");
      }
      // Persist via nameLocks if available
      try { require("../engine/nameLocks").saveNmLocks?.(global._nmLocks); } catch (_) {}
      const cur = global._nmLocks[tid] || {};
      res.json({ ok: true, active: !!cur.active, name: cur.name, minDelay: cur.minDelay, maxDelay: cur.maxDelay });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  // ── Control Panel: Nick control ───────────────────────────────────────────────
  app.post("/api/ctrlpanel/groups/:tid/nick", auth, async (req, res) => {
    const tid = String(req.params.tid);
    const { action, globalName, botName, uid, nickName, timerMin, timerMax } = req.body;
    const api = global._botApi || global.GoatBot?.fcaApi;
    try {
      global._nickLocks  = global._nickLocks  || {};
      global._nickTimers = global._nickTimers || {};
      if (!global._nickLocks[tid]) global._nickLocks[tid] = { active: false, globalName: "", perUser: {}, timerMin: 30, timerMax: 90 };
      const d = global._nickLocks[tid];
      d.perUser = d.perUser || {};

      const botID = String(global.GoatBot?.botID || api?.getCurrentUserID?.() || "");

      function _stopTimer() { clearTimeout(global._nickTimers[tid]); delete global._nickTimers[tid]; }
      function _startTimer() {
        _stopTimer();
        const mn = d.timerMin || 30, mx = d.timerMax || 90;
        const ms = (mn + Math.random() * (mx - mn)) * 1000;
        global._nickTimers[tid] = setTimeout(async () => {
          delete global._nickTimers[tid];
          const cur = (global._nickLocks || {})[tid];
          if (!cur?.active) return;
          if (api) {
            try {
              const info = await new Promise((resolve, rej) => api.getThreadInfo(tid, (e, data) => e ? rej(e) : resolve(data)));
              const allMembers = info?.participantIDs || [];
              for (const memId of allMembers) {
                const name = cur.perUser?.[String(memId)] ?? (String(memId) !== botID ? cur.globalName : "") ?? "";
                if (name) {
                  try { await new Promise(r => api.changeNickname(name, tid, String(memId), r)); } catch (_) {}
                  await new Promise(r => setTimeout(r, 1200));
                }
              }
            } catch (_) {}
          }
          if ((global._nickLocks || {})[tid]?.active) _startTimer();
        }, Math.round(ms));
      }

      if (action === "stop-all") {
        d.active = false;
        _stopTimer();

      } else if (action === "global-all-start") {
        if (globalName !== undefined) d.globalName = String(globalName);
        if (timerMin) d.timerMin = parseFloat(timerMin) || d.timerMin;
        if (timerMax) d.timerMax = parseFloat(timerMax) || d.timerMax;
        d.active = true;
        if (api && d.globalName) {
          setImmediate(async () => {
            try {
              const info = await new Promise((resolve, rej) => api.getThreadInfo(tid, (e, data) => e ? rej(e) : resolve(data)));
              const allMembers = (info?.participantIDs || []);
              for (const memId of allMembers) {
                const cur = (global._nickLocks || {})[tid];
                if (!cur?.active) break;
                const name = cur.perUser?.[String(memId)] ?? (String(memId) !== botID ? cur.globalName : "") ?? "";
                if (name) {
                  try { await new Promise(r => api.changeNickname(name, tid, String(memId), r)); } catch (_) {}
                  await new Promise(r => setTimeout(r, 1200));
                }
              }
            } catch (_) {}
          });
        }
        _startTimer();

      } else if (action === "global-all-stop") {
        d.globalName = "";
        if (!Object.keys(d.perUser).length) { d.active = false; _stopTimer(); }

      } else if (action === "bot-start") {
        if (botName !== undefined && botID) d.perUser[botID] = String(botName);
        if (timerMin) d.timerMin = parseFloat(timerMin) || d.timerMin;
        if (timerMax) d.timerMax = parseFloat(timerMax) || d.timerMax;
        d.active = true;
        if (api && botName && botID) {
          setImmediate(async () => {
            try { await new Promise(r => api.changeNickname(String(botName), tid, botID, r)); } catch (_) {}
          });
        }

      } else if (action === "bot-stop") {
        if (botID) delete d.perUser[botID];
        if (!d.globalName && !Object.keys(d.perUser).length) { d.active = false; _stopTimer(); }

      } else if (action === "add-user") {
        if (!uid || !nickName) return res.json({ ok: false, error: "uid و nickName مطلوبان" });
        d.perUser[String(uid)] = String(nickName);
        d.active = true;
        if (api) {
          setImmediate(async () => {
            try { await new Promise(r => api.changeNickname(String(nickName), tid, String(uid), r)); } catch (_) {}
          });
        }

      } else if (action === "remove-user") {
        if (!uid) return res.json({ ok: false, error: "uid مطلوب" });
        delete d.perUser[String(uid)];
        if (!d.globalName && !Object.keys(d.perUser).length) { d.active = false; _stopTimer(); }
      }

      try { require("../engine/nicknameLocks").saveNickLocks?.(global._nickLocks); } catch (_) {}

      const perUserPublic = {};
      for (const [k, v] of Object.entries(d.perUser || {})) {
        if (k !== botID) perUserPublic[k] = v;
      }
      res.json({
        ok: true, active: !!d.active,
        globalName: d.globalName || "",
        botName:    botID ? (d.perUser[botID] || "") : "",
        perUser:    perUserPublic,
        timerMin: d.timerMin, timerMax: d.timerMax,
      });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  // ── Catch-all SPA ─────────────────────────────────────────────────────────────
  app.get("*", (_, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

  setInterval(() => { if (_io) _io.emit("stats-update", getStats()); }, 5000);

  return new Promise((resolve, reject) => {
    _server.listen(port, "0.0.0.0", () => {
      console.log();
      console.log(chalk.cyan("  ╔══════════════════════════════════════════╗"));
      console.log(chalk.cyan(`  ║  🌐 Dashboard: http://0.0.0.0:${port}       ║`));
      console.log(chalk.cyan("  ╚══════════════════════════════════════════╝"));
      console.log();
      resolve({ app, server: _server, io: _io });
    });
    _server.on("error", reject);
  });
}

module.exports = { startDashboard, getIO, interceptLogs };
