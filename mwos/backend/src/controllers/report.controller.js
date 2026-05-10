const { query } = require('../config/database');

const getDashboard = async (req, res, next) => {
  try {
    const [
      totalPatients, activePregnancies, todayAppointments,
      deliveriesThisMonth, highRiskPatients, pendingBills,
      lowInventory, recentVitalsAlerts
    ] = await Promise.all([
      query('SELECT COUNT(*) FROM patients'),
      query("SELECT COUNT(*) FROM pregnancies WHERE status = 'active'"),
      query("SELECT COUNT(*) FROM appointments WHERE scheduled_date = CURRENT_DATE AND status NOT IN ('cancelled','no_show')"),
      query("SELECT COUNT(*) FROM deliveries WHERE DATE_TRUNC('month', delivery_date) = DATE_TRUNC('month', CURRENT_DATE)"),
      query("SELECT COUNT(*) FROM patients WHERE risk_level = 'high'"),
      query("SELECT COUNT(*) FROM billing WHERE payment_status = 'pending'"),
      query('SELECT COUNT(*) FROM inventory WHERE quantity <= reorder_level'),
      query(`SELECT COUNT(*) FROM vitals WHERE created_at >= NOW() - INTERVAL '24 hours'
             AND (bp_systolic >= 140 OR bp_diastolic >= 90 OR fetal_movement = 'absent')`),
    ]);

    // Monthly delivery trends (last 6 months)
    const deliveryTrend = await query(`
      SELECT TO_CHAR(delivery_date, 'Mon YYYY') as month,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE delivery_type = 'NSD') as nsd,
        COUNT(*) FILTER (WHERE delivery_type = 'CS') as cs
      FROM deliveries
      WHERE delivery_date >= NOW() - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', delivery_date), TO_CHAR(delivery_date, 'Mon YYYY')
      ORDER BY DATE_TRUNC('month', delivery_date) ASC
    `);

    // Today's appointments
    const todayList = await query(`
      SELECT a.scheduled_time, a.status, a.appointment_type,
        p.first_name || ' ' || p.last_name as patient_name,
        p.risk_level
      FROM appointments a
      LEFT JOIN patients p ON p.id = a.patient_id
      WHERE a.scheduled_date = CURRENT_DATE
      ORDER BY a.scheduled_time ASC
      LIMIT 10
    `);

    res.json({
      success: true,
      data: {
        stats: {
          totalPatients: parseInt(totalPatients.rows[0].count),
          activePregnancies: parseInt(activePregnancies.rows[0].count),
          todayAppointments: parseInt(todayAppointments.rows[0].count),
          deliveriesThisMonth: parseInt(deliveriesThisMonth.rows[0].count),
          highRiskPatients: parseInt(highRiskPatients.rows[0].count),
          pendingBills: parseInt(pendingBills.rows[0].count),
          lowInventory: parseInt(lowInventory.rows[0].count),
          recentAlerts: parseInt(recentVitalsAlerts.rows[0].count),
        },
        deliveryTrend: deliveryTrend.rows,
        todayAppointments: todayList.rows,
      },
    });
  } catch (err) {
    next(err);
  }
};

const getPatientDashboard = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const patient = await query('SELECT id FROM patients WHERE user_id = $1', [userId]);

    if (patient.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Patient profile not found' });
    }

    const patientId = patient.rows[0].id;

    const [nextAppt, activePregnancy, latestVitals, unpaidBills, immunizations] = await Promise.all([
      query(`SELECT * FROM appointments WHERE patient_id = $1 AND scheduled_date >= CURRENT_DATE
             AND status = 'scheduled' ORDER BY scheduled_date ASC LIMIT 1`, [patientId]),
      query("SELECT * FROM pregnancies WHERE patient_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1", [patientId]),
      query('SELECT * FROM vitals WHERE patient_id = $1 ORDER BY visit_date DESC LIMIT 1', [patientId]),
      query("SELECT SUM(total_amount) as total FROM billing WHERE patient_id = $1 AND payment_status = 'pending'", [patientId]),
      query('SELECT * FROM immunizations WHERE patient_id = $1 ORDER BY date_given DESC LIMIT 5', [patientId]),
    ]);

    res.json({
      success: true,
      data: {
        nextAppointment: nextAppt.rows[0] || null,
        activePregnancy: activePregnancy.rows[0] || null,
        latestVitals: latestVitals.rows[0] || null,
        unpaidAmount: parseFloat(unpaidBills.rows[0]?.total || 0),
        recentImmunizations: immunizations.rows,
      },
    });
  } catch (err) {
    next(err);
  }
};

const getBirthsMonthly = async (req, res, next) => {
  try {
    const result = await query(`
      SELECT 
        TO_CHAR(delivery_date, 'YYYY-MM') as month,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE delivery_type = 'NSD') as nsd,
        COUNT(*) FILTER (WHERE delivery_type = 'CS') as cs,
        AVG(birth_weight_kg) as avg_birth_weight
      FROM deliveries
      WHERE delivery_date >= NOW() - INTERVAL '12 months'
      GROUP BY TO_CHAR(delivery_date, 'YYYY-MM')
      ORDER BY month ASC
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
};

const getAuditLogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    const result = await query(
      `SELECT al.*, u.first_name || ' ' || u.last_name as user_name, u.role
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       ORDER BY al.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const count = await query('SELECT COUNT(*) FROM audit_logs');
    res.json({
      success: true,
      data: result.rows,
      pagination: { page: parseInt(page), limit: parseInt(limit), total: parseInt(count.rows[0].count) },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getDashboard, getPatientDashboard, getBirthsMonthly, getAuditLogs };
