const express = require("express");
const router = express.Router();
const db = require("../db");

/**
 * GET /services
 * Danh sách dịch vụ + tìm kiếm + phân trang
 */
router.get("/", async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      keyword = "", 
      minPrice, 
      maxPrice, 
      status,
      sortBy = "id", 
      order = "DESC" 
    } = req.query;

    const offset = (page - 1) * limit;

    // 1. Xây dựng câu lệnh WHERE động
    let whereClauses = ["name LIKE ?"];
    let params = [`%${keyword}%`];

    // Lọc theo giá tối thiểu
    if (minPrice) {
      whereClauses.push("price >= ?");
      params.push(Number(minPrice));
    }

    // Lọc theo giá tối đa
    if (maxPrice) {
      whereClauses.push("price <= ?");
      params.push(Number(maxPrice));
    }

    // Lọc theo trạng thái (ví dụ: 1 là đang kinh doanh)
    if (status !== undefined && status !== "") {
      whereClauses.push("status = ?");
      params.push(Number(status));
    }

    const whereSql = whereClauses.join(" AND ");

    // 2. Query lấy dữ liệu (Inject các biến an toàn)
    const queryData = `
      SELECT *
      FROM services
      WHERE ${whereSql}
      ORDER BY ${sortBy === 'price' ? 'price' : 'id'} ${order === 'ASC' ? 'ASC' : 'DESC'}
      LIMIT ? OFFSET ?
    `;

    // Copy params cho query count trước khi thêm limit/offset
    const countParams = [...params];
    params.push(Number(limit), Number(offset));

    const [data] = await db.query(queryData, params);

    // 3. Query lấy tổng số bản ghi để phân trang
    const queryCount = `
      SELECT COUNT(*) AS total
      FROM services
      WHERE ${whereSql}
    `;
    const [[{ total }]] = await db.query(queryCount, countParams);

    res.json({
      data,
      total,
      page: Number(page),
      limit: Number(limit)
    });
  } catch (err) {
    console.error("❌ GET services error:", err);
    res.status(500).json({ message: "Server error" });
  }
});
/**
 * GET /services/:id
 * Lấy chi tiết dịch vụ
 */
router.get("/:id", async (req, res) => {
  try {
    const [[service]] = await db.query(
      `SELECT * FROM services WHERE id = ?`,
      [req.params.id]
    );

    if (!service) {
      return res.status(404).json({ message: "Không tìm thấy dịch vụ" });
    }

    res.json(service);
  } catch (err) {
    console.error("❌ GET service detail:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /services
 * Thêm dịch vụ
 */
router.post("/", async (req, res) => {
  try {
    const { name, price, duration, description, status = 1 } = req.body;

    if (!name || !price) {
      return res.status(400).json({ message: "Thiếu dữ liệu bắt buộc" });
    }

    await db.query(
      `
      INSERT INTO services (name, price, duration, description, status)
      VALUES (?, ?, ?, ?, ?)
      `,
      [name, price, duration || null, description || null, status]
    );

    res.json({ message: "Thêm dịch vụ thành công" });
  } catch (err) {
    console.error("❌ POST service:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * PUT /services/:id
 * Cập nhật dịch vụ
 */
router.put("/:id", async (req, res) => {
  try {
    const { name, price, duration, description, status } = req.body;

    await db.query(
      `
      UPDATE services
      SET
        name = ?,
        price = ?,
        duration = ?,
        description = ?,
        status = ?
      WHERE id = ?
      `,
      [name, price, duration || null, description || null, status, req.params.id]
    );

    res.json({ message: "Cập nhật dịch vụ thành công" });
  } catch (err) {
    console.error("❌ PUT service:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * PATCH /services/:id/status
 * Bật / tắt dịch vụ
 */
router.patch("/:id/status", async (req, res) => {
  try {
    const { status } = req.body;

    await db.query(
      `UPDATE services SET status = ? WHERE id = ?`,
      [status, req.params.id]
    );

    res.json({ message: "Cập nhật trạng thái thành công" });
  } catch (err) {
    console.error("❌ PATCH service status:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * DELETE /services/:id
 * Xoá dịch vụ (xoá hẳn)
 */
router.delete("/:id", async (req, res) => {
  try {
    const serviceId = req.params.id;

    // 1️⃣ Kiểm tra có lịch hẹn không
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) total FROM appointments WHERE service_id = ?`,
      [serviceId]
    );

    if (total > 0) {
      return res.status(400).json({
        message:
          "Không thể xoá dịch vụ vì đã tồn tại lịch hẹn. Vui lòng ngưng hoạt động dịch vụ.",
      });
    }

    // 2️⃣ Xoá thật
    await db.query(`DELETE FROM services WHERE id = ?`, [serviceId]);

    res.json({ message: "Đã xoá dịch vụ" });
  } catch (err) {
    console.error("❌ DELETE service:", err);
    res.status(500).json({ message: "Server error" });
  }
});


/**
 * GET /services/active/list
 * Lấy dịch vụ đang hoạt động (dùng cho lịch hẹn)
 */
router.get("/active/list", async (req, res) => {
  try {
    const [data] = await db.query(
      `
      SELECT id, name, price, duration
      FROM services
      WHERE status = 1
      ORDER BY name ASC
      `
    );

    res.json(data);
  } catch (err) {
    console.error("❌ GET active services:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
