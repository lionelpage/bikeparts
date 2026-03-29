import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';

export default function Dashboard() {
  const { user } = useAuth();
  const [bikes, setBikes]   = useState([]);
  const [stats, setStats]   = useState({ total_bikes: 0, total_parts: 0, total_km: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await api.get('/api/garage');
        setBikes(data.bikes || []);
        const totalKm    = data.bikes.reduce((s, b) => s + parseFloat(b.total_distance || 0), 0);
        const partsRes   = await Promise.all(
          data.bikes.map((b) => api.get(`/api/parts/bike/${b.id}`).then((r) => r.data.parts.length))
        );
        setStats({
          total_bikes: data.bikes.length,
          total_parts: partsRes.reduce((a, b) => a + b, 0),
          total_km:    Math.round(totalKm),
        });
      } catch { /* silently fail */ } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div className="loading-screen">Chargement…</div>;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Bonjour, {user?.name} 👋</h1>
        <Link to="/garage" className="btn btn-primary">Mon Garage</Link>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.total_bikes}</div>
          <div className="stat-label">Vélo{stats.total_bikes !== 1 ? 's' : ''} dans le garage</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.total_km.toLocaleString('fr-FR')}</div>
          <div className="stat-label">km total</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.total_parts}</div>
          <div className="stat-label">Pièce{stats.total_parts !== 1 ? 's' : ''} suivie{stats.total_parts !== 1 ? 's' : ''}</div>
        </div>
      </div>

      {bikes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🚲</div>
          <h3>Votre garage est vide</h3>
          <p>Ajoutez votre premier vélo pour commencer le suivi de vos pièces.</p>
          <br />
          <Link to="/garage" className="btn btn-primary">Ajouter un vélo</Link>
        </div>
      ) : (
        <>
          <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Mes vélos</h2>
          <div className="card-grid">
            {bikes.slice(0, 3).map((bike) => (
              <Link key={bike.id} to={`/garage/${bike.id}`} className="bike-card">
                {bike.image_url || bike.catalog_image_url
                  ? <img src={bike.image_url || bike.catalog_image_url} alt={bike.name} />
                  : <div className="bike-card-no-img">🚲</div>
                }
                <div className="bike-card-body">
                  <div className="bike-card-title">{bike.name}</div>
                  <div className="bike-card-sub">{[bike.brand, bike.model, bike.year].filter(Boolean).join(' · ')}</div>
                  <div className="bike-card-km">{parseFloat(bike.total_distance || 0).toLocaleString('fr-FR')} km</div>
                </div>
              </Link>
            ))}
          </div>
          {bikes.length > 3 && (
            <div style={{ marginTop: '1rem', textAlign: 'center' }}>
              <Link to="/garage" className="btn btn-secondary">Voir tous les vélos ({bikes.length})</Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
