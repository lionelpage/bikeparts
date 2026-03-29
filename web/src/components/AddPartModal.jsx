import { useState, useEffect } from 'react';
import api from '../api/client';

export default function AddPartModal({ bikeId, bikeKm, onClose, onAdded }) {
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({
    category_id:        '',
    brand:              '',
    model:              '',
    notes:              '',
    installed_at_km:    bikeKm,
    installed_date:     new Date().toISOString().split('T')[0],
    max_km_recommended: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => {
    api.get('/api/parts/categories').then(({ data }) => setCategories(data.categories || []));
  }, []);

  function handleChange(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.category_id) return setError('Sélectionnez une catégorie');
    setLoading(true);
    try {
      const { data } = await api.post(`/api/parts/bike/${bikeId}`, {
        ...form,
        installed_at_km:    parseFloat(form.installed_at_km) || 0,
        max_km_recommended: form.max_km_recommended ? parseFloat(form.max_km_recommended) : undefined,
      });
      onAdded(data.part);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2 className="modal-title">Ajouter une pièce</h2>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Catégorie *</label>
            <select name="category_id" className="form-select" required value={form.category_id} onChange={handleChange}>
              <option value="">— Sélectionner —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Marque</label>
              <input name="brand" className="form-input" value={form.brand} onChange={handleChange} placeholder="Shimano" />
            </div>
            <div className="form-group">
              <label className="form-label">Modèle</label>
              <input name="model" className="form-input" value={form.model} onChange={handleChange} placeholder="105 R7000" />
            </div>
            <div className="form-group">
              <label className="form-label">Posé à (km)</label>
              <input name="installed_at_km" type="number" className="form-input" value={form.installed_at_km} onChange={handleChange} min="0" step="0.1" />
            </div>
            <div className="form-group">
              <label className="form-label">Date de pose</label>
              <input name="installed_date" type="date" className="form-input" value={form.installed_date} onChange={handleChange} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Durée de vie recommandée (km)</label>
            <input name="max_km_recommended" type="number" className="form-input"
              value={form.max_km_recommended} onChange={handleChange}
              placeholder="ex: 2000 pour une chaîne" min="0" />
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
      </div>
    </div>
  );
}
