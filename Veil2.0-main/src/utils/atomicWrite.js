"use strict";
const fs   = require("fs");
const path = require("path");

function atomicWriteJsonSync(filePath, data, opts = {}) {
  const json = JSON.stringify(data, null, opts.spaces ?? 2);
  const tmp  = filePath + ".tmp." + process.pid;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(tmp, json, "utf8");
    const fd = fs.openSync(tmp, "r+");
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, filePath);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (_) {}
    throw e;
  }
}

module.exports = { atomicWriteJsonSync };
