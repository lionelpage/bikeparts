const passport        = require('passport');
const GoogleStrategy  = require('passport-google-oauth20').Strategy;
const pool            = require('./db');

passport.use(new GoogleStrategy({
  clientID:     process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL:  process.env.GOOGLE_CALLBACK_URL,
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const email     = profile.emails?.[0]?.value;
    const name      = profile.displayName;
    const avatarUrl = profile.photos?.[0]?.value;
    const googleId  = profile.id;

    // Chercher l'utilisateur existant par google_id ou email
    let result = await pool.query('SELECT * FROM users WHERE google_id = $1', [googleId]);

    if (result.rows.length === 0) {
      result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      if (result.rows.length > 0) {
        // Lier le compte Google à l'utilisateur existant
        await pool.query('UPDATE users SET google_id = $1, avatar_url = $2 WHERE id = $3', [googleId, avatarUrl, result.rows[0].id]);
        result = await pool.query('SELECT * FROM users WHERE id = $1', [result.rows[0].id]);
      } else {
        // Créer un nouvel utilisateur
        result = await pool.query(
          'INSERT INTO users (email, google_id, name, avatar_url) VALUES ($1, $2, $3, $4) RETURNING *',
          [email, googleId, name, avatarUrl]
        );
      }
    }

    done(null, result.rows[0]);
  } catch (err) {
    done(err);
  }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    done(null, result.rows[0] || null);
  } catch (err) {
    done(err);
  }
});
