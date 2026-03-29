import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function Settings() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [strava, setStrava]     = useState(null);
  const [profileForm, setProfileForm] = useState({ name: user?.name || '' });
  const [message, setMessage]   = useState(null);
  const [loading, setLoading]   = useState(false);

  // Lire le retour du callback Strava
  useEffect(() => {
    const status = searchParams.get('strava');
    if (status === 'connected')  setMessage({ type: 'success', text: 'Compte Strava connecté avec succès !' });
    if (status === 'denied')     setMessage({ type: 'error',   text: 'Connexion Strava refusée.' });
    if (status === 'error')      setMessage({ type: 'error',   text: 'Erreur lors de la connexion Strava.' });
  }, []);

  useEffect(() => {
    api.get('/api/strava/status').then(({ data }) => setStrava(data)).catch(() => setStrava({ connected: false }));
  }, []);

  async function disconnectStrava() {
    if (!confirm('Déconnecter Strava ?')) return;
    await api.delete('/api/strava/disconnect');
    setStrava({ connected: false });
    setMessage({ type: 'success', text: 'Strava déconnecté.' });
  }

  async function updateProfile(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.patch('/api/auth/me', profileForm);
      setMessage({ type: 'success', text: 'Profil mis à jour.' });
    } catch {
      setMessage({ type: 'error', text: 'Erreur lors de la mise à jour.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <h1 className="page-title" style={{ marginBottom: '2rem' }}>Paramètres</h1>

      {message && (
        <div className={`alert alert-${message.type}`} style={{ marginBottom: '1.5rem' }}>
          {message.text}
        </div>
      )}

      {/* ── Profil ──────────────────────────────────── */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1.25rem' }}>Profil</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
          {user?.avatar_url
            ? <img src={user.avatar_url} alt={user.name} style={{ width: 56, height: 56, borderRadius: '50%' }} />
            : <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>👤</div>
          }
          <div>
            <div style={{ fontWeight: 600 }}>{user?.name}</div>
            <div style={{ color: 'var(--text2)', fontSize: '.85rem' }}>{user?.email}</div>
            {user?.google_id && <span className="badge badge-strava" style={{ marginTop: '.25rem' }}>Google</span>}
          </div>
        </div>
        <form onSubmit={updateProfile}>
          <div className="form-group">
            <label className="form-label">Nom affiché</label>
            <input className="form-input" value={profileForm.name}
              onChange={(e) => setProfileForm({ name: e.target.value })} />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </form>
      </div>

      {/* ── Strava ──────────────────────────────────── */}
      <div className="card">
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '.5rem' }}>Connexion Strava</h2>
        <p style={{ color: 'var(--text2)', fontSize: '.85rem', marginBottom: '1.25rem' }}>
          Connectez votre compte Strava pour importer vos vélos et synchroniser automatiquement les kilométrages.
        </p>

        {strava === null ? (
          <div style={{ color: 'var(--text2)' }}>Chargement…</div>
        ) : strava.connected ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span className="badge badge-active">✓ Connecté</span>
            <span style={{ color: 'var(--text2)', fontSize: '.85rem' }}>Athlète #{strava.athlete_id}</span>
            <button onClick={disconnectStrava} className="btn btn-secondary" style={{ marginLeft: 'auto', fontSize: '.85rem' }}>
              Déconnecter
            </button>
          </div>
        ) : (
          <a href={`${API_URL}/api/strava/connect?token=${localStorage.getItem('token')}`} className="btn btn-strava">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0 5 13.828h4.172" />
            </svg>
            Connecter avec Strava
          </a>
        )}
      </div>
    </div>
  );
}
