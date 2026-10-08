// routes/items.js - everything under /api/items
//
//   POST   /api/items              create a lost or found item (with photos)
//   GET    /api/items/mine         the logged-in user's items
//   GET    /api/items/found        public list of active found items
//   GET    /api/items/:id          item details
//   PATCH  /api/items/:id          change status (owner only)
//   DELETE /api/items/:id          delete (owner only)
//   POST   /api/items/:id/claim    claim a found item

const fs = require('fs');
const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const Item = require('../models/Item');
const Claim = require('../models/Claim');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { uploadImages, removeFiles, UPLOADS_DIR } = require('../middleware/upload');

const router = express.Router();

// These two come in the next stage. If they are missing the app still works.
function optionalRequire(name) {
  try {
    return require(name);
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND' && err.message.includes(name)) return null;
    throw err;
  }
}
const matching = optionalRequire('../matching');
const Match = optionalRequire('../models/Match');

const MAX_ATTEMPTS = 3;
const attempts = new Map(); // wrong answers per person per item (resets if the server restarts)

const normalize = (text) => text.trim().toLowerCase().replace(/\s+/g, ' ');
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isDate = (text) => /^\d{4}-\d{2}-\d{2}$/.test(text) && !isNaN(new Date(text));

// ---------- POST /api/items ----------
router.post('/', requireAuth, uploadImages, async (req, res, next) => {
  const files = req.files || [];
  const fail = (message) => {
    removeFiles(files); // do not keep photos of a post that was rejected
    return res.status(400).json({ message });
  };

  try {
    const body = req.body || {};
    const get = (key) => (typeof body[key] === 'string' ? body[key].trim() : '');

    const type = get('type');
    if (type !== 'lost' && type !== 'found') return fail('Choose whether the item is lost or found.');
    if (get('title').length < 3) return fail('Enter a short name for the item.');
    if (!Item.CATEGORIES.includes(get('category'))) return fail('Choose a category.');
    if (!get('locationText')) return fail('Enter a place.');
    if (!isDate(get('date'))) return fail('Choose a valid date.');

    const date = new Date(get('date'));
    if (date.getTime() > Date.now() + 24 * 60 * 60 * 1000) return fail('The date cannot be in the future.');

    const data = {
      owner: req.user._id,
      type,
      title: get('title'),
      category: get('category'),
      color: get('color'),
      brand: get('brand'),
      description: get('description'),
      locationText: get('locationText'),
      date,
      images: files.map((f) => '/uploads/' + f.filename)
    };

    const lat = Number(get('latitude'));
    const lng = Number(get('longitude'));
    if (get('latitude') && get('longitude') && Number.isFinite(lat) && Number.isFinite(lng)) {
      data.latitude = lat;
      data.longitude = lng;
    }

    if (type === 'found') {
      data.keptAt = get('keptAt');
      if (get('verificationQuestion')) {
        if (!get('verificationAnswer')) return fail('Enter the correct answer to your question.');
        data.verificationQuestion = get('verificationQuestion');
        data.verificationAnswer = await bcrypt.hash(normalize(get('verificationAnswer')), 10);
      }
    }

    const item = await Item.create(data);

    // Look for matches (the matching stage adds this). A failure here must not break the post.
    if (matching && typeof matching.findMatchesFor === 'function') {
      try {
        await matching.findMatchesFor(item);
      } catch (err) {
        console.error('Matching failed:', err.message);
      }
    }

    res.status(201).json({ item });
  } catch (err) {
    removeFiles(files);
    next(err);
  }
});

// ---------- GET /api/items/mine ----------
router.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const items = await Item.find({ owner: req.user._id }).sort({ createdAt: -1 });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

// ---------- GET /api/items/found (public) ----------
router.get('/found', async (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 60) : '';
    const category = typeof req.query.category === 'string' ? req.query.category : '';
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 12, 1), 24);

    const filter = { type: 'found', status: 'active' };
    if (Item.CATEGORIES.includes(category)) filter.category = category;
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ title: rx }, { description: rx }, { brand: rx }, { color: rx }, { category: rx }];
    }

    const [items, total] = await Promise.all([
      Item.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      Item.countDocuments(filter)
    ]);

    res.json({ items, total, page, pages: Math.max(Math.ceil(total / limit), 1) });
  } catch (err) {
    next(err);
  }
});

// ---------- GET /api/items/:id ----------
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const item = await Item.findById(req.params.id).populate('owner', 'name email');
    if (!item) return res.status(404).json({ message: 'Item not found.' });

    const user = req.user;
    if (item.type === 'lost' && !user) return res.status(401).json({ message: 'Log in to view this item.' });

    const isOwner = !!user && item.owner._id.equals(user._id);
    const obj = item.toJSON();
    obj.poster = { name: item.owner.name };
    obj.contact = null; // only filled for a claimant whose claim was approved

    let myClaim = null;
    let claims = [];

    if (item.type === 'found') {
      if (isOwner) {
        const list = await Claim.find({ item: item._id }).populate('claimant', 'name email').sort({ createdAt: -1 });
        claims = list.map((c) => c.toPublic(c.status === 'approved'));
      } else if (user) {
        const mine = await Claim.findOne({ item: item._id, claimant: user._id }).populate('claimant', 'name');
        if (mine) {
          myClaim = mine.toPublic(false);
          if (mine.status === 'approved') obj.contact = { name: item.owner.name, email: item.owner.email };
        }
      }
    }

    // ?match=<id>: show how this item relates to one of the viewer's own items
    let match = null;
    if (user && Match && typeof req.query.match === 'string') {
      const m = await Match.findById(req.query.match).populate('lostItem').populate('foundItem');
      if (m && m.lostItem && m.foundItem) {
        const involvesThis = [m.lostItem._id, m.foundItem._id].some((id) => id.equals(item._id));
        const mineItem = [m.lostItem, m.foundItem].find((i) => i.owner.equals(user._id));
        if (involvesThis && mineItem) {
          match = { _id: m._id, score: m.score, reasons: m.reasons, myItem: mineItem.toJSON() };
        }
      }
    }

    res.json({ item: obj, isOwner, myClaim, claims, match });
  } catch (err) {
    next(err);
  }
});

// ---------- PATCH /api/items/:id ----------
router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const status = req.body && req.body.status;
    if (!['active', 'returned', 'closed'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status.' });
    }

    const item = await Item.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Item not found.' });
    if (!item.owner.equals(req.user._id)) return res.status(403).json({ message: 'This is not your item.' });

    item.status = status;
    await item.save();
    res.json({ item });
  } catch (err) {
    next(err);
  }
});

// ---------- DELETE /api/items/:id ----------
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Item not found.' });
    if (!item.owner.equals(req.user._id)) return res.status(403).json({ message: 'This is not your item.' });

    // delete the photo files (basename keeps us inside the uploads folder)
    item.images.forEach((url) => fs.unlink(path.join(UPLOADS_DIR, path.basename(url)), () => {}));

    await Claim.deleteMany({ item: item._id });
    if (Match) await Match.deleteMany({ $or: [{ lostItem: item._id }, { foundItem: item._id }] });
    await item.deleteOne();

    res.json({ message: 'Item deleted.' });
  } catch (err) {
    next(err);
  }
});

// ---------- POST /api/items/:id/claim ----------
router.post('/:id/claim', requireAuth, async (req, res, next) => {
  try {
    const item = await Item.findById(req.params.id).select('+verificationAnswer').populate('owner', 'name email');
    if (!item || item.type !== 'found') return res.status(404).json({ message: 'Found item not available.' });
    if (item.status !== 'active') return res.status(400).json({ message: 'This item is no longer available.' });
    if (item.owner._id.equals(req.user._id)) return res.status(403).json({ message: 'You cannot claim your own item.' });

    if (await Claim.findOne({ item: item._id, claimant: req.user._id })) {
      return res.status(409).json({ message: 'You have already claimed this item.' });
    }

    const body = req.body || {};
    const message = typeof body.message === 'string' ? body.message.trim().slice(0, 400) : '';
    const answer = typeof body.answer === 'string' ? body.answer : '';
    const contact = { name: item.owner.name, email: item.owner.email };

    // Case 1: the finder set a question. A correct answer approves the claim at once.
    if (item.verificationQuestion) {
      if (!answer.trim()) return res.status(400).json({ message: 'Enter an answer to the question.' });

      const key = item.id + ':' + req.user.id;
      const correct = await bcrypt.compare(normalize(answer), item.verificationAnswer);

      if (!correct) {
        const used = (attempts.get(key) || 0) + 1;
        attempts.set(key, used);
        if (used >= MAX_ATTEMPTS) {
          attempts.delete(key);
          await Claim.create({ item: item._id, claimant: req.user._id, message, status: 'rejected' });
          return res.status(400).json({ message: 'Incorrect answer. No attempts left.' });
        }
        return res.status(400).json({ message: 'Incorrect answer. ' + (MAX_ATTEMPTS - used) + ' attempt(s) left.' });
      }

      attempts.delete(key);
      const claim = await Claim.create({ item: item._id, claimant: req.user._id, message, status: 'approved' });
      item.status = 'matched';
      await item.save();

      claim.claimant = req.user; // so toPublic can read the name
      return res.status(201).json({ claim: claim.toPublic(false), contact });
    }

    // Case 2: no question. The finder reviews the claim.
    if (message.length < 10) {
      return res.status(400).json({ message: 'Describe how you can prove it is yours (at least 10 characters).' });
    }
    const claim = await Claim.create({ item: item._id, claimant: req.user._id, message });
    claim.claimant = req.user;
    res.status(201).json({ claim: claim.toPublic(false) });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'You have already claimed this item.' });
    next(err);
  }
});

module.exports = router;
