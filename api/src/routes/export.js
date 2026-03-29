const router  = require('express').Router();
const PDFDocument = require('pdfkit');
const pool    = require('../config/db');
const { requireAuth } = require('../middleware/auth');

// GET /api/export/bike/:id
router.get('/bike/:id', requireAuth, async (req, res) => {
  // 1. Charger le vélo
  const bikeRes = await pool.query(
    `SELECT g.*, c.specs AS catalog_specs
     FROM garage_bikes g
     LEFT JOIN bikes_catalog c ON c.id = g.catalog_id
     WHERE g.id = $1 AND g.user_id = $2`,
    [req.params.id, req.user.id]
  );
  if (!bikeRes.rows[0]) return res.status(404).json({ error: 'Vélo introuvable' });
  const bike = bikeRes.rows[0];

  // 2. Charger les pièces
  const partsRes = await pool.query(
    `SELECT p.*,
            pc.name AS category_name,
            CASE
              WHEN p.removed_at_km IS NOT NULL THEN p.removed_at_km - p.installed_at_km
              ELSE $1 - p.installed_at_km
            END AS current_km
     FROM parts p
     JOIN part_categories pc ON pc.id = p.category_id
     WHERE p.garage_bike_id = $2
     ORDER BY p.category_id, p.installed_date DESC NULLS LAST`,
    [parseFloat(bike.total_distance || 0), req.params.id]
  );
  const parts = partsRes.rows;

  // 3. Charger le propriétaire
  const userRes = await pool.query('SELECT name, email FROM users WHERE id = $1', [req.user.id]);
  const user    = userRes.rows[0];

  // ── Génération PDF ────────────────────────────────────
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="bikeparts-${bike.name.replace(/\s+/g, '_')}.pdf"`);

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  doc.pipe(res);

  const orange = '#e85d04';
  const grey   = '#666666';
  const light  = '#999999';
  const dark   = '#111111';
  const W      = doc.page.width - 100; // largeur utile

  // ── En-tête ──────────────────────────────────────────
  doc.rect(0, 0, doc.page.width, 80).fill(orange);
  doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold')
    .text('🚲 BikeParts', 50, 25);
  doc.fontSize(10).font('Helvetica')
    .text('Carnet d\'entretien', 50, 52);

  // Date
  doc.text(new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }),
    { align: 'right' });

  doc.moveDown(3);

  // ── Titre vélo ───────────────────────────────────────
  doc.fillColor(dark).fontSize(18).font('Helvetica-Bold').text(bike.name);
  doc.moveDown(0.3);

  const subParts = [bike.brand, bike.model, bike.year, bike.color].filter(Boolean);
  if (subParts.length) {
    doc.fillColor(grey).fontSize(11).font('Helvetica').text(subParts.join(' · '));
  }
  doc.moveDown(0.5);

  // ── Propriétaire ─────────────────────────────────────
  doc.fillColor(light).fontSize(9).text(`Propriétaire : ${user.name} (${user.email})`);
  doc.moveDown(1.2);

  // ── Encart statistiques ──────────────────────────────
  const statY  = doc.y;
  const boxW   = (W - 20) / 3;
  const stats  = [
    { label: 'Kilométrage total', value: `${parseFloat(bike.total_distance || 0).toLocaleString('fr-FR')} km` },
    { label: 'Pièces actives',    value: String(parts.filter((p) => !p.removed_at_km).length) },
    { label: 'Pièces retirées',   value: String(parts.filter((p) => p.removed_at_km).length) },
  ];

  stats.forEach((s, i) => {
    const x = 50 + i * (boxW + 10);
    doc.rect(x, statY, boxW, 52).fillAndStroke('#f5f5f5', '#dddddd');
    doc.fillColor(orange).fontSize(18).font('Helvetica-Bold')
      .text(s.value, x, statY + 8, { width: boxW, align: 'center' });
    doc.fillColor(grey).fontSize(8).font('Helvetica')
      .text(s.label, x, statY + 33, { width: boxW, align: 'center' });
  });

  doc.moveDown(5);

  // ── Séparateur ───────────────────────────────────────
  function separator() {
    doc.moveTo(50, doc.y).lineTo(50 + W, doc.y).strokeColor('#eeeeee').lineWidth(1).stroke();
    doc.moveDown(0.5);
  }

  // ── Tableau pièces ───────────────────────────────────
  doc.fillColor(dark).fontSize(14).font('Helvetica-Bold').text('Historique des pièces');
  doc.moveDown(0.7);

  if (parts.length === 0) {
    doc.fillColor(grey).fontSize(10).font('Helvetica').text('Aucune pièce enregistrée.');
  } else {
    // En-tête tableau
    const cols = { cat: 50, piece: 160, pose: 310, retrait: 380, km: 450 };
    const headerY = doc.y;

    doc.rect(50, headerY, W, 20).fill('#f0f0f0');
    doc.fillColor(grey).fontSize(8).font('Helvetica-Bold');
    doc.text('CATÉGORIE',      cols.cat,   headerY + 6, { width: 105 });
    doc.text('PIÈCE',          cols.piece, headerY + 6, { width: 145 });
    doc.text('POSÉ À',         cols.pose,  headerY + 6, { width: 65 });
    doc.text('RETIRÉ À',       cols.retrait, headerY + 6, { width: 65 });
    doc.text('KM PARCOURUS',   cols.km,    headerY + 6, { width: 95, align: 'right' });

    doc.moveDown(1.8);

    // Lignes
    parts.forEach((part, idx) => {
      if (doc.y > doc.page.height - 100) {
        doc.addPage();
        doc.moveDown(1);
      }

      const rowY  = doc.y;
      const isOut = !!part.removed_at_km;
      const km    = parseFloat(part.current_km || 0);
      const atRisk = part.max_km_recommended && km >= parseFloat(part.max_km_recommended) * 0.8;

      // Zébrage
      if (idx % 2 === 0) doc.rect(50, rowY - 3, W, 22).fill('#fafafa');

      doc.fillColor(dark).fontSize(9).font('Helvetica-Bold')
        .text(part.category_name, cols.cat, rowY, { width: 105 });

      const pieceName = [part.brand, part.model].filter(Boolean).join(' ') || '—';
      doc.fillColor(isOut ? light : dark).font('Helvetica')
        .text(pieceName, cols.piece, rowY, { width: 145 });

      const poseKm   = parseFloat(part.installed_at_km || 0).toLocaleString('fr-FR');
      const retraitKm = part.removed_at_km ? parseFloat(part.removed_at_km).toLocaleString('fr-FR') : '—';
      doc.fillColor(grey)
        .text(`${poseKm} km`, cols.pose,   rowY, { width: 65 })
        .text(`${retraitKm}${part.removed_at_km ? ' km' : ''}`, cols.retrait, rowY, { width: 65 });

      // km parcourus — coloré si à risque
      doc.fillColor(isOut ? light : atRisk ? orange : dark).font('Helvetica-Bold')
        .text(`${Math.round(km).toLocaleString('fr-FR')} km`, cols.km, rowY, { width: 95, align: 'right' });

      if (part.max_km_recommended) {
        doc.fillColor(light).fontSize(7).font('Helvetica')
          .text(`/ ${parseFloat(part.max_km_recommended).toLocaleString('fr-FR')} km`,
            cols.km, rowY + 10, { width: 95, align: 'right' });
      }

      doc.moveDown(1.6);
      separator();
    });
  }

  // ── Pied de page ─────────────────────────────────────
  const pageH = doc.page.height;
  doc.rect(0, pageH - 35, doc.page.width, 35).fill('#f0f0f0');
  doc.fillColor(light).fontSize(8).font('Helvetica')
    .text(`Généré par BikeParts · ${new Date().toLocaleDateString('fr-FR')}`,
      50, pageH - 22, { width: W, align: 'center' });

  doc.end();
});

module.exports = router;
