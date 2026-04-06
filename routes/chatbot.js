const express = require("express");
const router = express.Router();
const multer = require("multer");
const sharp = require("sharp");
const db = require("../db");

const upload = multer({ dest: "uploads/" });

/* ------------------ AI PHÂN TÍCH DA (demo) ------------------ */

function analyzeSkin() {

  const conditions = [
  "Có dấu hiệu da dầu nhẹ",
  "Có thể có mụn ẩn vùng má",
  "Lỗ chân lông hơi to vùng mũi",
  "Da hơi thiếu ẩm",
  "Có dấu hiệu bít tắc lỗ chân lông",

  "Có dấu hiệu mụn đầu đen vùng mũi",
  "Da có thể đang thiếu nước",
  "Có dấu hiệu thâm mụn nhẹ",
  "Da có vùng nhạy cảm",
  "Có dấu hiệu da hỗn hợp thiên dầu",
  "Có dấu hiệu da xỉn màu",
  "Có thể có mụn viêm nhẹ",
  "Có dấu hiệu lỗ chân lông to vùng má",
  "Da có thể bị stress do môi trường",
  "Có dấu hiệu da thiếu dưỡng chất"
];

  const results = [];

  const count = Math.floor(Math.random() * 3) + 1;

  for (let i = 0; i < count; i++) {

    const random = conditions[Math.floor(Math.random() * conditions.length)];

    if (!results.includes(random)) {
      results.push(random);
    }

  }

  return results;
}

/* ------------------ API CHATBOT ------------------ */

router.post("/", upload.single("image"), async (req, res) => {
  console.log(res.file);
  
  console.log("📩 Chatbot request received");

  try {

    const { message } = req.body;
    const file = req.file;

    console.log("➡ message:", message);
    console.log("➡ file:", file ? file.originalname : "no image");

    /* ---------- IMAGE ANALYSIS ---------- */

    if (file) {

      const inputPath = file.path;
      const outputPath = "uploads/processed_" + file.filename + ".jpg";

      await sharp(inputPath)
        .resize(512, 512)
        .jpeg({ quality: 80 })
        .toFile(outputPath);

      const result = analyzeSkin();

      const reply = `
Spa đã phân tích ảnh da của bạn:

• ${result.join("\n• ")}

Bạn có thể cho spa biết thêm:
- Da bị bao lâu
- Có skincare gì chưa
`;

      console.log("📤 Response:", reply);

      return res.json({
        success: true,
        type: "image_analysis",
        reply,
        image: outputPath
      });

    }

    /* ---------- TEXT CHATBOT ---------- */

    if (message) {

      const msg = message.toLowerCase();

      console.log("💬 Processing message:", msg);

      /* lấy keywords */

      const [keywords] = await db.query(`
        SELECT k.keyword, i.response
        FROM chatbot_keywords k
        JOIN chatbot_intents i
        ON k.intent = i.intent
      `);

      console.log("📊 Keywords:", keywords.length);

      let reply = null;

      for (let row of keywords) {

        if (msg.includes(row.keyword.toLowerCase())) {

          console.log("✅ Match keyword:", row.keyword);

          reply = row.response;
          break;

        }

      }

      /* fallback tìm câu hỏi */

      if (!reply) {

        const [questions] = await db.query(`
          SELECT q.question, i.response
          FROM chatbot_questions q
          JOIN chatbot_intents i
          ON q.intent = i.intent
        `);

        console.log("📊 Questions:", questions.length);

        for (let row of questions) {

          if (msg.includes(row.question.toLowerCase())) {

            console.log("✅ Match question:", row.question);

            reply = row.response;
            break;

          }

        }

      }

      if (!reply) {
        reply = "Spa chưa có câu trả lời phù hợp.";
      }

      console.log("📤 Response:", reply);

      return res.json({
        success: true,
        type: "chat",
        reply
      });

    }

    return res.json({
      success: false,
      reply: "Spa chưa nhận được nội dung."
    });

  } catch (error) {

    console.error("🔥 Server error:", error);

    res.status(500).json({
      success: false,
      reply: "Có lỗi server."
    });

  }

});

module.exports = router;