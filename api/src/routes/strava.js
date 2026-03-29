const router = require('express').Router();
const axios  = require('axios');
const pool   = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { checkPartsAndNotify } = require('../services/notifications');

const STRAVA_AUTH_URL  = 'https://www.strava.com/oauth/authorize';
const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';
const STRAVA_API_BASE  = 'https://www.strava.com/api/v3';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getValidToken(userId) {
  const result = await pool.query('SELECT * FROM strava_tokens WHERE user_id = $1', [userId]);
  if (!result.rows[0]) return null;

  const token = result.rows[0];
  // Si le token expire dans moins de 5 minutes, on le rafraîchit
  if (new Date(token.expires_at) < new Date(Date.now() + 5 * 60 * 1000)) {
    const resp = await axios.post(STRAVA_TOKEN_URL, {
      client_id:     process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type:    'refresh_token',
      refresh_token: token.refresh_token,
    });
    const { access_token, refresh_token, expires_at } = resp.data;
    await pool.query(
      `UPDATE strava_tokens
       SET access_token = $1, refresh_token = $2, expires_at = to_timestamp($3)
       WHERE user_id = $4`,
      [access_token, refresh_token, expires_at, userId]
    );
    return access_token;
  }
  return token.access_token;
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /api/strava/connect
// Lance le flow OAuth Strava (l'utilisateur doit être connecté)
router.get('/connect', requireAuth, (req, res) => {
  req.session.stravaUserId = req.user.id; // on garde l'user ID pour le callback
  const params = new URLSearchParams({
    client_id:     process.env.STRAVA_CLIENT_ID,
    redirect_uri:  process.env.STRAVA_CALLBACK_URL,
    response_type: 'code',
    approval_prompt: 'auto',
    scope:         'read,activity:read,profile:read_all',
  });
  res.redirect(`${STRAVA_AUTH_URL}?${params}`);
});

// GET /api/strava/callback
router.get('/callback', async (req, res) => {
  const { code, error } = req.query;
  const userId = req.session.stravaUserId;

  if (error || !code) {
    return res.redirect(`${process.env.FRONTEND_URL}/settings?strava=denied`);
  }
  if (!userId) {
    return res.redirect(`${process.env.FRONTEND_URL}/login`);
  }

  try {
    const resp = await axios.post(STRAVA_TOKEN_URL, {
      client_id:     process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type:    'authorization_code',
    });

    const { access_token, refresh_token, expires_at, athlete } = resp.data;

    await pool.query(
      `INSERT INTO strava_tokens (user_id, strava_athlete_id, access_token, refresh_token, expires_at)
       VALUES ($1, $2, $3, $4, to_timestamp($5))
       ON CONFLICT (user_id) DO UPDATE
       SET strava_athlete_id = $2,
           access_token      = $3,
           refresh_token     = $4,
           expires_at        = to_timestamp($5)`,
      [userId, athlete.id, access_token, refresh_token, expires_at]
    );

    delete req.session.stravaUserId;
    res.redirect(`${process.env.FRONTEND_URL}/settings?strava=connected`);
  } catch (err) {
    console.error('Strava callback error:', err.response?.data || err.message);
    res.redirect(`${process.env.FRONTEND_URL}/settings?strava=error`);
  }
});

// GET /api/strava/status
router.get('/status', requireAuth, async (req, res) => {
  const result = await pool.query(
    'SELECT strava_athlete_id, expires_at FROM strava_tokens WHERE user_id = $1',
    [req.user.id]
  );
  if (!result.rows[0]) return res.json({ connected: false });
  res.json({ connected: true, athlete_id: result.rows[0].strava_athlete_id });
});

// DELETE /api/strava/disconnect
router.delete('/disconnect', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM strava_tokens WHERE user_id = $1', [req.user.id]);
  res.json({ message: 'Compte Strava déconnecté' });
});

// GET /api/strava/bikes
// Récupère les vélos depuis l'API Strava
router.get('/bikes', requireAuth, async (req, res) => {
  try {
    const accessToken = await getValidToken(req.user.id);
    if (!accessToken) return res.status(401).json({ error: 'Compte Strava non connecté' });

    const { data: athlete } = await axios.get(`${STRAVA_API_BASE}/athlete`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const bikes = (athlete.bikes || []).map((b) => ({
      strava_id:      b.id,
      name:           b.name,
      brand:          b.brand_name || null,
      model:          b.model_name || null,
      description:    b.description || null,
      total_distance: Math.round((b.converted_distance || 0) * 10) / 10,
    }));

    res.json({ bikes });
  } catch (err) {
    console.error('Strava bikes error:', err.response?.data || err.message);
    res.status(502).json({ error: 'Erreur lors de la récupération des vélos Strava' });
  }
});

// POST /api/strava/sync
// Synchronise les distances des vélos du garage depuis Strava
router.post('/sync', requireAuth, async (req, res) => {
  try {
    const accessToken = await getValidToken(req.user.id);
    if (!accessToken) return res.status(401).json({ error: 'Compte Strava non connecté' });

    const { data: athlete } = await axios.get(`${STRAVA_API_BASE}/athlete`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const stravaBikes = athlete.bikes || [];
    let updated = 0;

    for (const sb of stravaBikes) {
      const km = Math.round((sb.converted_distance || 0) * 10) / 10;
      const r  = await pool.query(
        `UPDATE garage_bikes
         SET total_distance = $1
         WHERE user_id = $2 AND strava_bike_id = $3`,
        [km, req.user.id, sb.id]
      );
      if (r.rowCount > 0) updated++;
    }

    // Générer les notifications si des pièces approchent de leur limite
    await checkPartsAndNotify(req.user.id).catch((e) =>
      console.error('Notification check error:', e.message)
    );

    res.json({ message: `${updated} vélo(s) synchronisé(s)` });
  } catch (err) {
    console.error('Strava sync error:', err.response?.data || err.message);
    res.status(502).json({ error: 'Erreur lors de la synchronisation' });
  }
});

module.exports = router;
