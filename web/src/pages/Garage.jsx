import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import AddBikeModal from '../components/AddBikeModal';

export default function Garage() {
  const [bikes, setBikes]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showAdd, setShowAdd]   = useState(false);
  const [syncing, setSyncing]   = useState(false);
  const [message, setMessage]   = useState(null);

  async function loadBikes() {
    try {
      const { data } = await api.get('/api/garage');
      setBikes(data.bikes || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadBikes(); }, []);

  async function syncStrava() {
    setSyncing(true);
    setMessage(null);
    try {
      const { data } = await api.post('/api/strava/sync');
      setMessage({ type: 'success', text: data.message });
      loadBikes();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Erreur lors de la synchronisation' });
    } finally {
      setSyncing(false);
    }
  }

  async function deleteBike(id) {
    if (!confirm('Supprimer ce vélo et toutes ses pièces ?')) return;
    await api.delete(`/api/garage/${id}`);
    setBikes((prev) => prev.filter((b) => b.id !== id));
  }

  if (loading) return <div className="loading-screen">Chargement…</div>;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Mon Garage</h1>
        <div style={{ display: 'flex', gap: '.75rem' }}>
          <button onClick={syncStrava} className="btn btn-strava" disabled={syncing}>
            {syncing ? 'Sync…' : '↻ Sync Strava'}
          </button>
          <button onClick={() => setShowAdd(true)} className="btn btn-primary">
            + Ajouter un vélo
          </button>
        </div>
      </div>

      {message && (
        <div className={`alert alert-${message.type}`}>{message.text}</div>
      )}

      {bikes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🚲</div>
          <h3>Aucun vélo dans le garage</h3>
          <p>Ajoutez votre vélo manuellement ou synchronisez depuis Strava.</p>
        </div>
      ) : (
        <div className="card-grid">
          {bikes.map((bike) => (
            <div key={bike.id} style={{ position: 'relative' }}>
              <Link to={`/garage/${bike.id}`} className="bike-card" style={{ display: 'block' }}>
                {bike.image_url || bike.catalog_image_url
                  ? <img src={bike.image_url || bike.catalog_image_url} alt={bike.name} />
                  : <div className="bike-card-no-img">🚲</div>
                }
                <div className="bike-card-body">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                    <div className="bike-card-title">{bike.name}</div>
                    {bike.strava_bike_id && <span className="badge badge-strava">Strava</span>}
                    {!bike.is_active && <span className="badge badge-inactive">Archivé</span>}
                  </div>
                  <div className="bike-card-sub">
                    {[bike.brand, bike.model, bike.year].filter(Boolean).join(' · ')}
                  </div>
                  {bike.color && <div className="bike-card-sub">{bike.color}</div>}
                  <div className="bike-card-km">
                    {parseFloat(bike.total_distance || 0).toLocaleString('fr-FR')} km
                  </div>
                </div>
              </Link>
              <button
                onClick={() => deleteBike(bike.id)}
                style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(0,0,0,.6)', border: 'none', color: '#fff', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', fontSize: '.9rem' }}
                title="Supprimer"
              >×</button>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <AddBikeModal
          onClose={() => setShowAdd(false)}
          onAdded={(bike) => { setBikes((p) => [bike, ...p]); setShowAdd(false); }}
        />
      )}
    </div>
  );
}
