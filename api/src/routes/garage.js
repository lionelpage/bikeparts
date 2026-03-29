const router = require('express').Router();
const pool   = require('../config/db');
const { requireAuth } = require('../middleware/auth');

// GET /api/garage
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT g.*, c.image_url AS catalog_image_url, c.specs AS catalog_specs
       FROM garage_bikes g
       LEFT JOIN bikes_catalog c ON c.id = g.catalog_id
       WHERE g.user_id = $1
       ORDER BY g.created_at DESC`,
      [req.user.id]
    );
    res.json({ bikes: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/garage
router.post('/', requireAuth, async (req, res) => {
  const { catalog_id, strava_bike_id, name, brand, model, year, color, image_url, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Le nom est requis' });

  try {
    const result = await pool.query(
      `INSERT INTO garage_bikes
         (user_id, catalog_id, strava_bike_id, name, brand, model, year, color, image_url, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [req.user.id, catalog_id || null, strava_bike_id || null, name, brand, model, year, color, image_url, notes]
    );
    res.status(201).json({ bike: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/garage/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT g.*, c.image_url AS catalog_image_url, c.specs AS catalog_specs
       FROM garage_bikes g
       LEFT JOIN bikes_catalog c ON c.id = g.catalog_id
       WHERE g.id = $1 AND g.user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Vélo introuvable' });
    res.json({ bike: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/garage/:id
router.put('/:id', requireAuth, async (req, res) => {
  const { name, brand, model, year, color, image_url, notes, is_active, catalog_id } = req.body;
  try {
    const result = await pool.query(
      `UPDATE garage_bikes SET
         name       = COALESCE($1, name),
         brand      = COALESCE($2, brand),
         model      = COALESCE($3, model),
         year       = COALESCE($4, year),
         color      = COALESCE($5, color),
         image_url  = COALESCE($6, image_url),
         notes      = COALESCE($7, notes),
         is_active  = COALESCE($8, is_active),
         catalog_id = COALESCE($9, catalog_id)
       WHERE id = $10 AND user_id = $11
       RETURNING *`,
      [name, brand, model, year, color, image_url, notes, is_active, catalog_id, req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Vélo introuvable' });
    res.json({ bike: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/garage/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM garage_bikes WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Vélo introuvable' });
    res.json({ message: 'Vélo supprimé' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
