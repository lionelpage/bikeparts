const router   = require('express').Router();
const path     = require('path');
const fs       = require('fs');
const pool     = require('../config/db');
const { upload, UPLOAD_DIR } = require('../config/upload');
const { requireAuth }        = require('../middleware/auth');

// POST /api/upload/bike/:id
// Téléverse une photo pour un vélo du garage
router.post('/bike/:id', requireAuth, (req, res) => {
  upload.single('photo')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });

    try {
      // Vérifier que le vélo appartient à l'utilisateur
      const check = await pool.query(
        'SELECT id, image_url FROM garage_bikes WHERE id = $1 AND user_id = $2',
        [req.params.id, req.user.id]
      );
      if (!check.rows[0]) {
        fs.unlinkSync(req.file.path); // supprimer le fichier orphelin
        return res.status(404).json({ error: 'Vélo introuvable' });
      }

      // Supprimer l'ancienne photo si c'était un upload local
      const old = check.rows[0].image_url;
      if (old?.startsWith('/uploads/')) {
        const oldPath = path.join('/app', old);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }

      // Optionnel: redimensionner avec sharp si disponible
      try {
        const sharp = require('sharp');
        const resized = req.file.path.replace(/(\.\w+)$/, '-resized$1');
        await sharp(req.file.path)
          .resize(1200, 800, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toFile(resized);
        fs.unlinkSync(req.file.path);
        fs.renameSync(resized, req.file.path);
      } catch { /* sharp non dispo, on garde l'original */ }

      const imageUrl = `/uploads/bikes/${req.file.filename}`;
      await pool.query(
        'UPDATE garage_bikes SET image_url = $1 WHERE id = $2',
        [imageUrl, req.params.id]
      );

      res.json({ image_url: imageUrl });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });
});

// DELETE /api/upload/bike/:id/photo
router.delete('/bike/:id/photo', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT image_url FROM garage_bikes WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Vélo introuvable' });

    const imageUrl = result.rows[0].image_url;
    if (imageUrl?.startsWith('/uploads/')) {
      const filePath = path.join('/app', imageUrl);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await pool.query('UPDATE garage_bikes SET image_url = NULL WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
