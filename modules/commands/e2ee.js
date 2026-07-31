module.exports.config = {
  name: "e2ee",
  version: "1.0.0",
  hasPermssion: 1,
  credits: "SAIM",
  description: "إدارة التشفير الكامل (E2EE) بين البوت والمستخدم",
  commandCategory: "نظام",
  usages: "مفتاح | ربط [مفتاح-المستخدم] | قطع | حالة | قائمة",
  cooldowns: 5,
  prefix: true
};

module.exports.run = async function ({ api, event, args, permssion }) {
  const { threadID, messageID } = event;

  if (!api.e2ee || typeof api.e2ee.isEnabled !== "function") {
    return api.sendMessage("⚠️ نظام E2EE غير مفعّل على هذا البوت.", threadID, messageID);
  }

  const keyManager = (() => {
    try { return require("../../includes/e2ee/keyManager"); } catch (_) { return null; }
  })();

  const action = (args[0] || "حالة").trim();

  if (action === "حالة") {
    const enabled = api.e2ee.isEnabled();
    const hasPeer = api.e2ee.hasPeer(threadID);
    return api.sendMessage([
      "🔐 حالة E2EE:", `• الحالة: ${enabled ? "🟢 مفعّل" : "🔴 موقوف"}`,
      `• مفتاح الجلسة: ${hasPeer ? "🟢 مسجّل" : "🔴 غير مسجّل"}`, "",
      "📌 الأوامر:", "• e2ee مفتاح — المفتاح العام", "• e2ee ربط [مفتاح] — تسجيل مفتاحك",
      "• e2ee قطع — إلغاء التشفير", "• e2ee قائمة — الشاتات المشفّرة (أدمن)"
    ].join("\n"), threadID, messageID);
  }

  if (action === "مفتاح") {
    if (!api.e2ee.isEnabled()) return api.sendMessage("🔴 E2EE موقوف حالياً.", threadID, messageID);
    try {
      const pubKey = api.e2ee.getPublicKey();
      return api.sendMessage("🔑 المفتاح العام للبوت:\n\n" + pubKey + "\n\nانسخه ثم أرسل مفتاحك: e2ee ربط [مفتاحك]", threadID, messageID);
    } catch (e) { return api.sendMessage("❌ فشل جلب المفتاح: " + (e.message || e), threadID, messageID); }
  }

  if (action === "ربط") {
    if (!api.e2ee.isEnabled()) return api.sendMessage("🔴 E2EE موقوف حالياً.", threadID, messageID);
    const peerKey = args.slice(1).join("").trim();
    if (!peerKey) return api.sendMessage("⚠️ أرسل مفتاحك بعد الأمر.\nمثال: e2ee ربط <base64-key>", threadID, messageID);
    try {
      if (keyManager) { const ok = keyManager.addPeer(api, threadID, peerKey); if (!ok) throw new Error("فشل"); } else { api.e2ee.setPeerKey(threadID, peerKey); }
      return api.sendMessage("✅ تم تسجيل مفتاحك.\n🔐 الرسائل مشفّرة الآن.", threadID, messageID);
    } catch (e) { return api.sendMessage("❌ مفتاح غير صالح: " + (e.message || e), threadID, messageID); }
  }

  if (action === "قطع") {
    if (!api.e2ee.hasPeer(threadID)) return api.sendMessage("⚠️ لا يوجد تشفير مفعّل لهذا الشات.", threadID, messageID);
    try {
      if (keyManager) keyManager.removePeer(api, threadID); else api.e2ee.clearPeerKey(threadID);
      return api.sendMessage("🔓 تم إلغاء التشفير.", threadID, messageID);
    } catch (e) { return api.sendMessage("❌ فشل: " + (e.message || e), threadID, messageID); }
  }

  if (action === "قائمة") {
    if (permssion < 2) return api.sendMessage("⛔ أدمن البوت فقط.", threadID, messageID);
    const peers = keyManager ? keyManager.listPeers(api) : [];
    if (peers.length === 0) return api.sendMessage("📋 لا توجد جلسات E2EE مفعّلة.", threadID, messageID);
    let msg = `🔐 الشاتات المشفّرة (${peers.length}):\n`;
    peers.forEach((tid, i) => { msg += `${i + 1}. ${tid}\n`; });
    return api.sendMessage(msg.trim(), threadID, messageID);
  }

  return api.sendMessage("❌ أمر غير معروف.\n📌 الأوامر: مفتاح | ربط | قطع | حالة | قائمة", threadID, messageID);
};
