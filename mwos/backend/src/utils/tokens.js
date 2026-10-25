const jwt = require('jsonwebtoken');

const generateSessionTokens = (userId, role) => {
  const issuedAtMs = Date.now();
  const accessToken = jwt.sign(
    { userId, role, issuedAtMs },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
  const refreshToken = jwt.sign(
    { userId, role, issuedAtMs },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );

  return { accessToken, refreshToken };
};

module.exports = { generateSessionTokens };
