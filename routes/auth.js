const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");

const JWT_SECRET = process.env.JWT_SECRET || "SECRET_KEY_123";
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Vui lòng nhập email và mật khẩu",
      });
    }

    const [[user]] = await db.query(
      "SELECT * FROM users WHERE email = ? LIMIT 1",
      [email]
    );

    if (!user) {
      return res.status(400).json({
        message: "Email hoặc mật khẩu không đúng",
      });
    }

    if (user.status === 0) {
      return res.status(403).json({
        message: "Tài khoản đã bị khóa",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({
        message: "Email hoặc mật khẩu không đúng",
      });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Đăng nhập thành công",
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("❌ LOGIN ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: "Chưa đăng nhập" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Token không hợp lệ" });
  }
};
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const [[user]] = await db.query(
      "SELECT * FROM users WHERE id = ?",
      [req.user.id]
    );

    if (!user) {
      return res.status(404).json({ message: "User không tồn tại" });
    }

    res.json(user);
  } catch (err) {
    console.error("❌ ME ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});
/* ================= UPDATE PROFILE ================= */
router.put("/", authMiddleware, async (req, res) => {
  try {
    const { full_name, phone } = req.body;
    const userId = req.user.id;

    // 1. Thực hiện cập nhật (Chỉ cho phép full_name và phone)
    const [result] = await db.query(
      `UPDATE users SET full_name = ?, phone = ? WHERE id = ?`,
      [full_name, phone, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }

    // 2. Lấy lại dữ liệu mới nhất (không lấy password) để trả về cho Frontend
    const [updatedUser] = await db.query(
      `SELECT id, full_name, email, phone, role FROM users WHERE id = ?`,
      [userId]
    );

    res.json({ 
      success: true, 
      message: "Cập nhật hồ sơ thành công",
      data: updatedUser[0] 
    });

  } catch (error) {
    console.error("Update Profile Error:", error);
    res.status(500).json({ message: "Lỗi hệ thống khi cập nhật hồ sơ" });
  }
});
/* ================= CHANGE PASSWORD ================= */
router.put("/password", authMiddleware, async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  const [[user]] = await db.query(
    `SELECT password FROM users WHERE id = ?`,
    [req.user.id]
  );

  const match = await bcrypt.compare(oldPassword, user.password);
  if (!match)
    return res.status(400).json({ message: "Mật khẩu cũ không đúng" });

  const hashed = await bcrypt.hash(newPassword, 10);
  await db.query(
    `UPDATE users SET password = ? WHERE id = ?`,
    [hashed, req.user.id]
  );

  res.json({ success: true });
});

router.post("/logout", (req, res) => {
  res.json({ message: "Đã đăng xuất" });
});
module.exports = router;
