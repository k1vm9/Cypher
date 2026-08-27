"use strict";
const fs   = require("fs");
const os   = require("os");
const path = require("path");
const { execSync } = require("child_process");
const moment = require("moment-timezone");

const ASSETS   = path.join(__dirname, "uptime");
const FONT_DIR = path.join(ASSETS, "Roboto", "static");
const CACHE_DIR = path.join(__dirname, "cache");

let fontsRegistered = false;
function ensureFonts(createCanvas, registerFont) {
  if (fontsRegistered) return;
  try {
    registerFont(path.join(FONT_DIR, "Roboto-Regular.ttf"), { family: "Roboto", weight: "400" });
    registerFont(path.join(FONT_DIR, "Roboto-Medium.ttf"),  { family: "Roboto", weight: "500" });
    registerFont(path.join(FONT_DIR, "Roboto-Bold.ttf"),    { family: "Roboto", weight: "700" });
    registerFont(path.join(FONT_DIR, "Roboto-Light.ttf"),   { family: "Roboto", weight: "300" });
    fontsRegistered = true;
  } catch (e) {
    console.error("[ابتيم] Font registration failed:", e.message);
  }
}

let prevCpu = null;
function sampleCpu() {
  let idle = 0, total = 0;
  for (const c of os.cpus()) {
    for (const t in c.times) total += c.times[t];
    idle += c.times.idle;
  }
  return { idle, total };
}
function getCpuUsage() {
  const cur = sampleCpu();
  if (!prevCpu) { prevCpu = cur; return 8; }
  const di = cur.idle - prevCpu.idle;
  const dt = cur.total - prevCpu.total;
  prevCpu = cur;
  if (dt <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(100 - (100 * di / dt))));
}

function getDisk() {
  const candidates = [process.cwd(), process.env.HOME || "/home", "/"];
  for (const target of candidates) {
    try {
      const line = execSync(`df -kP ${JSON.stringify(target)}`)
        .toString().trim().split("\n")[1].split(/\s+/);
      const totalKB = parseInt(line[1], 10);
      const usedKB  = parseInt(line[2], 10);
      if (totalKB > 1024 * 1024) {
        return { totalGB: totalKB/1024/1024, usedGB: usedKB/1024/1024, pct: Math.round((usedKB/totalKB)*100) };
      }
    } catch { /* try next */ }
  }
  return { totalGB: 0, usedGB: 0, pct: 0 };
}

function fmtGB(gb) {
  if (gb >= 1024) return (gb/1024).toFixed(1)+"TB";
  if (gb >= 100)  return Math.round(gb)+"GB";
  return gb.toFixed(1)+"GB";
}

function fmtUptime(sec) {
  const d = Math.floor(sec/86400);
  const h = Math.floor((sec%86400)/3600);
  const m = Math.floor((sec%3600)/60);
  const s = Math.floor(sec%60);
  const parts = [];
  if (d) parts.push(`${d} day${d!==1?"s":""}`);
  if (h||d) parts.push(`${h} hour${h!==1?"s":""}`);
  parts.push(`${m} minute${m!==1?"s":""}`);
  if (!d&&!h) parts.push(`${s} second${s!==1?"s":""}`);
  return parts.join(", ");
}

function roundedRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x+r,y); c.lineTo(x+w-r,y); c.quadraticCurveTo(x+w,y,x+w,y+r);
  c.lineTo(x+w,y+h-r); c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  c.lineTo(x+r,y+h); c.quadraticCurveTo(x,y+h,x,y+h-r);
  c.lineTo(x,y+r); c.quadraticCurveTo(x,y,x+r,y);
  c.closePath();
}

function card(c, x, y, w, h, r=18) {
  c.save();
  c.shadowColor="rgba(0,0,0,0.45)"; c.shadowBlur=22; c.shadowOffsetY=4;
  c.fillStyle="rgba(18,18,24,0.78)";
  roundedRect(c,x,y,w,h,r); c.fill(); c.restore();
  c.save(); roundedRect(c,x,y,w,h,r);
  c.strokeStyle="rgba(255,255,255,0.06)"; c.lineWidth=1; c.stroke(); c.restore();
}

function progressBar(c, x, y, w, h, pct, color) {
  c.save(); roundedRect(c,x,y,w,h,h/2); c.fillStyle="rgba(255,255,255,0.10)"; c.fill(); c.restore();
  const fillW = Math.max(h,(w*Math.min(100,Math.max(0,pct)))/100);
  c.save(); roundedRect(c,x,y,fillW,h,h/2); c.fillStyle=color; c.fill(); c.restore();
}

function donut(c, cx, cy, rOuter, rInner, pct, color) {
  const start=-Math.PI/2, end=start+(Math.PI*2*Math.min(100,Math.max(0,pct)))/100;
  c.save(); c.beginPath();
  c.arc(cx,cy,rOuter,0,Math.PI*2); c.arc(cx,cy,rInner,0,Math.PI*2,true);
  c.fillStyle="rgba(255,255,255,0.10)"; c.fill("evenodd"); c.restore();
  c.save(); c.beginPath(); c.moveTo(cx,cy); c.arc(cx,cy,rOuter,start,end); c.closePath();
  c.fillStyle=color; c.fill();
  c.globalCompositeOperation="destination-out";
  c.beginPath(); c.arc(cx,cy,rInner,0,Math.PI*2); c.fill(); c.restore();
}

function pie(c, cx, cy, r, pct, color) {
  c.save(); c.beginPath(); c.arc(cx,cy,r,0,Math.PI*2); c.fillStyle="rgba(255,255,255,0.10)"; c.fill(); c.restore();
  const start=-Math.PI/2, end=start+(Math.PI*2*Math.min(100,Math.max(0,pct)))/100;
  c.save(); c.beginPath(); c.moveTo(cx,cy); c.arc(cx,cy,r,start,end); c.closePath(); c.fillStyle=color; c.fill(); c.restore();
}

function cpuWave(c, x, y, w, h, pct) {
  c.save(); roundedRect(c,x,y,w,h,6); c.clip();
  c.fillStyle="rgba(255,255,255,0.06)"; c.fillRect(x,y,w,h);
  const bars=64, bw=w/bars, seed=Date.now()/1000;
  for (let i=0;i<bars;i++) {
    const noise=0.5+0.5*Math.sin(i*0.45+seed)*Math.cos(i*0.21+seed*0.7);
    const intensity=(pct/100)*0.85+0.15;
    const bh=Math.max(2,h*noise*intensity), by=y+(h-bh);
    c.fillStyle=i<bars*(pct/100)?"rgba(178,168,250,0.95)":"rgba(140,150,170,0.55)";
    c.fillRect(x+i*bw+0.5,by,bw-1,bh);
  }
  c.restore();
}

async function buildImage() {
  const { createCanvas, loadImage, registerFont } = require("canvas");
  ensureFonts(createCanvas, registerFont);

  const bg = await loadImage(path.join(ASSETS, "blank.png"));
  const W=bg.width, H=bg.height;
  const cv=createCanvas(W,H), c=cv.getContext("2d");
  c.drawImage(bg,0,0,W,H);

  const leftBandW=568, rightBandX=W-568;
  c.fillStyle="rgba(0,0,0,0.22)";
  c.fillRect(0,0,leftBandW,H); c.fillRect(rightBandX,0,W-rightBandX,H);

  const cpus=os.cpus();
  const cpuModel=(cpus[0]&&cpus[0].model||"Unknown CPU").replace(/\(R\)|\(TM\)|CPU/gi,"").replace(/\s+@.*$/,"").replace(/\s+/g," ").trim();
  const cores=cpus.length, cpuPct=getCpuUsage();
  const totalRamGB=os.totalmem()/1024/1024/1024;
  const usedRamGB=(os.totalmem()-os.freemem())/1024/1024/1024;
  const ramPct=Math.round((usedRamGB/totalRamGB)*100);
  const disk=getDisk(), nodeVer=process.version;

  const upStr=(()=>{
    try {
      const f=path.join(process.cwd(),"data","first-start.json");
      const d=JSON.parse(fs.readFileSync(f,"utf-8"));
      const sec=Math.floor((Date.now()-Number(d.ts||0))/1000);
      if (sec>0) return fmtUptime(sec);
    } catch (_) {}
    return fmtUptime(Math.floor((Date.now()-(global.GoatBot?.startTime||Date.now()))/1000)||Math.floor(process.uptime()));
  })();

  const cities=[
    {name:"Gomel",        tz:"Europe/Minsk"},
    {name:"Cairo",        tz:"Africa/Cairo"},
    {name:"Casablanca",   tz:"Africa/Casablanca"},
    {name:"Algeria",      tz:"Africa/Algiers"},
    {name:"Libya",        tz:"Africa/Tripoli"},
    {name:"Saudi Arabia", tz:"Asia/Riyadh"},
    {name:"Spain",        tz:"Europe/Madrid"},
  ];

  const accent="#b2a8fa", accentSoft="rgba(178,168,250,0.85)", subText="rgba(220,220,230,0.88)", labelText="rgba(255,255,255,0.60)";
  const leftX=24, leftW=520, rightW=520, rightX=W-24-rightW, gap=16, padL=28;

  const timeY=22, timeHeaderH=38, timeRowH=100, timeRows=4, timeH=timeHeaderH+timeRows*timeRowH+24;
  card(c,leftX,timeY,leftW,timeH);
  c.fillStyle=labelText; c.font="500 16px Roboto"; c.fillText("WORLD CLOCKS",leftX+padL,timeY+30);
  for (let i=0;i<cities.length;i++) {
    const col=i%2, row=Math.floor(i/2), colW=(leftW-padL*2)/2;
    const cx0=leftX+padL+col*colW, cy0=timeY+14+timeHeaderH+row*timeRowH;
    c.fillStyle=subText; c.font="400 19px Roboto"; c.fillText(cities[i].name,cx0,cy0+12);
    c.fillStyle="#ffffff"; c.font="300 50px Roboto"; c.fillText(moment.tz(cities[i].tz).format("HH:mm"),cx0,cy0+60);
  }

  let curY=timeY;
  const cpuH=168;
  card(c,rightX,curY,rightW,cpuH);
  c.fillStyle="#ffffff"; c.font="500 24px Roboto"; c.fillText("CPU Info",rightX+padL,curY+38);
  c.fillStyle=subText; c.font="400 18px Roboto";
  const cpuLabel="Model: "+cpuModel, maxCpuLabelW=rightW-padL*2;
  let displayed=cpuLabel;
  while (c.measureText(displayed).width>maxCpuLabelW&&displayed.length>4) displayed=displayed.slice(0,-2);
  if (displayed!==cpuLabel) displayed=displayed.slice(0,-1)+"…";
  c.fillText(displayed,rightX+padL,curY+70); c.fillText(`Cores: ${cores}`,rightX+padL,curY+96);
  c.fillStyle=subText; c.fillText(`Usage: ${cpuPct}%`,rightX+padL,curY+132);
  cpuWave(c,rightX+padL+130,curY+114,rightW-padL*2-130,28,cpuPct);
  curY+=cpuH+gap;

  const memH=116;
  card(c,rightX,curY,rightW,memH);
  donut(c,rightX+padL+26,curY+memH/2,32,19,ramPct,accent);
  c.fillStyle="#ffffff"; c.font="500 22px Roboto"; c.fillText("Memory",rightX+padL+80,curY+38);
  progressBar(c,rightX+padL+80,curY+54,rightW-padL*2-80,10,ramPct,accentSoft);
  c.fillStyle=subText; c.font="400 18px Roboto";
  c.fillText(`RAM: ${fmtGB(usedRamGB)} / ${fmtGB(totalRamGB)} (Used)`,rightX+padL+80,curY+92);
  curY+=memH+gap;

  const stoH=116;
  card(c,rightX,curY,rightW,stoH);
  pie(c,rightX+padL+26,curY+stoH/2,32,disk.pct,"#7da3e8");
  c.fillStyle="#ffffff"; c.font="500 22px Roboto"; c.fillText("Storage",rightX+padL+80,curY+38);
  progressBar(c,rightX+padL+80,curY+54,rightW-padL*2-80,10,disk.pct,"rgba(125,163,232,0.85)");
  c.fillStyle=subText; c.font="400 18px Roboto";
  c.fillText(`SSD: ${fmtGB(disk.usedGB)} / ${fmtGB(disk.totalGB)} (Used)`,rightX+padL+80,curY+92);
  curY+=stoH+gap;

  const devH=86;
  card(c,rightX,curY,rightW,devH);
  c.fillStyle="#ffffff"; c.font="500 22px Roboto"; c.fillText("Dev Environment",rightX+padL,curY+34);
  c.fillStyle=subText; c.font="400 18px Roboto"; c.fillText(`Node.js Version: ${nodeVer}`,rightX+padL,curY+64);
  curY+=devH+gap;

  const specRows=[
    ["Uptime",         upStr],
    ["Bot ID",         String(global.GoatBot?.botID||"—")],
    ["Commands",       String(global.GoatBot?.commands?.size||0)+" loaded"],
    ["Lock / Silent",  `${global._botLocked?"🔒":"🔓"} / ${global._silentMode?"🔇":"🔊"}`],
  ];

  const upH=220;
  card(c,rightX,curY,rightW,upH);
  c.fillStyle="#ffffff"; c.font="500 22px Roboto"; c.fillText("Bot Status",rightX+padL,curY+34);
  specRows.forEach(([lbl,val],i)=>{
    const ry=curY+64+i*38;
    c.fillStyle=labelText; c.font="400 15px Roboto"; c.fillText(lbl+":",rightX+padL,ry);
    c.fillStyle=subText; c.font="400 16px Roboto";
    let v=val;
    const maxW=rightW-padL*2-148;
    while (c.measureText(v).width>maxW&&v.length>2) v=v.slice(0,-2);
    if (v!==val) v=v.slice(0,-1)+"…";
    c.fillText(v,rightX+padL+148,ry);
  });

  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR,{recursive:true});
  const out=path.join(CACHE_DIR,`uptime_${Date.now()}.png`);
  fs.writeFileSync(out,cv.toBuffer("image/png"));
  return out;
}

// ── Text fallback ─────────────────────────────────────────────────────────────
function _fmtUptime(ms) {
  const s=Math.floor(ms/1000), m=Math.floor(s/60), h=Math.floor(m/60), d=Math.floor(h/24);
  const parts=[];
  if (d) parts.push(`${d} يوم`);
  if (h%24) parts.push(`${h%24} ساعة`);
  if (m%60) parts.push(`${m%60} دقيقة`);
  parts.push(`${s%60} ثانية`);
  return parts.join(" و ");
}
function _bar(pct,len=12){const f=Math.round(pct/100*len);return"█".repeat(f)+"░".repeat(len-f);}

async function textFallback(message) {
  const cfg=global.GoatBot?.config||{};
  const upMs=Date.now()-(global.GoatBot?.startTime||Date.now());
  const mem=process.memoryUsage(), sysM={total:os.totalmem(),free:os.freemem()};
  const heapPct=Math.round(mem.heapUsed/mem.heapTotal*100);
  const sysRamPct=Math.round((sysM.total-sysM.free)/sysM.total*100);
  const heapMB=(mem.heapUsed/1048576).toFixed(1), totalMB=(mem.heapTotal/1048576).toFixed(1);
  const sysUsed=((sysM.total-sysM.free)/1073741824).toFixed(2), sysTot=(sysM.total/1073741824).toFixed(2);
  const motor1Active=Object.values(global.motorData||{}).filter(d=>d?.status).length;
  const motor2Active=Object.values(global.motorData2||{}).filter(d=>d?.status).length;
  let nameLocks=0,nickLocks=0;
  try{nameLocks=require("../engine/nameLocks").getLocks().size;}catch(_){}
  try{nickLocks=require("../engine/nicknameLocks").getLocks().size;}catch(_){}
  const lines=[
    `╔════════ ${cfg.botName||"Veil"} ════════╗`,
    `║  🤖 Bot ID : ${global.GoatBot?.botID||"—"}`,
    `║  ⏱  Uptime : ${_fmtUptime(upMs)}`,
    `║  🏓 Ping   : ${process.uptime().toFixed(0)}s process`,
    `║  📦 Cmds   : ${global.GoatBot?.commands?.size||0} أمر`,
    `║  💾 Heap   : ${heapMB}/${totalMB} MB  [${_bar(heapPct)}] ${heapPct}%`,
    `║  💻 RAM    : ${sysUsed}/${sysTot} GB  [${_bar(sysRamPct)}] ${sysRamPct}%`,
    `║  ⚙️  Node  : ${process.version}`,
    `║  🔒 قفل   : ${global._botLocked?"🔴 مقفول":"🟢 مفتوح"}`,
    `║  🔇 صامت  : ${global._silentMode?"✅ مفعل":"❌ متوقف"}`,
    `║  🔁 Motor1 : ${motor1Active} | Motor2 : ${motor2Active}`,
    `║  📛 Locks  : Name:${nameLocks} Nick:${nickLocks}`,
    `╚══════════════════════════╝`,
  ];
  message.reply(lines.join("\n"));
}

module.exports = {
  config: {
    name: "ابتيم",
    aliases: ["uptime", "up", "وقت"],
    version: "3.0.0",
    hasPermssion: 0,
    credits: "ZAO Team / Veil",
    countDown: 5,
    role: 0,
    category: "معلومات",
    commandCategory: "معلومات",
    description: "عرض معلومات السيرفر بتصميم مرئي",
    guide: { en: "{pn} — عرض وقت التشغيل والإحصائيات" },
  },

  onStart: async function({ api, event, message }) {
    let filePath;
    try {
      sampleCpu();
      await new Promise(r => setTimeout(r, 250));
      filePath = await buildImage();
      await new Promise((resolve, reject) => {
        api.sendMessage(
          { attachment: require("fs").createReadStream(filePath) },
          event.threadID,
          (err) => (err ? reject(err) : resolve()),
          event.messageID
        );
      });
    } catch (err) {
      console.error("[ابتيم] canvas error, using text fallback:", err.message);
      await textFallback(message);
    } finally {
      if (filePath) setTimeout(() => { try { require("fs").unlinkSync(filePath); } catch {} }, 15000); }
  },
};

module.exports.run = module.exports.onStart;
