const { query } = require('../config/database');

const SHARE_DURATION_MINUTES = 15;

const getPatientIdForUser = async (userId) => {
  const result = await query('SELECT id FROM patients WHERE user_id = $1 LIMIT 1', [userId]);
  return result.rows[0]?.id || null;
};

const clearExpiredShares = () => query('DELETE FROM emergency_location_shares WHERE expires_at <= NOW()');

const mapLocation = (row) => ({
  id: row.id,
  patientId: row.patient_id,
  patientName: row.patient_name || null,
  patientCode: row.patient_code || null,
  barangay: row.barangay || null,
  city: row.city || null,
  province: row.province || null,
  latitude: Number(row.latitude),
  longitude: Number(row.longitude),
  accuracyMeters: row.accuracy_meters === null ? null : Number(row.accuracy_meters),
  sharedAt: row.shared_at,
  expiresAt: row.expires_at,
});

const validateCoordinate = (value, min, max) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
};

const getMine = async (req, res, next) => {
  try {
    await clearExpiredShares();
    const patientId = await getPatientIdForUser(req.user.id);
    if (!patientId) return res.status(404).json({ success: false, message: 'Patient profile not found' });

    const result = await query(
      `SELECT els.*
       FROM emergency_location_shares els
       WHERE els.patient_id = $1 AND els.expires_at > NOW()
       LIMIT 1`,
      [patientId]
    );

    res.json({ success: true, data: result.rows[0] ? mapLocation(result.rows[0]) : null });
  } catch (err) {
    next(err);
  }
};

const shareMine = async (req, res, next) => {
  try {
    await clearExpiredShares();
    const { latitude, longitude, accuracyMeters, consent } = req.body;
    const validLatitude = validateCoordinate(latitude, -90, 90);
    const validLongitude = validateCoordinate(longitude, -180, 180);
    const validAccuracy = accuracyMeters === undefined || accuracyMeters === null
      ? null
      : validateCoordinate(accuracyMeters, 0, 100000);

    if (consent !== true) {
      return res.status(400).json({ success: false, message: 'Location sharing requires your explicit consent' });
    }
    if (validLatitude === null || validLongitude === null || (accuracyMeters !== undefined && accuracyMeters !== null && validAccuracy === null)) {
      return res.status(400).json({ success: false, message: 'A valid device location is required' });
    }

    const patientId = await getPatientIdForUser(req.user.id);
    if (!patientId) return res.status(404).json({ success: false, message: 'Patient profile not found' });

    const result = await query(
      `INSERT INTO emergency_location_shares (
         patient_id, latitude, longitude, accuracy_meters, shared_at, expires_at
       )
       VALUES ($1, $2, $3, $4, NOW(), NOW() + ($5::int * INTERVAL '1 minute'))
       ON CONFLICT (patient_id) DO UPDATE SET
         latitude = EXCLUDED.latitude,
         longitude = EXCLUDED.longitude,
         accuracy_meters = EXCLUDED.accuracy_meters,
         shared_at = NOW(),
         expires_at = NOW() + ($5::int * INTERVAL '1 minute'),
         updated_at = NOW()
       RETURNING *`,
      [patientId, validLatitude, validLongitude, validAccuracy, SHARE_DURATION_MINUTES]
    );

    res.json({ success: true, data: mapLocation(result.rows[0]) });
  } catch (err) {
    next(err);
  }
};

const stopSharingMine = async (req, res, next) => {
  try {
    const patientId = await getPatientIdForUser(req.user.id);
    if (!patientId) return res.status(404).json({ success: false, message: 'Patient profile not found' });

    await query('DELETE FROM emergency_location_shares WHERE patient_id = $1', [patientId]);
    res.json({ success: true, message: 'Live location sharing has stopped' });
  } catch (err) {
    next(err);
  }
};

const listActive = async (_req, res, next) => {
  try {
    await clearExpiredShares();
    const result = await query(
      `SELECT
         els.*,
         p.patient_code,
         p.barangay,
         p.city,
         p.province,
         u.first_name || ' ' || u.last_name AS patient_name
       FROM emergency_location_shares els
       INNER JOIN patients p ON p.id = els.patient_id
       INNER JOIN users u ON u.id = p.user_id
       WHERE els.expires_at > NOW()
       ORDER BY els.shared_at DESC`
    );

    res.json({ success: true, data: result.rows.map(mapLocation) });
  } catch (err) {
    next(err);
  }
};

module.exports = { getMine, listActive, shareMine, stopSharingMine };
