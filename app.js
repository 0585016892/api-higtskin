require("dotenv").config();
const express = require("express");
const cors = require("cors");
const Pusher = require("pusher");
const db = require("./db"); // Đảm bảo bạn đã import database của mình

const app = express();

/* ===== 1. MIDDLEWARE (Phải đặt trên cùng) ===== */
app.use(cors());
app.use(express.json());

const pusher = new Pusher({
  appId: "2112635",
  key: "c258d7dc53d4386b3659",
  secret: "34340f188aa4b7d54cd5",
  cluster: "ap1",
  useTLS: true,
});

/* ===== 2. WEBHOOK XỬ LÝ THANH TOÁN TỰ ĐỘNG ===== */
// Endpoint này bạn sẽ điền vào phần Webhook URL trên PayOS/Casso
// app.post("/api/webhook/payment", async (req, res) => {
//   try {
//     // Lưu ý: Tùy dịch vụ mà cấu trúc body sẽ khác nhau
//     // Đây là ví dụ phổ biến (invoice_id và status)
//     const { invoice_id, status } = req.body; 

//     if (status === "paid" || status === "success") {
//       // 1. Cập nhật Database hóa đơn trong Spa của bạn
//       // Giả sử bạn dùng Sequelize:
//       await db.Invoice.update(
//         { 
//           payment_status: "paid",
//           payment_method: "banking" 
//         }, 
//         { where: { id: invoice_id } }
//       );

//       // 2. Bắn tín hiệu Pusher cho Frontend (React)
//       pusher.trigger("payment-channel", "payment-confirmed", {
//         invoiceId: invoice_id,
//         message: "Hệ thống đã nhận được tiền!",
//       });

//       console.log(`✅ Hóa đơn #${invoice_id} đã thanh toán thành công.`);
//     }

//     // Luôn phản hồi 200 để bên Ngân hàng không gửi lại thông báo nữa
//     res.status(200).send("OK");
//   } catch (error) {
//     console.error("❌ Lỗi Webhook:", error);
//     res.status(500).send("Internal Server Error");
//   }
// });

/* ===== 3. ROUTES DỊCH VỤ ===== */
app.use("/api/users", require("./routes/users.routes"));
app.use("/api/customers", require("./routes/customers.routes"));
app.use("/api/services", require("./routes/services.routes"));
app.use("/api/appointments", require("./routes/appointments.routes"));
app.use("/api/invoices", require("./routes/invoices.routes"));
app.use("/api/auth", require("./routes/auth"));
app.use("/api/dashboard", require("./routes/dashboard.routes"));
app.use("/api/report", require("./routes/report.routes"));
app.use("/api/settings", require("./routes/settings.routes"));
app.use("/api/membership", require("./routes/membership.routes"));
app.use("/api/chatbot", require("./routes/chatbot"));
app.use("/api/chatbotImage", require("./routes/chatImage"));
app.get("/", (req, res) => {
  res.send("🚀 Highskin Spa API running");
});

/* ===== START SERVER ===== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});