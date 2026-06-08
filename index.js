const express = require('express');
const app = express();
app.use(express.json());

// ========== CẤU HÌNH ==========
const GEMINI_KEY = process.env.GEMINI_KEY || '';
const ZALO_TOKEN = process.env.ZALO_TOKEN || '';

// Kiểm tra bot đang chạy
app.get('/', (req, res) => {
  res.send('✅ Mini Aimer Bot đang chạy!');
});

// ========== XÁC THỰC DOMAIN ZALO ==========
app.get('/zalo_verifierQT-aD9JVB1zpyFuvkCKlDZFXfJdVbt1lDZGr.html', (req, res) => {
  console.log('✅ Zalo verify request!');
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta property="zalo-platform-site-verification" content="QT-aD9JVB1zpyFuvkCKlDZFXfJdVbt1lDZGr" />
</head>
<body>There Is No Limit To What You Can Accomplish Using Zalo!</body>
</html>`);
});

// Nhận code OAuth từ Zalo
app.get('/callback', (req, res) => {
  const code = req.query.code;
  if (code) {
    console.log('✅ ZALO CODE:', code);
    res.send(`<h2>✅ Lấy code thành công!</h2><p>Code: <b>${code}</b></p><p>Copy code này lại nhé!</p>`);
  } else {
    res.send('<h2>❌ Không có code!</h2>');
  }
});

// Webhook nhận sự kiện từ Zalo
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  const event = req.body;
  console.log('📩 Webhook:', JSON.stringify(event));

  // Khách follow OA → gửi tin chào + nút nhận quà
  if (event.event_name === 'follow') {
    const userId   = event.follower.id;
    const userName = event.follower.display_name || 'bạn';
    console.log(`🎉 Khách mới follow: ${userName}`);
    await sendWelcomeMessage(userId, userName);
  }

  // Khách gửi tin nhắn text
  if (event.event_name === 'user_send_text') {
    const userId  = event.sender.id;
    const userMsg = event.message.text.trim();
    console.log(`👤 Khách nhắn: ${userMsg}`);

    if (userMsg === 'Nhận quà ngay' || userMsg === '🎁 Nhận quà ngay') {
      await sendGiftMessage(userId);
    } else {
      const reply = await getGeminiReply(userMsg);
      await sendZaloMessage(userId, reply);
    }
  }

  // Khách nhấn nút
  if (event.event_name === 'user_send_button') {
    const userId  = event.sender.id;
    const payload = event.message.payload || '';
    console.log(`🔘 Khách nhấn nút: ${payload}`);
    if (payload === 'NHAN_QUA_NGAY') {
      await sendGiftMessage(userId);
    }
  }
});

// ========== GỬI TIN CHÀO MỪNG + NÚT NHẬN QUÀ ==========
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
    const res = await fetch('https://openapi.zalo.me/v3.0/oa/message/cs', {
      method: 'POST',
      headers: { 'access_token': ZALO_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    console.log('📤 Chào mừng:', await res.json());
  } catch (e) { console.error('❌ Lỗi chào:', e); }
}

// ========== GỬI TIN NHẮN QUÀ TẶNG ==========
async function sendGiftMessage(userId) {
  const giftText =
    '🎉 Chúc mừng bạn!\n\n' +
    '✅ Bạn đã được Voucher giảm giá 5%.\n\n' +
    '🎁 Ngoài ra bạn sẽ được 1 món quà với hóa đơn từ 300k trở lên.\n\n' +
    'Liên hệ nhân viên Mini Aimer để được tư vấn và áp dụng ưu đãi nhé! 💕';
  await sendZaloMessage(userId, giftText);
}

// ========== HÀM GỌI GEMINI AI ==========
async function getGeminiReply(userMessage) {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{
            text: `Bạn là trợ lý tư vấn của Mini Aimer - shop mẹ và bé uy tín tại Việt Nam.
Trả lời ngắn gọn, thân thiện, nhiệt tình bằng tiếng Việt.
Sản phẩm: sữa công thức, tã bỉm, đồ chơi trẻ em, quần áo trẻ em, phụ kiện mẹ bầu.
Nếu khách hỏi giá hoặc đặt hàng: "Bạn để lại số điện thoại, nhân viên Mini Aimer tư vấn ngay nhé! 💕"
Nếu không biết: "Bạn để lại số điện thoại, nhân viên sẽ hỗ trợ ngay nhé! 💕"`
          }]
        },
        contents: [{
          parts: [{ text: userMessage }]
        }]
      })
    });

    const data = await response.json();
    console.log('🤖 Gemini response:', JSON.stringify(data));
    
    return data.candidates?.[0]?.content?.parts?.[0]?.text
      || 'Bạn để lại số điện thoại, nhân viên Mini Aimer sẽ hỗ trợ ngay nhé! 💕';

  } catch (e) {
    console.error('❌ Gemini Error:', e);
    return 'Xin lỗi bạn! Bạn để lại số điện thoại, nhân viên liên hệ ngay nhé! 💕';
  }
}

// ========== HÀM GỬI TIN NHẮN ZALO ==========
async function sendZaloMessage(userId, text) {
  try {
    const res = await fetch('https://openapi.zalo.me/v3.0/oa/message/cs', {
      method: 'POST',
      headers: { 'access_token': ZALO_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { user_id: userId }, message: { text } })
    });
    console.log('📤 Gửi tin:', await res.json());
  } catch (e) { console.error('❌ Lỗi gửi:', e); }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Mini Aimer Bot chạy tại port ${PORT}`));
