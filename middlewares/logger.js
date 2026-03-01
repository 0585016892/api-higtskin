module.exports = (err, req, res, next) => {
  console.error("❌ ERROR:", {
    time: new Date(),
    method: req.method,
    url: req.originalUrl,
    body: req.body,
    error: err.message,
  });

  res.status(500).json({
    success: false,
    message: err.message || "Lỗi server",
  });
};
