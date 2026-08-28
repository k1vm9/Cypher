"use strict";

/**
 * Cypher dashboard launcher.
 *
 * The imported bot has a large optional dependency tree, so the dashboard
 * intentionally stays on Node's built-in HTTP APIs. This keeps the control
 * plane available without importing the Messenger client or executing command
 * modules just to render the UI.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");
const { MessengerRuntime } = require("./messenger-runtime");

const ROOT = __dirname;
const CONFIG_PATH = path.join(ROOT, "config.json");
const DASHBOARD_STATE_PATH = path.join(ROOT, ".cypher-dashboard-state.json");
const APPSTATE_PATH = path.join(ROOT, "appstate.json");
const COMMAND_DIR = path.join(ROOT, "modules", "commands");
const VEIL_COMMAND_DIR = path.join(ROOT, "Veil2.0-main", "src", "commands");
const PORT = Number(process.env.PORT) || 2006;
const SESSION_TTL = 8 * 60 * 60 * 1000;
const MAX_BODY = 768 * 1024;
const MAX_FILE = 512 * 1024;

const processStartedAt = Date.now();
const sessions = new Map();
const sseClients = new Set();
const loginAttempts = new Map();
const csrfFailures = new Map();
const scheduleTimers = new Map();
let messengerRuntime;

const veilProtectionNames = [
  ["stealth", "Stealth presence", "Reduce unnecessary presence signals", true],
  ["keepAlive", "Keep-alive", "Maintain a warm connection", true],
  ["mqttHealth", "MQTT health check", "Detect silent or stalled transports", true],
  ["outgoingThrottle", "Outgoing throttle", "Limit bursts of outbound messages", true],
  ["humanTyping", "Human typing", "Add natural typing timing", true],
  ["naturalPresence", "Natural presence", "Vary presence updates", true],
  ["behaviorScheduler", "Behavior scheduler", "Spread automated work safely", true],
  ["antiDetection", "Anti-detection", "Avoid repetitive request patterns", true],
  ["sessionRefresher", "Session refresher", "Refresh session state before expiry", true],
  ["readReceipt", "Human read receipt", "Delay read receipts", true],
  ["scrollSimulator", "Scroll simulator", "Keep transport activity bounded", true],
  ["reactionDelay", "Reaction delay", "Throttle reaction activity", true],
  ["connectionJitter", "Connection jitter", "Avoid synchronized reconnects", true],
  ["duplicateGuard", "Duplicate guard", "Ignore repeated message events", true],
  ["typingVariator", "Typing variator", "Vary typing durations", true],
  ["rateLimit", "Rate limiting", "Protect the command handler", true],
  ["floodGuard", "Flood guard", "Block bursty senders", true],
  ["commandTimeout", "Command timeout", "Bound long-running commands", true],
  ["nameProtection", "Group name protection", "Restore a protected group name", false],
];

const state = {
  status: "no-session",
  latency: null,
  version: "1.2.14",
  startedAt: processStartedAt,
  botLocked: false,
  stats: {
    messages: 0,
    commands: 0,
    groups: 0,
    users: 0,
    totalCommands: 0,
    ram: "—",
  },
  messages: [],
  logs: [],
  settings: {
    botName: "Cypher",
    prefix: "!",
    adminOnly: true,
    silentMode: false,
    keepAlive: true,
    mqttReconnect: true,
    stealthMode: true,
    allowInbox: true,
    activationMode: "whitelist",
  },
  protections: Object.fromEntries(veilProtectionNames.map(([id, , , enabled]) => [id, enabled])),
  schedules: [],
  admins: {
    owner: [String(readConfig().YASSIN || "")].filter((id) => /^[0-9]{4,32}$/.test(id)),
    super: (Array.isArray(readConfig().FACEBOOK_ADMIN) ? readConfig().FACEBOOK_ADMIN : [readConfig().FACEBOOK_ADMIN]).map(String).filter((id) => /^[0-9]{4,32}$/.test(id)),
    admin: (Array.isArray(readConfig().ADMINBOT) ? readConfig().ADMINBOT : [readConfig().ADMINBOT]).map(String).filter((id) => /^[0-9]{4,32}$/.test(id)),
  },
  threads: [],
  threadMessages: {},
};

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

function loadDashboardState() {
  try {
    const saved = JSON.parse(fs.readFileSync(DASHBOARD_STATE_PATH, "utf8"));
    if (!saved || typeof saved !== "object") return;
    if (saved.settings && typeof saved.settings === "object") updateSettings(saved.settings);
    if (saved.protections && typeof saved.protections === "object") {
      for (const [id, enabled] of Object.entries(saved.protections)) {
        if (Object.prototype.hasOwnProperty.call(state.protections, id)) state.protections[id] = Boolean(enabled);
      }
    }
    if (Array.isArray(saved.schedules)) state.schedules = saved.schedules.slice(0, 100);
    if (saved.admins && typeof saved.admins === "object") {
      for (const role of Object.keys(state.admins)) {
        if (Array.isArray(saved.admins[role])) {
          state.admins[role] = saved.admins[role].map(String).filter((id) => /^[0-9]{4,32}$/.test(id)).slice(0, 100);
        }
      }
    }
  } catch {
    // A missing or incomplete dashboard state is expected on first launch.
  }
}

function persistDashboardState() {
  const payload = {
    settings: state.settings,
    protections: state.protections,
    schedules: state.schedules,
    admins: state.admins,
  };
  const temporaryPath = `${DASHBOARD_STATE_PATH}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(payload, null, 2), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporaryPath, DASHBOARD_STATE_PATH);
  } catch (error) {
    try { fs.rmSync(temporaryPath, { force: true }); } catch {}
    console.error(`[Cypher] Unable to persist dashboard state: ${error.message}`);
  }
}

loadDashboardState();

function publicState() {
  const messenger = messengerRuntime?.snapshot();
  const uptimeSeconds = messenger?.connected && messenger.connectedAt
    ? Math.max(0, Math.floor((Date.now() - messenger.connectedAt) / 1000))
    : 0;
  const activeProtections = Object.values(state.protections).filter(Boolean).length;
  const ram = `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`;
  return {
    name: state.settings.botName,
    status: state.status,
    latency: state.latency,
    version: state.version,
    startedAt: state.startedAt,
    uptime: uptimeSeconds,
    botLocked: state.botLocked,
    stats: {
      ...state.stats,
       messages: state.messages.length,
       commands: getCommandCatalog().filter((item) => item.enabled).length,
      groups: state.threads.length,
       users: state.threads.reduce((count, thread) => count + Number(thread.members || 0), 0),
       totalCommands: getCommandCatalog().length,
      uptime: formatUptime(uptimeSeconds),
      protections: activeProtections,
      ram,
    },
    settings: { ...state.settings },
    protections: { ...state.protections },
    protectionCount: veilProtectionNames.length,
    activeProtectionCount: activeProtections,
    schedules: state.schedules.map((item) => ({ ...item })),
    threads: state.threads.map((item) => ({ ...item })),
    messages: state.messages.slice(0, 100),
    logs: state.logs.slice(0, 100),
    messenger: messenger || {
      status: state.status,
      connected: false,
      hasSession: false,
      userID: null,
      connectedAt: null,
      error: null,
    },
    runtime: {
      node: process.version,
      platform: process.platform,
      pid: process.pid,
      processUptime: Math.floor(process.uptime()),
      memory: {
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      },
      client: messenger?.client || null,
      reconnectAttempts: messenger?.reconnectAttempts || 0,
      scheduledJobs: state.schedules.filter((schedule) => schedule.enabled).length,
    },
  };
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days ? `${days}d ` : ""}${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
}

function htmlEscape(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[character]));
}

function parseCookies(request) {
  const result = {};
  for (const part of String(request.headers.cookie || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    result[part.slice(0, separator).trim()] = decodeURIComponent(part.slice(separator + 1).trim());
  }
  return result;
}

function getSession(request) {
  const token = parseCookies(request).cypher_session;
  const session = token && sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    if (token) sessions.delete(token);
    return null;
  }
  return { token, ...session };
}

function issueSession() {
  const token = crypto.randomBytes(32).toString("hex");
  const csrf = crypto.randomBytes(24).toString("hex");
  sessions.set(token, { csrf, expiresAt: Date.now() + SESSION_TTL });
  return { token, csrf };
}

function clearSession(request) {
  const token = parseCookies(request).cypher_session;
  if (token) sessions.delete(token);
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function configuredDashboardKey() {
  return process.env.DASHBOARD_PASSWORD || readConfig().dashboard?.password || null;
}

function validLoginKey(key) {
  const configured = configuredDashboardKey();
  // Imported projects did not ship a dashboard password. Keep local preview
  // usable, while a configured password always takes precedence.
  return configured ? safeEqual(key, configured) : String(key || "").trim().length >= 4;
}

function requestIp(request) {
  return String(request.headers["x-forwarded-for"] || request.socket.remoteAddress || "local").split(",")[0].trim();
}

function rateLimited(map, key, limit, windowMs) {
  const now = Date.now();
  const current = map.get(key) || { count: 0, resetAt: now + windowMs };
  if (current.resetAt <= now) {
    current.count = 0;
    current.resetAt = now + windowMs;
  }
  current.count += 1;
  map.set(key, current);
  return current.count > limit;
}

function authError(response, message = "Authentication required.") {
  sendJson(response, 401, { error: message });
}

function requireAuth(request, response) {
  const session = getSession(request);
  if (!session) {
    authError(response);
    return null;
  }
  return session;
}

function requireMutation(request, response) {
  const session = requireAuth(request, response);
  if (!session) return null;
  if (request.method !== "GET" && request.headers["x-csrf-token"] !== session.csrf) {
    if (rateLimited(csrfFailures, requestIp(request), 20, 60_000)) {
      authError(response, "Too many invalid requests.");
    } else {
      sendJson(response, 403, { error: "Invalid request token." });
    }
    return null;
  }
  return session;
}

function sendJson(response, statusCode, payload, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  response.end(JSON.stringify(payload));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let settled = false;
    const fail = (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };
    request.on("data", (chunk) => {
      if (settled) return;
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY) {
        request.destroy();
        fail(new Error("Request body too large."));
      }
    });
    request.on("end", () => {
      if (settled) return;
      settled = true;
      if (!body) return resolve({});
      try {
        const value = JSON.parse(body);
        resolve(value && typeof value === "object" ? value : {});
      } catch {
        reject(new Error("Invalid JSON."));
      }
    });
    request.on("error", fail);
  });
}

function addLog(level, text, meta = "") {
  const time = new Date().toLocaleTimeString("en-US", { hour12: false });
  state.logs.unshift({ time, level, text: String(text).slice(0, 240), meta: String(meta).slice(0, 180) });
  state.logs = state.logs.slice(0, 100);
  broadcast("log-line", state.logs[0]);
}

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try { client.write(payload); } catch { sseClients.delete(client); }
  }
}

function mutateAndBroadcast() {
  persistDashboardState();
  broadcast("state-update", publicState());
}

function isInside(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function safeWorkspacePath(relativePath) {
  if (typeof relativePath !== "string" || !relativePath.trim() || relativePath.includes("\0")) return null;
  const normalized = relativePath.replace(/^[/\\]+/, "");
  const candidate = path.resolve(ROOT, normalized);
  return isInside(candidate, ROOT) ? candidate : null;
}

function commandSourcePath(relativePath) {
  const file = safeWorkspacePath(relativePath);
  if (!file || path.extname(file).toLowerCase() !== ".js") return null;
  return isInside(file, COMMAND_DIR) || isInside(file, VEIL_COMMAND_DIR) ? file : null;
}

function matchString(source, key) {
  const expression = new RegExp(`${key}\\s*:\\s*["'\`]([^"'\`]+)["'\`]`);
  return source.match(expression)?.[1] || "";
}

function matchArray(source, key) {
  const match = source.match(new RegExp(`${key}\\s*:\\s*\\[([^\\]]*)\\]`));
  if (!match) return [];
  return [...match[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((item) => item[1]).slice(0, 12);
}

function commandMetadata(file, sourceKind) {
  try {
    const source = fs.readFileSync(file, "utf8");
    const configName = matchString(source, "name") || path.basename(file, ".js");
    return {
      name: configName,
      aliases: matchArray(source, "aliases"),
      version: matchString(source, "version") || "1.0.0",
      description: matchString(source, "description") || "Veil-compatible command",
      category: matchString(source, "commandCategory") || matchString(source, "category") || "utility",
      role: Number(source.match(/(?:hasPermssion|role)\\s*:\\s*(\\d+)/)?.[1] || 0),
      enabled: sourceKind === "veil" || !((readConfig().commandDisabled || []).includes(path.basename(file))),
      source: sourceKind,
      file: path.relative(ROOT, file),
    };
  } catch {
    return null;
  }
}

function listFiles(directory) {
  try {
    return fs.readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
      .map((entry) => path.join(directory, entry.name));
  } catch {
    return [];
  }
}

function getCommandCatalog() {
  const items = [
    ...listFiles(COMMAND_DIR).map((file) => commandMetadata(file, "cypher")),
    ...listFiles(VEIL_COMMAND_DIR).map((file) => commandMetadata(file, "veil")),
  ].filter(Boolean);
  const seen = new Set();
  return items.filter((item) => {
    const key = item.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

function findThread(threadID) {
  return state.threads.find((thread) => thread.id === String(threadID));
}

function allowedSettingKeys() {
  return new Set(["botName", "prefix", "adminOnly", "silentMode", "keepAlive", "mqttReconnect", "stealthMode", "allowInbox", "activationMode"]);
}

function updateSettings(input) {
  if (!input || typeof input !== "object") return;
  const allowed = allowedSettingKeys();
  for (const [key, value] of Object.entries(input)) {
    if (!allowed.has(key)) continue;
    if (["adminOnly", "silentMode", "keepAlive", "stealthMode", "allowInbox"].includes(key)) {
      state.settings[key] = Boolean(value);
    } else if (key === "activationMode" && ["whitelist", "blacklist"].includes(value)) {
      state.settings[key] = value;
    } else if (key === "botName") {
      state.settings[key] = String(value).trim().slice(0, 40) || "Cypher";
    } else if (key === "prefix") {
      state.settings[key] = String(value).trim().slice(0, 3) || "!";
    }
  }
}

function clearLiveData() {
  state.threads = [];
  state.threadMessages = {};
  state.messages = [];
}

function applyMessengerSnapshot(snapshot, announce = false) {
  state.status = snapshot?.status || "no-session";
  state.latency = snapshot?.connected ? state.latency : null;
  if (!snapshot?.connected) {
    clearLiveData();
    clearScheduleTimers();
  } else {
    syncScheduleTimers();
  }
  if (announce) broadcast("state-update", publicState());
}

function recordLiveMessage(message) {
  if (!message?.threadID || !message.content) return;
  if (!findThread(message.threadID)) {
    state.threads.unshift({
      id: message.threadID,
      name: `Conversation ${message.threadID}`,
      type: "group",
      members: 0,
      unread: 0,
    });
  }
  const messages = state.threadMessages[message.threadID] || [];
  const duplicate = messages.some((item) => item.id === message.id
    || (item.content === message.content && item.kind === "bot" && message.kind === "bot"));
  if (duplicate) return;
  state.threadMessages[message.threadID] = [...messages, message].slice(-100);
  state.messages.unshift({
    ...message,
    status: message.status || "Received",
  });
  state.messages = state.messages.slice(0, 100);
  addLog("INFO", "New Messenger message received", `thread=${message.threadID}`);
  broadcast("message", message);
  mutateAndBroadcast();
}

async function refreshLiveThreads() {
  if (!messengerRuntime || !messengerRuntime.snapshot().connected) {
    clearLiveData();
    return [];
  }
  const startedAt = Date.now();
  const threads = await messengerRuntime.getThreads();
  state.threads = threads;
  const validIds = new Set(threads.map((thread) => thread.id));
  for (const id of Object.keys(state.threadMessages)) {
    if (!validIds.has(id)) delete state.threadMessages[id];
  }
  state.messages = Object.values(state.threadMessages).flat().slice(-100).reverse();
  state.latency = Math.max(1, Date.now() - startedAt);
  return threads;
}

function clearScheduleTimer(id) {
  const timer = scheduleTimers.get(id);
  if (timer) clearTimeout(timer);
  scheduleTimers.delete(id);
}

function clearScheduleTimers() {
  for (const id of scheduleTimers.keys()) clearScheduleTimer(id);
}

function scheduleDelay(schedule) {
  const min = Math.max(1, Number(schedule.min) || 30);
  const max = Math.max(min, Number(schedule.max) || min);
  const minutes = min + Math.random() * (max - min);
  return Math.round(minutes * 60 * 1000);
}

function scheduleNextRun(schedule) {
  clearScheduleTimer(schedule.id);
  if (!schedule.enabled || !messengerRuntime?.snapshot().connected) {
    schedule.nextRunAt = null;
    return;
  }
  const delay = scheduleDelay(schedule);
  schedule.nextRunAt = Date.now() + delay;
  const timer = setTimeout(async () => {
    scheduleTimers.delete(schedule.id);
    await runScheduledMessage(schedule);
  }, delay);
  timer.unref?.();
  scheduleTimers.set(schedule.id, timer);
}

async function runScheduledMessage(schedule) {
  if (!schedule.enabled) return;
  if (!messengerRuntime?.snapshot().connected) {
    schedule.lastError = "Waiting for a connected Messenger session.";
    schedule.nextRunAt = null;
    return;
  }
  const thread = findThread(schedule.threadID);
  if (!thread) {
    schedule.lastError = "Target thread is no longer available.";
    addLog("WARN", "Scheduled message skipped", `thread=${schedule.threadID}`);
    scheduleNextRun(schedule);
    mutateAndBroadcast();
    return;
  }
  try {
    await messengerRuntime.sendMessage(schedule.threadID, schedule.message);
    const item = {
      id: `scheduled_${Date.now()}`,
      sender: "Cypher",
      content: schedule.message,
      time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      status: "Sent",
      threadID: schedule.threadID,
      kind: "bot",
    };
    state.messages.unshift(item);
    state.threadMessages[schedule.threadID] = [...(state.threadMessages[schedule.threadID] || []), item].slice(-100);
    state.messages = state.messages.slice(0, 100);
    schedule.lastRunAt = Date.now();
    schedule.lastError = null;
    addLog("OK", "Scheduled message sent", `thread=${schedule.threadID}`);
    broadcast("message", item);
  } catch (error) {
    schedule.lastError = String(error.message || error).slice(0, 180);
    addLog("ERROR", "Scheduled message failed", `thread=${schedule.threadID}`);
  }
  scheduleNextRun(schedule);
  mutateAndBroadcast();
}

function syncScheduleTimers() {
  if (!messengerRuntime?.snapshot().connected) {
    clearScheduleTimers();
    return;
  }
  for (const schedule of state.schedules) scheduleNextRun(schedule);
}

function parseSessionPayload(payload) {
  const raw = String(payload || "").trim();
  if (!raw) throw new Error("Session payload cannot be empty.");
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch {
    // Veil-compatible header format: c_user=123; xs=session-token
  }
  let cookies = Array.isArray(parsed) ? parsed
    : parsed && Array.isArray(parsed.cookies) ? parsed.cookies
      : parsed && typeof parsed === "object" ? Object.entries(parsed)
        .map(([key, value]) => ({ key, value }))
        : null;
  if (!cookies && raw.includes("=")) {
    cookies = raw.split(/;\s*/g).filter(Boolean).map((part) => {
      const separator = part.indexOf("=");
      return separator > 0 ? { key: part.slice(0, separator).trim(), value: part.slice(separator + 1).trim() } : null;
    }).filter(Boolean);
  }
  if (!cookies?.length) throw new Error("Session payload must contain a cookie array or cookie header.");
  const deduped = new Map();
  for (const cookie of cookies) {
    if (!cookie || typeof cookie !== "object") throw new Error("Every session cookie must be an object.");
    const key = String(cookie.key || cookie.name || cookie.keyName || "").trim();
    const value = String(cookie.value ?? "").trim();
    if (!key || !value) throw new Error("Every session cookie needs a key and value.");
    deduped.set(key, {
      key: key.slice(0, 120),
      value: value.slice(0, 4096),
      domain: String(cookie.domain || ".facebook.com").slice(0, 200),
      path: String(cookie.path || "/").slice(0, 200),
      hostOnly: Boolean(cookie.hostOnly),
      httpOnly: Boolean(cookie.httpOnly),
      secure: cookie.secure !== false,
      session: Boolean(cookie.session),
      ...(Number.isFinite(Number(cookie.expirationDate)) ? { expirationDate: Number(cookie.expirationDate) } : {}),
      ...(cookie.expires ? { expires: String(cookie.expires).slice(0, 80) } : {}),
    });
  }
  const normalized = [...deduped.values()];
  const keys = new Set(normalized.map((cookie) => cookie.key));
  if (!keys.has("c_user") || !keys.has("xs")) {
    throw new Error("Session must include both c_user and xs cookies.");
  }
  return normalized;
}

function writeAppState(cookies) {
  const temporaryPath = `${APPSTATE_PATH}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(cookies, null, 2), { encoding: "utf8", mode: 0o600 });
  fs.chmodSync(temporaryPath, 0o600);
  fs.renameSync(temporaryPath, APPSTATE_PATH);
}

messengerRuntime = new MessengerRuntime({
  appStatePath: APPSTATE_PATH,
  onStatus: (snapshot) => {
    applyMessengerSnapshot(snapshot, true);
  },
  onMessage: recordLiveMessage,
  onLog: addLog,
});
state.status = messengerRuntime.snapshot().status;
addLog("INFO", "Cypher dashboard started", `session=${messengerRuntime.snapshot().hasSession ? "stored" : "none"}`);

if (messengerRuntime.snapshot().hasSession) {
  void messengerRuntime.start().then((session) => {
    if (!session.connected) mutateAndBroadcast();
  }).catch((error) => {
    addLog("ERROR", "Messenger startup connection failed", String(error.message || error).slice(0, 180));
    mutateAndBroadcast();
  });
}

async function handleApi(request, response, requestUrl) {
  const { pathname, searchParams } = requestUrl;

  if (pathname === "/api/auth/login" && request.method === "POST") {
    if (rateLimited(loginAttempts, requestIp(request), 12, 60_000)) {
      sendJson(response, 429, { error: "Too many login attempts. Try again shortly." });
      return true;
    }
    let body;
    try { body = await readJson(request); } catch (error) {
      sendJson(response, 400, { error: error.message });
      return true;
    }
    if (!validLoginKey(String(body.key || "").trim())) {
      sendJson(response, 401, { error: "Invalid access key." });
      return true;
    }
    const { token, csrf } = issueSession();
    sendJson(response, 200, { ok: true, csrf }, {
      "Set-Cookie": `cypher_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL / 1000}`,
    });
    return true;
  }

  if (pathname === "/api/auth/logout" && request.method === "POST") {
    if (!requireMutation(request, response)) return true;
    clearSession(request);
    sendJson(response, 200, { ok: true }, {
      "Set-Cookie": "cypher_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
    });
    return true;
  }

  if (pathname === "/api/auth/session" && request.method === "GET") {
    const session = getSession(request);
    sendJson(response, 200, { authenticated: Boolean(session), expiresAt: session?.expiresAt || null });
    return true;
  }

  if (pathname === "/api/auth/csrf" && request.method === "GET") {
    const session = requireAuth(request, response);
    if (!session) return true;
    sendJson(response, 200, { csrf: session.csrf });
    return true;
  }

  if (pathname === "/api/session" && request.method === "GET") {
    if (!requireAuth(request, response)) return true;
    sendJson(response, 200, { ok: true, session: messengerRuntime.snapshot() });
    return true;
  }

  if (pathname === "/api/session/import" && request.method === "POST") {
    if (!requireMutation(request, response)) return true;
    let body;
    try { body = await readJson(request); } catch (error) {
      sendJson(response, 400, { error: error.message });
      return true;
    }
    try {
      const cookies = parseSessionPayload(body.payload);
      await messengerRuntime.stop();
      writeAppState(cookies);
      const session = await messengerRuntime.start(cookies);
      addLog(session.connected ? "OK" : "WARN", "Messenger session imported", `cookies=${cookies.length}`);
      mutateAndBroadcast();
      sendJson(response, 200, { ok: true, session, state: publicState() });
    } catch (error) {
      sendJson(response, 422, { error: error.message });
    }
    return true;
  }

  if (pathname === "/api/session" && request.method === "DELETE") {
    if (!requireMutation(request, response)) return true;
    await messengerRuntime.stop();
    try {
      fs.rmSync(APPSTATE_PATH, { force: true });
      fs.rmSync(`${APPSTATE_PATH}.tmp`, { force: true });
    } catch (error) {
      sendJson(response, 500, { error: `Unable to clear session: ${error.message}` });
      return true;
    }
    applyMessengerSnapshot(messengerRuntime.snapshot());
    addLog("WARN", "Messenger session cleared", "storage=local");
    mutateAndBroadcast();
    sendJson(response, 200, { ok: true, session: messengerRuntime.snapshot(), state: publicState() });
    return true;
  }

  if (pathname === "/api/session/connect" && request.method === "POST") {
    if (!requireMutation(request, response)) return true;
    const session = await messengerRuntime.start();
    if (session.connected) {
      try { await refreshLiveThreads(); } catch (error) {
        addLog("WARN", "Conversation sync failed", "request=getThreadList");
      }
    }
    mutateAndBroadcast();
    sendJson(response, 200, { ok: true, session, state: publicState() });
    return true;
  }

  const threadInfoMatch = pathname.match(/^\/api\/threads\/([^/]+)\/info$/);
  if (threadInfoMatch && request.method === "GET") {
    if (!requireAuth(request, response)) return true;
    const threadID = decodeURIComponent(threadInfoMatch[1]);
    if (!findThread(threadID)) {
      sendJson(response, 404, { error: "Thread not found." });
      return true;
    }
    if (!messengerRuntime.snapshot().connected) {
      sendJson(response, 409, { error: "Connect a valid Messenger session before loading group information." });
      return true;
    }
    try {
      const info = await messengerRuntime.getThreadInfo(threadID);
      const members = Array.isArray(info?.participantIDs) ? info.participantIDs.map((id) => {
        const user = info.userInfo?.find?.((item) => String(item.id || item.userID) === String(id));
        return { id: String(id), name: String(user?.name || user?.firstName || id) };
      }) : [];
      sendJson(response, 200, {
        ok: true,
        info: {
          id: threadID,
          name: String(info?.threadName || info?.name || findThread(threadID).name),
          members,
          approvalMode: Boolean(info?.approvalMode),
          admins: Array.isArray(info?.adminIDs) ? info.adminIDs.map(String) : [],
        },
      });
    } catch (error) {
      sendJson(response, 502, { error: `Unable to load group information: ${error.message}` });
    }
    return true;
  }

  const threadActionMatch = pathname.match(/^\/api\/threads\/([^/]+)\/actions$/);
  if (threadActionMatch && request.method === "POST") {
    if (!requireMutation(request, response)) return true;
    const threadID = decodeURIComponent(threadActionMatch[1]);
    if (!findThread(threadID)) {
      sendJson(response, 404, { error: "Thread not found." });
      return true;
    }
    let body;
    try { body = await readJson(request); } catch (error) {
      sendJson(response, 400, { error: error.message });
      return true;
    }
    if (!messengerRuntime.snapshot().connected) {
      sendJson(response, 409, { error: "Connect a valid Messenger session before managing a thread." });
      return true;
    }
    const action = String(body.action || "");
    try {
      if (action === "mark-read") {
        await messengerRuntime.markRead(threadID);
      } else if (action === "rename") {
        const title = String(body.title || "").trim().slice(0, 120);
        if (!title) throw new Error("Thread name cannot be empty.");
        await messengerRuntime.setThreadTitle(threadID, title);
        const thread = findThread(threadID);
        if (thread) thread.name = title;
      } else if (action === "nickname") {
        const userID = String(body.userID || "").trim();
        const nickname = String(body.nickname || "").trim().slice(0, 80);
        if (!userID || !nickname) throw new Error("Member ID and nickname are required.");
        await messengerRuntime.setNickname(threadID, userID, nickname);
      } else if (action === "add-member") {
        const userID = String(body.userID || "").trim();
        if (!/^\d{4,32}$/.test(userID)) throw new Error("Enter a numeric Messenger user ID.");
        await messengerRuntime.addMember(threadID, userID);
      } else if (action === "remove-member") {
        const userID = String(body.userID || "").trim();
        if (!/^\d{4,32}$/.test(userID)) throw new Error("Enter a numeric Messenger user ID.");
        await messengerRuntime.removeMember(threadID, userID);
      } else {
        sendJson(response, 422, { error: "Unknown thread action." });
        return true;
      }
      addLog("OK", "Messenger thread action completed", `action=${action} · thread=${threadID}`);
      mutateAndBroadcast();
      sendJson(response, 200, { ok: true, action, state: publicState() });
    } catch (error) {
      sendJson(response, 502, { error: `Messenger action failed: ${error.message}` });
    }
    return true;
  }

  if (pathname === "/api/events" && request.method === "GET") {
    if (!requireAuth(request, response)) return true;
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store",
      Connection: "keep-alive",
    });
    response.write(`event: state-update\ndata: ${JSON.stringify(publicState())}\n\n`);
    sseClients.add(response);
    request.on("close", () => sseClients.delete(response));
    return true;
  }

  if (!pathname.startsWith("/api/")) return false;

  if (pathname === "/api/status" && request.method === "GET") {
    if (!requireAuth(request, response)) return true;
    sendJson(response, 200, publicState());
    return true;
  }

  if (pathname === "/api/commands" && request.method === "GET") {
    if (!requireAuth(request, response)) return true;
    sendJson(response, 200, { ok: true, commands: getCommandCatalog(), counts: {
      cypher: getCommandCatalog().filter((item) => item.source === "cypher").length,
      veil: getCommandCatalog().filter((item) => item.source === "veil").length,
    } });
    return true;
  }

  if (pathname === "/api/commands/source" && request.method === "GET") {
    if (!requireAuth(request, response)) return true;
    const file = commandSourcePath(searchParams.get("file") || "");
    if (!file || !fs.existsSync(file)) {
      sendJson(response, 404, { error: "Command source not found." });
      return true;
    }
    const stat = fs.statSync(file);
    if (stat.size > MAX_FILE) {
      sendJson(response, 413, { error: "Command source is too large." });
      return true;
    }
    sendJson(response, 200, { ok: true, file: path.relative(ROOT, file), readonly: !isInside(file, COMMAND_DIR), content: fs.readFileSync(file, "utf8") });
    return true;
  }

  if (pathname === "/api/protections" && request.method === "GET") {
    if (!requireAuth(request, response)) return true;
    sendJson(response, 200, { ok: true, protections: veilProtectionNames.map(([id, name, description]) => ({
      id, name, description, enabled: Boolean(state.protections[id]),
    })) });
    return true;
  }

  if (pathname === "/api/threads" && request.method === "GET") {
    if (!requireAuth(request, response)) return true;
    try {
      await refreshLiveThreads();
    } catch (error) {
      sendJson(response, 502, { error: `Unable to load Messenger conversations: ${error.message}` });
      return true;
    }
    sendJson(response, 200, { ok: true, threads: state.threads.map(({ id, name, type, members, unread }) => ({ id, name, type, members, unread })) });
    return true;
  }

  if (pathname === "/api/admins" && request.method === "GET") {
    if (!requireAuth(request, response)) return true;
    sendJson(response, 200, { ok: true, admins: state.admins });
    return true;
  }

  if (pathname === "/api/admins" && (request.method === "POST" || request.method === "DELETE")) {
    if (!requireMutation(request, response)) return true;
    let body;
    try { body = await readJson(request); } catch (error) {
      sendJson(response, 400, { error: error.message });
      return true;
    }
    const role = String(body.role || "");
    const id = String(body.id || "").trim();
    if (!Object.prototype.hasOwnProperty.call(state.admins, role) || !/^[0-9]{4,32}$/.test(id)) {
      sendJson(response, 422, { error: "Choose a valid role and numeric user ID." });
      return true;
    }
    if (request.method === "POST") {
      if (state.admins[role].includes(id)) {
        sendJson(response, 409, { error: "That user is already in this role." });
        return true;
      }
      if (state.admins[role].length >= 100) {
        sendJson(response, 422, { error: "This role has reached its safe limit." });
        return true;
      }
      state.admins[role].push(id);
      addLog("OK", "Operator access granted", `role=${role}`);
    } else {
      if (role === "owner" && state.admins.owner.length <= 1) {
        sendJson(response, 422, { error: "Keep at least one owner account." });
        return true;
      }
      state.admins[role] = state.admins[role].filter((item) => item !== id);
      addLog("WARN", "Operator access removed", `role=${role}`);
    }
    mutateAndBroadcast();
    sendJson(response, 200, { ok: true, admins: state.admins });
    return true;
  }

  const threadMessagesMatch = pathname.match(/^\/api\/threads\/([^/]+)\/messages$/);
  if (threadMessagesMatch && request.method === "GET") {
    if (!requireAuth(request, response)) return true;
    const threadID = decodeURIComponent(threadMessagesMatch[1]);
    if (!findThread(threadID)) {
      sendJson(response, 404, { error: "Thread not found." });
      return true;
    }
    if (messengerRuntime.snapshot().connected) {
      try {
        const messages = await messengerRuntime.getMessages(threadID);
        state.threadMessages[threadID] = messages;
        state.messages = Object.values(state.threadMessages).flat().slice(-100).reverse();
      } catch (error) {
        sendJson(response, 502, { error: `Unable to load conversation history: ${error.message}` });
        return true;
      }
    }
    sendJson(response, 200, { ok: true, messages: state.threadMessages[threadID] || [] });
    return true;
  }

  if (pathname === "/api/imagegen" && request.method === "POST") {
    if (!requireMutation(request, response)) return true;
    let body;
    try { body = await readJson(request); } catch (error) {
      sendJson(response, 400, { error: error.message });
      return true;
    }
    const prompt = String(body.prompt || "").trim().slice(0, 500);
    if (!prompt) {
      sendJson(response, 422, { error: "Describe the image you want to create." });
      return true;
    }
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=768&height=768&nologo=true`;
    addLog("OK", "Image generation queued", "provider=pollinations");
    sendJson(response, 200, { ok: true, prompt, imageUrl });
    return true;
  }

  if (pathname === "/api/actions" && request.method === "POST") {
    if (!requireMutation(request, response)) return true;
    let body;
    try { body = await readJson(request); } catch (error) {
      sendJson(response, 400, { error: error.message });
      return true;
    }
    const action = String(body.action || "").slice(0, 40);
    if (action === "restart") {
      addLog("INFO", "Restart requested from dashboard");
      await messengerRuntime.stop();
      await messengerRuntime.start();
      if (messengerRuntime.snapshot().connected) {
        try { await refreshLiveThreads(); } catch (error) {
          addLog("WARN", "Conversation sync failed after restart", "request=getThreadList");
        }
      }
    } else if (action === "stop") {
      await messengerRuntime.stop();
    } else if (action === "start") {
      await messengerRuntime.start();
      if (messengerRuntime.snapshot().connected) {
        try { await refreshLiveThreads(); } catch (error) {
          addLog("WARN", "Conversation sync failed after start", "request=getThreadList");
        }
      }
    } else if (action === "ping") {
      if (!messengerRuntime.snapshot().connected) {
        sendJson(response, 409, { error: "Connect a valid Messenger session before pinging." });
        return true;
      }
      try {
        await refreshLiveThreads();
        addLog("OK", "Connection ping completed", `latency=${state.latency}ms`);
      } catch (error) {
        sendJson(response, 502, { error: `Messenger ping failed: ${error.message}` });
        return true;
      }
    } else if (action === "refresh") {
      try {
        const threads = await refreshLiveThreads();
        addLog("INFO", "Telemetry refreshed", `threads=${threads.length}`);
      } catch (error) {
        sendJson(response, 502, { error: `Messenger refresh failed: ${error.message}` });
        return true;
      }
    } else if (action === "clear-logs") {
      state.logs = [];
    } else if (action === "stop-all") {
      state.schedules = state.schedules.map((schedule) => ({ ...schedule, enabled: false }));
      clearScheduleTimers();
      addLog("WARN", "All automated jobs paused");
    } else if (action === "schedule-toggle") {
      const scheduleId = String(body.id || "").slice(0, 80);
      const schedule = state.schedules.find((item) => item.id === scheduleId);
      if (!schedule) {
        sendJson(response, 404, { error: "Schedule not found." });
        return true;
      }
      schedule.enabled = body.enabled !== undefined ? Boolean(body.enabled) : !schedule.enabled;
      if (schedule.enabled) scheduleNextRun(schedule);
      else clearScheduleTimer(schedule.id);
      addLog("INFO", "Automatic message schedule updated", `enabled=${schedule.enabled}`);
    } else if (action === "admin" || action === "silent" || action === "lock") {
      if (action === "lock") state.botLocked = body.enabled !== undefined ? Boolean(body.enabled) : !state.botLocked;
      else {
        const key = action === "admin" ? "adminOnly" : "silentMode";
        state.settings[key] = body.enabled !== undefined ? Boolean(body.enabled) : !state.settings[key];
      }
      addLog("INFO", `${action} setting updated`, `enabled=${action === "lock" ? state.botLocked : state.settings[action === "admin" ? "adminOnly" : "silentMode"]}`);
    } else if (action === "save" || action === "reload" || action === "save-message") {
      updateSettings(body.settings);
      if (body.schedule && typeof body.schedule === "object") {
        const schedule = {
          id: String(body.schedule.id || `schedule_${Date.now()}`).slice(0, 80),
          threadID: String(body.schedule.threadID || "thread_8841").slice(0, 80),
          message: String(body.schedule.message || "").slice(0, 500),
          min: Math.max(1, Math.min(1440, Number(body.schedule.min) || 30)),
          max: Math.max(1, Math.min(1440, Number(body.schedule.max) || 60)),
          enabled: body.schedule.enabled !== false,
        };
        if (!findThread(schedule.threadID)) {
          sendJson(response, 422, { error: "Choose an active target group." });
          return true;
        }
        if (!schedule.message) {
          sendJson(response, 422, { error: "Automatic message cannot be empty." });
          return true;
        }
        if (schedule.max < schedule.min) {
          [schedule.min, schedule.max] = [schedule.max, schedule.min];
        }
        const existing = state.schedules.findIndex((item) => item.id === schedule.id);
        if (existing >= 0) state.schedules[existing] = schedule;
        else state.schedules.push(schedule);
        if (schedule.enabled && messengerRuntime.snapshot().connected) scheduleNextRun(schedule);
        else clearScheduleTimer(schedule.id);
      }
      addLog("OK", "Configuration saved", "source=dashboard");
    } else {
      addLog("INFO", "Dashboard action received", `action=${action || "unknown"}`);
    }
    mutateAndBroadcast();
    sendJson(response, 200, { ok: true, state: publicState() });
    return true;
  }

  if (pathname === "/api/messages" && request.method === "POST") {
    if (!requireMutation(request, response)) return true;
    let body;
    try { body = await readJson(request); } catch (error) {
      sendJson(response, 400, { error: error.message });
      return true;
    }
    const message = String(body.message || "").trim().slice(0, 2000);
    const threadID = String(body.threadID || "thread_8841").slice(0, 80);
    if (!message) {
      sendJson(response, 422, { error: "Message cannot be empty." });
      return true;
    }
    if (!messengerRuntime.snapshot().connected) {
      sendJson(response, 409, { error: "Connect a valid Messenger session before sending messages." });
      return true;
    }
    if (!findThread(threadID)) {
      sendJson(response, 404, { error: "Thread not found." });
      return true;
    }
    try {
      await messengerRuntime.sendMessage(threadID, message);
    } catch (error) {
      sendJson(response, 502, { error: `Unable to send Messenger message: ${error.message}` });
      return true;
    }
    const item = { id: `sent_${Date.now()}`, sender: "You", content: message, time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }), status: "Sent", threadID, kind: "bot" };
    state.messages.unshift(item);
    state.threadMessages[threadID] = state.threadMessages[threadID] || [];
    state.threadMessages[threadID].push(item);
    state.threadMessages[threadID] = state.threadMessages[threadID].slice(-100);
    addLog("OK", `Message sent to ${findThread(threadID).name}`, `thread=${threadID}`);
    broadcast("message", item);
    mutateAndBroadcast();
    sendJson(response, 201, { ok: true, message: item, state: publicState() });
    return true;
  }

  if (pathname === "/api/ai/generate" && request.method === "POST") {
    if (!requireMutation(request, response)) return true;
    let body;
    try { body = await readJson(request); } catch (error) {
      sendJson(response, 400, { error: error.message });
      return true;
    }
    const prompt = String(body.prompt || "").trim().slice(0, 500);
    if (!prompt) {
      sendJson(response, 422, { error: "Describe the command you want to generate." });
      return true;
    }
    const result = {
      name: "generated",
      description: `Generated safely from: ${prompt.slice(0, 90)}`,
      code: `module.exports.config = {\n  name: "generated",\n  version: "1.0.0",\n  hasPermssion: 0,\n  description: ${JSON.stringify(prompt)},\n  commandCategory: "أدوات",\n  cooldowns: 5\n};\n\nmodule.exports.run = async function ({ api, event }) {\n  return api.sendMessage("Command scaffold ready for review.", event.threadID, event.messageID);\n};`,
    };
    addLog("OK", "Command scaffold generated", "mode=local-safe-template");
    sendJson(response, 200, result);
    return true;
  }

  if (pathname === "/api/ai/chat" && request.method === "POST") {
    if (!requireMutation(request, response)) return true;
    let body;
    try { body = await readJson(request); } catch (error) {
      sendJson(response, 400, { error: error.message });
      return true;
    }
    const prompt = String(body.message || "").trim().slice(0, 600);
    if (!prompt) {
      sendJson(response, 422, { error: "Ask a question first." });
      return true;
    }
    const active = Object.entries(state.protections).filter(([, enabled]) => enabled).length;
    const answer = /protect|حماية/i.test(prompt)
      ? `Cypher currently has ${active} of ${veilProtectionNames.length} protection layers enabled. Group name protection is off by default.`
      : /command|أمر/i.test(prompt)
        ? `The panel exposes ${getCommandCatalog().length} commands: ${getCommandCatalog().filter((item) => item.source === "cypher").length} Cypher commands plus ${getCommandCatalog().filter((item) => item.source === "veil").length} Veil commands.`
        : "I can help with commands, protection layers, silent mode, image generation, logs, and thread automation.";
    addLog("INFO", "AI panel question answered", "mode=local");
    sendJson(response, 200, { ok: true, message: answer });
    return true;
  }

  if (pathname === "/api/settings" && request.method === "POST") {
    if (!requireMutation(request, response)) return true;
    let body;
    try { body = await readJson(request); } catch (error) {
      sendJson(response, 400, { error: error.message });
      return true;
    }
    updateSettings(body);
    addLog("OK", "Settings saved", "source=dashboard");
    mutateAndBroadcast();
    sendJson(response, 200, { ok: true, settings: state.settings, state: publicState() });
    return true;
  }

  if (pathname === "/api/protections/toggle" && request.method === "POST") {
    if (!requireMutation(request, response)) return true;
    let body;
    try { body = await readJson(request); } catch (error) {
      sendJson(response, 400, { error: error.message });
      return true;
    }
    const id = String(body.id || "");
    if (!Object.prototype.hasOwnProperty.call(state.protections, id)) {
      sendJson(response, 404, { error: "Protection layer not found." });
      return true;
    }
    state.protections[id] = body.enabled !== undefined ? Boolean(body.enabled) : !state.protections[id];
    addLog("INFO", "Protection layer updated", `${id}=${state.protections[id]}`);
    mutateAndBroadcast();
    sendJson(response, 200, { ok: true, id, enabled: state.protections[id], state: publicState() });
    return true;
  }

  if (pathname === "/api/commands/source" && request.method === "POST") {
    if (!requireMutation(request, response)) return true;
    let body;
    try { body = await readJson(request); } catch (error) {
      sendJson(response, 400, { error: error.message });
      return true;
    }
    const file = commandSourcePath(String(body.file || ""));
    const source = String(body.source || "");
    if (!file || !isInside(file, COMMAND_DIR)) {
      sendJson(response, 403, { error: "Only Cypher command files can be edited." });
      return true;
    }
    if (!source || Buffer.byteLength(source) > MAX_FILE) {
      sendJson(response, 422, { error: "Command source is empty or too large." });
      return true;
    }
    try {
      // Parse only. Do not execute code submitted by the panel.
      new (require("vm").Script)(source, { filename: path.basename(file) });
      fs.writeFileSync(file, source, { encoding: "utf8", mode: 0o600 });
      addLog("OK", "Command source saved", `file=${path.basename(file)}`);
      mutateAndBroadcast();
      sendJson(response, 200, { ok: true });
    } catch (error) {
      sendJson(response, 422, { error: `Invalid JavaScript: ${error.message}` });
    }
    return true;
  }

  if (pathname === "/api/files/write" && request.method === "POST") {
    if (!requireMutation(request, response)) return true;
    let body;
    try { body = await readJson(request); } catch (error) {
      sendJson(response, 400, { error: error.message });
      return true;
    }
    const file = safeWorkspacePath(String(body.path || ""));
    const source = String(body.content || "");
    const extension = file ? path.extname(file).toLowerCase() : "";
    const allowedExtensions = new Set([".js", ".json", ".md", ".txt", ".css", ".html"]);
    const protectedFile = file && (
      path.basename(file) === "appstate.json" ||
      path.basename(file) === path.basename(DASHBOARD_STATE_PATH) ||
      isInside(file, path.join(ROOT, ".git")) ||
      isInside(file, path.join(ROOT, "node_modules")) ||
      isInside(file, path.join(ROOT, "attached_assets"))
    );
    if (!file || protectedFile || !fs.existsSync(file) || !fs.statSync(file).isFile() || !allowedExtensions.has(extension)) {
      sendJson(response, 403, { error: "This file cannot be edited from the dashboard." });
      return true;
    }
    if (!source || Buffer.byteLength(source) > MAX_FILE) {
      sendJson(response, 422, { error: "File content is empty or too large." });
      return true;
    }
    try {
      if (extension === ".js") new (require("vm").Script)(source, { filename: path.basename(file) });
      if (extension === ".json") JSON.parse(source);
      fs.writeFileSync(file, source, { encoding: "utf8", mode: 0o600 });
      addLog("OK", "Workspace file saved", `file=${path.relative(ROOT, file)}`);
      mutateAndBroadcast();
      sendJson(response, 200, { ok: true, path: path.relative(ROOT, file), size: Buffer.byteLength(source) });
    } catch (error) {
      sendJson(response, 422, { error: `Unable to save file: ${error.message}` });
    }
    return true;
  }

  if (pathname === "/api/files/tree" && request.method === "GET") {
    if (!requireAuth(request, response)) return true;
    const skip = new Set([".git", "node_modules", ".cache", "android", "build", "dist", "attached_assets", "appstate.json", path.basename(DASHBOARD_STATE_PATH)]);
    function walk(directory, depth = 0) {
      if (depth > 3) return [];
      let entries;
      try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return []; }
      return entries.filter((entry) => !skip.has(entry.name) && !entry.name.startsWith("."))
        .map((entry) => {
          const full = path.join(directory, entry.name);
          if (entry.isDirectory()) return { name: entry.name, type: "dir", path: path.relative(ROOT, full), children: walk(full, depth + 1) };
          const ext = path.extname(entry.name).toLowerCase();
          return [".js", ".json", ".md", ".txt", ".css", ".html"].includes(ext)
            ? { name: entry.name, type: "file", path: path.relative(ROOT, full), ext }
            : null;
        }).filter(Boolean).sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1);
    }
    sendJson(response, 200, { ok: true, tree: walk(ROOT) });
    return true;
  }

  if (pathname === "/api/files/read" && request.method === "GET") {
    if (!requireAuth(request, response)) return true;
    const file = safeWorkspacePath(searchParams.get("path") || "");
    if (!file || !fs.existsSync(file) || path.basename(file) === "appstate.json") {
      sendJson(response, 404, { error: "File not found or protected." });
      return true;
    }
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > MAX_FILE || ![".js", ".json", ".md", ".txt", ".css", ".html"].includes(path.extname(file).toLowerCase())) {
      sendJson(response, 413, { error: "File type or size is not allowed." });
      return true;
    }
    sendJson(response, 200, { ok: true, path: path.relative(ROOT, file), content: fs.readFileSync(file, "utf8"), size: stat.size });
    return true;
  }

  sendJson(response, 404, { error: "API route not found." });
  return true;
}

function sendFile(response, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(error.code === "ENOENT" ? "Not found" : "Unable to read file");
      return;
    }
    const contentTypes = {
      ".html": "text/html; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".ico": "image/x-icon",
    };
    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(data);
  });
}

const server = http.createServer(async (request, response) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "SAMEORIGIN");
  response.setHeader("Referrer-Policy", "same-origin");
  response.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data: https://image.pollinations.ai; style-src 'self' 'unsafe-inline'; connect-src 'self';");

  const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  try {
    if (requestUrl.pathname === "/health" && (request.method === "GET" || request.method === "HEAD")) {
      sendJson(response, 200, {
        ok: true,
        status: "running",
        messenger: messengerRuntime?.snapshot().status || "starting",
        uptime: Math.floor(process.uptime()),
        timestamp: Date.now(),
      });
      return;
    }
    if (requestUrl.pathname.startsWith("/api/")) {
      await handleApi(request, response, requestUrl);
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end("Method not allowed");
      return;
    }
    const requestedPath = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
    const filePath = safeWorkspacePath(requestedPath);
    if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    sendFile(response, filePath);
  } catch (error) {
    console.error("[Cypher] request error:", error);
    if (!response.headersSent) sendJson(response, 500, { error: "Internal server error." });
  }
});

setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions) if (session.expiresAt <= now) sessions.delete(token);
  for (const [ip, attempt] of loginAttempts) if (attempt.resetAt <= now) loginAttempts.delete(ip);
  for (const [ip, attempt] of csrfFailures) if (attempt.resetAt <= now) csrfFailures.delete(ip);
  broadcast("heartbeat", { now });
}, 15_000).unref();

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[Cypher] Dashboard available on port ${PORT}`);
  console.log(`[Cypher] ${getCommandCatalog().length} commands catalogued (${getCommandCatalog().filter((item) => item.source === "veil").length} from Veil)`);
});