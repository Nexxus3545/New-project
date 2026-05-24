const { query } = require('../config/database');

const toAssetUrl = (req, storedPath) => {
  if (!storedPath) return null;
  if (/^https?:\/\//i.test(storedPath)) return storedPath;
  return `${req.protocol}://${req.get('host')}${storedPath}`;
};

const mapPost = (req, row) => ({
  ...row,
  media_url: toAssetUrl(req, row.media_url || row.video_url),
  video_url: toAssetUrl(req, row.video_url),
  thumbnail_url: toAssetUrl(req, row.thumbnail_url),
  poster_url: toAssetUrl(req, row.poster_url || row.thumbnail_url),
});

const list = async (req, res, next) => {
  try {
    const includeDrafts = req.user && ['admin', 'doctor', 'midwife'].includes(req.user.role) && req.query.includeDrafts === 'true';
    const result = await query(
      `SELECT m.*, u.first_name || ' ' || u.last_name AS created_by_name
       FROM media_feed_posts m
       LEFT JOIN users u ON u.id = m.created_by
       ${includeDrafts ? '' : 'WHERE m.is_published = true'}
       ORDER BY m.created_at DESC
       LIMIT 50`
    );

    res.json({ success: true, data: result.rows.map((row) => mapPost(req, row)) });
  } catch (err) {
    next(err);
  }
};

const recordView = async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE media_feed_posts
       SET engagement_views = COALESCE(engagement_views, 0) + 1
       WHERE id = $1
       RETURNING id, engagement_views`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Media post not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const { title, description, category, thumbnailUrl, posterUrl, isPublished = 'true', videoUrl, mediaUrl, mediaType } = req.body;
    const detectedMediaType = mediaType || (req.file?.mimetype?.startsWith('image/') ? 'image' : 'video');
    const storedMediaUrl = req.file ? `/uploads/videos/${req.file.filename}` : (mediaUrl || videoUrl || '').trim();
    const publishNow = isPublished === undefined ? true : isPublished !== 'false' && isPublished !== false;

    if (!title || !storedMediaUrl) {
      return res.status(400).json({ success: false, message: 'title and a media upload or mediaUrl are required' });
    }

    const result = await query(
      `INSERT INTO media_feed_posts (
         title, description, media_type, media_url, video_url, thumbnail_url, poster_url, category, is_published, created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        title.trim(),
        description?.trim() || null,
        detectedMediaType,
        storedMediaUrl,
        storedMediaUrl,
        thumbnailUrl?.trim() || null,
        posterUrl?.trim() || thumbnailUrl?.trim() || null,
        category?.trim() || 'general',
        publishNow,
        req.user.id,
      ]
    );

    res.status(201).json({ success: true, data: mapPost(req, result.rows[0]) });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  list,
  create,
  recordView,
};
