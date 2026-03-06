'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve the static web client from the dedicated public directory
const PUBLIC_DIR = path.join(__dirname, 'public');

// Guard: fail fast with a helpful message if the build step was skipped
if (!fs.existsSync(path.join(PUBLIC_DIR, 'index.html'))) {
    console.error(
        'ERROR: public/index.html not found. ' +
        'Run "npm run build" to generate static assets before starting the server.'
    );
    process.exit(1);
}

// Read index.html once at startup so the SPA fallback avoids per-request FS access
const indexHtml = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'));

// Serve the static web client
app.use(express.static(PUBLIC_DIR));

// Parse JSON bodies for the proxy API
app.use(express.json());

// Proxy route to handle Zoho CRM API requests
app.post('/api/zoho', async (req, res) => {
    const { endpoint, headers, data } = req.body;

    if (!endpoint) {
        return res.status(400).json({ message: 'Endpoint is required.' });
    }

    try {
        const response = await axios.post(endpoint, data, { headers });
        return res.json(response.data);
    } catch (error) {
        const status = error.response?.status || 500;
        return res.status(status).json({ message: error.message });
    }
});

// Fallback: return the cached index.html for any unmatched route (SPA support)
app.get('*', (req, res) => {
    res.type('html').send(indexHtml);
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

