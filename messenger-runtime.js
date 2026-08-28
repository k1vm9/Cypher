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
    sender: String(event.senderID || "Messenger user"),
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
    this.status = "no-session";
    this.error = "";
    this.connectedAt = null;
    this.startPromise = null;
  }

  snapshot() {
    return {
      status: this.status,
      connected: this.status === "connected",
      hasSession: fs.existsSync(this.appStatePath),
      userID: this.currentUserID || null,
      connectedAt: this.connectedAt,
      error: this.error || null,
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
    this.startPromise = (async () => {
      let login;
      try {
        login = require("@dongdev/fca-unofficial");
      } catch {
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
                  this.onLog?.("WARN", "Messenger listener error", "transport=mqtt");
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
        this.setStatus("connected");
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

  sendMessage(threadID, body) {
    if (this.status !== "connected" || typeof this.api?.sendMessage !== "function") {
      return Promise.reject(new Error("Connect a valid Messenger session before sending messages."));
    }
    return callbackCall(this.api.sendMessage.bind(this.api), [String(body), threadID]);
  }
}

module.exports = { MessengerRuntime };