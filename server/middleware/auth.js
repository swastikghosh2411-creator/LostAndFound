// auth.js (middleware) - checks the login cookie before a route runs.
//
// requireAuth: the route needs a logged-in user. Otherwise it answers 401,
//              and api.js sends the browser to login.html.
// optionalAuth: the route is public, but if the visitor is logged in we
//               want to know who they are (used on item details later).

const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Reads the token from the cookie and returns the user, or null.
async function getUserFromRequest(req) {
  const token = req.cookies && req.cookies.token;
  if (!token) return null;

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return await User.findById(payload.id); // null if the user was deleted
  } catch (err) {
    return null; // expired or tampered token
  }
}

async function requireAuth(req, res, next) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ message: 'Please log in.' });
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

async function optionalAuth(req, res, next) {
  try {
    req.user = await getUserFromRequest(req); // may be null
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireAuth, optionalAuth };
