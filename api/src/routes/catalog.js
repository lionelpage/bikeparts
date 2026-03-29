const router = require('express').Router();
const { execFile } = require('child_process');
const path   = require('path');
const pool   = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// État du scraping en cours (en mémoire, simple)
let scrapeJob = null;

// POST /api/catalog/scrape — admin seulement
// body: { brand: 'all' | 'canyon' | 'trek' | ... }
router.post('/scrape', requireAuth, requireAdmin, (req, res) => {
  if (scrapeJob && scrapeJob.running) {
    return res.status(409).json({ error: 'Un scraping est déjà en cours', job: scrapeJob });
  }

  const brand   = req.body.brand || 'all';
  const allowed = ['all', 'bikeindex', 'canyon', 'giant', 'cube', 'orbea', 'trek', 'specialized'];
  if (!allowed.includes(brand)) {
    return res.status(400).json({ error: `brand doit être : ${allowed.join(', ')}` });
  }

  // Le script scraper est dans /scraper/src/index.js (monté en volume ou présent dans l'image)
  // En développement, on peut l'exécuter directement si node est disponible
  const scraperPath = path.resolve('/scraper/src/index.js');

  scrapeJob = {
    running:   true,
    brand,
    startedAt: new Date().toISOString(),
    output:    [],
    exitCode:  null,
    finishedAt: null,
  };

  const child = execFile('node', [scraperPath, brand], {
    env: { ...process.env },
    timeout: 30 * 60 * 1000, // 30 min max
  });

  child.stdout.on('data', (d) => scrapeJob.output.push(d.toString()));
  child.stderr.on('data', (d) => scrapeJob.output.push(`[ERR] ${d.toString()}`));
  child.on('close', (code) => {
    scrapeJob.running    = false;
    scrapeJob.exitCode   = code;
    scrapeJob.finishedAt = new Date().toISOString();
  });

  res.json({ message: `Scraping "${brand}" démarré`, job: scrapeJob });
});

// GET /api/catalog/scrape/status — admin seulement
router.get('/scrape/status', requireAuth, requireAdmin, (req, res) => {
  if (!scrapeJob) return res.json({ status: 'idle' });
  res.json({
    status:     scrapeJob.running ? 'running' : 'done',
    brand:      scrapeJob.brand,
    startedAt:  scrapeJob.startedAt,
    finishedAt: scrapeJob.finishedAt,
    exitCode:   scrapeJob.exitCode,
    // Dernières 50 lignes de log
    recentLog:  scrapeJob.output.slice(-50).join(''),
  });
});

// GET /api/catalog?brand=Trek&year=2023&q=domane
router.get('/', async (req, res) => {
  const { brand, year, q, category, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const conditions = [];
  const values     = [];
  let   idx        = 1;

  if (brand) { conditions.push(`LOWER(brand) = LOWER($${idx++})`); values.push(brand); }
  if (year)  { conditions.push(`year = $${idx++}`);                 values.push(parseInt(year)); }
  if (category) { conditions.push(`LOWER(category) = LOWER($${idx++})`); values.push(category); }
  if (q) {
    conditions.push(`(to_tsvector('simple', brand || ' ' || model) @@ plainto_tsquery('simple', $${idx++}))`);
    values.push(q);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM bikes_catalog ${where}`,
      values
    );
    const total = parseInt(countResult.rows[0].count);

    values.push(parseInt(limit), offset);
    const result = await pool.query(
      `SELECT id, brand, model, year, color, color_code, category, image_url, specs
       FROM bikes_catalog ${where}
       ORDER BY brand, model, year DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      values
    );

    res.json({ bikes: result.rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/catalog/brands
router.get('/brands', async (req, res) => {
  const result = await pool.query(
    'SELECT DISTINCT brand FROM bikes_catalog ORDER BY brand'
  );
  res.json({ brands: result.rows.map((r) => r.brand) });
});

// GET /api/catalog/years
router.get('/years', async (req, res) => {
  const result = await pool.query(
    'SELECT DISTINCT year FROM bikes_catalog ORDER BY year DESC'
  );
  res.json({ years: result.rows.map((r) => r.year) });
});

// GET /api/catalog/:id
router.get('/:id', async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM bikes_catalog WHERE id = $1',
    [req.params.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Vélo introuvable dans le catalogue' });
  res.json({ bike: result.rows[0] });
});

// POST /api/catalog — admin seulement
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { brand, model, year, color, color_code, category, specs, image_url, source_url, source } = req.body;
  if (!brand || !model || !year) {
    return res.status(400).json({ error: 'brand, model et year sont requis' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO bikes_catalog (brand, model, year, color, color_code, category, specs, image_url, source_url, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [brand, model, year, color, color_code, category, specs ? JSON.stringify(specs) : null, image_url, source_url, source || 'manual']
    );
    if (!result.rows[0]) return res.status(409).json({ error: 'Ce vélo existe déjà dans le catalogue' });
    res.status(201).json({ bike: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/catalog/:id — admin seulement
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { brand, model, year, color, color_code, category, specs, image_url, source_url } = req.body;
  try {
    const result = await pool.query(
      `UPDATE bikes_catalog SET
         brand      = COALESCE($1, brand),
         model      = COALESCE($2, model),
         year       = COALESCE($3, year),
         color      = COALESCE($4, color),
         color_code = COALESCE($5, color_code),
         category   = COALESCE($6, category),
         specs      = COALESCE($7, specs),
         image_url  = COALESCE($8, image_url),
         source_url = COALESCE($9, source_url)
       WHERE id = $10
       RETURNING *`,
      [brand, model, year, color, color_code, category, specs ? JSON.stringify(specs) : null, image_url, source_url, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Entrée catalogue introuvable' });
    res.json({ bike: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/catalog/:id — admin seulement
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const result = await pool.query('DELETE FROM bikes_catalog WHERE id = $1 RETURNING id', [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Entrée catalogue introuvable' });
  res.json({ message: 'Entrée supprimée du catalogue' });
});

module.exports = router;
