import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import AddPartModal from '../components/AddPartModal';
import BikePhotoUpload from '../components/BikePhotoUpload';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function downloadPdf(bikeId, bikeName) {
  const token = localStorage.getItem('token');
  fetch(`${API_URL}/api/export/bike/${bikeId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((res) => res.blob())
    .then((blob) => {
      const url  = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href     = url;
      link.download = `bikeparts-${bikeName.replace(/\s+/g, '_')}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    });
}

function kmColor(current, max) {
  if (!max) return 'ok';
  const pct = current / max;
  if (pct >= 1) return 'warning';
  if (pct >= 0.8) return 'warning';
  return 'ok';
}

export default function BikeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [bike, setBike]       = useState(null);
  const [parts, setParts]     = useState([]);
  const [totalKm, setTotalKm] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter]   = useState('active'); // 'active' | 'all'

  async function load() {
    try {
      const [bikeRes, partsRes] = await Promise.all([
        api.get(`/api/garage/${id}`),
        api.get(`/api/parts/bike/${id}`),
      ]);
      setBike(bikeRes.data.bike);
      setParts(partsRes.data.parts || []);
      setTotalKm(parseFloat(partsRes.data.bike_total_km || 0));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function removePart(partId) {
    if (!confirm('Supprimer cette pièce ?')) return;
    await api.delete(`/api/parts/${partId}`);
    setParts((p) => p.filter((x) => x.id !== partId));
  }

  async function retirePart(part) {
    await api.put(`/api/parts/${part.id}`, {
      removed_at_km:  totalKm,
      removed_date:   new Date().toISOString().split('T')[0],
    });
    load();
  }

  if (loading) return <div className="loading-screen">Chargement…</div>;
  if (!bike)   return <div className="loading-screen">Vélo introuvable</div>;

  const activeParts  = parts.filter((p) => !p.removed_at_km);
  const retiredParts = parts.filter((p) => p.removed_at_km);
  const displayed    = filter === 'active' ? activeParts : parts;

  return (
    <div>
      {/* ── Entête vélo ─────────────────────────────── */}
      <button onClick={() => navigate('/garage')} className="btn btn-secondary" style={{ marginBottom: '1.5rem', fontSize: '.8rem' }}>
        ← Retour au garage
      </button>

      <div className="card" style={{ marginBottom: '2rem', display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
        <BikePhotoUpload
          bikeId={id}
          currentImage={bike.image_url || bike.catalog_image_url || null}
          onUpdated={(url) => setBike((b) => ({ ...b, image_url: url }))}
        />
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '.5rem' }}>{bike.name}</h1>
          <div style={{ color: 'var(--text2)', fontSize: '.9rem', marginBottom: '.75rem' }}>
            {[bike.brand, bike.model, bike.year, bike.color].filter(Boolean).join(' · ')}
          </div>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div className="stat-card" style={{ padding: '.75rem 1.25rem' }}>
              <div className="stat-value" style={{ fontSize: '1.4rem' }}>{totalKm.toLocaleString('fr-FR')}</div>
              <div className="stat-label">km total</div>
            </div>
            <div className="stat-card" style={{ padding: '.75rem 1.25rem' }}>
              <div className="stat-value" style={{ fontSize: '1.4rem' }}>{activeParts.length}</div>
              <div className="stat-label">pièces actives</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Pièces ───────────────────────────────────── */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h2 className="page-title">Pièces</h2>
          <div style={{ display: 'flex', gap: '.5rem' }}>
            <button onClick={() => setFilter('active')}
              className={`btn ${filter === 'active' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '.8rem', padding: '.35rem .7rem' }}>
              Actives ({activeParts.length})
            </button>
            <button onClick={() => setFilter('all')}
              className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '.8rem', padding: '.35rem .7rem' }}>
              Toutes ({parts.length})
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '.75rem' }}>
          <button onClick={() => downloadPdf(id, bike.name)} className="btn btn-secondary" title="Exporter en PDF">
            ↓ Export PDF
          </button>
          <button onClick={() => setShowAdd(true)} className="btn btn-primary">+ Ajouter une pièce</button>
        </div>
      </div>

      {displayed.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔧</div>
          <h3>Aucune pièce enregistrée</h3>
          <p>Ajoutez les pièces de ce vélo pour suivre leur kilométrage.</p>
        </div>
      ) : (
        <div className="parts-list">
          {displayed.map((part) => {
            const km    = parseFloat(part.current_km || 0);
            const isOut = !!part.removed_at_km;
            return (
              <div key={part.id} className="part-item">
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, marginBottom: '.2rem' }}>
                    {part.brand ? `${part.brand} ${part.model || ''}` : part.model || 'Pièce sans nom'}
                  </div>
                  <div className="part-category">{part.category_name}</div>
                  {part.installed_date && (
                    <div className="part-category">Posé le {new Date(part.installed_date).toLocaleDateString('fr-FR')}</div>
                  )}
                </div>
                <div className={`part-km ${isOut ? 'removed' : kmColor(km, part.max_km_recommended)}`}>
                  {km.toLocaleString('fr-FR')} km
                  {part.max_km_recommended && !isOut && (
                    <div style={{ fontSize: '.75rem', fontWeight: 400 }}>/ {parseFloat(part.max_km_recommended).toLocaleString('fr-FR')} km</div>
                  )}
                  {isOut && <div style={{ fontSize: '.75rem', fontWeight: 400 }}>Retirée</div>}
                </div>
                <div style={{ display: 'flex', gap: '.5rem', marginLeft: '.5rem' }}>
                  {!isOut && (
                    <button onClick={() => retirePart(part)} title="Retirer la pièce"
                      className="btn btn-secondary" style={{ fontSize: '.75rem', padding: '.3rem .6rem' }}>
                      Retirer
                    </button>
                  )}
                  <button onClick={() => removePart(part.id)} title="Supprimer"
                    className="btn btn-danger" style={{ fontSize: '.75rem', padding: '.3rem .6rem' }}>
                    ×
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <AddPartModal
          bikeId={id}
          bikeKm={totalKm}
          onClose={() => setShowAdd(false)}
          onAdded={(part) => { setParts((p) => [part, ...p]); setShowAdd(false); }}
        />
      )}
    </div>
  );
}
