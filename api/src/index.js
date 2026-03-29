require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const session    = require('express-session');
const passport   = require('passport');

const authRouter          = require('./routes/auth');
const stravaRouter        = require('./routes/strava');
const garageRouter        = require('./routes/garage');
const catalogRouter       = require('./routes/catalog');
const partsRouter         = require('./routes/parts');
const notificationsRouter = require('./routes/notifications');
const exportRouter        = require('./routes/export');

require('./config/passport');

const app  = express();
const PORT = process.env.PORT || 4000;

// ── Middlewares ──────────────────────────────────────────────────────────────
app.use(cors({
  origin:      process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(session({
  secret:            process.env.JWT_SECRET || 'dev_secret',
  resave:            false,
  saveUninitialized: false,
  cookie:            { secure: false, maxAge: 10 * 60 * 1000 }, // 10 min, pour OAuth flow
}));
app.use(passport.initialize());
app.use(passport.session());

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',          authRouter);
app.use('/api/strava',        stravaRouter);
app.use('/api/garage',        garageRouter);
app.use('/api/catalog',       catalogRouter);
app.use('/api/parts',         partsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/export',        exportRouter);

app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
