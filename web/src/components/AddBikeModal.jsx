import { useState, useEffect } from 'react';
import api from '../api/client';

export default function AddBikeModal({ onClose, onAdded }) {
  const [tab, setTab]       = useState('manual'); // 'manual' | 'strava' | 'catalog'
  const [form, setForm]     = useState({ name: '', brand: '', model: '', year: '', color: '', notes: '' });
  const [stravaBikes, setStravaBikes] = useState([]);
  const [catalogResults, setCatalogResults] = useState([]);
  const [catalogQuery, setCatalogQuery]     = useState('');
  const [selectedCatalog, setSelectedCatalog] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => {
    if (tab === 'strava') {
      api.get('/api/strava/bikes')
        .then(({ data }) => setStravaBikes(data.bikes || []))
        .catch(() => setStravaBikes([]));
    }
  }, [tab]);

  async function searchCatalog() {
    if (!catalogQuery.trim()) return;
    const { data } = await api.get(`/api/catalog?q=${encodeURIComponent(catalogQuery)}&limit=10`);
    setCatalogResults(data.bikes || []);
  }

  function selectCatalog(bike) {
    setSelectedCatalog(bike);
    setForm((f) => ({
      ...f,
      name:  bike.model,
      brand: bike.brand,
      model: bike.model,
      year:  bike.year,
      color: bike.color || '',
    }));
    setTab('manual');
  }

  function handleChange(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function addFromStrava(sb) {
    setLoading(true);
    try {
      const { data } = await api.post('/api/garage', {
        name:            sb.name,
        brand:           sb.brand,
        model:           sb.model,
        strava_bike_id:  sb.strava_id,
        total_distance:  sb.total_distance,
      });
      onAdded(data.bike);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name) return setError('Le nom est requis');
    setLoading(true);
    try {
      const { data } = await api.post('/api/garage', {
        ...form,
        year:       form.year ? parseInt(form.year) : undefined,
        catalog_id: selectedCatalog?.id || undefined,
      });
      onAdded(data.bike);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2 className="modal-title">Ajouter un vélo</h2>

        <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1.5rem' }}>
          {['manual', 'strava', 'catalog'].map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`btn ${tab === t ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1, fontSize: '.8rem' }}>
              {t === 'manual' ? 'Manuel' : t === 'strava' ? 'Strava' : 'Catalogue'}
            </button>
          ))}
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {/* ── Tab Strava ── */}
        {tab === 'strava' && (
          <div>
            {stravaBikes.length === 0
              ? <p style={{ color: 'var(--text2)', textAlign: 'center', padding: '2rem' }}>
                  Aucun vélo sur votre compte Strava.<br />
                  <small>Vérifiez que Strava est connecté dans les Paramètres.</small>
                </p>
              : stravaBikes.map((sb) => (
                  <div key={sb.strava_id} className="part-item" style={{ cursor: 'pointer' }}
                    onClick={() => addFromStrava(sb)}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{sb.name}</div>
                      <div className="part-category">{[sb.brand, sb.model].filter(Boolean).join(' ')}</div>
                    </div>
                    <div className="part-km ok">{sb.total_distance.toLocaleString('fr-FR')} km</div>
                  </div>
                ))
            }
          </div>
        )}

        {/* ── Tab Catalogue ── */}
        {tab === 'catalog' && (
          <div>
            <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem' }}>
              <input
                className="form-input" placeholder="Trek Domane, Specialized Tarmac…"
                value={catalogQuery} onChange={(e) => setCatalogQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchCatalog()}
              />
              <button className="btn btn-primary" onClick={searchCatalog}>Chercher</button>
            </div>
            {catalogResults.map((b) => (
              <div key={b.id} className="part-item" style={{ cursor: 'pointer' }}
                onClick={() => selectCatalog(b)}>
                <div>
                  <div style={{ fontWeight: 600 }}>{b.brand} {b.model}</div>
                  <div className="part-category">{b.year}{b.color ? ` · ${b.color}` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Tab Manuel ── */}
        {tab === 'manual' && (
          <form onSubmit={handleSubmit}>
            {selectedCatalog && (
              <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
                Modèle sélectionné : {selectedCatalog.brand} {selectedCatalog.model} {selectedCatalog.year}
                <button onClick={() => setSelectedCatalog(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>×</button>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Nom *</label>
              <input name="name" className="form-input" required value={form.name} onChange={handleChange} placeholder="Mon Trek Domane" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Marque</label>
                <input name="brand" className="form-input" value={form.brand} onChange={handleChange} placeholder="Trek" />
              </div>
              <div className="form-group">
                <label className="form-label">Modèle</label>
                <input name="model" className="form-input" value={form.model} onChange={handleChange} placeholder="Domane SL 6" />
              </div>
              <div className="form-group">
                <label className="form-label">Année</label>
                <input name="year" type="number" className="form-input" value={form.year} onChange={handleChange} placeholder="2023" min="1990" max="2030" />
              </div>
              <div className="form-group">
                <label className="form-label">Couleur</label>
                <input name="color" className="form-input" value={form.color} onChange={handleChange} placeholder="Carbon Red Smoke" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea name="notes" className="form-textarea" value={form.notes} onChange={handleChange} placeholder="…" />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Ajout…' : 'Ajouter'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
