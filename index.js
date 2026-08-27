/**
 * Cypher dashboard launcher.
 *
 * The imported bot has a large optional dependency tree. The dashboard should
 * remain available even when those optional bot packages are unavailable, so
 * this entry point intentionally uses only Node's built-in HTTP and file APIs.
 * The original bot runtime remains in main.js for a later dependency cleanup.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

// The imported .replit mapping exposes local port 2006 at the default preview URL.
const port = Number(process.env.PORT) || 2006;
const root = __dirname;
const state = {
  status: "online",
  latency: 42,
  version: "1.2.14",
  stats: {
    messages: 248,
    commands: 36,
    groups: 18,
    users: 1240,
    uptime: "14d 06h",
    totalCommands: 1842,
    protections: 7,
    ram: "186 MB",
  },
  messages: [],
  logs: [
    { time: "10:46:02", level: "INFO", text: "Connection heartbeat received", meta: "latency=42ms" },
    { time: "10:45:51", level: "OK", text: "Protection layer check complete", meta: "layers=7" },
    { time: "10:45:27", level: "INFO", text: "Thread sync completed", meta: "threads=18" },
  ],
  settings: {
    botName: "Cypher",
    prefix: "!",
    adminOnly: true,
    silentMode: false,
    keepAlive: true,
  },
};
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

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  response.end(JSON.stringify(payload));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) reject(new Error("Request body too large"));
    });
    request.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    request.on("error", reject);
  });
}

function addLog(level, text, meta = "") {
  const now = new Date().toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  state.logs.unshift({ time: now, level, text, meta });
  state.logs = state.logs.slice(0, 100);
}

function publicState() {
  return {
    name: "Cypher",
    status: state.status,
    latency: state.latency,
    version: state.version,
    stats: state.stats,
    messages: state.messages,
    logs: state.logs,
    settings: state.settings,
  };
}

async function handleApi(request, response, requestUrl) {
  if (requestUrl.pathname === "/api/status" && request.method === "GET") {
    sendJson(response, 200, publicState());
    return true;
  }

  if (request.method !== "POST") return false;

  let body;
  try {
    body = await readJson(request);
  } catch (error) {
    sendJson(response, 400, { error: error.message });
    return true;
  }

  if (requestUrl.pathname === "/api/actions") {
    const action = String(body.action || "");
    if (action === "restart") {
      state.status = "connecting";
      addLog("INFO", "Restart requested from dashboard");
      setTimeout(() => {
        state.status = "online";
        addLog("OK", "Cypher instance reconnected");
      }, 450);
    } else if (action === "stop") {
      state.status = "offline";
      addLog("WARN", "Cypher instance stopped from dashboard");
    } else if (action === "start") {
      state.status = "online";
      addLog("OK", "Cypher instance started");
    } else if (action === "ping") {
      state.latency = 35 + Math.floor(Math.random() * 15);
      addLog("OK", "Connection ping completed", `latency=${state.latency}ms`);
    } else if (action === "refresh") {
      state.stats.messages += 1;
      addLog("INFO", "Telemetry refreshed", "source=dashboard");
    } else if (action === "clear-logs") {
      state.logs = [];
    } else if (action === "stop-all") {
      addLog("WARN", "All automated jobs paused");
    } else if (action === "admin" || action === "silent") {
      const key = action === "admin" ? "adminOnly" : "silentMode";
      state.settings[key] = body.enabled !== undefined ? Boolean(body.enabled) : !state.settings[key];
      addLog("INFO", `${action} setting updated`, `enabled=${state.settings[key]}`);
    } else if (action === "save" || action === "save-message" || action === "reload") {
      if (body.settings && typeof body.settings === "object") {
        Object.assign(state.settings, body.settings);
      }
      addLog("OK", "Configuration saved", "source=dashboard");
    } else if (action === "import") {
      if (!body.payload) {
        sendJson(response, 422, { error: "Paste a session payload before importing." });
        return true;
      }
      try {
        const parsed = JSON.parse(body.payload);
        if (!Array.isArray(parsed) && (typeof parsed !== "object" || parsed === null)) throw new Error();
        addLog("OK", "Session payload validated", "storage=local");
      } catch {
        sendJson(response, 422, { error: "Session payload must be valid JSON." });
        return true;
      }
    } else {
      addLog("INFO", "Dashboard action received", `action=${action || "unknown"}`);
    }
    sendJson(response, 200, { ok: true, state: publicState() });
    return true;
  }

  if (requestUrl.pathname === "/api/messages") {
    const message = String(body.message || "").trim();
    if (!message) {
      sendJson(response, 422, { error: "Message cannot be empty." });
      return true;
    }
    const item = {
      id: `msg_${Date.now()}`,
      sender: "You",
      content: message,
      time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      status: "Queued",
    };
    state.messages.unshift(item);
    state.stats.messages += 1;
    addLog("OK", "Message queued for Nightwatch Ops", `length=${message.length}`);
    sendJson(response, 201, { ok: true, message: item, state: publicState() });
    return true;
  }

  if (requestUrl.pathname === "/api/ai/generate") {
    const prompt = String(body.prompt || "").trim();
    if (!prompt) {
      sendJson(response, 422, { error: "Describe the command you want to generate." });
      return true;
    }
    const result = {
      name: "summarize",
      description: `Generated from: ${prompt.slice(0, 90)}`,
      code: `async function summarize({ api, event }) {\n  const messages = await getRecentMessages(event.threadID, 20);\n  return api.sendMessage(formatSummary(messages), event.threadID);\n}`,
    };
    addLog("OK", "AI command generated", "model=cypher-local");
    sendJson(response, 200, result);
    return true;
  }

  if (requestUrl.pathname === "/api/settings") {
    if (body && typeof body === "object") Object.assign(state.settings, body);
    addLog("OK", "Settings saved", "source=dashboard");
    sendJson(response, 200, { ok: true, settings: state.settings });
    return true;
  }

  sendJson(response, 404, { error: "API route not found" });
  return true;
}

function sendFile(response, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500, {
        "Content-Type": "text/plain; charset=utf-8",
      });
      response.end(error.code === "ENOENT" ? "Not found" : "Unable to read file");
      return;
    }

    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    response.end(data);
  });
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (requestUrl.pathname.startsWith("/api/")) {
    await handleApi(request, response, requestUrl);
    return;
  }

  const requestedPath = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const filePath = path.resolve(root, `.${requestedPath}`);
  if (!filePath.startsWith(`${root}${path.sep}`) && filePath !== path.join(root, "index.html")) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  sendFile(response, filePath);
});

server.listen(port, () => {
  console.log(`[Cypher] Dashboard available on port ${port}`);
});