const express = require("express");
const router = express.Router();
const db = require("../db");

/**
 * GET /api/settings
 */
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT setting_key, setting_value, note FROM settings"
    );

    const settings = {};
    rows.forEach(item => {
      settings[item.setting_key] = item.setting_value;
    });

    res.json(settings);
  } catch (err) {
    console.error("❌ GET settings error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /api/settings/:key
 */
router.get("/:key", async (req, res) => {
  try {
    const { key } = req.params;

    const [rows] = await db.query(
      "SELECT setting_value FROM settings WHERE setting_key = ? LIMIT 1",
      [key]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Setting not found" });
    }

    res.json({
      key,
      value: rows[0].setting_value
    });
  } catch (err) {
    console.error("❌ GET setting error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/settings
 */
router.post("/", async (req, res) => {
  try {
    const { setting_key, setting_value, note } = req.body;

    if (!setting_key) {
      return res.status(400).json({ message: "setting_key is required" });
    }

    await db.query(
      `INSERT INTO settings (setting_key, setting_value, note)
       VALUES (?, ?, ?)`,
      [setting_key, setting_value, note || null]
    );

    res.json({ message: "Setting created successfully" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Setting key already exists" });
    }

    console.error("❌ CREATE setting error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * PUT /api/settings/:key
 */
router.put("/:key", async (req, res) => {
  try {
    const { key } = req.params;
    const { setting_value, note } = req.body;

    const [result] = await db.query(
      `UPDATE settings
       SET setting_value = ?, note = ?
       WHERE setting_key = ?`,
      [setting_value, note || null, key]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Setting not found" });
    }

    res.json({ message: "Setting updated successfully" });
  } catch (err) {
    console.error("❌ UPDATE setting error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * PUT /api/settings
 * Update nhiều setting
 */
router.put("/", async (req, res) => {
  const data = req.body;
  const keys = Object.keys(data);

  if (keys.length === 0) {
    return res.status(400).json({ message: "No data provided" });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    for (const key of keys) {
      await conn.query(
        `INSERT INTO settings (setting_key, setting_value)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [key, data[key]]
      );
    }

    await conn.commit();
    res.json({ message: "Settings updated successfully" });
  } catch (err) {
    await conn.rollback();
    console.error("❌ BULK update error:", err);
    res.status(500).json({ message: "Server error" });
  } finally {
    conn.release();
  }
});

/**
 * DELETE /api/settings/:key
 */
router.delete("/:key", async (req, res) => {
  try {
    const { key } = req.params;

    const [result] = await db.query(
      "DELETE FROM settings WHERE setting_key = ?",
      [key]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Setting not found" });
    }

    res.json({ message: "Setting deleted successfully" });
  } catch (err) {
    console.error("❌ DELETE setting error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
