/**
 * cp.js — أمر التحكم (Bot Control Panel)
 * @debugger Djamel — Fixed handleEvent crash: senderID.toString() on undefined
 *   for log:* events. Added type guard and optional-chain safety on ADMINBOT.
 */
module.exports.config = {
  name: "التحكم",
  version: "1.1.0",
  hasPermssion: 2,
  credits: "Saint",
  description: "إدارة الغروبات وطلبات المراسلة",
  commandCategory: "إدارة البوت",
  usages: "",
  cooldowns: 5,
  prefix: true
};

module.exports.languages = {
  "vi": {},
  "en": {}
};

module.exports.onLoad = () => {
  global.chatsSession = global.chatsSession || {};
  global.motorData = global.motorData || {};
  global.motorData2 = global.motorData2 || {};
  global.lastActivity = global.lastActivity || {};
};

function startMotor(api, threadID) {
  const data = global.motorData[threadID];
  if (!data || !data.message || !data.time) return;
  if (data.interval) { clearInterval(data.interval); data.interval = null; }
  data.status = true;
  data.interval = setInterval(() => {
    const botApi = global._botApi || api;
    const r = botApi.sendMessage(data.message, threadID);
    if (r && typeof r.catch === 'function') r.catch(() => {});
  }, data.time);
}

function startMotor2(api, threadID) {
  const data = global.motorData2[threadID];
  if (!data || !data.message || !data.time) return;
  if (data.interval) { clearInterval(data.interval); data.interval = null; }
  data.status = true;
  data.interval = setInterval(() => {
    const botApi = global._botApi || api;
    const lastActive = global.lastActivity[threadID];
    if (!lastActive) return;
    if (Date.now() - lastActive < data.time * 2) {
      const r = botApi.sendMessage(data.message, threadID);
      if (r && typeof r.catch === 'function') r.catch(() => {});
    }
  }, data.time);
}

function stopMotor(threadID) {
  const data = global.motorData[threadID];
  if (data?.interval) { clearInterval(data.interval); data.interval = null; }
  if (data) data.status = false;
}

function stopMotor2(threadID) {
  const data = global.motorData2[threadID];
  if (data?.interval) { clearInterval(data.interval); data.interval = null; }
  if (data) data.status = false;
}

async function getThreadList(api, tags) {
  try {
    const result = await api.getThreadList(60, null, tags);
    return Array.isArray(result) ? result : (result?.data || []);
  } catch (e) { return []; }
}

function timeAgo(ts) {
  if (!ts) return "—";
  const diff = Date.now() - Number(ts);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `${m}د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}س`;
  return `${Math.floor(h / 24)}ي`;
}

function parseTime(input) {
  let ms = 0;
  if (input.endsWith("s")) ms = parseFloat(input) * 1000;
  else if (input.endsWith("m")) ms = parseFloat(input) * 60 * 1000;
  return ms;
}

module.exports.handleEvent = async function ({ api, event }) {
  const { senderID, threadID, messageReply, body, isGroup, type } = event;
  if (type !== "message" && type !== "message_reply") return;
  if (!senderID || !threadID) return;
  if (isGroup && String(senderID) !== String(global.config?.BOTID || global.botUserID || "")) {
    global.lastActivity[threadID] = Date.now();
  }
  if (!global.config?.ADMINBOT?.includes(String(senderID))) return;
  if (!messageReply) return;
  if (!body || !body.trim()) return;
  const session = global.chatsSession[senderID];
  if (!session) return;
  if (messageReply.messageID !== session.botMessageID) return;
  const input = body.trim();
  const { step } = session;

  if (step === "main") {
    if (input === "1") {
      api.sendMessage("⏳ جاري جلب طلبات المراسلة...", threadID);
      const pending = await getThreadList(api, ["PENDING"]);
      const other = await getThreadList(api, ["OTHER"]);
      const requests = [...pending, ...other].filter(r => r?.threadID);
      if (!requests.length) return api.sendMessage("📭 لا توجد طلبات مراسلة.", threadID);
      let msg = `📬 طلبات المراسلة (${requests.length})\n━━━━━━━━━━━━━━━\n`;
      const list = [];
      requests.slice(0, 20).forEach((r, i) => {
        const name = r.name || r.threadName || ("ID: " + r.threadID);
        const type = r.isGroup ? "👥" : "👤";
        msg += `${i + 1}. ${type} ${name}\n🆔 ${r.threadID}\n\n`;
        list.push({ threadID: r.threadID, name, isGroup: !!r.isGroup });
      });
      msg += "━━━━━━━━━━━━━━━\n↩️ رد برقم الطلب\n0 - قبول الكل";
      api.sendMessage(msg, threadID, (err, info) => {
        if (!err) global.chatsSession[senderID] = { step: "request_list", list, botMessageID: info.messageID };
      });
    } else if (input === "2") {
      api.sendMessage("⏳ جاري جلب الغروبات...", threadID);
      const inbox = await getThreadList(api, ["INBOX"]);
      const groups = inbox.filter(t => t?.isGroup && t?.threadID);
      if (!groups.length) return api.sendMessage("📭 البوت ليس في أي غروب.", threadID);
      groups.sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
      let msg = `👥 الغروبات (${groups.length})\n━━━━━━━━━━━━━━━\n`;
      const list = [];
      groups.slice(0, 25).forEach((g, i) => {
        const name = (g.name || g.threadName || ("ID: " + g.threadID)).slice(0, 25);
        const m1 = global.motorData[g.threadID]?.status ? "🟢" : "⚫";
        const m2 = global.motorData2[g.threadID]?.status ? "🟢" : "⚫";
        const members = g.participantIDs?.length || "?";
        const last = timeAgo(g.timestamp);
        msg += `${i + 1}. ${name}\n👥${members} 🕐${last} M1:${m1} M2:${m2}\n🆔 ${g.threadID}\n\n`;
        list.push({ threadID: g.threadID, name });
      });
      msg += "━━━━━━━━━━━━━━━\nM1=محرك M2=محرك ذكي\n↩️ رد برقم الغروب";
      api.sendMessage(msg, threadID, (err, info) => {
        if (!err) global.chatsSession[senderID] = { step: "group_list", list, botMessageID: info.messageID };
      });
    } else {
      api.sendMessage("⚠️ اختار 1 أو 2 فقط.", threadID);
    }
  } else if (step === "request_list") {
    const { list } = session;
    if (input === "0") {
      api.sendMessage(`⏳ جاري قبول ${list.length} طلب...`, threadID);
      let success = 0, failed = 0;
      for (const req of list) {
        try { await api.sendMessage("مرحباً 👋", req.threadID); success++; await new Promise(r => setTimeout(r, 500)); } catch (_) { failed++; }
      }
      return api.sendMessage(`✅ تم قبول ${success} طلب${failed > 0 ? ` · فشل ${failed}` : ""}`, threadID);
    }
    const idx = parseInt(input) - 1;
    if (isNaN(idx) || idx < 0 || idx >= list.length) return api.sendMessage("❌ رقم غير صحيح.", threadID);
    const selected = list[idx];
    const msg = `📨 ${selected.name}\n🆔 ${selected.threadID}\n━━━━━━━━━━━━━━━\n1 - قبول الطلب\n2 - رفض وحذف الطلب\n3 - إرسال رسالة ثم قبول\n━━━━━━━━━━━━━━━\n↩️ رد بالرقم`;
    api.sendMessage(msg, threadID, (err, info) => {
      if (!err) global.chatsSession[senderID] = { step: "request_action", selected, botMessageID: info.messageID };
    });
  } else if (step === "request_action") {
    const { selected } = session;
    if (input === "1") {
      try { await api.sendMessage("مرحباً! 👋", selected.threadID); api.sendMessage(`✅ تم قبول طلب "${selected.name}"`, threadID); } catch (e) { api.sendMessage(`❌ فشل: ${e.message?.slice(0, 100)}`, threadID); }
      delete global.chatsSession[senderID];
    } else if (input === "2") {
      try { await api.deleteThread(selected.threadID); api.sendMessage(`🗑️ تم حذف طلب "${selected.name}"`, threadID); } catch (e) { api.sendMessage(`❌ فشل: ${e.message?.slice(0, 100)}`, threadID); }
      delete global.chatsSession[senderID];
    } else if (input === "3") {
      api.sendMessage(`✏️ أرسل الرسالة التي تريد إرسالها لـ "${selected.name}":`, threadID, (err, info) => {
        if (!err) global.chatsSession[senderID] = { step: "request_accept_msg", selected, botMessageID: info.messageID };
      });
    } else { api.sendMessage("⚠️ اختار 1 أو 2 أو 3 فقط.", threadID); }
  } else if (step === "request_accept_msg") {
    const { selected } = session;
    try { await api.sendMessage(input || "مرحباً! 👋", selected.threadID); api.sendMessage(`✅ تم قبول طلب "${selected.name}" وإرسال الرسالة.`, threadID); } catch (e) { api.sendMessage(`❌ فشل: ${e.message?.slice(0, 100)}`, threadID); }
    delete global.chatsSession[senderID];
  } else if (step === "group_list") {
    const idx = parseInt(input) - 1;
    const { list } = session;
    if (isNaN(idx) || idx < 0 || idx >= list.length) return api.sendMessage("❌ رقم غير صحيح.", threadID);
    const selected = list[idx];
    const tid = selected.threadID;
    const m1 = global.motorData[tid];
    const m2 = global.motorData2[tid];
    function sendGroupMenu(statusMsg) {
      const m1 = global.motorData[tid];
      const m2 = global.motorData2[tid];
      const msg = (statusMsg ? statusMsg + "\n\n" : "") + `👥 ${selected.name}\n🆔 ${tid}\n━━━━━━━━━━━━━━━\n📍 المحرك العادي: ${m1?.status ? "🟢 شغّال" : "⚫ متوقف"}\n   📝 "${m1?.message || "لم تُضبط"}" · ⏱ ${m1?.time ? m1.time / 1000 + "s" : "—"}\n\n📍 المحرك الذكي: ${m2?.status ? "🟢 شغّال" : "⚫ متوقف"}\n   📝 "${m2?.message || "لم تُضبط"}" · ⏱ ${m2?.time ? m2.time / 1000 + "s" : "—"}\n━━━━━━━━━━━━━━━\n1-تفعيل محرك\n2-إيقاف محرك\n3-رسالة محرك\n4-وقت محرك\n5-تفعيل محرك ذكي\n6-إيقاف محرك ذكي\n7-رسالة محرك ذكي\n8-وقت محرك ذكي\n9-إرسال رسالة\n10-إخراج البوت\n━━━━━━━━━━━━━━━\n↩️ رد بالرقم`;
      api.sendMessage(msg, threadID, (err, info) => {
        if (!err) global.chatsSession[senderID] = { step: "group_action", selected, botMessageID: info.messageID };
      });
    }
    const msg = `👥 ${selected.name}\n🆔 ${tid}\n━━━━━━━━━━━━━━━\n📍 المحرك العادي: ${m1?.status ? "🟢 شغّال" : "⚫ متوقف"}\n   📝 "${m1?.message || "لم تُضبط"}" · ⏱ ${m1?.time ? m1.time / 1000 + "s" : "—"}\n\n📍 المحرك الذكي: ${m2?.status ? "🟢 شغّال" : "⚫ متوقف"}\n   📝 "${m2?.message || "لم تُضبط"}" · ⏱ ${m2?.time ? m2.time / 1000 + "s" : "—"}\n━━━━━━━━━━━━━━━\n1-تفعيل محرك\n2-إيقاف محرك\n3-رسالة محرك\n4-وقت محرك\n5-تفعيل محرك ذكي\n6-إيقاف محرك ذكي\n7-رسالة محرك ذكي\n8-وقت محرك ذكي\n9-إرسال رسالة\n10-إخراج البوت\n━━━━━━━━━━━━━━━\n↩️ رد بالرقم`;
    api.sendMessage(msg, threadID, (err, info) => {
      if (!err) global.chatsSession[senderID] = { step: "group_action", selected, botMessageID: info.messageID };
    });
  } else if (step === "group_action") {
    const { selected } = session;
    const tid = selected.threadID;
    function sendGroupMenu(statusMsg) {
      const m1 = global.motorData[tid];
      const m2 = global.motorData2[tid];
      const msg = (statusMsg ? statusMsg + "\n\n" : "") + `👥 ${selected.name}\n🆔 ${tid}\n━━━━━━━━━━━━━━━\n📍 المحرك: ${m1?.status ? "🟢" : "⚫"} | الذكي: ${m2?.status ? "🟢" : "⚫"}\n━━━━━━━━━━━━━━━\n1-تفعيل محرك\n2-إيقاف محرك\n3-رسالة محرك\n4-وقت محرك\n5-تفعيل محرك ذكي\n6-إيقاف محرك ذكي\n7-رسالة محرك ذكي\n8-وقت محرك ذكي\n9-إرسال رسالة\n10-إخراج البوت\n━━━━━━━━━━━━━━━\n↩️ رد بالرقم`;
      api.sendMessage(msg, threadID, (err, info) => {
        if (!err) global.chatsSession[senderID] = { step: "group_action", selected, botMessageID: info.messageID };
      });
    }
    if (input === "1") { if (!global.motorData[tid]?.message) return sendGroupMenu("❌ لم تُضبط رسالة المحرك. اختار 3 أولاً."); if (!global.motorData[tid]?.time) return sendGroupMenu("❌ لم يُضبط الوقت. اختار 4 أولاً."); startMotor(api, tid); sendGroupMenu(`✅ تم تفعيل المحرك`); }
    else if (input === "2") { if (!global.motorData[tid]?.status) return sendGroupMenu("⚠️ المحرك متوقف أصلاً."); stopMotor(tid); sendGroupMenu(`✅ تم إيقاف المحرك`); }
    else if (input === "3") { api.sendMessage(`✏️ أرسل رسالة المحرك:`, threadID, (err, info) => { if (!err) global.chatsSession[senderID] = { step: "motor_set_msg", selected, motorType: 1, botMessageID: info.messageID }; }); }
    else if (input === "4") { api.sendMessage(`⏱️ أرسل وقت المحرك (مثال: 30s أو 2m):`, threadID, (err, info) => { if (!err) global.chatsSession[senderID] = { step: "motor_set_time", selected, motorType: 1, botMessageID: info.messageID }; }); }
    else if (input === "5") { if (!global.motorData2[tid]?.message) return sendGroupMenu("❌ لم تُضبط رسالة المحرك الذكي. اختار 7 أولاً."); if (!global.motorData2[tid]?.time) return sendGroupMenu("❌ لم يُضبط الوقت. اختار 8 أولاً."); startMotor2(api, tid); sendGroupMenu(`✅ تم تفعيل المحرك الذكي`); }
    else if (input === "6") { if (!global.motorData2[tid]?.status) return sendGroupMenu("⚠️ المحرك الذكي متوقف أصلاً."); stopMotor2(tid); sendGroupMenu(`✅ تم إيقاف المحرك الذكي`); }
    else if (input === "7") { api.sendMessage(`✏️ أرسل رسالة المحرك الذكي:`, threadID, (err, info) => { if (!err) global.chatsSession[senderID] = { step: "motor_set_msg", selected, motorType: 2, botMessageID: info.messageID }; }); }
    else if (input === "8") { api.sendMessage(`⏱️ أرسل وقت المحرك الذكي (مثال: 30s أو 2m):`, threadID, (err, info) => { if (!err) global.chatsSession[senderID] = { step: "motor_set_time", selected, motorType: 2, botMessageID: info.messageID }; }); }
    else if (input === "9") { api.sendMessage(`💬 أرسل الرسالة:`, threadID, (err, info) => { if (!err) global.chatsSession[senderID] = { step: "group_send_msg", selected, botMessageID: info.messageID }; }); }
    else if (input === "10") { api.sendMessage(`⚠️ إخراج البوت من "${selected.name}"؟ أرسل "نعم":`, threadID, (err, info) => { if (!err) global.chatsSession[senderID] = { step: "group_leave_confirm", selected, botMessageID: info.messageID }; }); }
    else { sendGroupMenu("⚠️ اختار رقماً من 1 إلى 10."); }
  } else if (step === "motor_set_msg") {
    const { selected, motorType } = session;
    if (!input) return api.sendMessage("❌ الرسالة فارغة.", threadID);
    const store = motorType === 1 ? global.motorData : global.motorData2;
    if (!store[selected.threadID]) store[selected.threadID] = { status: false, message: null, time: null, interval: null };
    store[selected.threadID].message = input;
    api.sendMessage(`✅ تم ضبط الرسالة: "${input}"`, threadID);
    delete global.chatsSession[senderID];
  } else if (step === "motor_set_time") {
    const { selected, motorType } = session;
    const ms = parseTime(input);
    if (!ms || ms < 5000) return api.sendMessage("❌ وقت غير صحيح. مثال: 30s أو 2m (الحد الأدنى 5s)", threadID);
    const store = motorType === 1 ? global.motorData : global.motorData2;
    if (!store[selected.threadID]) store[selected.threadID] = { status: false, message: null, time: null, interval: null };
    store[selected.threadID].time = ms;
    api.sendMessage(`✅ تم ضبط الوقت: ${input}`, threadID);
    delete global.chatsSession[senderID];
  } else if (step === "group_send_msg") {
    const { selected } = session;
    if (!input) return api.sendMessage("❌ الرسالة فارغة.", threadID);
    try { await api.sendMessage(input, selected.threadID); api.sendMessage(`✅ تم الإرسال إلى "${selected.name}"`, threadID); } catch (e) { api.sendMessage(`❌ فشل: ${e.message?.slice(0, 100)}`, threadID); }
    delete global.chatsSession[senderID];
  } else if (step === "group_leave_confirm") {
    const { selected } = session;
    if (input === "نعم") {
      try { await api.removeUserFromGroup(api.getCurrentUserID(), selected.threadID); api.sendMessage(`✅ خرج البوت من "${selected.name}"`, threadID); } catch (e) { api.sendMessage(`❌ فشل: ${e.message?.slice(0, 100)}`, threadID); }
    } else { api.sendMessage("❎ تم الإلغاء.", threadID); }
    delete global.chatsSession[senderID];
  }
};

module.exports.run = async function ({ api, event, permssion }) {
  const { threadID, messageID, senderID } = event;
  if (permssion < 2) return api.sendMessage("⛔ هذا الأمر خاص بأدمن البوت فقط.", threadID, messageID);
  global.chatsSession[senderID] = { step: "main", botMessageID: null };
  const menu = "💬 إدارة المحادثات\n━━━━━━━━━━━━━━━\n1 - طلبات المراسلة\n2 - الغروبات الحالية\n━━━━━━━━━━━━━━━\n↩️ رد بالرقم";
  api.sendMessage(menu, threadID, (err, info) => {
    if (!err) global.chatsSession[senderID].botMessageID = info.messageID;
  }, messageID);
};
