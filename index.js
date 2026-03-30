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

// ✅ 多人白名单
const ALLOWED_USERS = ['black_1816', 'GleidShulkerBox'].map(u => u.toLowerCase());

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
      if (m.includes('/register')) {
        bot.chat(`/register ${AUTHME_PASSWORD} ${AUTHME_PASSWORD}`);
      }

      if (m.includes('/login')) {
        bot.chat(`/login ${AUTHME_PASSWORD}`);
      }

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

      // ===== 私聊控制 =====
      const whisperPattern = new RegExp(
        `^\\[(${ALLOWED_USERS.join('|')}) -> ${BOT_USERNAME.toLowerCase()}\\]\\s*(.+)$`,
        'i'
      );

      const match = msg.match(whisperPattern);

      if (match && match[2]) {
        const content = match[2].trim();

        if (content.startsWith('!')) {
          const sayContent = content.slice(1).trim();

          if (sayContent.length > 0) {
            console.log(`[私聊 -> 自动说] ${match[1]} → ${sayContent}`);
            bot.chat(sayContent);
          }
        }
      }
    });

    // ===== 公共聊天控制 =====
    bot.on('chat', (username, message) => {
      if (username === bot.username) return;

      const user = username.toLowerCase();

      // ❗ 白名单判断
      if (!ALLOWED_USERS.includes(user)) return;

      const msgLower = message.toLowerCase().trim();

      // @aibot xxx
      if (msgLower.startsWith('@aibot ')) {
        const content = message.slice(7).trim();

        if (content.length > 0) {
          console.log(`[Echo @aibot] ${username} → ${content}`);
          bot.chat(content);
          return;
        }
      }

      // ✅ 谁发就 TP 谁
      if (msgLower === '!home light') {
        console.log(`[命令] ${username} → /tpahere ${username}`);
        bot.chat(`/tpahere ${username}`);
      }

      // ✅ sethome → tpa
      if (msgLower === '!sethome') {
        console.log(`[命令] ${username} → /tpa ${username}`);
        bot.chat(`/tpa ${username}`);
      }
    });
  });

  bot.on('kicked', (reason, loggedIn) => {
    console.log('❌ 被踢出！ 已登录:', loggedIn ? '是' : '否');
    console.log('原因:', reason);
    reconnect('被踢出');
  });

  bot.on('end', () => reconnect('连接结束'));

  bot.on('error', (err) => {
    console.log('⚠️ 错误:', err.message || err);
    reconnect('错误');
  });
}

// ===== 基础反 AFK（20秒跳）=====
function startAntiAFK() {
  if (jumpInterval) return;

  console.log('启动反AFK：每20秒跳一下');

  jumpInterval = setInterval(() => {
    if (!bot?.entity) return;

    bot.setControlState('jump', true);
    setTimeout(() => bot.setControlState('jump', false), 300);
  }, 20000);
}

// ===== 高级防 AFK（蹲 + 跳）=====
function startHumanLikeAFK() {
  if (humanInterval) return;

  humanInterval = setInterval(() => {
    if (!bot?.entity) return;

    console.log('执行防AFK动作：蹲下 + 跳跃');

    bot.setControlState('sneak', true);

    setTimeout(() => {
      bot.setControlState('sneak', false);

      bot.setControlState('jump', true);

      setTimeout(() => {
        bot.setControlState('jump', false);
      }, 400);

    }, 2000);

  }, 120000);
}

// ===== 重连机制 =====
function reconnect(reason = '未知') {
  console.log('❌ 掉线:', reason);

  try { bot?.quit(); } catch {}
  bot?.removeAllListeners();
  bot = null;

  if (jumpInterval) {
    clearInterval(jumpInterval);
    jumpInterval = null;
  }

  if (humanInterval) {
    clearInterval(humanInterval);
    humanInterval = null;
  }

  reconnectAttempts++;

  const delay = Math.min(30000 + (reconnectAttempts - 1) * 15000, 180000);

  console.log(`将在 ${delay / 1000} 秒后第 ${reconnectAttempts} 次重连...`);

  setTimeout(() => {
    reconnecting = false;
    startBot();
  }, delay);
}

startBot();
