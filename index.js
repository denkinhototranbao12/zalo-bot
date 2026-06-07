const express = require('express');
const app = express();
app.use(express.json());

// ========== CẤU HÌNH — THAY CÁC GIÁ TRỊ NÀY ==========
const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY || 'sk-ant-XXXXX';
const ZALO_TOKEN    = process.env.ZALO_TOKEN    || '';
// =======================================================

// Kiểm tra bot đang chạy
app.get('/', (req, res) => {
  res.send('✅ Mini Aimer Bot đang chạy!');
});

// Nhận code OAuth từ Zalo
app.get('/callback', (req, res) => {
  const code = req.query.code;
  if (code) {
    console.log('✅ ZALO CODE:', code);
    res.send(`
      <h2>✅ Lấy code thành công!</h2>
      <p>Code: <b>${code}</b></p>
      <p>Copy code này và báo cho admin để lấy Access Token!</p>
    `);
  } else {
    res.send('<h2>❌ Không có code!</h2>');
  }
});

// Webhook nhận sự kiện từ Zalo
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  const event = req.body;
  console.log('📩 Webhook nhận được:', JSON.stringify(event));

  // ====================================================
  // SỰ KIỆN 1: Khách FOLLOW OA (theo dõi trang)
  // => Gửi tin chào + nút "Nhận quà ngay"
  // ====================================================
  if (event.event_name === 'follow') {
    const userId   = event.follower.id;
    const userName = event.follower.display_name || 'bạn';

    console.log(`🎉 Khách mới follow: ${userName}`);
    await sendWelcomeMessage(userId, userName);
  }

  // ====================================================
  // SỰ KIỆN 2: Khách gửi tin nhắn text
  // ====================================================
  if (event.event_name === 'user_send_text') {
    const userId  = event.sender.id;
    const userMsg = event.message.text.trim();

    console.log(`👤 Khách nhắn: ${userMsg}`);

    // Nếu khách nhấn nút "Nhận quà ngay" (gửi text này)
    if (userMsg === 'Nhận quà ngay' || userMsg === 'nhan qua ngay' || userMsg === '🎁 Nhận quà ngay') {
      await sendGiftMessage(userId);
    } else {
      // Các tin nhắn khác → gọi AI trả lời
      const reply = await getAIReply(userMsg);
      await sendZaloMessage(userId, reply);
    }
  }

  // ====================================================
  // SỰ KIỆN 3: Khách nhấn nút (button) trong tin nhắn
  // ====================================================
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
            buttons: [
              {
                type: 'oa.query.show',
                title: '🎁 Nhận quà ngay',
                payload: 'NHAN_QUA_NGAY'
              }
            ]
          }
        }
      }
    };

    const response = await fetch('https://openapi.zalo.me/v3.0/oa/message/cs', {
      method: 'POST',
      headers: {
        'access_token': ZALO_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    console.log('📤 Gửi tin chào mừng:', data);

  } catch (error) {
    console.error('❌ Lỗi gửi tin chào:', error);
  }
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

// ========== HÀM GỌI CLAUDE AI ==========
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
Hãy trả lời ngắn gọn, thân thiện, nhiệt tình bằng tiếng Việt.
Các sản phẩm của shop: sữa công thức, tã bỉm, đồ chơi trẻ em, quần áo trẻ em, phụ kiện mẹ bầu.
Nếu khách hỏi giá cụ thể hoặc muốn đặt hàng, hãy trả lời: "Bạn để lại số điện thoại, nhân viên Mini Aimer sẽ tư vấn và báo giá ngay nhé! 💕"
Nếu không biết câu trả lời, hãy nói: "Bạn để lại số điện thoại, nhân viên sẽ hỗ trợ bạn ngay nhé! 💕"`,
        messages: [
          { role: 'user', content: userMessage }
        ]
      })
    });

    const data = await response.json();

    if (data.content && data.content[0] && data.content[0].text) {
      return data.content[0].text;
    }

    return 'Xin lỗi bạn nhé! Bạn để lại số điện thoại, nhân viên Mini Aimer sẽ liên hệ ngay! 💕';

  } catch (error) {
    console.error('❌ AI Error:', error);
    return 'Xin lỗi bạn nhé! Bạn để lại số điện thoại, nhân viên Mini Aimer sẽ liên hệ ngay! 💕';
  }
}

// ========== HÀM GỬI TIN NHẮN THƯỜNG ==========
async function sendZaloMessage(userId, text) {
  try {
    const response = await fetch('https://openapi.zalo.me/v3.0/oa/message/cs', {
      method: 'POST',
      headers: {
        'access_token': ZALO_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        recipient: { user_id: userId },
        message: { text: text }
      })
    });

    const data = await response.json();
    console.log('📤 Kết quả gửi tin:', data);
    return data;

  } catch (error) {
    console.error('❌ Zalo Send Error:', error);
  }
}

// Khởi động server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Mini Aimer Bot đang chạy tại port ${PORT}`);
});
