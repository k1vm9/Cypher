'use strict';

module.exports.config = {
  name:            'ping',
  aliases:         ['وضع', 'status', 'حالة', 'pong', 'صحة'],
  version:         '2.0.0',
  hasPermssion:    0,
  credits:         'ZAO Team',
  description:     'فحص سرعة استجابة البوت وصحة النظام',
  commandCategory: 'معلومات',
  usages:          'ping',
  cooldowns:       5,
};

function _fmtUptime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s  / 60);
  const h = Math.floor(m  / 60);
  const d = Math.floor(h  / 24);
  if (d > 0) return `${d}ي ${h % 24}س ${m % 60}د`;
  if (h > 0) return `${h}س ${m % 60}د`;
  if (m > 0) return `${m}د ${s % 60}ث`;
  return `${s}ث`;
}

function _fmtMem(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB';
  return (bytes / 1024 / 1024).toFixed(0) + ' MB';
}

module.exports.run = async function ({ api, event }) {
  const { threadID, messageID } = event;
  const t0 = Date.now();

  await new Promise(resolve => {
    api.sendMessage('🏓 جاري القياس...', threadID, (err, info) => {
      if (info?.messageID) {
        try { api.unsendMessage(info.messageID); } catch (_) {}
      }
      resolve();
    });
  });

  const rtt = Date.now() - t0;
  const rttLabel =
    rtt < 300  ? '🟢 ممتاز' :
    rtt < 700  ? '🟡 جيد'  :
    rtt < 1500 ? '🟠 متوسط' :
                 '🔴 بطيء';

  const mem      = process.memoryUsage();
  const uptime   = _fmtUptime(Date.now() - (global.GoatBot?.startTime || Date.now()));
  const heapUsed = _fmtMem(mem.heapUsed);
  const heapTot  = _fmtMem(mem.heapTotal);
  const rss      = _fmtMem(mem.rss);

  const cmdCount = global.GoatBot?.commands?.size ?? global.client?.commands?.size ?? '—';

  let mqttStatus = '—';
  try {
    const last = Number(global.lastMqttActivity || 0);
    if (last) {
      const ago = Math.round((Date.now() - last) / 1000);
      mqttStatus = ago < 60 ? `🟢 منذ ${ago}ث` : ago < 300 ? `🟡 منذ ${Math.round(ago/60)}د` : `🔴 صامت ${Math.round(ago/60)}د`;
    }
  } catch (_) {}

  const lines = [
    `🏓 Veil Bot — فحص الصحة`,
    ``,
    `⚡ الاستجابة : ${rtt}ms  ${rttLabel}`,
    `⏱️ مدة التشغيل: ${uptime}`,
    ``,
    `💾 الذاكرة:`,
    `   Heap : ${heapUsed} / ${heapTot}`,
    `   RSS  : ${rss}`,
    ``,
    `📡 MQTT      : ${mqttStatus}`,
    `🔒 قفل      : ${global._botLocked ? '🔴 مقفول' : '🟢 مفتوح'}`,
    `🔇 صامت     : ${global._silentMode ? '🔕 مفعّل' : '🔔 متوقف'}`,
    `📋 الأوامر   : ${cmdCount} أمر`,
    `⚙️ Node.js   : ${process.version}`,
  ];

  return api.sendMessage(lines.join('\n'), threadID, messageID);
};

module.exports.onStart = module.exports.run;
