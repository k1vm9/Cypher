"use strict";

const fs = require("fs");

function callbackCall(fn, args = []) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (error, value) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve(value);
    };
    try {
      fn(...args, done);
    } catch (error) {
      done(error);
    }
  });
}

function normalizeThread(thread) {
  if (!thread || !thread.threadID) return null;
  return {
    id: String(thread.threadID),
    name: String(thread.name || thread.threadName || "Unnamed conversation"),
    type: thread.isGroup ? "group" : "direct",
    members: Number(thread.participantIDs?.length || thread.participants?.length || 0),
    unread: Number(thread.unreadCount || 0),
  };
}

function normalizeEvent(event, currentUserID) {
  if (!event || !event.threadID || (!event.body && event.type !== "message")) return null;
  return {
    id: String(event.messageID || `live_${Date.now()}`),
    sender: String(event.senderName || event.senderID || "Messenger user"),
    content: String(event.body || ""),
    time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    status: event.senderID === currentUserID ? "Sent" : "Received",
    threadID: String(event.threadID),
    kind: event.senderID === currentUserID ? "bot" : "incoming",
  };
}

class MessengerRuntime {
  constructor({ appStatePath, onStatus, onMessage, onLog }) {
    this.appStatePath = appStatePath;
    this.onStatus = onStatus;
    this.onMessage = onMessage;
    this.onLog = onLog;
    this.api = null;
    this.listener = null;
    this.currentUserID = "";
    this.status = fs.existsSync(this.appStatePath) ? "stored" : "no-session";
    this.error = "";
    this.connectedAt = null;
    this.startPromise = null;
    this.clientPackage = "";
    this.reconnectTimer = null;
    this.healthTimer = null;
    this.reconnectAttempts = 0;
    this.stoppedByUser = false;
  }

  snapshot() {
    return {
      status: this.status,
      connected: this.status === "connected",
      hasSession: fs.existsSync(this.appStatePath),
      userID: this.currentUserID || null,
      connectedAt: this.connectedAt,
      error: this.error || null,
      client: this.clientPackage || null,
      reconnectAttempts: this.reconnectAttempts,
    };
  }

  setStatus(status, error = "") {
    this.status = status;
    this.error = error;
    this.onStatus?.(this.snapshot());
  }

  readAppState() {
    try {
      const value = JSON.parse(fs.readFileSync(this.appStatePath, "utf8"));
      if (!Array.isArray(value) || !value.length) throw new Error("Session file must contain a non-empty cookie array.");
      return value;
    } catch (error) {
      throw new Error(`Unable to read session file: ${error.message}`);
    }
  }

  async start(appState = null) {
    if (this.startPromise) return this.startPromise;
    if (this.status === "connected") return this.snapshot();
    this.stoppedByUser = false;
    this.startPromise = (async () => {
      let login;
      const candidates = ["@dongdev/fca-unofficial", "@xaviabot/fca-unofficial", "fca-prjvt"];
      for (const candidate of candidates) {
        try {
          login = require(candidate);
          this.clientPackage = candidate;
          break;
        } catch {
          // Try the next compatible client before reporting the dependency error.
        }
      }
      if (!login) {
        this.setStatus("dependency-missing", "Messenger client package is not installed.");
        return this.snapshot();
      }
      let cookies;
      try {
        cookies = appState || this.readAppState();
      } catch (error) {
        this.setStatus("no-session", error.message);
        return this.snapshot();
      }
      this.setStatus("connecting");
      this.onLog?.("INFO", "Connecting to Messenger", "transport=fca");
      try {
        await new Promise((resolve, reject) => {
          login({ appState: cookies }, (error, api) => {
            if (error) return reject(error);
            if (!api) return reject(new Error("Messenger client returned no API."));
            this.api = api;
            try {
              this.currentUserID = String(api.getCurrentUserID?.() || "");
              this.listener = api.listenMqtt?.((listenError, event) => {
                if (listenError) {
                  this.handleTransportError(listenError);
                  return;
                }
                const message = normalizeEvent(event, this.currentUserID);
                if (message) this.onMessage?.(message);
              });
            } catch (listenerError) {
              return reject(listenerError);
            }
            resolve();
          });
        });
        this.connectedAt = Date.now();
        this.reconnectAttempts = 0;
        this.setStatus("connected");
        this.startHealthMonitor();
        this.onLog?.("OK", "Messenger session connected", this.currentUserID ? `user=${this.currentUserID}` : "");
      } catch (error) {
        this.api = null;
        this.listener = null;
        const message = String(error?.errorDescription || error?.message || error || "Messenger login failed").slice(0, 240);
        this.setStatus("auth-error", message);
        this.onLog?.("ERROR", "Messenger session failed", "credentials rejected or expired");
      }
      return this.snapshot();
    })().finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  async stop() {
    this.stoppedByUser = true;
    this.clearTimers();
    const api = this.api;
    this.api = null;
    this.listener = null;
    this.currentUserID = "";
    this.connectedAt = null;
    try {
      if (api?.logout) await callbackCall(api.logout.bind(api));
    } catch {
      // The local bridge is stopped even if the provider does not acknowledge logout.
    }
    this.setStatus(fs.existsSync(this.appStatePath) ? "stopped" : "no-session");
    this.onLog?.("WARN", "Messenger bridge stopped");
    return this.snapshot();
  }

  clearTimers() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.healthTimer) clearInterval(this.healthTimer);
    this.reconnectTimer = null;
    this.healthTimer = null;
  }

  startHealthMonitor() {
    if (this.healthTimer) clearInterval(this.healthTimer);
    this.healthTimer = setInterval(async () => {
      if (this.status !== "connected" || typeof this.api?.getThreadList !== "function") return;
      try {
        await callbackCall(this.api.getThreadList.bind(this.api), [1, null, ["INBOX"]]);
      } catch (error) {
        this.handleTransportError(error);
      }
    }, 90_000);
    this.healthTimer.unref?.();
  }

  handleTransportError(error) {
    const detail = String(error?.message || error || "transport unavailable").slice(0, 180);
    this.onLog?.("WARN", "Messenger transport degraded", `transport=mqtt · ${detail}`);
    if (this.status === "connected") {
      this.connectedAt = null;
      this.setStatus("offline", "Messenger transport stopped responding.");
    }
    this.scheduleReconnect();
  }

  scheduleReconnect() {
    if (this.stoppedByUser || !fs.existsSync(this.appStatePath) || this.reconnectTimer) return;
    if (this.reconnectAttempts >= 5) {
      this.setStatus("offline", "Automatic reconnect paused after 5 attempts. Use Connect session to retry.");
      return;
    }
    this.reconnectAttempts += 1;
    const delay = Math.min(60_000, 2_000 * (2 ** (this.reconnectAttempts - 1)));
    this.onLog?.("INFO", "Messenger reconnect scheduled", `attempt=${this.reconnectAttempts} · delay=${Math.round(delay / 1000)}s`);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      await this.start();
    }, delay);
    this.reconnectTimer.unref?.();
  }

  getThreads() {
    if (this.status !== "connected" || typeof this.api?.getThreadList !== "function") return [];
    return callbackCall(this.api.getThreadList.bind(this.api), [100, null, ["INBOX"]])
      .then((threads) => (Array.isArray(threads) ? threads.map(normalizeThread).filter(Boolean) : []))
      .catch((error) => {
        this.onLog?.("WARN", "Unable to load Messenger conversations", "request=getThreadList");
        throw error;
      });
  }

  getMessages(threadID, limit = 50) {
    if (this.status !== "connected" || typeof this.api?.getThreadHistory !== "function") return [];
    return callbackCall(this.api.getThreadHistory.bind(this.api), [threadID, limit, null])
      .then((messages) => (Array.isArray(messages) ? messages.map((event) => normalizeEvent({ ...event, threadID }, this.currentUserID)).filter(Boolean).reverse() : []));
  }

  getThreadInfo(threadID) {
    if (this.status !== "connected" || typeof this.api?.getThreadInfo !== "function") {
      return Promise.reject(new Error("Connect a valid Messenger session before loading group information."));
    }
    return callbackCall(this.api.getThreadInfo.bind(this.api), [String(threadID)]);
  }

  markRead(threadID) {
    if (this.status !== "connected" || typeof this.api?.markAsRead !== "function") {
      return Promise.reject(new Error("Connect a valid Messenger session before marking a thread read."));
    }
    return callbackCall(this.api.markAsRead.bind(this.api), [String(threadID)]);
  }

  setThreadTitle(threadID, title) {
    if (this.status !== "connected" || typeof this.api?.setTitle !== "function") {
      return Promise.reject(new Error("This Messenger client cannot rename threads."));
    }
    return callbackCall(this.api.setTitle.bind(this.api), [String(title), String(threadID)]);
  }

  setNickname(threadID, userID, nickname) {
    if (this.status !== "connected" || typeof this.api?.changeNickname !== "function") {
      return Promise.reject(new Error("This Messenger client cannot change nicknames."));
    }
    return callbackCall(this.api.changeNickname.bind(this.api), [String(nickname), String(threadID), String(userID)]);
  }

  addMember(threadID, userID) {
    if (this.status !== "connected" || typeof this.api?.addUserToGroup !== "function") {
      return Promise.reject(new Error("This Messenger client cannot add members."));
    }
    return callbackCall(this.api.addUserToGroup.bind(this.api), [String(userID), String(threadID)]);
  }

  removeMember(threadID, userID) {
    if (this.status !== "connected" || typeof this.api?.removeUserFromGroup !== "function") {
      return Promise.reject(new Error("This Messenger client cannot remove members."));
    }
    return callbackCall(this.api.removeUserFromGroup.bind(this.api), [String(userID), String(threadID)]);
  }

  sendMessage(threadID, body) {
    if (this.status !== "connected" || typeof this.api?.sendMessage !== "function") {
      return Promise.reject(new Error("Connect a valid Messenger session before sending messages."));
    }
    return callbackCall(this.api.sendMessage.bind(this.api), [String(body), threadID]);
  }
}

module.exports = { MessengerRuntime };