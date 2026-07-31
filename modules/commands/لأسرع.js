module.exports.config = {
  name: "الاسرع",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "لوفي تشان",
  description: "لعبة الاسرع ",
  usages: ["لعبة"],
  commandCategory: "العاب",
  cooldowns: 0,
  prefix: true
};

const fs = require('fs');
const axios = require('axios');
const tempImageFilePath = __dirname + "/cache/tempIm1age.jpg";

module.exports.handleReply = async function ({ api, event, handleReply, Currencies }) {
  const userAnswer = event.body.trim().toLowerCase();
  const correctAnswer = handleReply.correctAnswer.toLowerCase();
  const userName = global.data.userName.get(event.senderID) || await Users.getNameUser(event.senderID);

  if (userAnswer === correctAnswer) {
      Currencies.increaseMoney(event.senderID, 50);
      api.sendMessage(`تهانينا ${userName} لقد حصلت على 50 دولار`, event.threadID);

      api.unsendMessage(handleReply.messageID);
  } else {
      api.sendMessage(`خطأ، حاول مرة أخرى`, event.threadID);
  }

  fs.unlinkSync(tempImageFilePath);
};

module.exports.run = async function ({ api, event, args }) {
  const questions = [


    {
      "emoji": "😗",
      "link": "https://i.imgur.com/LdyIyYD.png"
    },
    {
      "emoji": "😭",
      "link": "https://i.imgur.com/P8zpqby.png"
    },
      {
      "emoji": "🤠",
      "link": "https://i.imgur.com/kG71glL.png"
      },
      {
      "emoji": "🙂",
      "link": "https://i.imgur.com/hzP1Zca.png"
      },
        {
      "emoji": "🐸",
      "link": "https://i.imgur.com/rnsgJju.png"
      },
        {
      "emoji": "⛽",
      "link": "https://i.imgur.com/LBROa0K.png"
      },
        {
      "emoji": "💰",
      "link": "https://i.imgur.com/uQmrlvt.png"
      },
        {
      "emoji": "🥅",
      "link": "https://i.imgur.com/sGItXyC.png"
      },
        {
      "emoji": "♋",
      "link": "https://i.imgur.com/FCOgj6D.jpg"
      },
        {
      "emoji": "🍌",
      "link": "https://i.imgur.com/71WozFU.jpg"
      },
        {
      "emoji": "🦊",
      "link": "https://i.imgur.com/uyElK2K.png"
      },
        {
      "emoji": "😺",
      "link": "https://i.imgur.com/PXjjXzl.png"
      },
        {
      "emoji": "🍀",
      "link": "https://i.imgur.com/8zJRvzg.png"
      },
        {
      "emoji": "🆘",
      "link": "https://i.imgur.com/Sl0JWTu.png"
      },
        {
      "emoji": "🥺",
      "link": "https://i.imgur.com/M69t6MP.jpg"
      },
        {
      "emoji": "😶",
      "link": "https://i.imgur.com/k0hHyyX.jpg"
      },
        {
      "emoji": "😑",
      "link": "https://i.imgur.com/AvZygtY.png"
      },
        {
      "emoji": "😔",
      "link": "https://i.imgur.com/pQ08T2Q.jpg"
      },
        {
      "emoji": "🤦‍♂️",
      "link": "https://i.imgur.com/WbVCMIp.jpg"
      },
        {
      "emoji": "👀",
      "link": "https://i.imgur.com/sH3gFGd.jpg"
      },
        {
      "emoji": "💱",
      "link": "https://i.imgur.com/Gt301sv.jpg"
      },
        {
      "emoji": "🕴️",
      "link": "https://i.imgur.com/652pmot.jpg"
      },
        {
      "emoji": "🏖️",
      "link": "https://i.imgur.com/CCb2cVz.png"
      },
        {
      "emoji": "🏕️",
      "link": "https://i.imgur.com/zoGHqWD.jpg"
      },
        {
      "emoji": "🪆",
      "link": "https://i.imgur.com/FUrUIYZ.jpg"
      }


  ];

  const randomQuestion = questions[Math.floor(Math.random() * questions.length)];
  const correctAnswer = randomQuestion.emoji;

  const imageResponse = await axios.get(randomQuestion.link, { responseType: "arraybuffer" });
  fs.writeFileSync(tempImageFilePath, Buffer.from(imageResponse.data, "binary"));

  const attachment = [fs.createReadStream(tempImageFilePath)];
  const message = `اسرع شخص يرسل الايموجي`;

  api.sendMessage({ body: message, attachment }, event.threadID, (error, info) => {
      if (!error) {
          global.client.handleReply.push({
              name: this.config.name,
              messageID: info.messageID,
              correctAnswer: correctAnswer
          });
      }
  });
};
