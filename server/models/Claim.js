// Claim.js - someone says "this found item is mine".

const mongoose = require('mongoose');

const claimSchema = new mongoose.Schema(
  {
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true, index: true },
    claimant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, trim: true, maxlength: 400, default: '' },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' }
  },
  { timestamps: true }
);

// One claim per person per item
claimSchema.index({ item: 1, claimant: 1 }, { unique: true });

// The shape the browser expects. The claimant must be populated (name, email).
// The email is only included when showEmail is true.
claimSchema.methods.toPublic = function (showEmail) {
  const person = this.claimant && this.claimant.name ? this.claimant : null;
  const out = {
    _id: this._id,
    status: this.status,
    message: this.message,
    createdAt: this.createdAt,
    claimant: { name: person ? person.name : 'Someone' }
  };
  if (showEmail && person && person.email) out.claimant.email = person.email;
  return out;
};

module.exports = mongoose.model('Claim', claimSchema);
