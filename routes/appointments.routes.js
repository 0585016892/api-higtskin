const express = require("express");
const router = express.Router();
const db = require("../db");
const nodemailer = require("nodemailer");

// 1. Cấu hình transporter (thông tin server gửi mail)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "tranhung6829@gmail.com", // Email của mày
    pass: "nkqkaccgfjeuyypz",    // Mật khẩu ứng dụng Gmail (16 ký tự)
  },
});
/**
 * ===============================
 * GET /api/appointments
 * Danh sách lịch hẹn (pagination + filter)
 * ===============================
 */
router.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      staff_id,
      service_id,
      customer_name, // Thêm nhận param này từ Frontend
      date, 
    } = req.query;

    const offset = (page - 1) * limit;

    // Khởi tạo WHERE và params
    let where = "WHERE 1=1";
    let params = [];

    // Lọc theo trạng thái
    if (status) {
      where += " AND a.status = ?";
      params.push(status);
    }

    // Lọc theo nhân viên
    if (staff_id) {
      where += " AND a.staff_id = ?";
      params.push(staff_id);
    }

    // Lọc theo dịch vụ
    if (service_id) {
      where += " AND a.service_id = ?";
      params.push(service_id);
    }

    // Lọc theo ngày (YYYY-MM-DD)
    if (date) {
      where += " AND DATE(a.appointment_time) = ?";
      params.push(date);
    }

    // QUAN TRỌNG: Lọc theo tên khách hàng (Tìm kiếm mờ)
    if (customer_name) {
      where += " AND c.full_name LIKE ?";
      params.push(`%${customer_name}%`);
    }

    // Câu lệnh lấy dữ liệu
// Câu lệnh lấy dữ liệu
    const [rows] = await db.query(
      `
      SELECT 
        a.id,
        a.appointment_time,
        a.status,
        a.note,
        a.customer_id,
        a.staff_id,
        a.service_id,
        c.full_name AS customer_name,
        c.phone AS customer_phone,
        s.name AS service_name,
        u.full_name AS staff_name
      FROM appointments a
      JOIN customers c ON a.customer_id = c.id
      JOIN services s ON a.service_id = s.id
      LEFT JOIN users u ON a.staff_id = u.id
      ${where}
      ORDER BY 
        CASE 
          WHEN a.status = 'pending' THEN 1
          WHEN a.status = 'confirmed' THEN 2
          WHEN a.status = 'completed' THEN 3
          WHEN a.status = 'cancelled' THEN 4
          ELSE 5 
        END ASC, 
        a.appointment_time DESC
      LIMIT ? OFFSET ?
      `,
      [...params, Number(limit), Number(offset)]
    );

    // Câu lệnh đếm tổng (Cần JOIN với customers để lọc theo tên khách được)
    const [[{ total }]] = await db.query(
      `
      SELECT COUNT(*) as total
      FROM appointments a
      JOIN customers c ON a.customer_id = c.id
      ${where}
      `,
      params
    );

    res.json({
      data: rows,
      total,
      page: Number(page),
      limit: Number(limit),
    });
  } catch (err) {
    console.error("❌ GET appointments error:", err);
    res.status(500).json({ message: "Lỗi máy chủ khi lấy danh sách lịch hẹn" });
  }
});

/**
 * ===============================
 * POST /api/appointments
 * Tạo lịch hẹn
 * ===============================
 */
router.post("/", async (req, res) => {
  try {
    const {
      customer_id,
      full_name,
      phone,
      email,
      skin_type,
      skin_issue,
      service_id,
      staff_id,
      appointment_time,
      note,
    } = req.body;

    // 1️⃣ Kiểm tra bắt buộc
    if (!service_id || !appointment_time) {
      return res.status(400).json({
        message: "Thiếu dịch vụ hoặc thời gian hẹn"
      });
    }

    let finalCustomerId = customer_id;
    let customerName = full_name;
    let customerPhone = phone;
    let customerEmail = email;

    // 2️⃣ Xử lý khách hàng
    if (!finalCustomerId) {
      if (!full_name || !phone) {
        return res.status(400).json({
          message: "Cần họ tên và số điện thoại khách hàng"
        });
      }

      const [existing] = await db.query(
        "SELECT id, full_name, email FROM customers WHERE phone = ?",
        [phone]
      );

      if (existing.length > 0) {
        finalCustomerId = existing[0].id;
        customerName = existing[0].full_name;
        customerEmail = existing[0].email || email;
      } else {
        const [newCustomer] = await db.query(
          `INSERT INTO customers 
          (full_name, phone, email, skin_type, skin_issue, membership_id)
          VALUES (?, ?, ?, ?, ?, 4)`,
          [full_name, phone, email || null, skin_type || null, skin_issue || null, 4]
        );

        finalCustomerId = newCustomer.insertId;
      }
    } else {
      const [custInfo] = await db.query(
        "SELECT full_name, phone, email FROM customers WHERE id=?",
        [finalCustomerId]
      );

      if (custInfo.length > 0) {
        customerName = custInfo[0].full_name;
        customerPhone = custInfo[0].phone;
        customerEmail = custInfo[0].email;
      }
    }

    // 3️⃣ Kiểm tra dịch vụ
    const [[service]] = await db.query(
      "SELECT id, name, price FROM services WHERE id=? AND status=1",
      [service_id]
    );

    if (!service) {
      return res.status(400).json({
        message: "Dịch vụ không tồn tại hoặc đã ngừng"
      });
    }

    // 4️⃣ Kiểm tra tối đa 3 khách / 1 giờ
    const [[{ totalAppointments }]] = await db.query(
      `SELECT COUNT(*) as totalAppointments
       FROM appointments
       WHERE appointment_time = ?
       AND status != 'cancelled'`,
      [appointment_time]
    );

    if (totalAppointments >= 3) {
      return res.status(400).json({
        message: "Khung giờ đã kín lịch, vui lòng chọn giờ khác"
      });
    }

    // 5️⃣ Kiểm tra KTV
    const finalStaffId = (staff_id && staff_id !== "null") ? staff_id : null;
    let staffName = "Hệ thống tự sắp xếp";

    if (finalStaffId) {
      const [[staff]] = await db.query(
        "SELECT full_name FROM users WHERE id=?",
        [finalStaffId]
      );

      staffName = staff ? staff.full_name : "N/A";

      const [[{ total }]] = await db.query(
        `SELECT COUNT(*) as total
         FROM appointments
         WHERE staff_id = ?
         AND appointment_time = ?
         AND status != 'cancelled'`,
        [finalStaffId, appointment_time]
      );

      if (total > 0) {
        return res.status(400).json({
          message: "Kỹ thuật viên đã có lịch trong giờ này"
        });
      }
    }

    // 6️⃣ Lưu lịch hẹn
    const [result] = await db.query(
      `INSERT INTO appointments
      (customer_id, service_id, staff_id, appointment_time, status, note)
      VALUES (?, ?, ?, ?, 'pending', ?)`,
      [
        finalCustomerId,
        service_id,
        finalStaffId,
        appointment_time,
        note || ""
      ]
    );

    const appointmentId = result.insertId;

    // 7️⃣ Gửi email xác nhận
    if (customerEmail) {
      const mailOptions = {
        from: '"HighSkin Spa" <your-email@gmail.com>',
        to: customerEmail,
        subject: `[HighSkin] Xác nhận đặt lịch: ${service.name}`,
        html: `
          <div style="font-family:Arial;max-width:600px;margin:auto;border:1px solid #eee;border-radius:10px">
            <div style="background:#eb2f96;color:white;padding:20px;text-align:center">
              <h2>XÁC NHẬN ĐẶT LỊCH</h2>
            </div>

            <div style="padding:20px">
              <p>Xin chào <b>${customerName}</b>,</p>
              <p>Lịch hẹn tại <b>HighSkin Spa</b> đã được ghi nhận.</p>

              <div style="background:#fff5f9;padding:15px;border-left:4px solid #eb2f96">
                <p><b>Dịch vụ:</b> ${service.name}</p>
                <p><b>Thời gian:</b> ${appointment_time}</p>
                <p><b>Kỹ thuật viên:</b> ${staffName}</p>
                <p><b>Giá tham khảo:</b> ${Number(service.price).toLocaleString()}₫</p>
              </div>

              <p style="font-size:13px;color:#777">
                Vui lòng đến trước 10 phút. Hotline: 033 604 1807
              </p>
            </div>

            <div style="background:#fafafa;padding:15px;text-align:center;font-size:12px;color:#888">
              © 2026 HighSkin Spa
            </div>
          </div>
        `
      };

      transporter.sendMail(mailOptions).catch(err =>
        console.error("Email Error:", err)
      );
    }

    // 8️⃣ Trả kết quả
    res.json({
      success: true,
      message: "Đặt lịch thành công",
      appointment_id: appointmentId,
      customer_id: finalCustomerId
    });

  } catch (err) {
    console.error("SERVER ERROR:", err);

    res.status(500).json({
      message: "Lỗi hệ thống, vui lòng thử lại sau"
    });
  }
});
/**
 * ===============================
 * PUT /api/appointments/:id
 * Cập nhật lịch hẹn
 * ===============================
 */
router.put("/:id", async (req, res) => {
  try {
    const { appointment_time, staff_id, note } = req.body;

    const [[appointment]] = await db.query(
      "SELECT status FROM appointments WHERE id=?",
      [req.params.id]
    );

    if (!appointment) {
      return res.status(404).json({ message: "Lịch hẹn không tồn tại" });
    }

    if (appointment.status === "completed") {
      return res
        .status(400)
        .json({ message: "Không thể sửa lịch đã hoàn thành" });
    }

    await db.query(
      `
      UPDATE appointments
      SET appointment_time=?, staff_id=?, note=?
      WHERE id=?
      `,
      [appointment_time, staff_id || null, note, req.params.id]
    );

    res.json({ message: "Cập nhật lịch hẹn thành công" });
  } catch (err) {
    console.error("❌ PUT appointment:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * ===============================
 * PUT /api/appointments/:id/cancel
 * Huỷ lịch
 * ===============================
 */
router.put("/:id/cancel", async (req, res) => {
  try {
    await db.query(
      `
      UPDATE appointments
      SET status = 'cancelled'
      WHERE id = ?
      `,
      [req.params.id]
    );

    res.json({ message: "Đã huỷ lịch hẹn" });
  } catch (err) {
    console.error("❌ CANCEL appointment:", err);
    res.status(500).json({ message: "Server error" });
  }
});


/**
 * ===============================
 * PUT /api/appointments/:id/complete
 * Hoàn thành lịch
 * ===============================
 */
router.put("/:id/complete", async (req, res) => {
  const conn = await db.getConnection();

  try {

    const appointmentId = parseInt(req.params.id);

    if (!appointmentId) {
      return res.status(400).json({
        success: false,
        message: "ID lịch hẹn không hợp lệ"
      });
    }

    await conn.beginTransaction();

    // 1️⃣ Lấy appointment + service
    const [rows] = await conn.query(
      `
      SELECT 
        a.id,
        a.customer_id,
        a.staff_id,
        a.service_id,
        a.status,
        s.name AS service_name,
        s.price
      FROM appointments a
      JOIN services s ON a.service_id = s.id
      WHERE a.id = ?
      `,
      [appointmentId]
    );

    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lịch hẹn"
      });
    }

    const appt = rows[0];

    // 2️⃣ Check trạng thái
    if (appt.status !== "confirmed") {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: "Chỉ lịch hẹn đã xác nhận mới được hoàn thành"
      });
    }

    // 3️⃣ Check staff
    if (!appt.staff_id) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: "Chưa gán nhân viên cho lịch hẹn"
      });
    }

    // 4️⃣ Check invoice đã tồn tại chưa
    const [existInvoice] = await conn.query(
      `SELECT id FROM invoices WHERE appointment_id = ? LIMIT 1`,
      [appointmentId]
    );

    if (existInvoice.length > 0) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: "Hóa đơn đã tồn tại cho lịch hẹn này"
      });
    }

    // 5️⃣ Update appointment
    await conn.query(
      `UPDATE appointments SET status = 'completed' WHERE id = ?`,
      [appointmentId]
    );

    // 6️⃣ Create invoice
    const [invoiceResult] = await conn.query(
      `
      INSERT INTO invoices
      (appointment_id, customer_id, staff_id, total_amount, payment_status)
      VALUES (?, ?, ?, ?, 'unpaid')
      `,
      [
        appt.id,
        appt.customer_id,
        appt.staff_id,
        appt.price
      ]
    );

    const invoiceId = invoiceResult.insertId;

    // 7️⃣ Create invoice item
    await conn.query(
      `
      INSERT INTO invoice_items
      (invoice_id, service_id, service_name, price, quantity, total)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        invoiceId,
        appt.service_id,
        appt.service_name,
        appt.price,
        1,
        appt.price
      ]
    );

    await conn.commit();

    return res.json({
      success: true,
      message: "Hoàn thành lịch hẹn và tạo hóa đơn thành công",
      data: {
        invoice_id: invoiceId,
        appointment_id: appointmentId
      }
    });

  } catch (err) {

    await conn.rollback();

    console.error("COMPLETE APPOINTMENT ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Lỗi server"
    });

  } finally {

    conn.release();

  }
});


router.put("/:id/confirm", async (req, res) => {
  try {
    const [[appointment]] = await db.query(
      "SELECT status FROM appointments WHERE id = ?",
      [req.params.id]
    );

    if (!appointment) {
      return res.status(404).json({ message: "Lịch hẹn không tồn tại" });
    }

    if (appointment.status !== "pending") {
      return res
        .status(400)
        .json({ message: "Chỉ xác nhận lịch đang chờ xử lý" });
    }

    await db.query(
      "UPDATE appointments SET status='confirmed' WHERE id=?",
      [req.params.id]
    );

    res.json({ message: "Đã xác nhận lịch hẹn" });
  } catch (err) {
    console.error("❌ CONFIRM appointment:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * ===============================
 * GET /api/customers/:id/appointments
 * Lịch hẹn theo khách hàng
 * ===============================
 */
router.get("/customer/:id", async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT 
        a.id,
        a.appointment_time,
        a.status,
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
    console.error("❌ GET customer appointments:", err);
    res.status(500).json({ message: "Server error" });
  }
});
router.put("/nhanvien/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      customer_id,
      service_id,
      staff_id,
      appointment_time,
      status,
      note
    } = req.body;

    // 1. Kiểm tra xem lịch hẹn có tồn tại không
    const [[appointment]] = await db.query("SELECT * FROM appointments WHERE id = ?", [id]);
    if (!appointment) {
      return res.status(404).json({ message: "Không tìm thấy lịch hẹn" });
    }

    // 2. Kiểm tra trùng lịch nhân viên (Nếu có cập nhật staff_id hoặc appointment_time)
    // Chỉ kiểm tra khi có staff_id và lịch hẹn không phải là 'cancelled'
    const finalStaffId = staff_id !== undefined ? staff_id : appointment.staff_id;
    const finalTime = appointment_time || appointment.appointment_time;

    if (finalStaffId && finalStaffId !== 'null' && finalStaffId !== null) {
      const [[{ total }]] = await db.query(
        `SELECT COUNT(*) total FROM appointments 
         WHERE staff_id = ? 
         AND appointment_time = ? 
         AND id != ? 
         AND status NOT IN ('cancelled', 'completed')`,
        [finalStaffId, finalTime, id]
      );

      if (total > 0) {
        return res.status(400).json({ message: "Nhân viên đã có lịch bận vào khung giờ này" });
      }
    }

    // 3. Xây dựng câu lệnh Update linh hoạt (Dynamic Update)
    // Chỉ cập nhật những trường được gửi lên trong req.body
    const updateFields = [];
    const values = [];

    if (customer_id !== undefined) { updateFields.push("customer_id = ?"); values.push(customer_id); }
    if (service_id !== undefined) { updateFields.push("service_id = ?"); values.push(service_id); }
    if (staff_id !== undefined) { 
        updateFields.push("staff_id = ?"); 
        values.push(staff_id === 'null' ? null : staff_id); 
    }
    if (appointment_time !== undefined) { updateFields.push("appointment_time = ?"); values.push(appointment_time); }
    if (status !== undefined) { updateFields.push("status = ?"); values.push(status); }
    if (note !== undefined) { updateFields.push("note = ?"); values.push(note); }

    if (updateFields.length === 0) {
      return res.status(400).json({ message: "Không có dữ liệu thay đổi" });
    }

    values.push(id); // Thêm ID vào cuối cho mệnh đề WHERE
    const sql = `UPDATE appointments SET ${updateFields.join(", ")} WHERE id = ?`;

    await db.query(sql, values);

    res.json({ message: "Cập nhật lịch hẹn thành công" });
  } catch (err) {
    console.error("❌ PUT appointment error:", err);
    res.status(500).json({ message: "Lỗi hệ thống khi cập nhật" });
  }
});
module.exports = router;
