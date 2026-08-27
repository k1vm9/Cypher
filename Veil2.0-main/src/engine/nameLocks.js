/**
 * Veil — nameLocks bridge
 * Compatible with ZAO-ENGINE/nameLocks API.
 * Bridges into global._nmLocks used by nm.js
 */
"use strict";

function _ensure() {
  if (!global._nmLocks) global._nmLocks = {};
}

function getLock(tid) {
  _ensure();
  const l = global._nmLocks[String(tid)];
  if (!l || !l.active || !l.name) return null;
  return { name: l.name };
}

function setLock(tid, name) {
  _ensure();
  const key = String(tid);
  global._nmLocks[key] = Object.assign({}, global._nmLocks[key] || {}, {
    active: true,
    name: String(name),
    minDelay: (global._nmLocks[key] || {}).minDelay ?? 30,
    maxDelay: (global._nmLocks[key] || {}).maxDelay ?? 60,
  });
}

function clearLock(tid) {
  _ensure();
  const key = String(tid);
  if (global._nmLocks[key]) {
    global._nmLocks[key].active = false;
    return true;
  }
  return false;
}

function getLocks() {
  _ensure();
  const m = new Map();
  for (const [tid, l] of Object.entries(global._nmLocks)) {
    if (l && l.active && l.name) m.set(String(tid), { name: l.name });
  }
  return m;
}

module.exports = { getLock, setLock, clearLock, getLocks };
