// Match.js - the system thinks a lost item and a found item are the same thing.
// These are created by matching.js (the next stage) and listed on the dashboard.

const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema(
  {
    lostItem: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true, index: true },
    foundItem: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true, index: true },
    score: { type: Number, required: true, min: 0, max: 100 },
    reasons: { type: [String], default: [] },
    status: { type: String, enum: ['pending', 'dismissed'], default: 'pending' }
  },
  { timestamps: true }
);

// The same pair is never stored twice
matchSchema.index({ lostItem: 1, foundItem: 1 }, { unique: true });

module.exports = mongoose.model('Match', matchSchema);
