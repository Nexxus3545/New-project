const { query } = require('../config/database');

const getSummary = async (_req, res, next) => {
  try {
    const [aggregate, recent] = await Promise.all([
      query(
        `SELECT COUNT(*)::int AS total_reviews,
                COALESCE(ROUND(AVG(rating)::numeric, 2), 0) AS average_rating
         FROM reviews
         WHERE is_published = true`
      ),
      query(
        `SELECT id, display_name, role_label, rating, comment, created_at
         FROM reviews
         WHERE is_published = true
         ORDER BY created_at DESC
         LIMIT 6`
      ),
    ]);

    res.json({
      success: true,
      data: {
        totalReviews: aggregate.rows[0].total_reviews,
        averageRating: Number(aggregate.rows[0].average_rating || 0),
        recent: recent.rows,
      },
    });
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const { rating, comment, displayName, roleLabel } = req.body;
    const numericRating = Number(rating);

    if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({ success: false, message: 'rating must be an integer from 1 to 5' });
    }

    const fallbackName = req.user ? `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() : null;
    const fallbackRole = req.user?.role || null;

    const result = await query(
      `INSERT INTO reviews (user_id, display_name, role_label, rating, comment)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, display_name, role_label, rating, comment, created_at`,
      [
        req.user?.id || null,
        (displayName || fallbackName || 'Anonymous').trim(),
        (roleLabel || fallbackRole || 'Guest').trim(),
        numericRating,
        comment?.trim() || null,
      ]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getSummary,
  create,
};
