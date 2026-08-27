/**
 * Veil — nickProtect
 * Compatible with ZAO-ENGINE/nickProtect API.
 * Snapshot-based nickname protection.
 */
"use strict";

function _ensure() {
  if (!global._nickProtect) global._nickProtect = {};
}

function isEnabled(tid) {
  _ensure();
  return !!(global._nickProtect[String(tid)]?.enabled);
}

function enable(tid, snapshots) {
  _ensure();
  global._nickProtect[String(tid)] = { enabled: true, snapshots: snapshots || {} };
}

function disable(tid) {
  _ensure();
  if (global._nickProtect[String(tid)]) {
    global._nickProtect[String(tid)].enabled = false;
  }
}

function getSnapshot(tid) {
  _ensure();
  return global._nickProtect[String(tid)]?.snapshots || {};
}

module.exports = { isEnabled, enable, disable, getSnapshot };
