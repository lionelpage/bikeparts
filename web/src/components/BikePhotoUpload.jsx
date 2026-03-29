import { useRef, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4001';

export default function BikePhotoUpload({ bikeId, currentImage, onUpdated }) {
  const inputRef          = useRef(null);
  const [preview, setPreview]   = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setPreview(URL.createObjectURL(file));
    uploadFile(file);
  }

  async function uploadFile(file) {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('photo', file);

      const token = localStorage.getItem('token');
      const res   = await fetch(`${API_URL}/api/upload/bike/${bikeId}`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
        body:    formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur upload');
      onUpdated(data.image_url);
    } catch (err) {
      setError(err.message);
      setPreview(null);
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function deletePhoto() {
    if (!confirm('Supprimer la photo ?')) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_URL}/api/upload/bike/${bikeId}/photo`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setPreview(null);
      onUpdated(null);
    } catch {
      setError('Erreur lors de la suppression');
    } finally {
      setLoading(false);
    }
  }

  const displayed = preview || currentImage;

  return (
    <div style={{ position: 'relative', width: 200, flexShrink: 0 }}>
      {/* Image ou placeholder */}
      <div
        onClick={() => !loading && inputRef.current?.click()}
        style={{
          width: 200, height: 130, borderRadius: 8, overflow: 'hidden',
          background: 'var(--bg3)', cursor: loading ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '2px dashed var(--border)', position: 'relative',
          transition: 'border-color .2s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--primary)'}
        onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
        title={displayed ? 'Changer la photo' : 'Ajouter une photo'}
      >
        {displayed ? (
          <img
            src={displayed.startsWith('blob:') ? displayed : `${API_URL}${displayed}`}
            alt="Vélo"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--text2)', fontSize: '.8rem', padding: '1rem' }}>
            <div style={{ fontSize: '1.8rem', marginBottom: '.4rem' }}>📷</div>
            {loading ? 'Upload…' : 'Ajouter une photo'}
          </div>
        )}

        {/* Overlay au hover si image présente */}
        {displayed && !loading && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: 0, transition: 'opacity .2s', gap: '.5rem',
          }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '0'}
          >
            <button
              onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
              style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '.4rem .7rem', borderRadius: 6, cursor: 'pointer', fontSize: '.8rem' }}
            >
              ✏️ Changer
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); deletePhoto(); }}
              style={{ background: 'var(--danger)', border: 'none', color: '#fff', padding: '.4rem .7rem', borderRadius: 6, cursor: 'pointer', fontSize: '.8rem' }}
            >
              🗑
            </button>
          </div>
        )}

        {loading && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: '.85rem',
          }}>
            Upload…
          </div>
        )}
      </div>

      {error && (
        <div style={{ color: 'var(--danger)', fontSize: '.75rem', marginTop: '.4rem' }}>{error}</div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </div>
  );
}
