import { useState, useEffect, useRef } from 'react';
import api from '../api/client';

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread]               = useState(0);
  const [open, setOpen]                   = useState(false);
  const ref                               = useRef(null);

  async function load() {
    try {
      const { data } = await api.get('/api/notifications');
      setNotifications(data.notifications || []);
      setUnread(data.unread_count || 0);
    } catch { /* silently fail */ }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000); // rafraîchit chaque minute
    return () => clearInterval(interval);
  }, []);

  // Ferme en cliquant en dehors
  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function markAllRead() {
    await api.patch('/api/notifications/read-all');
    setNotifications((n) => n.map((x) => ({ ...x, is_read: true })));
    setUnread(0);
  }

  async function markRead(id) {
    await api.patch(`/api/notifications/${id}/read`);
    setNotifications((n) => n.map((x) => x.id === id ? { ...x, is_read: true } : x));
    setUnread((u) => Math.max(0, u - 1));
  }

  async function deleteNotif(e, id) {
    e.stopPropagation();
    await api.delete(`/api/notifications/${id}`);
    setNotifications((n) => n.filter((x) => x.id !== id));
    setUnread((u) => Math.max(0, u - 1));
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          position: 'relative', fontSize: '1.2rem', padding: '.2rem',
          color: open ? 'var(--text)' : 'var(--text2)',
          lineHeight: 1,
        }}
        title="Notifications"
      >
        🔔
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -3, right: -5,
            background: 'var(--primary)', color: '#fff',
            borderRadius: '50%', width: 16, height: 16,
            fontSize: '.65rem', fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '110%',
          width: 340, background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)',
          zIndex: 300, overflow: 'hidden',
        }}>
          {/* En-tête */}
          <div style={{
            padding: '.75rem 1rem', display: 'flex',
            alignItems: 'center', justifyContent: 'space-between',
            borderBottom: '1px solid var(--border)',
          }}>
            <span style={{ fontWeight: 600, fontSize: '.9rem' }}>
              Notifications {unread > 0 && <span style={{ color: 'var(--primary)' }}>({unread})</span>}
            </span>
            {unread > 0 && (
              <button onClick={markAllRead}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '.75rem', color: 'var(--text2)' }}>
                Tout marquer lu
              </button>
            )}
          </div>

          {/* Liste */}
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text2)', fontSize: '.85rem' }}>
                Aucune notification
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => !n.is_read && markRead(n.id)}
                  style={{
                    padding: '.85rem 1rem',
                    borderBottom: '1px solid var(--border)',
                    background: n.is_read ? 'transparent' : 'rgba(232,93,4,.07)',
                    cursor: n.is_read ? 'default' : 'pointer',
                    display: 'flex', gap: '.75rem', alignItems: 'flex-start',
                  }}
                >
                  <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>
                    {n.type === 'part_critical' ? '🔴' : '🟡'}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '.85rem', fontWeight: n.is_read ? 400 : 600, marginBottom: '.2rem' }}>
                      {n.title}
                    </div>
                    <div style={{ fontSize: '.78rem', color: 'var(--text2)', lineHeight: 1.4 }}>
                      {n.message}
                    </div>
                    <div style={{ fontSize: '.7rem', color: 'var(--text2)', marginTop: '.3rem' }}>
                      {new Date(n.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <button onClick={(e) => deleteNotif(e, n.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: '.9rem', flexShrink: 0 }}
                    title="Supprimer">
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
