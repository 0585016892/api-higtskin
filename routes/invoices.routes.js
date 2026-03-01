const express = require("express");
const router = express.Router();
const db = require("../db");

/**
 * GET /api/invoices
 */


/**
 * PUT /api/invoices/:id/pay
 */
router.put("/:id/pay", async (req, res) => {
  const { payment_method } = req.body;

  await db.query(`
    UPDATE invoices
    SET payment_status='paid', payment_method=?
    WHERE id=?
  `, [payment_method, req.params.id]);

  res.json({ message: "Thanh toán thành công" });
});

router.get("/", async (req, res) => {
  const [rows] = await db.query(`
    SELECT i.*, c.full_name customer_name, u.full_name staff_name
    FROM invoices i
    LEFT JOIN customers c ON i.customer_id = c.id
    LEFT JOIN users u ON i.staff_id = u.id
    ORDER BY i.created_at DESC
  `);
  res.json(rows);
});
router.get("/:id", async (req, res) => {
  const [[invoice]] = await db.query(`
    SELECT i.*, c.full_name customer_name, u.full_name staff_name
    FROM invoices i
    LEFT JOIN customers c ON i.customer_id = c.id
    LEFT JOIN users u ON i.staff_id = u.id
    WHERE i.id = ?
  `, [req.params.id]);

  if (!invoice) {
    return res.status(404).json({ message: "Không tìm thấy hoá đơn" });
  }

  const [items] = await db.query(`
    SELECT * FROM invoice_items WHERE invoice_id = ?
  `, [req.params.id]);

  res.json({
    ...invoice,
    items,
  });
});

module.exports = router;
