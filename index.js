const mineflayer = require('mineflayer');
const express = require('express');
const fetch = require('node-fetch');

// ===== HTTP 保活服务器 =====
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => {
  res.send('AFK Bot 在线 - Running on Render');
});
app.listen(PORT, () => {
  console.log(`[Render] HTTP server started on port ${PORT}`);
});

// ===== 自 ping 保活 =====
const RENDER_URL = process.env.RENDER_EXTERNAL_HOSTNAME
  ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
  : `http://localhost:${PORT}`;

setInterval(() => {
  console.log('[Self-Ping] Pinging:', RENDER_URL);
  fetch(RENDER_URL).catch(err => {
    console.error('[Self-Ping] Failed:', err.message);
  });
}, 300000);

// ===== 配置 =====
const CONFIG = {
  host: 'fan.play.hosting',
  port: 25565,
  version: '1.21',
  auth: 'offline',
  checkTimeoutInterval: 300000
};

const BOT_USERNAME = 'GSBbot';
const AUTHME_PASSWORD = process.env.AUTHME_PASSWORD || 'deutschland';

// 白名单用户（可私聊控制机器人）
const ALLOWED_USERS = ['black_1816', 'GleidShulkerBox'].map(u => u.toLowerCase());

// ==================== FACT 系统 ====================
let facts = [
  "这个服务器由热爱Minecraft的玩家共同维护！",
  "使用 $fact 可以随机获得一条服务器趣闻哦~",
  "机器人由 Mineflayer 驱动，24小时在线！",
  "欢迎来到 fan.play.hosting！",
  // 你可以在这里继续添加默认fact
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
  console.log('⏳ 连接中:', BOT_USERNAME);

  bot = mineflayer.createBot({
    ...CONFIG,
    username: BOT_USERNAME
  });

  // 自动接受资源包
  bot.on('resourcePack', () => {
    console.log('[资源包] 收到 → 自动接受');
    bot.acceptResourcePack();
  });

  bot.once('spawn', () => {
    console.log('✅ 已进服，等待 5 秒后尝试 AuthMe');
    setTimeout(() => {
      reconnecting = false;
      bot.chat(`/login ${AUTHME_PASSWORD}`);
      bot.chat(`/register ${AUTHME_PASSWORD} ${AUTHME_PASSWORD}`);
    }, 5000);

    // ===== 消息处理 =====
    bot.on('messagestr', (msg) => {
      const m = msg.toLowerCase();

      // AuthMe 自动处理
      if (m.includes('/register')) bot.chat(`/register ${AUTHME_PASSWORD} ${AUTHME_PASSWORD}`);
      if (m.includes('/login')) bot.chat(`/login ${AUTHME_PASSWORD}`);

      if (
        m.includes('success') ||
        m.includes('logged') ||
        m.includes('验证成功') ||
        m.includes('已登录') ||
        m.includes('welcome')
      ) {
        console.log('✅ AuthMe 完成，开始 AFK');
        startAntiAFK();
        startHumanLikeAFK();
        reconnectAttempts = 0;
      }

      // ===== 私聊控制（白名单用户）=====
      const whisperPattern = new RegExp(
        `^\\[(${ALLOWED_USERS.join('|')}) -> ${BOT_USERNAME.toLowerCase()}\\]\\s*(.+)$`,
        'i'
      );
      const match = msg.match(whisperPattern);
      if (match && match[2]) {
        const content = match[2].trim();
        const sender = match[1];

        // !fact add 新内容
        if (content.toLowerCase().startsWith('!fact add ')) {
          const newFact = content.slice(10).trim();
          if (newFact.length > 0) {
            facts.push(newFact);
            console.log(`[Fact Added] ${sender} 添加了新fact: ${newFact}`);
            bot.whisper(sender, `✅ 已成功添加新fact！当前共有 ${facts.length} 条`);
          }
        }
      }
    });

    // ===== 公共聊天控制 =====
    bot.on('chat', (username, message) => {
      if (username === bot.username) return;
      const user = username.toLowerCase();
      const msgLower = message.toLowerCase().trim();

      // 任何人输入 $fact
      if (msgLower === '$fact') {
        const fact = getRandomFact();
        bot.chat(fact);
        console.log(`[Fact] ${username} 请求 → ${fact}`);
        return;
      }

      // 白名单用户指令
      if (!ALLOWED_USERS.includes(user)) return;

      if (msgLower.startsWith('@aibot ')) {
        const content = message.slice(7).trim();
        if (content) bot.chat(content);
      }

      if (msgLower === '!home light') {
        bot.chat(`/tpahere ${username}`);
      }
      if (msgLower === '!sethome') {
        bot.chat(`/tpa ${username}`);
      }
    });

    // ===== 玩家加入自动欢迎 =====
    bot.on('playerJoined', (player) => {
      if (player.username === bot.username) return;

      console.log(`[Join] ${player.username} 加入服务器，20秒后发送欢迎消息`);

      setTimeout(() => {
        if (bot?.player) {  // 确保机器人还在线
          bot.whisper(player.username, "Hey! You can now use server's public bot! Use $fact to know fact of server!");
          console.log(`[Welcome] 已私聊 ${player.username}`);
        }
      }, 20000);
    });
  });

  bot.on('kicked', (reason) => {
    console.log('❌ 被踢出！原因:', reason);
    reconnect('被踢出');
  });

  bot.on('end', () => reconnect('连接结束'));
  bot.on('error', (err) => {
    console.log('⚠️ 错误:', err.message || err);
    reconnect('错误');
  });
}

// ===== 反AFK 函数（保持不变）=====
function startAntiAFK() {
  if (jumpInterval) return;
  console.log('启动反AFK：每20秒跳一下');
  jumpInterval = setInterval(() => {
    if (!bot?.entity) return;
    bot.setControlState('jump', true);
    setTimeout(() => bot.setControlState('jump', false), 300);
  }, 20000);
}

function startHumanLikeAFK() {
  if (humanInterval) return;
  humanInterval = setInterval(() => {
    if (!bot?.entity) return;
    console.log('执行防AFK动作：蹲下 + 跳跃');
    bot.setControlState('sneak', true);
    setTimeout(() => {
      bot.setControlState('sneak', false);
      bot.setControlState('jump', true);
      setTimeout(() => bot.setControlState('jump', false), 400);
    }, 2000);
  }, 120000);
}

// ===== 重连机制 =====
function reconnect(reason = '未知') {
  console.log('❌ 掉线:', reason);
  try { bot?.quit(); } catch {}
  bot?.removeAllListeners();
  bot = null;

  if (jumpInterval) clearInterval(jumpInterval);
  if (humanInterval) clearInterval(humanInterval);
  jumpInterval = humanInterval = null;

  reconnectAttempts++;
  const delay = Math.min(30000 + (reconnectAttempts - 1) * 15000, 180000);
  console.log(`将在 ${delay / 1000} 秒后第 ${reconnectAttempts} 次重连...`);

  setTimeout(() => {
    reconnecting = false;
    startBot();
  }, delay);
}

startBot();
