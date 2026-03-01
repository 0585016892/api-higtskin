const express = require("express");
const router = express.Router();
const db = require("../db");

/**
 * GET /api/dashboard
 */
router.get("/", async (req, res) => {
  try {
    // 1️⃣ Tổng hoá đơn & doanh thu (chỉ tính đã thanh toán)
    const [[invoiceStats]] = await db.query(`
      SELECT 
        COUNT(*) AS totalInvoices,
        IFNULL(SUM(total_amount), 0) AS totalRevenue
      FROM invoices
      WHERE payment_status = 'paid'
    `);

    // 2️⃣ Hoá đơn hôm nay
    const [[todayInvoices]] = await db.query(`
      SELECT COUNT(*) AS todayInvoices
      FROM invoices
      WHERE DATE(created_at) = CURDATE()
    `);

    // 3️⃣ Tổng khách hàng
    const [[customers]] = await db.query(`
      SELECT COUNT(*) AS totalCustomers FROM customers
    `);

    // 4️⃣ Tổng dịch vụ
    const [[services]] = await db.query(`
      SELECT COUNT(*) AS totalServices FROM services
    `);

    // 5️⃣ Trạng thái hoá đơn
    const [invoiceStatus] = await db.query(`
      SELECT payment_status AS status, COUNT(*) AS count
      FROM invoices
      GROUP BY payment_status
    `);

    // 6️⃣ Doanh thu 7 ngày gần nhất
    const [revenue7Days] = await db.query(`
      SELECT 
        DATE(created_at) AS date,
        SUM(total_amount) AS revenue
      FROM invoices
      WHERE payment_status = 'paid'
        AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);

    // 7️⃣ Top dịch vụ bán chạy
    const [topServices] = await db.query(`
      SELECT 
        s.id,
        s.name,
        SUM(ii.quantity) AS sold,
        SUM(ii.total) AS revenue
      FROM invoice_items ii
      JOIN services s ON s.id = ii.service_id
      GROUP BY s.id
      ORDER BY sold DESC
      LIMIT 5
    `);

    // 8️⃣ Lịch hẹn hôm nay
   // 8️⃣ Lịch hẹn hôm nay
const [[todayAppointments]] = await db.query(`
  SELECT COUNT(*) AS todayAppointments
  FROM appointments
  WHERE DATE(appointment_time) = CURDATE()
`);


    // 9️⃣ Tổng feedback
    const [[feedbacks]] = await db.query(`
      SELECT COUNT(*) AS totalFeedbacks FROM feedbacks
    `);

    return res.json({
      success: true,
      data: {
        invoiceStats,
        todayInvoices: todayInvoices.todayInvoices,
        totalCustomers: customers.totalCustomers,
        totalServices: services.totalServices,
        invoiceStatus,
        revenue7Days,
        topServices,
        todayAppointments: todayAppointments.todayAppointments,
        totalFeedbacks: feedbacks.totalFeedbacks,
      },
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).json({
      success: false,
      message: "Lỗi dashboard",
    });
  }
});
router.get("/search", async (req, res) => {
  try {
    const q = req.query.q || "";
    if (!q.trim()) return res.json({ data: [] });

    const keyword = `%${q}%`;

    const [customers] = await db.query(
      `SELECT id, full_name AS name FROM customers WHERE full_name LIKE ? LIMIT 5`,
      [keyword]
    );

    const [services] = await db.query(
      `SELECT id, name FROM services WHERE name LIKE ? LIMIT 5`,
      [keyword]
    );

    const [invoices] = await db.query(
      `SELECT id FROM invoices WHERE CAST(id AS CHAR) LIKE ? LIMIT 5`,
      [keyword]
    );

    const [appointments] = await db.query(
      `SELECT id FROM appointments WHERE note LIKE ? LIMIT 5`,
      [keyword]
    );

    const results = [
      ...customers.map((i) => ({ ...i, type: "customer" })),
      ...services.map((i) => ({ ...i, type: "service" })),
      ...invoices.map((i) => ({ ...i, type: "invoice" })),
      ...appointments.map((i) => ({ ...i, type: "appointment" })),
    ];

    res.json({ success: true, data: results });
  } catch (err) {
    console.error("SEARCH ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Search failed",
    });
  }
});

router.get("/detail/:type/:id", async (req, res) => {
  try {
    const { type, id } = req.params;

    let data = null;

    switch (type) {
      /* ================= CUSTOMER ================= */
      case "customer": {
        const [[customer]] = await db.query(
          `
          SELECT 
            c.id,
            c.full_name,
            c.phone,
            c.email,
            COUNT(i.id) AS totalInvoices,
            IFNULL(SUM(i.total_amount),0) AS totalSpent
          FROM customers c
          LEFT JOIN invoices i ON i.customer_id = c.id
          WHERE c.id = ?
          GROUP BY c.id
        `,
          [id]
        );

        data = customer;
        break;
      }

      /* ================= SERVICE ================= */
      case "service": {
        const [[service]] = await db.query(
          `
          SELECT id, name, price, description
          FROM services
          WHERE id = ?
        `,
          [id]
        );

        data = service;
        break;
      }

      /* ================= INVOICE ================= */
      case "invoice": {
        const [[invoice]] = await db.query(
          `
          SELECT 
            i.id,
            i.total_amount,
            i.payment_status,
            i.created_at,
            c.full_name AS customer_name
          FROM invoices i
          LEFT JOIN customers c ON c.id = i.customer_id
          WHERE i.id = ?
        `,
          [id]
        );

        const [items] = await db.query(
          `
          SELECT 
            s.name,
            ii.quantity,
            ii.total
          FROM invoice_items ii
          JOIN services s ON s.id = ii.service_id
          WHERE ii.invoice_id = ?
        `,
          [id]
        );

        data = {
          ...invoice,
          items,
        };
        break;
      }

      /* ================= APPOINTMENT ================= */
      case "appointment": {
        const [[appointment]] = await db.query(
          `
          SELECT 
            a.id,
            a.appointment_time,
            a.note,
            c.full_name AS customer_name,
            s.name AS service_name
          FROM appointments a
          LEFT JOIN customers c ON c.id = a.customer_id
          LEFT JOIN services s ON s.id = a.service_id
          WHERE a.id = ?
        `,
          [id]
        );

        data = appointment;
        break;
      }

      default:
        return res.status(400).json({
          success: false,
          message: "Type không hợp lệ",
        });
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy dữ liệu",
      });
    }

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error("DETAIL ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Lỗi lấy chi tiết",
    });
  }
});


module.exports = router;
