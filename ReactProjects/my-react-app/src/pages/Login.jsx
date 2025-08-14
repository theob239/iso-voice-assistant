import { useState } from 'react';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Please enter username and password');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('http://localhost:3000/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Login failed');
      window.location.href = '/';
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: '#222', color: '#fff'
    }}>
      <form onSubmit={handleSubmit} style={{
        width: 400, background: '#2b2b2b', padding: 28, borderRadius: 12,
        boxShadow: '0 12px 32px rgba(0,0,0,0.5)', border: '1px solid #3a3a3a'
      }}>
        <h2 style={{ margin: 0, marginBottom: 18, textAlign: 'center', fontSize: '1.6rem' }}>Login</h2>
        <div style={{ width: '100%', maxWidth: 300, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
          {error && (
            <div style={{ background: '#dc3545', padding: 10, borderRadius: 6, marginBottom: 14, textAlign: 'center' }}>
              {error}
            </div>
          )}
          <label style={{ display: 'block', marginBottom: 6, color: '#cfcfcf', textAlign: 'center' }}>Username</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid #555', background: '#3b3b3b', color: '#fff', marginBottom: 14, display: 'block', boxSizing: 'border-box' }}
            autoFocus
          />
          <label style={{ display: 'block', marginBottom: 6, color: '#cfcfcf', textAlign: 'center' }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid #555', background: '#3b3b3b', color: '#fff', marginBottom: 18, display: 'block', boxSizing: 'border-box' }}
          />
          <button type="submit" disabled={loading} style={{
            width: '80%', padding: 12, border: 'none', borderRadius: 8,
            background: '#28a745', color: '#fff', cursor: 'pointer', opacity: loading ? 0.6 : 1,
            fontSize: '1rem', alignSelf: 'center'
          }}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </div>
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <a href="/register" style={{ color: '#9ad', textDecoration: 'none' }}>Create account</a>
        </div>
      </form>
    </div>
  );
}
