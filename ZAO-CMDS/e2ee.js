module.exports.config = {
  name: "e2ee",
  version: "1.0.0",
  hasPermssion: 1,
  credits: "SAIM",
  description: "إدارة التشفير الكامل (E2EE) بين البوت والمستخدم",
  commandCategory: "نظام",
  usages: "مفتاح | ربط [مفتاح-المستخدم] | قطع | حالة | قائمة",
  cooldowns: 5
};

module.exports.run = async function ({ api, event, args, permssion }) {
  const { threadID, messageID } = event;

  if (!api.e2ee || typeof api.e2ee.isEnabled !== "function") {
    return api.sendMessage(
      "⚠️ نظام E2EE غير مفعّل على هذا البوت.\n" +
      "يحتاج المطور إلى تفعيل enableE2EE في الإعدادات.",
      threadID, messageID
    );
  }

  const keyManager = (() => {
    try { return require("../../includes/e2ee/keyManager"); } catch (_) { return null; }
  })();

  const action = (args[0] || "حالة").trim();

  // ── حالة ──────────────────────────────────────────────────────────────
  if (action === "حالة") {
    const enabled  = api.e2ee.isEnabled();
    const hasPeer  = api.e2ee.hasPeer(threadID);
    const lines = [
      "🔐 حالة E2EE في هذا الشات:",
      `• الحالة العامة : ${enabled  ? "🟢 مفعّل" : "🔴 موقوف"}`,
      `• مفتاح الجلسة : ${hasPeer  ? "🟢 مسجّل" : "🔴 غير مسجّل"}`,
      "",
      "📌 الأوامر:",
      "• e2ee مفتاح       — عرض المفتاح العام للبوت",
      "• e2ee ربط [مفتاح] — تسجيل مفتاحك لتفعيل التشفير",
      "• e2ee قطع         — إلغاء التشفير لهذا الشات",
      "• e2ee قائمة       — عرض الشاتات المشفّرة (أدمن)"
    ];
    return api.sendMessage(lines.join("\n"), threadID, messageID);
  }

  // ── مفتاح ─────────────────────────────────────────────────────────────
  if (action === "مفتاح") {
    if (!api.e2ee.isEnabled()) {
      return api.sendMessage("🔴 E2EE موقوف حالياً. يحتاج المطور لتفعيله أولاً.", threadID, messageID);
    }
    let pubKey;
    try {
      pubKey = api.e2ee.getPublicKey();
    } catch (e) {
      return api.sendMessage("❌ فشل جلب المفتاح العام: " + (e.message || e), threadID, messageID);
    }
    return api.sendMessage(
      "🔑 المفتاح العام للبوت (X25519 SPKI):\n\n" +
      pubKey + "\n\n" +
      "📋 انسخ هذا المفتاح إلى تطبيقك، ثم أرسل مفتاحك باستخدام:\ne2ee ربط [مفتاحك]",
      threadID, messageID
    );
  }

  // ── ربط ──────────────────────────────────────────────────────────────
  if (action === "ربط") {
    if (!api.e2ee.isEnabled()) {
      return api.sendMessage("🔴 E2EE موقوف حالياً.", threadID, messageID);
    }
    const peerKey = args.slice(1).join("").trim();
    if (!peerKey) {
      return api.sendMessage(
        "⚠️ أرسل مفتاحك العام بعد الأمر.\nمثال: e2ee ربط <base64-key>",
        threadID, messageID
      );
    }
    try {
      if (keyManager) {
        const ok = keyManager.addPeer(api, threadID, peerKey);
        if (!ok) throw new Error("فشل تسجيل المفتاح");
      } else {
        api.e2ee.setPeerKey(threadID, peerKey);
      }
      return api.sendMessage(
        "✅ تم تسجيل مفتاحك.\n" +
        "🔐 الرسائل بين البوت وهذا الشات مشفّرة الآن بـ X25519 + AES-256-GCM.\n\n" +
        "🔑 المفتاح العام للبوت:\n" + api.e2ee.getPublicKey(),
        threadID, messageID
      );
    } catch (e) {
      return api.sendMessage(
        "❌ مفتاح غير صالح: " + (e.message || e) + "\nتأكد أن المفتاح بصيغة base64 صحيحة (SPKI X25519).",
        threadID, messageID
      );
    }
  }

  // ── قطع ──────────────────────────────────────────────────────────────
  if (action === "قطع") {
    if (!api.e2ee.hasPeer(threadID)) {
      return api.sendMessage("⚠️ لا يوجد تشفير مفعّل لهذا الشات أصلاً.", threadID, messageID);
    }
    try {
      if (keyManager) {
        keyManager.removePeer(api, threadID);
      } else {
        api.e2ee.clearPeerKey(threadID);
      }
      return api.sendMessage("🔓 تم إلغاء التشفير لهذا الشات.", threadID, messageID);
    } catch (e) {
      return api.sendMessage("❌ فشل إلغاء المفتاح: " + (e.message || e), threadID, messageID);
    }
  }

  // ── قائمة (أدمن فقط) ─────────────────────────────────────────────────
  if (action === "قائمة") {
    if (permssion < 2) {
      return api.sendMessage("⛔ هذا الأمر خاص بأدمن البوت فقط.", threadID, messageID);
    }
    const peers = keyManager ? keyManager.listPeers(api) : [];
    if (peers.length === 0) {
      return api.sendMessage("📋 لا توجد جلسات E2EE مفعّلة حالياً.", threadID, messageID);
    }
    let msg = `🔐 الشاتات المشفّرة (${peers.length}):\n`;
    peers.forEach((tid, i) => { msg += `${i + 1}. ${tid}\n`; });
    return api.sendMessage(msg.trim(), threadID, messageID);
  }

  return api.sendMessage(
    "❌ أمر غير معروف.\n📌 الأوامر: مفتاح | ربط | قطع | حالة | قائمة",
    threadID, messageID
  );
};
