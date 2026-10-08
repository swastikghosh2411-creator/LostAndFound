// routes/matches.js - GET /api/matches
// Lists the matches that involve the logged-in user's items.

const express = require('express');
const Item = require('../models/Item');
const Match = require('../models/Match');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const myIds = await Item.find({ owner: req.user._id }).distinct('_id');

    const matches = await Match.find({
      status: { $ne: 'dismissed' },
      $or: [{ lostItem: { $in: myIds } }, { foundItem: { $in: myIds } }]
    })
      .populate('lostItem')
      .populate('foundItem')
      .sort({ score: -1 });

    const result = [];
    matches.forEach((m) => {
      if (!m.lostItem || !m.foundItem) return; // one of the items was deleted

      const lostIsMine = m.lostItem.owner.equals(req.user._id);
      const foundIsMine = m.foundItem.owner.equals(req.user._id);
      if (lostIsMine === foundIsMine) return; // both mine (or neither): not useful

      result.push({
        _id: m._id,
        score: m.score,
        reasons: m.reasons,
        status: m.status,
        myItem: (lostIsMine ? m.lostItem : m.foundItem).toJSON(),
        otherItem: (lostIsMine ? m.foundItem : m.lostItem).toJSON()
      });
    });

    res.json({ matches: result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
