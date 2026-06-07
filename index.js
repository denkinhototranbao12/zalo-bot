const express = require('express');
const app = express();
app.use(express.json());

// ========== CẤU HÌNH ==========
const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY || 'sk-ant-XXXXX';
const ZALO_TOKEN    = process.env.ZALO_TOKEN    || '';

// Kiểm tra bot đang chạy
app.get('/', (req, res) => {
  res.send('✅ Mini Aimer Bot đang chạy!');
});

// ========== XÁC THỰC DOMAIN ZALO ==========
// Bắt TẤT CẢ các request GET — kiểm tra nếu là file xác thực Zalo
app.use((req, res, next) => {
  const path = req.path;
  
  // Nếu URL chứa "zalo" hoặc kết thúc bằng .html → trả về nội dung xác thực
  if (path.toLowerCase().includes('zalo') && path.endsWith('.html')) {
    const filename = path.replace('/', ''); // bỏ dấu /
    const content  = filename.replace('.html', ''); // bỏ .html
    console.log('✅ Zalo verify:', path, '→', content);
    res.setHeader('Content-Type', 'text/html');
    return res.send(content);
  }
  
  next();
});

// Nhận code OAuth từ Zalo
app.get('/callback', (req, res) => {
  const code = req.query.code;
  if (code) {
    console.log('✅ ZALO CODE:', code);
    res.send(`<h2>✅ Lấy code thành công!</h2><p>Code: <b>${code}</b></p>`);
  } else {
    res.send('<h2>❌ Không có code!</h2>');
  }
});

// Webhook nhận sự kiện từ Zalo
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  const event = req.body;
  console.log('📩 Webhook:', JSON.stringify(event));

  if (event.event_name === 'follow') {
    const userId   = event.follower.id;
    const userName = event.follower.display_name || 'bạn';
    await sendWelcomeMessage(userId, userName);
  }

  if (event.event_name === 'user_send_text') {
    const userId  = event.sender.id;
    const userMsg = event.message.text.trim();
    if (userMsg === 'Nhận quà ngay' || userMsg === '🎁 Nhận quà ngay') {
      await sendGiftMessage(userId);
    } else {
      const reply = await getAIReply(userMsg);
      await sendZaloMessage(userId, reply);
    }
  }

  if (event.event_name === 'user_send_button') {
    const userId  = event.sender.id;
    const payload = event.message.payload || '';
    if (payload === 'NHAN_QUA_NGAY') {
      await sendGiftMessage(userId);
    }
  }
});

async function sendWelcomeMessage(userId, userName) {
  try {
    const body = {
      recipient: { user_id: userId },
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'button',
            text: `Chào mừng ${userName} đến với Mini Aimer 💕\n\nMini Aimer là shop mẹ và bé uy tín, chuyên cung cấp:\n🍼 Sữa công thức\n👶 Tã bỉm\n🧸 Đồ chơi trẻ em\n👗 Quần áo trẻ em\n\nNhấn nút bên dưới để nhận quà từ Mini Aimer nhé!`,
            buttons: [{ type: 'oa.query.show', title: '🎁 Nhận quà ngay', payload: 'NHAN_QUA_NGAY' }]
          }
        }
      }
    };
    const response = await fetch('https://openapi.zalo.me/v3.0/oa/message/cs', {
      method: 'POST',
      headers: { 'access_token': ZALO_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    console.log('📤 Chào mừng:', await response.json());
  } catch (e) { console.error('❌ Lỗi chào:', e); }
}

async function sendGiftMessage(userId) {
  const giftText =
    '🎉 Chúc mừng bạn!\n\n' +
    '✅ Bạn đã được Voucher giảm giá 5%.\n\n' +
    '🎁 Ngoài ra bạn sẽ được 1 món quà với hóa đơn từ 300k trở lên.\n\n' +
    'Liên hệ nhân viên Mini Aimer để được tư vấn và áp dụng ưu đãi nhé! 💕';
  await sendZaloMessage(userId, giftText);
}

async function getAIReply(userMessage) {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        system: `Bạn là trợ lý tư vấn của Mini Aimer - shop mẹ và bé uy tín tại Việt Nam.
Trả lời ngắn gọn, thân thiện bằng tiếng Việt.
Sản phẩm: sữa công thức, tã bỉm, đồ chơi, quần áo trẻ em, phụ kiện mẹ bầu.
Nếu khách hỏi giá hoặc đặt hàng: "Bạn để lại số điện thoại, nhân viên Mini Aimer tư vấn ngay nhé! 💕"`,
        messages: [{ role: 'user', content: userMessage }]
      })
    });
    const data = await response.json();
    return data.content?.[0]?.text || 'Bạn để lại số điện thoại, nhân viên sẽ hỗ trợ ngay nhé! 💕';
  } catch (e) {
    return 'Xin lỗi bạn! Bạn để lại số điện thoại, nhân viên liên hệ ngay nhé! 💕';
  }
}

async function sendZaloMessage(userId, text) {
  try {
    const response = await fetch('https://openapi.zalo.me/v3.0/oa/message/cs', {
      method: 'POST',
      headers: { 'access_token': ZALO_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { user_id: userId }, message: { text } })
    });
    console.log('📤 Gửi tin:', await response.json());
  } catch (e) { console.error('❌ Lỗi gửi:', e); }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Mini Aimer Bot chạy tại port ${PORT}`));
