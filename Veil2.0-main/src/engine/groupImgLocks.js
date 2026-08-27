/**
 * Veil — groupImgLocks
 * Compatible with ZAO-ENGINE/groupImgLocks API.
 * Manages group image lock state.
 */
"use strict";

function _ensure() {
  if (!global._groupImgLocks) global._groupImgLocks = {};
}

function getLock(tid) {
  _ensure();
  const l = global._groupImgLocks[String(tid)];
  return l && l.active ? l : null;
}

function setLock(tid, opts) {
  _ensure();
  global._groupImgLocks[String(tid)] = Object.assign({ active: true, time: 30000 }, opts || {});
}

function clearLock(tid) {
  _ensure();
  const key = String(tid);
  if (global._groupImgLocks[key]) {
    global._groupImgLocks[key].active = false;
    return true;
  }
  return false;
}

function getLocks() {
  _ensure();
  const m = new Map();
  for (const [tid, l] of Object.entries(global._groupImgLocks)) {
    if (l && l.active) m.set(String(tid), l);
  }
  return m;
}

module.exports = { getLock, setLock, clearLock, getLocks };
