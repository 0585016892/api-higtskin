const express = require("express");
const router = express.Router();
const db = require("../db"); // mysql2/promise pool

router.get("/", async (req, res) => {
  try {
    const [
      [invoiceStats],
      [invoiceStatus],
      [revenue7Days],
      [todayInvoices],
      [todayAppointments],
      [totalCustomers],
      [totalServices],
      [totalFeedbacks],
      [topServices],
    ] = await Promise.all([

      // 1️⃣ Tổng hóa đơn + doanh thu
      db.query(`
        SELECT 
          COUNT(*) AS totalInvoices,
          IFNULL(SUM(total_amount), 0) AS totalRevenue
        FROM invoices
        WHERE payment_status = 'paid'
      `),

      // 2️⃣ Trạng thái hóa đơn
      db.query(`
        SELECT payment_status, COUNT(*) AS count
        FROM invoices
        GROUP BY payment_status
      `),

      // 3️⃣ Doanh thu 7 ngày
      db.query(`
        SELECT 
          DATE(created_at) AS date,
          SUM(total_amount) AS revenue
        FROM invoices
        WHERE payment_status = 'paid'
          AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `),

      // 4️⃣ Hóa đơn hôm nay
      db.query(`
        SELECT COUNT(*) AS todayInvoices
        FROM invoices
        WHERE DATE(created_at) = CURDATE()
      `),

      // 5️⃣ Lịch hẹn hôm nay
      db.query(`
        SELECT COUNT(*) AS todayAppointments
        FROM appointments
        WHERE DATE(appointment_time) = CURDATE()
      `),

      // 6️⃣ Tổng khách hàng
      db.query(`SELECT COUNT(*) AS totalCustomers FROM customers`),

      // 7️⃣ Tổng dịch vụ
      db.query(`SELECT COUNT(*) AS totalServices FROM services`),

      // 8️⃣ Tổng feedback
      db.query(`SELECT COUNT(*) AS totalFeedbacks FROM feedbacks`),

      // 9️⃣ Top dịch vụ
      db.query(`
        SELECT 
          s.id,
          s.name,
          SUM(ii.quantity) AS total
        FROM invoice_items ii
        JOIN services s ON s.id = ii.service_id
        JOIN invoices i ON i.id = ii.invoice_id
        WHERE i.payment_status = 'paid'
        GROUP BY s.id
        ORDER BY total DESC
        LIMIT 5
      `),
    ]);

    res.json({
      invoiceStats: invoiceStats[0] || { totalInvoices: 0, totalRevenue: 0 },
      invoiceStatus: invoiceStatus || [],
      revenue7Days: revenue7Days || [],
      todayInvoices: todayInvoices[0]?.todayInvoices || 0,
      todayAppointments: todayAppointments[0]?.todayAppointments || 0,
      totalCustomers: totalCustomers[0]?.totalCustomers || 0,
      totalServices: totalServices[0]?.totalServices || 0,
      totalFeedbacks: totalFeedbacks[0]?.totalFeedbacks || 0,
      topServices: topServices || [],
    });

  } catch (err) {
    console.error("REPORT DASHBOARD ERROR:", err);
    res.status(500).json({
      message: "Lỗi lấy báo cáo dashboard",
      error: err.message,
    });
  }
});

module.exports = router;
