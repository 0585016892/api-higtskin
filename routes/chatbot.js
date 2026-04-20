// const express = require("express");
// const router = express.Router();
// const multer = require("multer");
// const sharp = require("sharp");
// const db = require("../db");

// const openai = require("../config/openai");

// const upload = multer({ dest: "uploads/" });

// /* ------------------ AI PHÂN TÍCH DA (demo) ------------------ */

// function analyzeSkin() {

//   const conditions = [
//   "Có dấu hiệu da dầu nhẹ",
//   "Có thể có mụn ẩn vùng má",
//   "Lỗ chân lông hơi to vùng mũi",
//   "Da hơi thiếu ẩm",
//   "Có dấu hiệu bít tắc lỗ chân lông",

//   "Có dấu hiệu mụn đầu đen vùng mũi",
//   "Da có thể đang thiếu nước",
//   "Có dấu hiệu thâm mụn nhẹ",
//   "Da có vùng nhạy cảm",
//   "Có dấu hiệu da hỗn hợp thiên dầu",
//   "Có dấu hiệu da xỉn màu",
//   "Có thể có mụn viêm nhẹ",
//   "Có dấu hiệu lỗ chân lông to vùng má",
//   "Da có thể bị stress do môi trường",
//   "Có dấu hiệu da thiếu dưỡng chất"
// ];

//   const results = [];

//   const count = Math.floor(Math.random() * 3) + 1;

//   for (let i = 0; i < count; i++) {

//     const random = conditions[Math.floor(Math.random() * conditions.length)];

//     if (!results.includes(random)) {
//       results.push(random);
//     }

//   }

//   return results;
// }

// /* ------------------ API CHATBOT ------------------ */

// router.post("/", upload.single("image"), async (req, res) => {
//   console.log(res.file);
  
//   console.log("📩 Chatbot request received");

//   try {

//     const { message } = req.body;
//     const file = req.file;

//     console.log("➡ message:", message);
//     console.log("➡ file:", file ? file.originalname : "no image");

//     /* ---------- IMAGE ANALYSIS ---------- */

//     if (file) {

//       const inputPath = file.path;
//       const outputPath = "uploads/processed_" + file.filename + ".jpg";

//       await sharp(inputPath)
//         .resize(512, 512)
//         .jpeg({ quality: 80 })
//         .toFile(outputPath);

//       const result = analyzeSkin();

//       const reply = `
// Spa đã phân tích ảnh da của bạn:

// • ${result.join("\n• ")}

// Bạn có thể cho spa biết thêm:
// - Da bị bao lâu
// - Có skincare gì chưa
// `;

//       console.log("📤 Response:", reply);

//       return res.json({
//         success: true,
//         type: "image_analysis",
//         reply,
//         image: outputPath
//       });

//     }

//     /* ---------- TEXT CHATBOT ---------- */

//     if (message) {

//       const msg = message.toLowerCase();

//       console.log("💬 Processing message:", msg);

//       /* lấy keywords */

//       const [keywords] = await db.query(`
//         SELECT k.keyword, i.response
//         FROM chatbot_keywords k
//         JOIN chatbot_intents i
//         ON k.intent = i.intent
//       `);

//       console.log("📊 Keywords:", keywords.length);

//       let reply = null;

//       for (let row of keywords) {

//         if (msg.includes(row.keyword.toLowerCase())) {

//           console.log("✅ Match keyword:", row.keyword);

//           reply = row.response;
//           break;

//         }

//       }

//       /* fallback tìm câu hỏi */

//       if (!reply) {

//         const [questions] = await db.query(`
//           SELECT q.question, i.response
//           FROM chatbot_questions q
//           JOIN chatbot_intents i
//           ON q.intent = i.intent
//         `);

//         console.log("📊 Questions:", questions.length);

//         for (let row of questions) {

//           if (msg.includes(row.question.toLowerCase())) {

//             console.log("✅ Match question:", row.question);

//             reply = row.response;
//             break;

//           }

//         }

//       }

//       if (!reply) {
//         reply = "Spa chưa có câu trả lời phù hợp.";
//       }

//       console.log("📤 Response:", reply);

//       return res.json({
//         success: true,
//         type: "chat",
//         reply
//       });

//     }

//     return res.json({
//       success: false,
//       reply: "Spa chưa nhận được nội dung."
//     });

//   } catch (error) {

//     console.error("🔥 Server error:", error);

//     res.status(500).json({
//       success: false,
//       reply: "Có lỗi server."
//     });

//   }

// });

// router.post("/chatbotai", async (req, res) => {
//   try {
//     const { message } = req.body;

//     const response = await openai.chat.completions.create({
//       model: "gpt-4.1-mini",
//       messages: [
//         {
//           role: "system",
//           content: "Bạn là trợ lý tư vấn cho website của tôi.",
//         },
//         {
//           role: "user",
//           content: message,
//         },
//       ],
//     });

//     res.json({
//       reply: response.choices[0].message.content,
//     });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ error: "Lỗi AI" });
//   }
// });

// module.exports = router;

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
