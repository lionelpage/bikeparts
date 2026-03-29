const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  // Accepte le token depuis le header Authorization OU depuis ?token= (pour les redirections OAuth)
  const header = req.headers.authorization;
  const token  = (header?.startsWith('Bearer ') ? header.slice(7) : null) || req.query.token;
  if (!token) {
    return res.status(401).json({ error: 'Token manquant' });
  }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
