exports.success = (res, data, message = "OK") => {
  res.json({
    success: true,
    message,
    data,
  });
};

exports.pagination = (res, data, total, page, limit) => {
  res.json({
    success: true,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    data,
  });
};
    