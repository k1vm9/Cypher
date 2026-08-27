/**
 * Veil — nicknameLocks bridge
 * Compatible with ZAO-ENGINE/nicknameLocks API.
 * Bridges into global._nickLocks used by nick.js
 */
"use strict";

function _ensure() {
  if (!global._nickLocks) global._nickLocks = {};
}

function getLock(tid) {
  _ensure();
  const l = global._nickLocks[String(tid)];
  if (!l || !l.active) return null;
  return {
    nickname: l.globalName || "",
    scope:    l._scope || (l.globalName ? "bot" : null),
  };
}

function setLock(tid, nickname, scope) {
  _ensure();
  const key = String(tid);
  const existing = global._nickLocks[key] || {};
  if (scope === "bot") {
    global._nickLocks[key] = Object.assign({}, existing, {
      active:     true,
      globalName: String(nickname),
      perUser:    existing.perUser || {},
      _scope:     "bot",
    });
  } else {
    global._nickLocks[key] = Object.assign({}, existing, {
      active:     true,
      globalName: String(nickname),
      perUser:    existing.perUser || {},
      _scope:     scope || "all",
    });
  }
}

function clearLock(tid) {
  _ensure();
  const key = String(tid);
  if (global._nickLocks[key]) {
    global._nickLocks[key].active = false;
    global._nickLocks[key]._scope = null;
    return true;
  }
  return false;
}

function getLocks() {
  _ensure();
  const m = new Map();
  for (const [tid, l] of Object.entries(global._nickLocks)) {
    if (l && l.active) m.set(String(tid), { nickname: l.globalName || "", scope: l._scope || "all" });
  }
  return m;
}

function setMembers(tid, membersMap, opts) {
  _ensure();
  const key   = String(tid);
  const scope = opts?.scope || "all";
  const templ = opts?.template || "";
  const perUser = {};
  for (const [uid, nick] of membersMap) perUser[String(uid)] = nick;
  global._nickLocks[key] = Object.assign({}, global._nickLocks[key] || {}, {
    active:     true,
    globalName: templ,
    perUser,
    _scope:     scope,
  });
}

module.exports = { getLock, setLock, clearLock, getLocks, setMembers };
