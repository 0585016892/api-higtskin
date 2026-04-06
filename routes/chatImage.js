const express = require("express");
const router = express.Router();
const multer = require("multer");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const upload = multer({ dest: "uploads/" });
function analyzeSkin(imagePath) {

  const results = [];

  // random demo (giả lập)
  const conditions = [

    "Có dấu hiệu da dầu nhẹ",
    "Có thể có mụn ẩn vùng má",
    "Lỗ chân lông hơi to vùng mũi",
    "Da hơi thiếu ẩm",
    "Có dấu hiệu bít tắc lỗ chân lông"

  ];

  const count = Math.floor(Math.random() * 3) + 1;

  for (let i = 0; i < count; i++) {

    const random = conditions[Math.floor(Math.random() * conditions.length)];

    if (!results.includes(random)) {
      results.push(random);
    }

  }

  return results;

}
router.post("/", upload.single("image"), async (req, res) => {

  try {

    const file = req.file;

    if (!file) {
      return res.json({
        reply: "Spa chưa nhận được ảnh."
      });
    }

    const inputPath = file.path;
    const outputPath = "uploads/processed_" + file.filename + ".jpg";

    // resize ảnh
    await sharp(inputPath)
      .resize(512, 512)
      .jpeg({ quality: 80 })
      .toFile(outputPath);

    // phân tích da
    const result = analyzeSkin(outputPath);

    let reply = `
Spa đã phân tích ảnh da của bạn:

• ${result.join("\n• ")}

Bạn có thể cho spa biết thêm:
- Da bị bao lâu
- Có skincare gì chưa
`;

    res.json({
      reply,
      image: outputPath
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      reply: "Có lỗi khi xử lý ảnh."
    });

  }

});
module.exports = router;
