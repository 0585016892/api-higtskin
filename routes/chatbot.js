const express = require("express");
const multer = require("multer");
const axios = require("axios");

const router = express.Router();
const upload = multer();

router.post("/", upload.single("image"), async (req, res) => {
  console.log("\n===== OPENROUTER CHAT REQUEST =====");

  try {
    const { message } = req.body;
    const imageFile = req.file;

    console.log("📩 Message:", message);
    console.log("🖼 Có ảnh:", !!imageFile);

    const prompt = `
Bạn là chuyên gia chăm sóc da nhiều năm kinh nghiệm tại Highskin Spa.

🎯 Nhiệm vụ của bạn:
- Chỉ tư vấn về: mụn (mụn viêm, mụn ẩn, mụn đầu đen, mụn lưng), da dầu, da khô, da nhạy cảm, nám, tàn nhang, lỗ chân lông to.
- Không trả lời các chủ đề ngoài chăm sóc da.
- Nếu khách hỏi ngoài phạm vi → trả lời lịch sự rằng spa chỉ tư vấn về da.

📌 Cách trả lời:
- Ngắn gọn (3–6 dòng)
- Dễ hiểu
- Thân thiện như đang tư vấn trực tiếp
- Không dùng thuật ngữ y khoa phức tạp
- Không chẩn đoán bệnh
- Không kê đơn thuốc
- Không khẳng định điều trị khỏi 100%
- Có thể gợi ý khách đến spa để soi da nếu cần

📌 Khi tư vấn:
- Giải thích nguyên nhân ngắn gọn
- Đưa ra hướng chăm sóc cơ bản tại nhà
- Nếu tình trạng nặng → khuyên nên gặp chuyên gia

📌 Nếu khách chỉ chào hỏi (ví dụ: "hey", "hello"):
→ Trả lời thân thiện và hỏi khách đang gặp vấn đề da gì.

📌 Nếu có hình ảnh:
→ Phân tích tổng quan (không chẩn đoán bệnh)
→ Nhận xét tình trạng da nhìn thấy
→ Đưa lời khuyên nhẹ nhàng

Giữ giọng văn tích cực, chuyên nghiệp nhưng gần gũi.

Câu hỏi khách hàng: ${message}
`;

    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "meta-llama/llama-3-8b-instruct",
        messages: [
          { role: "system", content: "Bạn là chuyên gia da liễu spa." },
          { role: "user", content: prompt }
        ],
        max_tokens: 500
      },
      {
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const reply = response.data.choices[0].message.content;

    console.log("✅ OpenRouter trả về:");
    console.log(reply);

    return res.json({
      success: true,
      reply
    });

  } catch (error) {
    console.error("❌ OpenRouter Error:");
    console.error(error.response?.data || error.message);

    return res.status(500).json({
      success: false,
      reply: "Hệ thống tạm thời gián đoạn, bạn thử lại nhé ❤️"
    });
  }
});

module.exports = router;
