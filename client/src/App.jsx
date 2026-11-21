import { useState, useEffect } from 'react';
import './App.css';

const API_URL = 'http://localhost:5000/api/monitors';

function App() {
  const [monitors, setMonitors] = useState([]);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Fetch all monitors from Express API
  const fetchMonitors = async () => {
    try {
      const response = await fetch(API_URL);
      if (!response.ok) throw new Error('Failed to fetch monitors');
      const data = await response.json();
      setMonitors(data);
      setError('');
    } catch (err) {
      setError('Cannot connect to backend server. Make sure Express is running on port 5000.');
    } finally {
      setLoading(false);
    }
  };

  // Initial load + auto-refresh every 15 seconds
  useEffect(() => {
    fetchMonitors();

    const intervalId = setInterval(() => {
      fetchMonitors();
    }, 15000);

    return () => clearInterval(intervalId);
  }, []);

  // Handle adding a new site
  const handleAddMonitor = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;

    // Auto-add https:// if the user forgot it
    const formattedUrl = /^https?:\/\//i.test(url.trim())
      ? url.trim()
      : `https://${url.trim()}`;

    setSubmitting(true);
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || formattedUrl,
          url: formattedUrl,
        }),
      });

      if (!response.ok) throw new Error('Failed to add monitor');

      setName('');
      setUrl('');
      await fetchMonitors();
    } catch (err) {
      setError('Error adding monitor. Check your server logs.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle deleting a site
  const handleDeleteMonitor = async (id) => {
    try {
      const response = await fetch(`${API_URL}/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete monitor');

      setMonitors((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      setError('Error deleting monitor.');
    }
  };

  return (
    <div className="container">
      <header className="header">
        <div>
          <h1>Uptime Monitor</h1>
          <p className="subtitle">Live status dashboard • Auto-refreshes every 15s</p>
        </div>
        <button onClick={fetchMonitors} className="refresh-btn">
          Refresh Now
        </button>
      </header>

      {/* Add Monitor Form */}
      <form onSubmit={handleAddMonitor} className="add-form">
        <input
          type="text"
          placeholder="Site Name (e.g. Google)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="text"
          placeholder="URL (e.g. https://google.com)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
        <button type="submit" disabled={submitting}>
          {submitting ? 'Adding...' : '+ Add Monitor'}
        </button>
      </form>

      {error && <div className="error-banner">{error}</div>}

      {/* Monitors Grid */}
      {loading ? (
        <p className="empty-state">Loading monitors...</p>
      ) : monitors.length === 0 ? (
        <p className="empty-state">No monitors yet. Add a website above to start tracking!</p>
      ) : (
        <div className="grid">
          {monitors.map((monitor) => {
            const hasBeenPinged = monitor.is_up !== null;
            const statusClass = !hasBeenPinged
              ? 'badge-pending'
              : monitor.is_up
              ? 'badge-up'
              : 'badge-down';

            const statusText = !hasBeenPinged
              ? 'PENDING'
              : monitor.is_up
              ? 'UP'
              : 'DOWN';

            return (
              <div key={monitor.id} className="card">
                <div className="card-top">
                  <span className={`badge ${statusClass}`}>{statusText}</span>
                  <button
                    onClick={() => handleDeleteMonitor(monitor.id)}
                    className="delete-btn"
                    title="Delete monitor"
                  >
                    ✕
                  </button>
                </div>

                <h3 className="site-name">{monitor.name}</h3>
                <a
                  href={monitor.url}
                  target="_blank"
                  rel="noreferrer"
                  className="site-url"
                >
                  {monitor.url}
                </a>

                <div className="card-footer">
                  <span>
                    Latency:{' '}
                    <strong>
                      {monitor.response_time_ms !== null
                        ? `${monitor.response_time_ms} ms`
                        : '—'}
                    </strong>
                  </span>
                  <span>
                    Code: <strong>{monitor.status_code ?? '—'}</strong>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default App;
