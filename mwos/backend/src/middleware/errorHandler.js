const buildErrorResponse = (req, status, message, options = {}) => ({
  success: false,
  message,
  requestId: req.requestId || null,
  ...options,
});

const errorHandler = (err, req, res, next) => {
  console.error('Unhandled error:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
  });

  // PostgreSQL errors
  if (err.code === '23505') {
    const field = err.detail?.match(/Key \((.+)\)=/)?.[1] || 'field';
    return res.status(409).json(
      buildErrorResponse(req, 409, `A record with this ${field} already exists`)
    );
  }

  if (err.code === '23503') {
    return res.status(400).json(
      buildErrorResponse(req, 400, 'Referenced record does not exist')
    );
  }

  if (err.code === '23502') {
    return res.status(400).json(
      buildErrorResponse(req, 400, 'Required field is missing')
    );
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json(buildErrorResponse(req, 401, 'Invalid token'));
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json(buildErrorResponse(req, 401, 'Token expired', { code: 'TOKEN_EXPIRED' }));
  }

  // Validation errors
  if (err.type === 'validation') {
    return res.status(422).json(
      buildErrorResponse(req, 422, err.message, { errors: err.errors })
    );
  }

  // Default
  const status = err.statusCode || err.status || 500;
  res.status(status).json(
    buildErrorResponse(req, status, err.message || 'Internal server error', {
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    })
  );
};

const notFound = (req, res) => {
  res.status(404).json(
    buildErrorResponse(req, 404, `Route ${req.method} ${req.originalUrl} not found`)
  );
};

module.exports = { errorHandler, notFound };
