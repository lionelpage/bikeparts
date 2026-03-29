const router = require('express').Router();
const pool   = require('../config/db');
const { requireAuth } = require('../middleware/auth');

// GET /api/notifications?unread=true
router.get('/', requireAuth, async (req, res) => {
  const onlyUnread = req.query.unread === 'true';
  const where      = onlyUnread ? 'AND n.is_read = FALSE' : '';
  try {
    const result = await pool.query(
      `SELECT n.*,
              g.name  AS bike_name,
              pc.name AS part_category
       FROM notifications n
       LEFT JOIN garage_bikes g  ON g.id = n.bike_id
       LEFT JOIN parts p         ON p.id = n.part_id
       LEFT JOIN part_categories pc ON pc.id = p.category_id
       WHERE n.user_id = $1 ${where}
       ORDER BY n.created_at DESC
       LIMIT 50`,
      [req.user.id]
    );
    const unreadCount = result.rows.filter((r) => !r.is_read).length;
    res.json({ notifications: result.rows, unread_count: unreadCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', requireAuth, async (req, res) => {
  await pool.query(
    'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  res.json({ ok: true });
});

// PATCH /api/notifications/read-all
router.patch('/read-all', requireAuth, async (req, res) => {
  await pool.query(
    'UPDATE notifications SET is_read = TRUE WHERE user_id = $1',
    [req.user.id]
  );
  res.json({ ok: true });
});

// DELETE /api/notifications/:id
router.delete('/:id', requireAuth, async (req, res) => {
  await pool.query(
    'DELETE FROM notifications WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  res.json({ ok: true });
});

module.exports = router;
