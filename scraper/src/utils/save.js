const pool = require('../db');

/**
 * Insère ou met à jour un vélo dans bikes_catalog.
 * Clé d'unicité : (brand, model, year, color).
 * Retourne 'inserted' | 'updated' | 'skipped'.
 */
async function saveBike({
  brand, model, year, color = null, color_code = null,
  category = null, specs = null, image_url = null,
  source_url = null, source = 'scraping',
}) {
  if (!brand || !model || !year) return 'skipped';

  // Nettoyage
  brand     = clean(brand);
  model     = clean(model);
  color     = color ? clean(color) : null;
  category  = category ? clean(category) : null;

  const existing = await pool.query(
    `SELECT id FROM bikes_catalog
     WHERE LOWER(brand) = LOWER($1)
       AND LOWER(model) = LOWER($2)
       AND year = $3
       AND (color IS NULL AND $4 IS NULL OR LOWER(color) = LOWER($4))`,
    [brand, model, year, color]
  );

  if (existing.rows.length > 0) {
    // Mise à jour si on a de nouvelles infos (image, specs)
    await pool.query(
      `UPDATE bikes_catalog SET
         image_url  = COALESCE($1, image_url),
         specs      = COALESCE($2, specs),
         source_url = COALESCE($3, source_url),
         color_code = COALESCE($4, color_code),
         category   = COALESCE($5, category)
       WHERE id = $6`,
      [image_url, specs ? JSON.stringify(specs) : null, source_url, color_code, category, existing.rows[0].id]
    );
    return 'updated';
  }

  await pool.query(
    `INSERT INTO bikes_catalog
       (brand, model, year, color, color_code, category, specs, image_url, source_url, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [brand, model, year, color, color_code, category, specs ? JSON.stringify(specs) : null, image_url, source_url, source]
  );
  return 'inserted';
}

function clean(str) {
  return str?.toString().trim().replace(/\s+/g, ' ') || '';
}

module.exports = { saveBike };
