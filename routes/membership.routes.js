const express = require("express");
const router = express.Router();
const pool = require("../db");

/* ===================== MEMBERSHIP API ===================== */

/**
 * GET /api/memberships
 */
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM memberships ORDER BY id DESC"
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi lấy danh sách membership" });
  }
});

/**
 * GET /api/memberships/:id
 */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      "SELECT * FROM memberships WHERE id = ?",
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Membership không tồn tại" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi lấy membership" });
  }
});

/**
 * POST /api/memberships
 */
router.post("/", async (req, res) => {
  try {
    const { name, discount_percent = 0, note = null } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Tên membership là bắt buộc" });
    }

    const [result] = await pool.query(
      `INSERT INTO memberships (name, discount_percent, note)
       VALUES (?, ?, ?)`,
      [name, discount_percent, note]
    );

    res.status(201).json({
      message: "Tạo membership thành công",
      id: result.insertId,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi tạo membership" });
  }
});

/**
 * PUT /api/memberships/:id
 */
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, discount_percent, note } = req.body;

    const [result] = await pool.query(
      `UPDATE memberships
       SET name = ?, discount_percent = ?, note = ?
       WHERE id = ?`,
      [name, discount_percent, note, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Membership không tồn tại" });
    }

    res.json({ message: "Cập nhật membership thành công" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi cập nhật membership" });
  }
});

/**
 * DELETE /api/memberships/:id
 */
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await pool.query(
      "DELETE FROM memberships WHERE id = ?",
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Membership không tồn tại" });
    }

    res.json({ message: "Xóa membership thành công" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi xóa membership" });
  }
});

module.exports = router;
