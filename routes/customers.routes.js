const express = require("express");
const router = express.Router();
const db = require("../db");

/**
 * GET customers (pagination + search)
 * /api/customers?page=1&limit=10&keyword=
 */
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 10, keyword = "" } = req.query;
    const offset = (page - 1) * limit;

    const [data] = await db.query(
      `
      SELECT *
      FROM customers
      WHERE full_name LIKE ? OR phone LIKE ? OR email LIKE ?
      ORDER BY id DESC
      LIMIT ? OFFSET ?
      `,
      [
        `%${keyword}%`,
        `%${keyword}%`,
        `%${keyword}%`,
        Number(limit),
        Number(offset),
      ]
    );

    const [[{ total }]] = await db.query(
      `
      SELECT COUNT(*) total
      FROM customers
      WHERE full_name LIKE ? OR phone LIKE ? OR email LIKE ?
      `,
      [`%${keyword}%`, `%${keyword}%`, `%${keyword}%`]
    );

    res.json({
      data,
      total,
      page: Number(page),
      limit: Number(limit),
    });
  } catch (err) {
    console.error("❌ GET customers:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET customer detail
 * /api/customers/:id
 */
router.get("/:id", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM customers WHERE id = ?",
      [req.params.id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Không tìm thấy khách hàng" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("❌ GET customer detail:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST customer (thêm)
 */
router.post("/", async (req, res) => {
console.log(req.body);

  try {
    const { full_name, phone, email, skin_type, skin_issue, note ,membership_id} = req.body;

    if (!full_name || !phone) {
      return res.status(400).json({ message: "Thiếu dữ liệu bắt buộc" });
    }

    await db.query(
      `
      INSERT INTO customers
      (full_name, phone, email, skin_type, skin_issue, note,membership_id)
      VALUES (?, ?, ?, ?, ?, ?,4)
      `,
      [full_name, phone, email, skin_type, skin_issue, note,membership_id]
    );

    res.json({ message: "Thêm khách hàng thành công" });
  } catch (err) {
    console.error("❌ POST customer:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * PUT customer (sửa)
 */
router.put("/:id", async (req, res) => {

  try {
    const { full_name, phone, email, skin_type, skin_issue, note,membership_id } = req.body;

    await db.query(
      `
      UPDATE customers
      SET full_name=?, phone=?, email=?, skin_type=?, skin_issue=?, note=?,membership_id=?
      WHERE id=?
      `,
      [
        full_name,
        phone,
        email,
        skin_type,
        skin_issue,
        note,
        membership_id,
        req.params.id,
      ]
    );

    res.json({ message: "Cập nhật khách hàng thành công" });
  } catch (err) {
    console.error("❌ PUT customer:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * DELETE customer (xoá vĩnh viễn)
 */
router.delete("/:id", async (req, res) => {
  try {
    await db.query("DELETE FROM customers WHERE id=?", [req.params.id]);
    res.json({ message: "Đã xoá khách hàng" });
  } catch (err) {
    console.error("❌ DELETE customer:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET appointments by customer
 * /api/customers/:id/appointments
 */
/**
 * GET appointments by customer
 * /api/customers/:id/appointments
 */
router.get("/:id/appointments", async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT 
        a.id,
        a.appointment_time,
        a.status,
        a.note,
        s.name AS service_name,
        u.full_name AS staff_name
      FROM appointments a
      JOIN services s ON a.service_id = s.id
      LEFT JOIN users u ON a.staff_id = u.id
      WHERE a.customer_id = ?
      ORDER BY a.appointment_time DESC
      `,
      [req.params.id]
    );

    res.json(rows);
  } catch (err) {
    console.error("❌ GET appointments:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET invoices by customer
 * /api/customers/:id/invoices
 */
/**
 * GET invoices by customer
 * /api/customers/:id/invoices
 */
router.get("/:id/invoices", async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT 
        id,
        total_amount,
        payment_method,
        payment_status,
        created_at
      FROM invoices
      WHERE customer_id = ?
      ORDER BY created_at DESC
      `,
      [req.params.id]
    );

    res.json(rows);
  } catch (err) {
    console.error("❌ GET invoices:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
