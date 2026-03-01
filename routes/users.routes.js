const express = require("express");
const bcrypt = require("bcryptjs");
const router = express.Router();
const db = require("../db");

/**
 * GET /api/users
 * Phân trang + lọc
 */
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 10, role, status, keyword } = req.query;
    const offset = (page - 1) * limit;

    let where = "WHERE 1=1";
    const params = [];

    if (role) {
      where += " AND role = ?";
      params.push(role);
    }

    if (status !== undefined) {
      where += " AND status = ?";
      params.push(status);
    }

    if (keyword) {
      where += " AND (full_name LIKE ? OR email LIKE ?)";
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM users ${where}`,
      params
    );

    const [rows] = await db.query(
      `
      SELECT id, full_name, email, phone, role, status, created_at
      FROM users
      ${where}
      ORDER BY id DESC
      LIMIT ? OFFSET ?
      `,
      [...params, Number(limit), Number(offset)]
    );

    res.json({
      success: true,
      total,
      page: Number(page),
      limit: Number(limit),
      data: rows,
    });
  } catch (err) {
    console.error("GET USERS ERROR:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
});

/**
 * POST /api/users
 * Tạo user
 */
router.post("/", async (req, res) => {
  try {
    const { full_name, email, password, phone, role = "staff", status = 1 } =
      req.body;

    if (!full_name || !email || !password) {
      return res.status(400).json({ message: "Thiếu dữ liệu bắt buộc" });
    }

    const [exist] = await db.query(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );

    if (exist.length) {
      return res.status(400).json({ message: "Email đã tồn tại" });
    }

    const hashPassword = await bcrypt.hash(password, 10);

    await db.query(
      `
      INSERT INTO users (full_name, email, phone, password, role, status)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [full_name, email, phone, hashPassword, role, status]
    );

    res.json({ success: true, message: "Tạo user thành công" });
  } catch (err) {
    console.error("CREATE USER ERROR:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
});

/**
 * PUT /api/users/:id
 * Cập nhật user
 */
router.put("/:id", async (req, res) => {
  try {
    const { full_name, phone, role, status } = req.body;
    const data = { full_name, phone, role, status };

    // remove undefined field
    Object.keys(data).forEach(
      (key) => data[key] === undefined && delete data[key]
    );

    const [result] = await db.query(
      "UPDATE users SET ? WHERE id = ?",
      [data, req.params.id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: "User không tồn tại" });
    }

    res.json({ success: true, message: "Cập nhật thành công" });
  } catch (err) {
    console.error("UPDATE USER ERROR:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
});

/**
 * DELETE /api/users/:id
 * Khoá user (soft delete)
 */
router.delete("/:id", async (req, res) => {
  console.log("🔥 Gọi xóa user vĩnh viễn");

  try {
    const [result] = await db.query(
      "DELETE FROM users WHERE id = ?",
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "User không tồn tại",
      });
    }

    res.json({
      success: true,
      message: "Đã xoá user vĩnh viễn",
    });
  } catch (err) {
    console.error("❌ DELETE USER ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
});

/**
 * POST /api/users/login
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const [users] = await db.query(
      "SELECT * FROM users WHERE email = ? AND status = 1",
      [email]
    );

    if (!users.length) {
      return res.status(401).json({ message: "Sai email hoặc mật khẩu" });
    }

    const user = users[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(401).json({ message: "Sai email hoặc mật khẩu" });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
      },
      token: "FAKE_JWT_TOKEN",
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
});

module.exports = router;
