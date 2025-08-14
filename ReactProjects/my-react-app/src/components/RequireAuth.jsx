import { useEffect, useState } from 'react';

export default function RequireAuth({ children }) {
  const [status, setStatus] = useState('checking'); // checking | authed | unauth

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch('http://localhost:3000/auth/refresh', {
          method: 'POST',
          credentials: 'include',
        });
        if (!cancelled) {
          if (res.ok) setStatus('authed');
          else setStatus('unauth');
        }
      } catch {
        if (!cancelled) setStatus('unauth');
      }
    }
    check();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (status === 'unauth') {
      window.location.replace('/login');
    }
  }, [status]);

  if (status !== 'authed') {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#222', color: '#fff'
      }}>
        <div>Loading...</div>
      </div>
    );
  }

  return children;
}


