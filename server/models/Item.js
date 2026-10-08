// Item.js - one lost or found item.

const mongoose = require('mongoose');

// Must match the category list in report.html and browse.html
const CATEGORIES = [
  'Wallet or purse', 'Phone', 'Keys', 'Bag or backpack', 'ID or cards', 'Laptop or tablet',
  'Earphones or headphones', 'Water bottle', 'Clothing', 'Books or stationery',
  'Jewellery or watch', 'Other'
];

const itemSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['lost', 'found'], required: true },
    title: { type: String, required: [true, 'Item name is required.'], trim: true, minlength: 3, maxlength: 80 },
    category: { type: String, enum: CATEGORIES, required: [true, 'Category is required.'] },
    color: { type: String, trim: true, maxlength: 30, default: '' },
    brand: { type: String, trim: true, maxlength: 40, default: '' },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    locationText: { type: String, required: [true, 'Place is required.'], trim: true, maxlength: 120 },
    date: { type: Date, required: [true, 'Date is required.'] },
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 },
    images: { type: [String], default: [] },
    status: { type: String, enum: ['active', 'matched', 'returned', 'closed'], default: 'active' },

    // Found items only
    keptAt: { type: String, trim: true, maxlength: 120, default: '' },
    verificationQuestion: { type: String, trim: true, maxlength: 150, default: '' },
    // bcrypt hash of the answer. select:false = never loaded unless asked for.
    verificationAnswer: { type: String, select: false }
  },
  {
    timestamps: true,
    toJSON: {
      // Whatever goes to the browser as JSON: no answer hash, no owner id, no __v
      transform(doc, ret) {
        delete ret.verificationAnswer;
        delete ret.owner;
        delete ret.__v;
        return ret;
      }
    }
  }
);

itemSchema.index({ type: 1, status: 1, createdAt: -1 });

const Item = mongoose.model('Item', itemSchema);
Item.CATEGORIES = CATEGORIES;
module.exports = Item;
