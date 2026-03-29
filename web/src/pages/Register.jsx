import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function Register() {
  const { register } = useAuth();
  const [form, setForm]     = useState({ name: '', email: '', password: '' });
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) {
      return setError('Le mot de passe doit faire au moins 8 caractères');
    }
    setLoading(true);
    try {
      await register(form.email, form.password, form.name);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de l\'inscription');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-box card">
        <div className="auth-logo">🚲 BikeParts</div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Nom</label>
            <input
              type="text" name="name" className="form-input" required
              value={form.name} onChange={handleChange} placeholder="Jean Dupont"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email" name="email" className="form-input" required
              value={form.email} onChange={handleChange} placeholder="vous@exemple.com"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Mot de passe</label>
            <input
              type="password" name="password" className="form-input" required minLength={8}
              value={form.password} onChange={handleChange} placeholder="8 caractères minimum"
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Création…' : 'Créer mon compte'}
          </button>
        </form>

        <div className="auth-divider">ou</div>

        <a href={`${API_URL}/api/auth/google`} className="btn btn-google" style={{ width: '100%', justifyContent: 'center' }}>
          <img src="https://www.google.com/favicon.ico" width="16" alt="Google" />
          Continuer avec Google
        </a>

        <div className="auth-footer">
          Déjà un compte ? <Link to="/login">Se connecter</Link>
        </div>
      </div>
    </div>
  );
}
