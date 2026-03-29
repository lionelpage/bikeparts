const pool = require('../config/db');

/**
 * Après chaque synchronisation Strava, vérifie toutes les pièces actives
 * de l'utilisateur et crée des notifications si nécessaire.
 *
 * Seuils :
 *  - warning  : pièce à >= 80 % de sa durée de vie recommandée
 *  - critical : pièce à >= 100 % (dépassement)
 *
 * On ne crée pas de doublon : si une notif du même type existe déjà
 * pour la même pièce et n'est pas lue, on ne la recrée pas.
 */
async function checkPartsAndNotify(userId) {
  // Récupère toutes les pièces actives avec max_km et km courant
  const { rows: parts } = await pool.query(
    `SELECT p.id        AS part_id,
            p.garage_bike_id AS bike_id,
            p.brand,
            p.model,
            p.max_km_recommended,
            p.installed_at_km,
            g.total_distance,
            g.name      AS bike_name,
            pc.name     AS category_name
     FROM parts p
     JOIN garage_bikes    g  ON g.id  = p.garage_bike_id
     JOIN part_categories pc ON pc.id = p.category_id
     WHERE g.user_id        = $1
       AND p.removed_at_km  IS NULL
       AND p.max_km_recommended IS NOT NULL
       AND p.max_km_recommended > 0`,
    [userId]
  );

  for (const part of parts) {
    const currentKm = parseFloat(part.total_distance) - parseFloat(part.installed_at_km);
    const maxKm     = parseFloat(part.max_km_recommended);
    const pct       = currentKm / maxKm;

    let type    = null;
    let title   = null;
    let message = null;

    if (pct >= 1) {
      type    = 'part_critical';
      title   = `Pièce à remplacer sur ${part.bike_name}`;
      message = `${part.category_name}${part.brand ? ` (${part.brand}${part.model ? ' ' + part.model : ''})` : ''} — ${Math.round(currentKm).toLocaleString('fr-FR')} km / ${Math.round(maxKm).toLocaleString('fr-FR')} km recommandés. Durée de vie dépassée.`;
    } else if (pct >= 0.8) {
      type    = 'part_warning';
      title   = `Pièce bientôt à remplacer sur ${part.bike_name}`;
      message = `${part.category_name}${part.brand ? ` (${part.brand}${part.model ? ' ' + part.model : ''})` : ''} — ${Math.round(currentKm).toLocaleString('fr-FR')} km / ${Math.round(maxKm).toLocaleString('fr-FR')} km recommandés (${Math.round(pct * 100)} %).`;
    }

    if (!type) continue;

    // Vérifier si une notif non-lue du même type existe déjà pour cette pièce
    const existing = await pool.query(
      `SELECT id FROM notifications
       WHERE user_id = $1 AND part_id = $2 AND type = $3 AND is_read = FALSE`,
      [userId, part.part_id, type]
    );
    if (existing.rows.length > 0) continue;

    await pool.query(
      `INSERT INTO notifications (user_id, part_id, bike_id, type, title, message)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, part.part_id, part.bike_id, type, title, message]
    );
  }
}

module.exports = { checkPartsAndNotify };
