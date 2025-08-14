import { useState } from 'react';

export default function Register() {
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !name || !password) {
      setError('Please fill all fields');
      return;
    }
    setLoading(true);
    setError('');
    try {
      // Placeholder until backend /auth/register with Supabase is added
      // For now, show message and redirect to login
      alert('Registration endpoint not implemented yet. Ask mentor to enable Supabase backend.');
      window.location.href = '/login';
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
        width: 360, background: '#2d2d2d', padding: 24, borderRadius: 8,
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)'
      }}>
        <h2 style={{ margin: 0, marginBottom: 16, textAlign: 'center' }}>Register</h2>
        {error && (
          <div style={{ background: '#dc3545', padding: 8, borderRadius: 4, marginBottom: 12 }}>
            {error}
          </div>
        )}
        <label style={{ display: 'block', marginBottom: 6 }}>Username</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={{ width: '100%', padding: 10, borderRadius: 4, border: '1px solid #555', background: '#444', color: '#fff', marginBottom: 12 }}
          autoFocus
        />
        <label style={{ display: 'block', marginBottom: 6 }}>Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ width: '100%', padding: 10, borderRadius: 4, border: '1px solid #555', background: '#444', color: '#fff', marginBottom: 12 }}
        />
        <label style={{ display: 'block', marginBottom: 6 }}>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: '100%', padding: 10, borderRadius: 4, border: '1px solid #555', background: '#444', color: '#fff', marginBottom: 16 }}
        />
        <button type="submit" disabled={loading} style={{
          width: '100%', padding: 10, border: 'none', borderRadius: 4,
          background: '#28a745', color: '#fff', cursor: 'pointer', opacity: loading ? 0.6 : 1
        }}>
          {loading ? 'Creating...' : 'Register'}
        </button>
        <div style={{ marginTop: 12, textAlign: 'center' }}>
          <a href="/login" style={{ color: '#9ad', textDecoration: 'none' }}>Back to login</a>
        </div>
      </form>
    </div>
  );
}


