const axios = require("axios");
const fs    = require("fs-extra");
const path  = require("path");

const CACHE_DIR = path.join(__dirname, "cache");

const YT_SEARCH_API = "https://www.googleapis.com/youtube/v3/search";
const YTDL_APIS = [
  "https://yt-download.org/api/button/mp3/",
  "https://api.vevioz.com/api/button/mp3/"
];

async function searchYouTube(query) {
  const ytKey = process.env.YOUTUBE_API_KEY || global.config?.["youtube-video"]?.YOUTUBE_API || "";

  if (ytKey) {
    const res = await axios.get(YT_SEARCH_API, {
      params: { part: "snippet", q: query, type: "video", maxResults: 1, key: ytKey },
      timeout: 10000
    });
    const item = res.data.items?.[0];
    if (item) {
      return {
        url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
        title: item.snippet.title
      };
    }
  }

  const searchRes = await axios.get(
    `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
    { headers: { "User-Agent": "Mozilla/5.0" }, timeout: 10000 }
  );
  const match = searchRes.data.match(/"videoId":"([^"]+)","title":\{"runs":\[\{"text":"([^"]+)"/);
  if (match) {
    return {
      url: `https://www.youtube.com/watch?v=${match[1]}`,
      title: match[2]
    };
  }
  throw new Error("لم يتم إيجاد النتيجة");
}

async function downloadMp3(videoUrl) {
  const COBALT_API = "https://api.cobalt.tools/";
  try {
    const res = await axios.post(
      COBALT_API,
      { url: videoUrl, downloadMode: "audio", audioFormat: "mp3", filenameStyle: "basic" },
      {
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        timeout: 30000
      }
    );

    if (res.data?.url) return res.data.url;
    if (res.data?.tunnel) return res.data.tunnel;
    if (res.data?.status === "redirect" || res.data?.status === "tunnel") return res.data.url || res.data.tunnel;
  } catch (e) {
    // Cobalt failed, try fallback
  }

  const encodedUrl = encodeURIComponent(videoUrl);
  for (const apiBase of YTDL_APIS) {
    try {
      const r = await axios.get(apiBase + encodedUrl, { timeout: 20000, maxRedirects: 5 });
      if (r.data && typeof r.data === "string") {
        const mp3Match = r.data.match(/href="(https?:\/\/[^"]+\.mp3[^"]*)"/);
        if (mp3Match) return mp3Match[1];
      }
    } catch (_) {}
  }

  throw new Error("فشل تحميل الملف الصوتي من جميع المصادر");
}

module.exports.config = {
  name: "song",
  aliases: ["sing", "music", "play"],
  version: "2.0.0",
  hasPermssion: 0,
  credits: "ZAO Team",
  description: "تحميل أغنية من يوتيوب وإرسالها كملف صوتي",
  commandCategory: "ميديا",
  usages: "song [اسم الأغنية أو رابط يوتيوب]",
  cooldowns: 15
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID } = event;
  const query = args.join(" ").trim();

  if (!query) {
    return api.sendMessage(
      "🎵 أرسل اسم الأغنية أو رابط يوتيوب\nمثال: .song faded alan walker",
      threadID,
      messageID
    );
  }

  api.setMessageReaction("⏳", messageID, () => {}, true);
  await fs.ensureDir(CACHE_DIR);

  const outPath = path.join(CACHE_DIR, `song_${Date.now()}.mp3`);

  try {
    let videoUrl = query;
    let title    = query;

    const isYtLink = /youtu(be\.com|\.be)\//i.test(query);
    if (!isYtLink) {
      const result = await searchYouTube(query);
      videoUrl = result.url;
      title    = result.title;
    }

    api.sendMessage(`🔍 جاري تحميل: ${title}`, threadID, messageID);

    const dlUrl = await downloadMp3(videoUrl);

    const audioRes = await axios.get(dlUrl, {
      responseType: "arraybuffer",
      timeout: 120000,
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    await fs.outputFile(outPath, Buffer.from(audioRes.data));

    if (!fs.existsSync(outPath) || fs.statSync(outPath).size < 10000) {
      throw new Error("الملف الصوتي فارغ أو تالف");
    }

    api.setMessageReaction("✅", messageID, () => {}, true);

    return api.sendMessage(
      {
        body: `🎵 ${title}\n🔗 ${videoUrl}`,
        attachment: fs.createReadStream(outPath)
      },
      threadID,
      () => {
        try { fs.unlinkSync(outPath); } catch (_) {}
      },
      messageID
    );

  } catch (e) {
    api.setMessageReaction("❌", messageID, () => {}, true);
    try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch (_) {}
    return api.sendMessage(`❌ خطأ: ${e.message}`, threadID, messageID);
  }
};
