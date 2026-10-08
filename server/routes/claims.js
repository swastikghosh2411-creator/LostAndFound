// routes/claims.js - PATCH /api/claims/:id
// The finder (item owner) approves or rejects a pending claim.

const express = require('express');
const Claim = require('../models/Claim');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const status = req.body && req.body.status;
    if (status !== 'approved' && status !== 'rejected') {
      return res.status(400).json({ message: 'Status must be approved or rejected.' });
    }

    const claim = await Claim.findById(req.params.id)
      .populate('item')
      .populate('claimant', 'name email');
    if (!claim || !claim.item) return res.status(404).json({ message: 'Claim not found.' });

    if (!claim.item.owner.equals(req.user._id)) {
      return res.status(403).json({ message: 'Only the finder can review this claim.' });
    }
    if (claim.status !== 'pending') {
      return res.status(400).json({ message: 'This claim was already reviewed.' });
    }

    claim.status = status;
    await claim.save();

    if (status === 'approved') {
      claim.item.status = 'matched';
      await claim.item.save();
    }

    res.json({ claim: claim.toPublic(status === 'approved') });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
