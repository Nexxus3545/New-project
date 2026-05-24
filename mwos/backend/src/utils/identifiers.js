const crypto = require('crypto');
const { query } = require('../config/database');

const buildDateStamp = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');

const createCandidate = (prefix) => `${prefix}-${buildDateStamp()}-${crypto.randomInt(1000, 9999)}`;

const generateUniqueCode = async ({ table, column, prefix }) => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = createCandidate(prefix);
    const existing = await query(`SELECT 1 FROM ${table} WHERE ${column} = $1 LIMIT 1`, [candidate]);
    if (existing.rows.length === 0) {
      return candidate;
    }
  }

  throw new Error(`Unable to generate unique ${column} after multiple attempts`);
};

const toNullableNumber = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
};

const calculateBmi = (heightCm, weightKg) => {
  const normalizedHeight = toNullableNumber(heightCm);
  const normalizedWeight = toNullableNumber(weightKg);

  if (!normalizedHeight || !normalizedWeight) {
    return null;
  }

  const heightMeters = normalizedHeight / 100;
  if (!heightMeters) {
    return null;
  }

  return Number((normalizedWeight / (heightMeters * heightMeters)).toFixed(2));
};

module.exports = {
  generateUniqueCode,
  toNullableNumber,
  calculateBmi,
};
