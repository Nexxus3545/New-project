const issuedAfterRevocation = (decoded, revokedAt) => {
  if (!revokedAt) return true;
  const issuedAt = Number(decoded.issuedAtMs || Number(decoded.iat) * 1000);
  return Number.isFinite(issuedAt) && issuedAt > new Date(revokedAt).getTime();
};

module.exports = { issuedAfterRevocation };
