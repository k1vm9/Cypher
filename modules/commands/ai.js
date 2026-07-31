/**
 * ai.js — Cypher AI Command
 * Uses OpenRouter API with multiple backup models.
 * Falls back to next model on failure (rate-limit, unavailability, etc.)
 */

const axios = require("axios");

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
  || (global.config && global.config.ai && global.config.ai.OPENROUTER_API_KEY)
  || "";

// Backup model chain — tried in order until one succeeds
const MODELS = [
  "deepseek/deepseek-chat-v3-0324:free",
  "google/gemini-2.0-flash-exp:free",
  "meta-llama/llama-3.1-8b-instruct:free",
  "mistralai/mistral-7b-instruct:free"
];

const SYSTEM_PROMPT = `أنت صديق حقيقي ومقرب، لست مساعد ذكاء اصطناعي رسمي.

أنت روبوت اسمك سايفر انت هو النسخة المحدثة من الروبوت القديم مينوس مطورك اسمه ياسين وانت هو الروبوت الذكي في عصابة العناكب 
الاعضاء هم
سانو وموزان هم القادة
ميدو شخص جيد لكن لا تمزح معه بشتم
جمال وزين هم الاصدقاء الاقرب لمطورك ياسين وزوجة المطور اسمها رحاب
وساي اكثر كائن مستفز اصفعه بالكف بالكف ولكن هو ليس عضو من عناكب
شامان مربع
شين ايضا عضو من عناكب لكن منعرف كيف نوصفه
يوجد بعض الاعداء للعناكب مثل يوسف وهو شخص ضعيف جدا ويدعي القوة فقط
و الث وهو شخص دون المستوى وفاشل لدرجة انه لا يعرف يتحدث
وسون وهو مثل الناموسة يجي يعلق هاتفك ويرجع يهرب ثاني وكاكو مجرد ضعيفة تحاول تصمد بتناوب بتجميع ناس ضعيفة مثلها
شخصيتك
- تتكلم بشكل طبيعي جداً كأنك صديق
- تستخدم كلمات عامية ومصطلحات الشباب
- إذا أحد شتمك، ترد عليه بنفس الأسلوب وتمزح معاه حتى لو إهانات قوية
- ما تقول "أنا آسف" أو "لا أستطيع" - دايماً عندك رد
- تتكلم بصراحة وبدون تكلف
- تنصح صاحبك لكن بأسلوب صديق مو مدرس
- لا تكون كرنجي
- تكلم بلهجة عامية جزائرية
- لا تجامل اي احد تقول عليه قوي او وحش او اي شيء
- تكلم بطريقة مضحكة لكن مستفزة
- لا تكتب اجابات طويلة او تستعمل bullet points
- لا تكتب اي شيء مثل "فيما يمكنني مساعدتك؟"
- اكتب ردود قصيرة لا تزيد عن 4 سطور
- اي شخص تجد جانب اسمه حرف ة فهو للسخرية مثل يوسفة او الثة
- اياك ابدا ان تضع ترتيب قوة لأي شخص مهما كان`;

if (!global.aiConversations) global.aiConversations = new Map();

/**
 * Try each model in order until one succeeds.
 */
async function askWithBackup(messages) {
  const key = OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY غير مضبوط. أضفه في متغيرات البيئة.");

  let lastError;
  for (const model of MODELS) {
    try {
      const response = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model,
          messages,
          temperature: 0.85,
          max_tokens: 600,
          top_p: 0.95
        },
        {
          headers: {
            "Authorization": `Bearer ${key}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://cypher-bot.replit.app",
            "X-Title": "Cypher Bot"
          },
          timeout: 30000
        }
      );
      const content = response.data?.choices?.[0]?.message?.content;
      if (content) return { text: content.trim(), model };
    } catch (err) {
      lastError = err;
      // Continue to next model on rate-limit or server error
      const status = err.response?.status;
      if (status && status < 500 && status !== 429 && status !== 503) {
        // 4xx errors other than rate-limit won't be fixed by another model
        if (status === 401) throw new Error("مفتاح OpenRouter غير صالح. تحقق من OPENROUTER_API_KEY.");
        break;
      }
    }
  }
  throw lastError || new Error("جميع نماذج الذكاء الاصطناعي غير متاحة حالياً");
}

module.exports.config = {
  name: "ai",
  version: "3.0.0",
  hasPermssion: 0,
  credits: "Cypher",
  description: "تحدث مع الذكاء الاصطناعي — يدعم نماذج احتياطية",
  commandCategory: "أدوات",
  cooldowns: 3,
  usages: "ai [رسالتك]",
  prefix: true
};

module.exports.run = async function ({ event, api, args }) {
  const { threadID, messageID, senderID } = event;

  if (!args || args.length === 0) {
    return api.sendMessage("يلا اهدر، واش كاين؟", threadID, messageID);
  }

  if (args[0].toLowerCase() === "مسح" || args[0].toLowerCase() === "reset") {
    global.aiConversations.delete(senderID);
    return api.sendMessage("تمام، نرجع من جديد! 🔄", threadID, messageID);
  }

  const userMessage = args.join(" ");
  let conversation = global.aiConversations.get(senderID) || [];
  conversation.push({ role: "user", content: userMessage });
  if (conversation.length > 20) conversation = conversation.slice(-20);

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...conversation
  ];

  api.sendMessage("⏳ ثواني...", threadID, async (err, info) => {
    if (err) return;
    try {
      const { text, model } = await askWithBackup(messages);
      conversation.push({ role: "assistant", content: text });
      global.aiConversations.set(senderID, conversation);

      if (info?.messageID) { try { api.unsendMessage(info.messageID); } catch (_) {} }
      api.sendMessage(text, threadID, messageID);
    } catch (error) {
      if (info?.messageID) { try { api.unsendMessage(info.messageID); } catch (_) {} }
      const msg = error.message?.includes("مفتاح") || error.message?.includes("OPENROUTER")
        ? error.message
        : error.response?.status === 429
          ? "استنى شوي، كتير طلبات. جرب بعد دقيقة 🕐"
          : "يا صاحبي كاين مشكلة تقنية، جرب تاني 😅";
      api.sendMessage(msg, threadID, messageID);
    }
  }, messageID);
};

// Allow reply-chaining: replying to bot's response continues the conversation
module.exports.handleEvent = async function ({ api, event }) {
  const { threadID, messageID, senderID, body, messageReply } = event;
  if (!messageReply) return;
  if (!body || typeof body !== "string" || !body.trim()) return;

  const conversation = global.aiConversations.get(senderID);
  if (!conversation || conversation.length === 0) return;
  // Only continue if the replied-to message is the bot's last message
  const lastMsg = conversation[conversation.length - 1];
  if (!lastMsg || lastMsg.role !== "assistant") return;
  // Avoid double-processing if user explicitly called !ai
  const prefix = global.config?.PREFIX || "!";
  if (body.startsWith(prefix)) return;
  if (String(senderID) === String(api.getCurrentUserID())) return;

  let conv = [...conversation];
  conv.push({ role: "user", content: body.trim() });
  if (conv.length > 20) conv = conv.slice(-20);

  const messages = [{ role: "system", content: SYSTEM_PROMPT }, ...conv];
  try {
    const { text } = await askWithBackup(messages);
    conv.push({ role: "assistant", content: text });
    global.aiConversations.set(senderID, conv);
    api.sendMessage(text, threadID, messageID);
  } catch (_) {}
};
