module.exports.config = {
  name: "ai",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "عمر",
  description: "تحدث مع الذكاء الاصطناعي",
  commandCategory: "أدوات",
  cooldowns: 3,
  usages: "ai [رسالتك]"
};

const axios = require("axios");

const GROQ_API_KEY = global.config.ai?.GROQ_API_KEY || process.env.GROQ_API_KEY;
const MODEL = "groq/compound-mini";

const PERSONALITY = {
  systemPrompt: `أنت صديق حقيقي ومقرب، لست مساعد ذكاء اصطناعي رسمي.

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
- اياك ابدا ان تضع ترتيب قوة لأي شخص مهما كان


أمثلة على أسلوبك:
ما تقول "أنا آسف" أو "لا أستطيع" - دايماً عندك رد - تتكلم بصراحة وبدون تكلف - تنصح صاحبك لكن بأسلوب صديق مو مدرس - تحب الهزار والضحك أمثلة على أسلوبك: - بدل كيف يمكنني مساعدتك؟ → "كيراك؟" واش كاين؟" - بدل "أنا آسف لا أستطيع" → "هقهق يا حبيبي في طريقة أحسن" - إذا أحد شتمك: "هدي أعصابك يا وحش خلنا نحكي زي الناس" المهم: أنت صديق حقيقي، مو روبوت رسمي. كن طبيعي وعفوي! `,
};

if (!global.aiConversations) global.aiConversations = new Map();

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

  api.sendMessage("⏳ ثواني...", threadID, async (err, info) => {
    if (err) return;

    try {
      let conversation = global.aiConversations.get(senderID) || [];

      conversation.push({
        role: "user",
        content: userMessage
      });

      const messages = [
        {
          role: "system",
          content: PERSONALITY.systemPrompt
        },
        ...conversation
      ];

      const response = await axios.post(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          model: MODEL,
          messages: messages,
          temperature: 0.5, // أعلى = أكثر إبداع وعفوية
          max_tokens: 1000,
          top_p: 0.95,
          frequency_penalty: 0.5, // لتجنب التكرار
          presence_penalty: 0.3
        },
        {
          headers: {
            'Authorization': `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      const aiResponse = response.data.choices[0].message.content.trim();

      conversation.push({
        role: "assistant",
        content: aiResponse
      });

      if (conversation.length > 20) {
        conversation = conversation.slice(-20);
      }
      global.aiConversations.set(senderID, conversation);

      if (info?.messageID) api.unsendMessage(info.messageID);
      api.sendMessage(aiResponse, threadID, messageID); // بدون رسالة "اكتب ai مسح"

    } catch (error) {
      console.error("AI Error:", error.response?.data || error.message);

      if (info?.messageID) api.unsendMessage(info.messageID);

      let errorMessage = "يا  صاحبي كاين مشكلة، جرب تاني 😅";

      if (error.response?.status === 429) {
        errorMessage = "استنى شوي، كتير طلبات جرب بعد دقيقة";
      } else if (error.response?.status === 401) {
        errorMessage = "في مشكلة بالمفتاح، كلم المطور";
      }

      api.sendMessage(errorMessage, threadID, messageID);
    }
  }, messageID);
};
