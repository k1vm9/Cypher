const fs = require("fs"),
  path = __dirname + "/cache/namebox.json";

function readProtectionData() {
  try {
    const value = JSON.parse(fs.readFileSync(path, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function writeProtectionData(data) {
  fs.mkdirSync(__dirname + "/cache", { recursive: true });
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

module.exports.config = {
name: "اسم",
version: "1.0.8",
hasPermssion: 0,
credits: "نوت دفاين",
description: "حماية اسم مجموعتك",
commandCategory: "مسؤولي المجموعات",
usages: "",
cooldowns: 0,
prefix: true
};
module.exports.languages = {
"vi": {},
"en": {}
};
module.exports.onLoad = () => {   
 fs.mkdirSync(__dirname + "/cache", { recursive: true });
 if (!fs.existsSync(path)) writeProtectionData({});
};

module.exports.handleEvent = async function ({ api, event, Threads, permssion }) {
const { threadID, messageID, senderID, isGroup, author } = event;

if (isGroup == true) {
 let data = readProtectionData()
 let dataThread = (await Threads.getData(threadID)).threadInfo
 if (!dataThread) return
const threadName = dataThread.threadName;
if (!data[threadID]) {
data[threadID] = {
namebox: threadName,
   // Name protection is deliberately off for newly discovered groups.
status: false
}
writeProtectionData(data);
}
if (data[threadID].namebox == null || threadName == "undefined" || threadName == null) return

else if (threadName != data[threadID].namebox && data[threadID].status == false) {
data[threadID].namebox = threadName
 writeProtectionData(data);
}

if (threadName != data[threadID].namebox && data[threadID].status == true) {
return api.setTitle(
 data[threadID].namebox,
   threadID, () => {
     api.sendMessage(
  ``,
   threadID)
   });
  }
}
};

module.exports.run = async function ({ api, event, permssion, Threads }) {
const { threadID, messageID } = event;
if (permssion == 0) return api.sendMessage("قم بي تشغيل/ايقاف", threadID);
let data = readProtectionData()
let dataThread = (await Threads.getData(threadID)).threadInfo
if (!dataThread) return api.sendMessage("تعذر العثور على بيانات المجموعة", threadID);
const threadName = dataThread.threadName;

if (!data[threadID]) {
  data[threadID] = { namebox: threadName, status: false };
}

if (data[threadID].status == false) {
   data[threadID] = {
     namebox: threadName,
     status: true
   }
} else data[threadID].status = false
      writeProtectionData(data);
      api.sendMessage(
    `بلفعل تم ${data[threadID].status == true ? `تشغيل` : `ايقاف`} وضع حماية اسم المجموعة`,
 threadID)
} 
function PREFIX(t) {
var dataThread = global.data.threadData.get(t) || {}
return dataThread.PREFIX || global.config.PREFIX
  }