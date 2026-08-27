"use strict";
const fs   = require("fs-extra");
const path = require("path");

function makePersist(filename) {
  const FILE = path.join(process.cwd(), "data", filename);
  fs.ensureDirSync(path.dirname(FILE));
  return {
    persistAll(data) {
      const safe = {};
      for (const [k, v] of Object.entries(data || {})) {
        const { interval: _iv, shouldSend: _ss, ...rest } = v || {};
        safe[k] = rest;
      }
      try { fs.writeJsonSync(FILE, safe, { spaces: 2 }); } catch (_) {}
    },
    loadAll() {
      try { return fs.readJsonSync(FILE) || {}; } catch (_) { return {}; }
    },
  };
}

module.exports.motor1 = makePersist("motor1-persist.json");
module.exports.motor2 = makePersist("motor2-persist.json");
