module.exports.config = {
  name: "محرك",
  version: "1.0.0",
  hasPermssion: 2,
  credits: "SAIN",
  description: "إرسال رسالة تلقائية كل فترة زمنية محددة",
  commandCategory: "إدارة البوت",
  usages: "تفعيل | ايقاف | رسالة [نص] | وقت [مثال: 30s أو 0.5m]",
  cooldowns: 0,
  prefix: true
};

module.exports.languages = { "vi": {}, "en": {} };

module.exports.onLoad = () => {
  global.motorData = global.motorData || {};
};

module.exports.run = async function ({ api, event, args, permssion }) {
  const { threadID, messageID } = event;
  if (permssion < 2) return api.sendMessage("⛔ هذا الأمر خاص بأدمن البوت فقط.", threadID, messageID);
  if (!args[0]) return api.sendMessage("📌 الاستخدام:\nمحرك تفعيل\nمحرك ايقاف\nمحرك رسالة [النص]\nمحرك وقت [مثال: 30s أو 0.5m]", threadID, messageID);

  if (!global.motorData[threadID]) {
    global.motorData[threadID] = { status: false, message: null, time: null, interval: null };
  }
  const data = global.motorData[threadID];

  if (args[0] === "رسالة") {
    const body = event.body || "";
    const subCmd = "رسالة";
    const subCmdIdx = body.indexOf(subCmd);
    let msg = subCmdIdx !== -1 ? body.slice(subCmdIdx + subCmd.length).replace(/^ /, "") : args.slice(1).join(" ");
    if (!msg) return api.sendMessage("⚠️ اكتب الرسالة بعد الأمر.", threadID, messageID);
    data.message = msg;
    return api.sendMessage(`✅ تم حفظ رسالة المحرك:\n"${msg}"`, threadID, messageID);
  }

  if (args[0] === "وقت") {
    const input = args[1];
    if (!input) return api.sendMessage("⚠️ حدد الوقت.\nمثال: محرك وقت 30s أو محرك وقت 0.5m", threadID, messageID);
    let ms = 0;
    if (input.endsWith("s")) ms = parseFloat(input) * 1000;
    else if (input.endsWith("m")) ms = parseFloat(input) * 60 * 1000;
    else return api.sendMessage("⚠️ صيغة غير صحيحة. استخدم s أو m.", threadID, messageID);
    if (ms < 5000) return api.sendMessage("⚠️ الحد الأدنى 5 ثواني.", threadID, messageID);
    data.time = ms;
    return api.sendMessage(`✅ تم حفظ الوقت: ${input}`, threadID, messageID);
  }

  if (args[0] === "تفعيل") {
    if (data.status === true) return api.sendMessage("⚠️ المحرك مفعل مسبقاً.", threadID, messageID);
    if (!data.message) return api.sendMessage("⚠️ لم تحدد رسالة المحرك.\nاستخدم: محرك رسالة [النص]", threadID, messageID);
    if (!data.time) return api.sendMessage("⚠️ لم تحدد وقت المحرك.\nاستخدم: محرك وقت [مثال: 30s]", threadID, messageID);
    data.status = true;
    data.interval = setInterval(() => {
      const botApi = global._botApi || api;
      const r = botApi.sendMessage(data.message, threadID);
      if (r && typeof r.catch === 'function') r.catch(() => {});
    }, data.time);
    return api.sendMessage(`✅ تم تفعيل المحرك.\n📝 "${data.message}"\n⏱ كل: ${data.time / 1000}s`, threadID, messageID);
  }

  if (args[0] === "ايقاف") {
    if (data.status === false) return api.sendMessage("⚠️ المحرك غير مفعل أصلاً.", threadID, messageID);
    clearInterval(data.interval);
    data.status = false; data.interval = null;
    return api.sendMessage("🔴 تم إيقاف المحرك.", threadID, messageID);
  }

  return api.sendMessage("📌 الاستخدام:\nمحرك تفعيل\nمحرك ايقاف\nمحرك رسالة [النص]\nمحرك وقت [30s أو 0.5m]", threadID, messageID);
};
