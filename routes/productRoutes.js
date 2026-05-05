const express = require("express");
const router = express.Router();
const db = require("../db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");


// ======================================================
// CONFIG UPLOAD
// ======================================================
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = "uploads/products";
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const uniqueName =
      Date.now() + "-" + Math.round(Math.random() * 1e9) +
      path.extname(file.originalname);
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: function (req, file, cb) {
    const allowed = /jpeg|jpg|png|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    if (ext) cb(null, true);
    else cb(new Error("Chỉ cho phép ảnh jpeg, jpg, png, webp"));
  },
});


// ======================================================
// 1️⃣ GET ALL PRODUCTS
// ======================================================
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const keyword = req.query.keyword || "";
    const category = req.query.category || null;

    const offset = (page - 1) * limit;

    let sql = `SELECT * FROM products WHERE deleted_at IS NULL`;
    let countSql = `SELECT COUNT(*) as total FROM products WHERE deleted_at IS NULL`;

    const params = [];
    const countParams = [];

    if (keyword) {
      sql += " AND name LIKE ?";
      countSql += " AND name LIKE ?";
      params.push(`%${keyword}%`);
      countParams.push(`%${keyword}%`);
    }

    if (category) {
      sql += " AND category_id = ?";
      countSql += " AND category_id = ?";
      params.push(category);
      countParams.push(category);
    }

    sql += " ORDER BY id DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const [data] = await db.query(sql, params);
    const [countResult] = await db.query(countSql, countParams);

    res.json({
      success: true,
      data,
      total: countResult[0].total,
      page,
      limit,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Lỗi lấy danh sách sản phẩm",
    });
  }
});


// ======================================================
// 2️⃣ GET PRODUCT BY ID
// ======================================================
router.get("/:id", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM products WHERE id = ? AND deleted_at IS NULL",
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy sản phẩm",
      });
    }

    res.json({
      success: true,
      data: rows[0],
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Lỗi lấy sản phẩm",
    });
  }
});


// ======================================================
// 3️⃣ CREATE PRODUCT (UPLOAD ẢNH)
// ======================================================
router.post("/", upload.single("image"), async (req, res) => {
        
  try {
    const { name, price, stock, description, category_id } = req.body;

    if (!name || !price) {
      return res.status(400).json({
        success: false,
        message: "Thiếu name hoặc price",
      });
    }

    const imagePath = req.file
      ? `/uploads/products/${req.file.filename}`
      : null;
    console.log(imagePath);
    
    const [result] = await db.query(
      `INSERT INTO products 
       (name, price, stock, description, image, category_id, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        price,
        stock || 0,
        description || "",
        imagePath,
        category_id || null,
        1,
      ]
    );

    res.json({
      success: true,
      message: "Thêm sản phẩm thành công",
      id: result.insertId,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Lỗi thêm sản phẩm",
    });
  }
});


// ======================================================
// 4️⃣ UPDATE PRODUCT
// ======================================================
router.put("/:id", upload.single("image"), async (req, res) => {
  try {
    const { name, price, stock, description, category_id, status } = req.body;

    const [existing] = await db.query(
      "SELECT * FROM products WHERE id = ? AND deleted_at IS NULL",
      [req.params.id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Sản phẩm không tồn tại",
      });
    }

    let imagePath = existing[0].image;

    if (req.file) {
      if (imagePath) {
        const oldPath = "." + imagePath;
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      imagePath = `/uploads/products/${req.file.filename}`;
    }

    await db.query(
      `UPDATE products 
       SET name=?, price=?, stock=?, description=?, image=?, category_id=?, status=? 
       WHERE id=?`,
      [
        name,
        price,
        stock,
        description,
        imagePath,
        category_id,
        status ?? 1,
        req.params.id,
      ]
    );

    res.json({
      success: true,
      message: "Cập nhật sản phẩm thành công",
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Lỗi cập nhật sản phẩm",
    });
  }
});


// ======================================================
// 5️⃣ SOFT DELETE PRODUCT
// ======================================================
router.delete("/:id", async (req, res) => {
  try {
    const [existing] = await db.query(
      "SELECT id FROM products WHERE id = ? AND deleted_at IS NULL",
      [req.params.id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Sản phẩm không tồn tại",
      });
    }

    await db.query(
      "UPDATE products SET deleted_at = NOW() WHERE id = ?",
      [req.params.id]
    );

    res.json({
      success: true,
      message: "Xóa sản phẩm thành công",
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Lỗi xóa sản phẩm",
    });
  }
});

module.exports = router;