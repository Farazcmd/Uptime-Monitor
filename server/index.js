const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { pool, initDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// ==========================================
// 1. REST API ENDPOINTS
// ==========================================

// GET /api/monitors — returns all monitors joined with their latest ping status
app.get('/api/monitors', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        m.id,
        m.name,
        m.url,
        m.created_at,
        lp.status_code,
        lp.response_time_ms,
        lp.is_up,
        lp.checked_at
      FROM monitors m
      LEFT JOIN LATERAL (
        SELECT status_code, response_time_ms, is_up, checked_at
        FROM ping_logs
        WHERE monitor_id = m.id
        ORDER BY checked_at DESC
        LIMIT 1
      ) lp ON true
      ORDER BY m.created_at DESC;
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching monitors:', err.message);
    res.status(500).json({ error: 'Server error fetching monitors' });
  }
});

// POST /api/monitors — inserts a new URL to watch
app.post('/api/monitors', async (req, res) => {
  const { name, url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO monitors (name, url) VALUES ($1, $2) RETURNING *',
      [name || url, url]
    );
    const newMonitor = result.rows[0];

    // Optional: ping immediately upon adding so it doesn't show "Pending" for 60s
    pingSingleMonitor(newMonitor);

    res.status(201).json(newMonitor);
  } catch (err) {
    console.error('Error creating monitor:', err.message);
    res.status(500).json({ error: 'Server error creating monitor' });
  }
});

// DELETE /api/monitors/:id — deletes a monitor
app.delete('/api/monitors/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM monitors WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Monitor not found' });
    }

    res.json({ message: 'Monitor deleted', monitor: result.rows[0] });
  } catch (err) {
    console.error('Error deleting monitor:', err.message);
    res.status(500).json({ error: 'Server error deleting monitor' });
  }
});

// ==========================================
// 2. BACKGROUND PINGER (Runs every 60s)
// ==========================================

const pingSingleMonitor = async (monitor) => {
  const startTime = Date.now();
  let statusCode = null;
  let isUp = false;

  try {
    // AbortSignal.timeout(10000) prevents hung websites from stalling the worker
    const response = await fetch(monitor.url, {
      signal: AbortSignal.timeout(10000),
    });
    statusCode = response.status;
    isUp = response.ok; // true for HTTP 200-299
  } catch (err) {
    // Network error, DNS failure, or timeout
    statusCode = 0;
    isUp = false;
  }

  const responseTimeMs = Date.now() - startTime;

  try {
    await pool.query(
      `INSERT INTO ping_logs (monitor_id, status_code, response_time_ms, is_up)
       VALUES ($1, $2, $3, $4)`,
      [monitor.id, statusCode, responseTimeMs, isUp]
    );
    console.log(
      `[PING] ${monitor.name} (${monitor.url}) -> ${isUp ? 'UP' : 'DOWN'} (${statusCode}) in ${responseTimeMs}ms`
    );
  } catch (dbErr) {
    console.error(`Error saving ping log for monitor ${monitor.id}:`, dbErr.message);
  }
};

const runAllPings = async () => {
  try {
    const { rows: monitors } = await pool.query('SELECT * FROM monitors');
    await Promise.all(monitors.map((monitor) => pingSingleMonitor(monitor)));
  } catch (err) {
    console.error('Error running background pinger:', err.message);
  }
};

// ==========================================
// 3. START SERVER & INTERVAL
// ==========================================

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    
    // Run an initial check immediately on startup, then every 60 seconds
    runAllPings();
    setInterval(runAllPings, 60000);
  });
});
