const router = require('express').Router();
const pool   = require('../config/db');
const { requireAuth } = require('../middleware/auth');

// Vérifie que le vélo appartient à l'utilisateur
async function ownsBike(userId, bikeId) {
  const r = await pool.query(
    'SELECT id, total_distance FROM garage_bikes WHERE id = $1 AND user_id = $2',
    [bikeId, userId]
  );
  return r.rows[0] || null;
}

// GET /api/parts/categories
router.get('/categories', async (req, res) => {
  const result = await pool.query('SELECT * FROM part_categories ORDER BY name');
  res.json({ categories: result.rows });
});

// GET /api/parts/bike/:bikeId
// Retourne toutes les pièces d'un vélo avec leur kilométrage calculé
router.get('/bike/:bikeId', requireAuth, async (req, res) => {
  const bike = await ownsBike(req.user.id, req.params.bikeId);
  if (!bike) return res.status(404).json({ error: 'Vélo introuvable' });

  try {
    const result = await pool.query(
      `SELECT p.*,
              pc.name  AS category_name,
              pc.icon  AS category_icon,
              CASE
                WHEN p.removed_at_km IS NOT NULL
                  THEN p.removed_at_km - p.installed_at_km
                ELSE $1 - p.installed_at_km
              END AS current_km
       FROM parts p
       JOIN part_categories pc ON pc.id = p.category_id
       WHERE p.garage_bike_id = $2
       ORDER BY p.installed_date DESC NULLS LAST, p.created_at DESC`,
      [bike.total_distance, req.params.bikeId]
    );
    res.json({ parts: result.rows, bike_total_km: bike.total_distance });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/parts/bike/:bikeId
router.post('/bike/:bikeId', requireAuth, async (req, res) => {
  const bike = await ownsBike(req.user.id, req.params.bikeId);
  if (!bike) return res.status(404).json({ error: 'Vélo introuvable' });

  const { category_id, brand, model, notes, installed_at_km, installed_date, max_km_recommended } = req.body;
  if (!category_id) return res.status(400).json({ error: 'category_id est requis' });

  try {
    const result = await pool.query(
      `INSERT INTO parts
         (garage_bike_id, category_id, brand, model, notes, installed_at_km, installed_date, max_km_recommended)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        req.params.bikeId, category_id, brand, model, notes,
        installed_at_km ?? bike.total_distance,
        installed_date || null,
        max_km_recommended || null,
      ]
    );
    res.status(201).json({ part: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/parts/:id
router.put('/:id', requireAuth, async (req, res) => {
  // Vérifie que la pièce appartient à un vélo de l'utilisateur
  const check = await pool.query(
    `SELECT p.id FROM parts p
     JOIN garage_bikes g ON g.id = p.garage_bike_id
     WHERE p.id = $1 AND g.user_id = $2`,
    [req.params.id, req.user.id]
  );
  if (!check.rows[0]) return res.status(404).json({ error: 'Pièce introuvable' });

  const { brand, model, notes, installed_at_km, installed_date, removed_at_km, removed_date, max_km_recommended } = req.body;
  try {
    const result = await pool.query(
      `UPDATE parts SET
         brand               = COALESCE($1, brand),
         model               = COALESCE($2, model),
         notes               = COALESCE($3, notes),
         installed_at_km     = COALESCE($4, installed_at_km),
         installed_date      = COALESCE($5, installed_date),
         removed_at_km       = COALESCE($6, removed_at_km),
         removed_date        = COALESCE($7, removed_date),
         max_km_recommended  = COALESCE($8, max_km_recommended)
       WHERE id = $9
       RETURNING *`,
      [brand, model, notes, installed_at_km, installed_date, removed_at_km, removed_date, max_km_recommended, req.params.id]
    );
    res.json({ part: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/parts/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const check = await pool.query(
    `SELECT p.id FROM parts p
     JOIN garage_bikes g ON g.id = p.garage_bike_id
     WHERE p.id = $1 AND g.user_id = $2`,
    [req.params.id, req.user.id]
  );
  if (!check.rows[0]) return res.status(404).json({ error: 'Pièce introuvable' });

  await pool.query('DELETE FROM parts WHERE id = $1', [req.params.id]);
  res.json({ message: 'Pièce supprimée' });
});

module.exports = router;
