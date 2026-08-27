"use strict";
module.exports = {
  setAdmins(ids) {
    const list = (ids || []).map(String).filter(Boolean);
    if (global.config) global.config.adminBot = list;
    if (global.GoatBot?.config) global.GoatBot.config.adminBot = list;
  },
  persistHint() {
    return `\n\n⚠️ التغيير مؤقت حتى إعادة التشغيل — حدّث ADMINBOT في لوحة التحكم لتثبيته.`;
  },
};
