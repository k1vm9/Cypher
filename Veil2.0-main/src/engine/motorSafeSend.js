/**
 * Veil — motorSafeSend
 * Compatible with ZAO-ENGINE/motorSafeSend API.
 * Manages motor (auto-message) loop scheduling.
 */
"use strict";

const _loopStats = {};  // tid → { lastSentAt, nextSendAt }

function _pickDelay(data) {
  if (data.randomTime && data.randomRange) {
    const { min, max } = data.randomRange;
    return Math.round(min + Math.random() * (max - min));
  }
  return Number(data.time) || 30000;
}

function scheduleMotorLoop({ api, threadID, getData, onDisable }) {
  const tid = String(threadID);

  async function fire() {
    const data = getData();
    if (!data || !data.status) {
      if (typeof onDisable === "function") { try { onDisable(); } catch (_) {} }
      return;
    }
    if (!data.message) return;

    // Check shouldSend gate (motor 2 smart mode)
    if (typeof data.shouldSend === "function" && !data.shouldSend()) {
      const nextMs = _pickDelay(data);
      _loopStats[tid] = { lastSentAt: _loopStats[tid]?.lastSentAt || null, nextSendAt: Date.now() + nextMs };
      data.interval = setTimeout(fire, nextMs);
      return;
    }

    try {
      const liveApi = global._botApi || api;
      await liveApi.sendMessage(data.message, tid);
      _loopStats[tid] = { lastSentAt: Date.now(), nextSendAt: null };
      if (typeof global._saveMotorState === "function") { try { global._saveMotorState(); } catch (_) {} }
    } catch (e) {
      console.error(`[Motor] tid=${tid} send error: ${e.message}`);
    }

    const d2 = getData();
    if (!d2 || !d2.status) {
      if (typeof onDisable === "function") { try { onDisable(); } catch (_) {} }
      return;
    }
    const nextMs = _pickDelay(d2);
    _loopStats[tid] = { ..._loopStats[tid], nextSendAt: Date.now() + nextMs };
    d2.interval = setTimeout(fire, nextMs);
  }

  const data = getData();
  if (!data) return;
  const initialMs = _pickDelay(data);
  _loopStats[tid] = { lastSentAt: null, nextSendAt: Date.now() + initialMs };
  data.interval = setTimeout(fire, initialMs);
}

function getLoopStats(threadID) {
  return _loopStats[String(threadID)] || { lastSentAt: null, nextSendAt: null };
}

function stopMotorLoop(threadID) {
  const tid = String(threadID);
  delete _loopStats[tid];
}

function isActiveLoop(threadID) {
  const tid = String(threadID);
  const stats = _loopStats[tid];
  if (!stats) return false;
  if (stats.nextSendAt && (Date.now() - stats.nextSendAt) > 120000) return false;
  return true;
}

module.exports = { scheduleMotorLoop, getLoopStats, stopMotorLoop, isActiveLoop };
