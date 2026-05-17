const express = require("express");
const router = express.Router();
const db = require("../db");

/**
 * GET /api/invoices
 */

/**
 * PUT /api/invoices/:id/pay
 */
// router.put("/:id/pay", async (req, res) => {
//   try {

//     const { payment_method, final_amount } = req.body;

//     await db.query(`
//       UPDATE invoices
//       SET
//         payment_status = 'paid',
//         payment_method = ?,
//         final_amount = ?
//       WHERE id = ?
//     `, [payment_method, final_amount, req.params.id]);

//     res.json({
//       message: "Thanh toán thành công"
//     });

//   } catch (err) {

//     res.status(500).json({
//       message: err.message
//     });

//   }
// });
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
  const [[invoice]] = await db.query(
    `
    SELECT i.*, c.full_name customer_name, u.full_name staff_name
    FROM invoices i
    LEFT JOIN customers c ON i.customer_id = c.id
    LEFT JOIN users u ON i.staff_id = u.id
    WHERE i.id = ?
  `,
    [req.params.id],
  );

  if (!invoice) {
    return res.status(404).json({ message: "Không tìm thấy hoá đơn" });
  }

  const [items] = await db.query(
    `
    SELECT * FROM invoice_items WHERE invoice_id = ?
  `,
    [req.params.id],
  );

  res.json({
    ...invoice,
    items,
  });
});
router.put("/:id/pay", async (req, res) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    const invoiceId = Number(req.params.id);

    const { payment_method, final_amount, items } = req.body;

    if (!invoiceId) {
      throw new Error("Invoice ID không hợp lệ");
    }

    await connection.query(
      `
      UPDATE invoices
      SET 
        payment_status = 'paid',
        payment_method = ?,
        final_amount = ?
      WHERE id = ?
      `,
      [payment_method || "cash", Number(final_amount) || 0, invoiceId],
    );

    await connection.query(`DELETE FROM invoice_items WHERE invoice_id = ?`, [
      invoiceId,
    ]);

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("Không có dịch vụ trong hóa đơn");
    }
    console.log("ITEMS:", items);
    for (const item of items) {
      const productId = item.product_id || null;
      const serviceId = item.service_id || null;

      if (!productId && !serviceId) {
        throw new Error("Thiếu product_id/service_id");
      }

      const quantity = Number(item.quantity) || 1;
      const price = Number(item.price) || 0;
      const total = Number(item.total) || quantity * price;

      // ✅ Nếu là product thì trừ stock
      if (productId) {
        // Lấy stock hiện tại
        const [rows] = await connection.query(
          `SELECT stock FROM products WHERE id = ? FOR UPDATE`,
          [productId],
        );

        if (rows.length === 0) {
          throw new Error(`Sản phẩm ID ${productId} không tồn tại`);
        }

        const currentStock = rows[0].stock;

        if (currentStock < quantity) {
          throw new Error(`Sản phẩm ID ${productId} không đủ tồn kho`);
        }

        // Trừ stock
        await connection.query(
          `UPDATE products SET stock = stock - ? WHERE id = ?`,
          [quantity, productId],
        );
      }

      // Insert invoice item
      await connection.query(
        `
    INSERT INTO invoice_items
    (invoice_id, product_id, service_id, service_name, quantity, price, total)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
        [
          invoiceId,
          productId,
          serviceId,
          item.service_name || null,
          quantity,
          price,
          total,
        ],
      );
    }
    await connection.commit();

    res.json({ message: "Thanh toán thành công" });
  } catch (err) {
    await connection.rollback();
    console.error("PAY ERROR:", err);
    res.status(500).json({ message: err.message });
  } finally {
    connection.release();
  }
});
module.exports = router;
console.log();
