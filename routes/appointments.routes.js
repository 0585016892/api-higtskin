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

    // 1. Kiểm tra bắt buộc
    if (!service_id || !appointment_time) {
      return res.status(400).json({ message: "Thiếu dịch vụ hoặc thời gian hẹn" });
    }

    let finalCustomerId = customer_id;
    let customerName = full_name;
    let customerPhone = phone;
    let customerEmail = email;

    // 2. Xử lý Khách hàng (Tạo mới hoặc Lấy khách cũ)
    if (!finalCustomerId) {
      if (!full_name || !phone) {
        return res.status(400).json({ message: "Cần thông tin họ tên và SĐT khách hàng" });
      }

      // Check SĐT đã tồn tại chưa
      const [existing] = await db.query("SELECT id, full_name, email FROM customers WHERE phone = ?", [phone]);
      
      if (existing.length > 0) {
        finalCustomerId = existing[0].id;
        customerName = existing[0].full_name;
        customerEmail = existing[0].email || email;
      } else {
        // Tạo khách hàng mới
        const [newCust] = await db.query(
          `INSERT INTO customers (full_name, phone, email, skin_type, skin_issue) VALUES (?, ?, ?, ?, ?)`,
          [full_name, phone, email || null, skin_type || null, skin_issue || null]
        );
        finalCustomerId = newCust.insertId;
      }
    } else {
      // Nếu Admin chọn customer_id từ list, lấy lại tên/email để gửi mail
      const [custInfo] = await db.query("SELECT full_name, phone, email FROM customers WHERE id = ?", [finalCustomerId]);
      if (custInfo.length > 0) {
        customerName = custInfo[0].full_name;
        customerPhone = custInfo[0].phone;
        customerEmail = custInfo[0].email;
      }
    }

    // 3. Kiểm tra Dịch vụ (Lấy luôn tên để gửi mail)
    const [[service]] = await db.query("SELECT id, name, price FROM services WHERE id=? AND status=1", [service_id]);
    if (!service) return res.status(400).json({ message: "Dịch vụ không tồn tại hoặc đã ngừng hoạt động" });

    // 4. Kiểm tra Nhân viên & Trùng lịch
    const finalStaffId = (staff_id && staff_id !== "null") ? staff_id : null;
    let staffName = "Hệ thống tự sắp xếp";

    if (finalStaffId) {
      const [[staff]] = await db.query("SELECT full_name FROM users WHERE id = ?", [finalStaffId]);
      staffName = staff ? staff.full_name : "N/A";

      const [[{ total }]] = await db.query(
        `SELECT COUNT(*) as total FROM appointments 
         WHERE staff_id = ? AND appointment_time = ? AND status != 'cancelled'`,
        [finalStaffId, appointment_time]
      );
      if (total > 0) return res.status(400).json({ message: "Kỹ thuật viên này đã có lịch vào khung giờ bạn chọn" });
    }

    // 5. Lưu Lịch hẹn vào Database
    await db.query(
      `INSERT INTO appointments 
       (customer_id, service_id, staff_id, appointment_time, status, note)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
      [finalCustomerId, service_id, finalStaffId, appointment_time, note || ""]
    );

    // 🚀 6. LOGIC GỬI MAIL (KHÔNG DÙNG AWAIT ĐỂ GIẢM ĐỘ TRỄ PHẢN HỒI)
    if (customerEmail) {
      const mailOptions = {
        from: '"HighSkin Spa" <your-email@gmail.com>',
        to: customerEmail,
        subject: `[HighSkin] Xác nhận đặt lịch: ${service.name}`,
        html: `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #f0f0f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
            <div style="background: linear-gradient(135deg, #eb2f96 0%, #722ed1 100%); padding: 30px; text-align: center; color: white;">
              <h2 style="margin: 0; letter-spacing: 2px;">XÁC NHẬN ĐẶT LỊCH</h2>
            </div>
            <div style="padding: 30px; color: #333;">
              <p>Xin chào <strong>${customerName}</strong>,</p>
              <p>Chúc mừng bạn! Lịch hẹn chăm sóc da tại <strong>HighSkin Spa</strong> đã được ghi nhận thành công.</p>
              
              <div style="background: #fff5f9; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #eb2f96;">
                <p style="margin: 5px 0;"><strong>Dịch vụ:</strong> ${service.name}</p>
                <p style="margin: 5px 0;"><strong>Thời gian:</strong> ${appointment_time}</p>
                <p style="margin: 5px 0;"><strong>Kỹ thuật viên:</strong> ${staffName}</p>
                <p style="margin: 5px 0;"><strong>Giá tham khảo:</strong> ${Number(service.price).toLocaleString()}₫</p>
              </div>

              <p style="font-size: 13px; color: #666; font-style: italic;">
                * Lưu ý: Vui lòng đến trước lịch hẹn 10 phút để chúng tôi phục vụ bạn tốt nhất. 
                Nếu có thay đổi, vui lòng liên hệ hotline: <strong>033 604 1807</strong>
              </p>
            </div>
            <div style="background: #fafafa; padding: 20px; text-align: center; color: #999; font-size: 12px;">
              © 2026 HighSkin Spa - Chuẩn Y Khoa. Tất cả quyền được bảo lưu.
            </div>
          </div>
        `,
      };

      transporter.sendMail(mailOptions).catch(err => console.error("❌ Email Error:", err));
    }

    // 7. Phản hồi cho Client
    res.json({ 
      success: true,
      message: "Đặt lịch thành công!", 
      customer_id: finalCustomerId 
    });

  } catch (err) {
    console.error("❌ SERVER ERROR:", err);
    res.status(500).json({ message: "Lỗi hệ thống, vui lòng thử lại sau" });
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
    await conn.beginTransaction();

    // 1️⃣ Lấy appointment + service
    const [[appt]] = await conn.query(
      `
      SELECT 
        a.*, 
        s.name AS service_name, 
        s.price
      FROM appointments a
      JOIN services s ON a.service_id = s.id
      WHERE a.id = ?
      `,
      [req.params.id]
    );

    if (!appt) {
      await conn.rollback();
      return res.status(404).json({
        message: "Không tìm thấy lịch hẹn",
      });
    }

    if (appt.status !== "confirmed") {
      await conn.rollback();
      return res.status(400).json({
        message: "Chỉ được hoàn thành lịch đã xác nhận",
      });
    }

    // 2️⃣ Update appointment
    await conn.query(
      `UPDATE appointments SET status='completed' WHERE id=?`,
      [appt.id]
    );

    // 3️⃣ Tạo invoice (🔥 FIX Ở ĐÂY)
    const [invoice] = await conn.query(
      `
      INSERT INTO invoices
        (appointment_id, customer_id, staff_id, total_amount)
      VALUES (?, ?, ?, ?)
      `,
      [
        appt.id,
        appt.customer_id,
        appt.staff_id,
        appt.price,
      ]
    );

    // 4️⃣ Tạo invoice_items
    await conn.query(
      `
      INSERT INTO invoice_items
        (invoice_id, service_id, service_name, price, quantity, total)
      VALUES (?, ?, ?, ?, 1, ?)
      `,
      [
        invoice.insertId,
        appt.service_id,
        appt.service_name,
        appt.price,
        appt.price,
      ]
    );

    await conn.commit();

    res.json({
      message: "Hoàn thành lịch & tạo hoá đơn thành công",
      invoice_id: invoice.insertId,
    });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({
      message: "Server error",
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
