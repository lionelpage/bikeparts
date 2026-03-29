import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function AuthCallback() {
  const [params] = useSearchParams();
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const token = params.get('token');
    if (token) {
      loginWithToken(token);
      navigate('/dashboard', { replace: true });
    } else {
      navigate('/login?error=oauth', { replace: true });
    }
  }, []);

  return <div className="loading-screen">Connexion en cours…</div>;
}
