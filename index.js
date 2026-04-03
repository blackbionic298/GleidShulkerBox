const mineflayer = require('mineflayer');
const express = require('express');
const fetch = require('node-fetch');

// ===== HTTP 保活服务器 =====
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => {
  res.send('AFK Bot 在线 - Running on Render');
});
app.listen(PORT, () => console.log(`[Render] HTTP server started on port ${PORT}`));

// ===== 自 ping 保活 =====
const RENDER_URL = process.env.RENDER_EXTERNAL_HOSTNAME
  ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
  : `http://localhost:${PORT}`;

setInterval(() => {
  fetch(RENDER_URL).catch(() => {});
}, 300000);

// ===== 配置 =====
const CONFIG = {
  host: 'fan.play.hosting',
  port: 25565,
  version: '1.21',
  auth: 'offline',
};

const BOT_USERNAME = 'GSBbot';
const AUTHME_PASSWORD = process.env.AUTHME_PASSWORD || 'deutschland';

const ALLOWED_USERS = ['black_1816', 'GleidShulkerBox'].map(u => u.toLowerCase());

// ==================== FACT 系统 ====================
let facts = [
  "这个服务器由热爱Minecraft的玩家共同维护！",
  "使用 $fact 可以随机获得一条服务器趣闻哦~",
  "机器人由 Mineflayer 驱动，24小时在线！",
  "欢迎来到 fan.play.hosting！",
];

function getRandomFact() {
  return facts[Math.floor(Math.random() * facts.length)];
}

// ==================== 机器人本体 ====================
let bot;
let jumpInterval;
let humanInterval;
let reconnecting = false;
let reconnectAttempts = 0;

function startBot() {
  if (reconnecting) return;
  reconnecting = true;

  bot = mineflayer.createBot({
    ...CONFIG,
    username: BOT_USERNAME
  });

  bot.on('resourcePack', () => bot.acceptResourcePack());

  bot.once('spawn', () => {
    setTimeout(() => {
      reconnecting = false;
      bot.chat(`/login ${AUTHME_PASSWORD}`);
      bot.chat(`/register ${AUTHME_PASSWORD} ${AUTHME_PASSWORD}`);
    }, 5000);

    // 消息处理
    bot.on('messagestr', (msg) => {
      const m = msg.toLowerCase();

      if (m.includes('/register')) bot.chat(`/register ${AUTHME_PASSWORD} ${AUTHME_PASSWORD}`);
      if (m.includes('/login')) bot.chat(`/login ${AUTHME_PASSWORD}`);

      if (m.includes('success') || m.includes('logged') || m.includes('验证成功') || m.includes('已登录') || m.includes('welcome')) {
        startAntiAFK();
        startHumanLikeAFK();
        reconnectAttempts = 0;
      }

      // ===== 私聊控制（白名单）=====
      const whisperPattern = new RegExp(`^\\[(${ALLOWED_USERS.join('|')}) -> ${BOT_USERNAME.toLowerCase()}\\]\\s*(.+)$`, 'i');
      const match = msg.match(whisperPattern);
      
      if (match && match[2]) {
        const content = match[2].trim();
        const sender = match[1];

        if (content.toLowerCase().startsWith('!fact add ')) {
          const newFact = content.slice(10).trim();
          if (newFact) {
            facts.push(newFact);
            bot.whisper(sender, `✅ 已添加！当前共有 ${facts.length} 条fact`);
          }
        }

        else if (content.toLowerCase() === '!fact list') {
          if (facts.length === 0) {
            bot.whisper(sender, "📭 目前没有任何fact");
            return;
          }
          let text = `📋 当前fact列表（共 ${facts.length} 条）：\n`;
          facts.forEach((f, i) => text += `${i+1}. ${f}\n`);
          bot.whisper(sender, text);
        }

        else if (content.toLowerCase().startsWith('!fact delete ') || content.toLowerCase().startsWith('!fact remove ')) {
          const numStr = content.split(' ')[2];
          const index = parseInt(numStr) - 1;
          
          if (isNaN(index) || index < 0 || index >= facts.length) {
            bot.whisper(sender, `❌ 无效编号！请输入 1~${facts.length} 之间的数字`);
          } else {
            const deleted = facts.splice(index, 1)[0];
            bot.whisper(sender, `🗑️ 已删除：${deleted}\n当前剩余 ${facts.length} 条`);
          }
        }
      }
    });

    // 公共聊天 $fact
    bot.on('chat', (username, message) => {
      if (username === bot.username) return;
      const msgLower = message.toLowerCase().trim();

      if (msgLower === '$fact') {
        bot.chat(getRandomFact());
      }

      // 其他白名单指令...
      if (!ALLOWED_USERS.includes(username.toLowerCase())) return;

      if (msgLower.startsWith('@aibot ')) bot.chat(message.slice(7).trim());
      if (msgLower === '!home light') bot.chat(`/tpahere ${username}`);
      if (msgLower === '!sethome') bot.chat(`/tpa ${username}`);
    });

    // 玩家加入欢迎
    bot.on('playerJoined', (player) => {
      if (player.username === bot.username) return;
      setTimeout(() => {
        bot.whisper(player.username, "Hey! You can now use server's public bot! Use $fact to know fact of server!");
      }, 20000);
    });
  });

  bot.on('kicked', () => reconnect('被踢出'));
  bot.on('end', () => reconnect('连接结束'));
  bot.on('error', () => reconnect('错误'));
}

// 反AFK 函数（保持不变）
function startAntiAFK() {
  if (jumpInterval) return;
  jumpInterval = setInterval(() => {
    if (bot?.entity) {
      bot.setControlState('jump', true);
      setTimeout(() => bot.setControlState('jump', false), 300);
    }
  }, 20000);
}

function startHumanLikeAFK() {
  if (humanInterval) return;
  humanInterval = setInterval(() => {
    if (bot?.entity) {
      bot.setControlState('sneak', true);
      setTimeout(() => {
        bot.setControlState('sneak', false);
        bot.setControlState('jump', true);
        setTimeout(() => bot.setControlState('jump', false), 400);
      }, 2000);
    }
  }, 120000);
}

function reconnect(reason) {
  console.log('❌ 掉线:', reason);
  try { bot?.quit(); } catch {}
  bot?.removeAllListeners();
  bot = null;
  if (jumpInterval) clearInterval(jumpInterval);
  if (humanInterval) clearInterval(humanInterval);
  
  reconnectAttempts++;
  const delay = Math.min(30000 + (reconnectAttempts-1)*15000, 180000);
  setTimeout(() => {
    reconnecting = false;
    startBot();
  }, delay);
}

startBot();
