// server.js - starts the app.
// It loads settings, connects to MongoDB, serves the public/ folder,
// mounts the API routes and handles errors.

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');

// ---------- 1. Check settings ----------
const PORT = process.env.PORT || 3000;
const { MONGO_URI, JWT_SECRET } = process.env;

if (!MONGO_URI || !JWT_SECRET) {
  console.error('Missing MONGO_URI or JWT_SECRET. Create a .env file in the project root (see README).');
  process.exit(1);
}

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const UPLOADS_DIR = path.join(ROOT, 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true }); // photos are saved here

const app = express();

// ---------- 2. Middleware ----------
// helmet adds security headers. The policy below allows what our pages use:
// Google Fonts, our own scripts, inline script on index.html, and photo previews.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", 'https://fonts.googleapis.com'],
        fontSrc: ['https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://res.cloudinary.com'],
        connectSrc: ["'self'"],
        upgradeInsecureRequests: null // we run on http://localhost
      }
    }
  })
);

app.use(express.json({ limit: '1mb' })); // reads JSON bodies (login, signup, claims)
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser()); // reads the login cookie

// ---------- 3. Static files ----------
app.use('/uploads', express.static(UPLOADS_DIR)); // uploaded photos
app.use(express.static(PUBLIC_DIR)); // index.html, css, js ...

// ---------- 4. API routes ----------
app.get('/api/health', (req, res) => {
  res.json({ ok: true, database: mongoose.connection.readyState === 1 ? 'connected' : 'not connected' });
});

// Each route file is mounted only if it exists, so you can add them one stage at a time.
const routes = [
  ['/api/auth', 'auth'],
  ['/api/items', 'items'],
  ['/api/matches', 'matches'],
  ['/api/claims', 'claims']
];

routes.forEach(([mountPath, file]) => {
  const filePath = path.join(__dirname, 'routes', file + '.js');
  if (fs.existsSync(filePath)) {
    app.use(mountPath, require(filePath));
    console.log('Route loaded: ' + mountPath);
  }
});

// Unknown API address -> JSON, not an HTML page
app.use('/api', (req, res) => {
  res.status(404).json({ message: 'Not found' });
});

// ---------- 5. Page not found ----------
app.use((req, res) => {
  res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'));
});

// ---------- 6. Error handler ----------
// Every error in the app ends up here and becomes { message } JSON,
// which is the format api.js expects.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  // Upload problems (Multer)
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: 'Each photo must be 5 MB or smaller.' });
  if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ message: 'You can upload up to 3 photos.' });
  }

  // Bad JSON body
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid request.' });

  // Mongoose validation or bad id
  if (err.name === 'ValidationError') {
    const first = Object.values(err.errors)[0];
    return res.status(400).json({ message: first ? first.message : 'Invalid data.' });
  }
  if (err.name === 'CastError') return res.status(400).json({ message: 'Invalid id.' });

  const status = err.status || 500;
  if (status >= 500) console.error(err); // details stay in the terminal only
  res.status(status).json({ message: status >= 500 ? 'Something went wrong on the server.' : err.message });
});

// ---------- 7. Connect to MongoDB, then start listening ----------
mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    app.listen(PORT, () => console.log('Server running at http://localhost:' + PORT));
  })
  .catch((err) => {
    console.error('Could not connect to MongoDB:', err.message);
    console.error('Is MongoDB running? Check MONGO_URI in .env.');
    process.exit(1);
  });
