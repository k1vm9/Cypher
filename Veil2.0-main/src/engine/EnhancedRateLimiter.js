"use strict";
module.exports = {
  getStatus() { return { requests: 0, limit: 1000, remaining: 1000, resets: "—" }; },
  check()  { return true; },
  record() {},
};
