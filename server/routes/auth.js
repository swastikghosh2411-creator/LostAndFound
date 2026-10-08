// routes/auth.js - /api/auth/signup, /login, /logout, /me

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const WEEK = 7 * 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Slows down password guessing: 20 tries per 15 minutes per IP.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts. Please try again in a few minutes.' }
});

// Puts the login token in an httpOnly cookie (JavaScript in the page cannot read it).
function setLoginCookie(res, userId) {
  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: WEEK
  });
}

// Only send the browser what it needs. Never the password.
function publicUser(user) {
  return { _id: user._id, name: user.name, email: user.email };
}

// ---------- POST /api/auth/signup ----------
router.post('/signup', limiter, async (req, res, next) => {
  try {
    const body = req.body || {};
    // typeof checks stop tricks like sending an object instead of a string
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (name.length < 2) return res.status(400).json({ message: 'Enter your full name.' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ message: 'Enter a valid email address.' });
    if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    if (password.length > 72) return res.status(400).json({ message: 'Password must be 72 characters or fewer.' });

    if (await User.findOne({ email })) {
      return res.status(409).json({ message: 'That email is already registered. Try logging in.' });
    }

    const hashed = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, password: hashed });

    setLoginCookie(res, user._id);
    res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    if (err.code === 11000) {
      // two signups with the same email at the same moment
      return res.status(409).json({ message: 'That email is already registered. Try logging in.' });
    }
    next(err);
  }
});

// ---------- POST /api/auth/login ----------
router.post('/login', limiter, async (req, res, next) => {
  try {
    const body = req.body || {};
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    // Same message whether the email or the password is wrong,
    // so nobody can use this form to find out which emails exist.
    const invalid = { message: 'Invalid email or password.' };

    const user = await User.findOne({ email }).select('+password');
    if (!user) return res.status(401).json(invalid);

    const matches = await bcrypt.compare(password, user.password);
    if (!matches) return res.status(401).json(invalid);

    setLoginCookie(res, user._id);
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// ---------- POST /api/auth/logout ----------
router.post('/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  });
  res.json({ message: 'Logged out.' });
});

// ---------- GET /api/auth/me ----------
// Used by every page to find out who is logged in.
router.get('/me', requireAuth, (req, res) => {
  res.json(publicUser(req.user));
});

module.exports = router;
