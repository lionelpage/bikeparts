import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import NotificationBell from './NotificationBell';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <nav className="navbar">
      <Link to="/dashboard" className="navbar-brand">
        🚲 BikeParts
      </Link>
      <div className="navbar-links">
        <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'active' : ''}>
          Tableau de bord
        </NavLink>
        <NavLink to="/garage" className={({ isActive }) => isActive ? 'active' : ''}>
          Mon Garage
        </NavLink>
      </div>
      <div className="navbar-user">
        <NotificationBell />
        {user?.avatar_url && (
          <img src={user.avatar_url} alt={user.name} className="avatar" />
        )}
        <span className="user-name">{user?.name}</span>
        <NavLink to="/settings">Paramètres</NavLink>
        <button onClick={handleLogout} className="btn-logout">Déconnexion</button>
      </div>
    </nav>
  );
}
