// matching.js - compares a new item with active items of the opposite type
// and saves a Match when the score is high enough.
//
// Two scoring modes:
//   - without photos: category, color, brand, text, place, date
//   - with photos:    the same, plus an image score from the CLIP service

const Item = require('./models/Item');
const Match = require('./models/Match');

const MIN_SCORE = 50;     // matches below this are not saved
const DATE_WINDOW = 30;   // days between lost date and found date

// Points for each part. Each row adds up to 100.
const WEIGHTS_NO_IMAGE = { category: 25, color: 10, brand: 10, text: 25, place: 15, date: 15, image: 0 };
const WEIGHTS_WITH_IMAGE = { category: 15, color: 7, brand: 5, text: 18, place: 12, date: 13, image: 30 };

const STOP_WORDS = new Set([
  'the', 'and', 'with', 'near', 'for', 'was', 'has', 'have', 'its', 'this',
  'that', 'from', 'lost', 'found', 'item', 'one', 'small', 'big'
]);

// "Black Wallet, near canteen" -> Set { 'black', 'wallet', 'canteen' }
function words(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
  );
}

// 0 to 1: how many words they share, compared to the shorter text
function overlap(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  a.forEach((w) => { if (b.has(w)) shared++; });
  return shared / Math.min(a.size, b.size);
}

const same = (a, b) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

// ---------- IMAGE SCORE (calls the Python CLIP service) ----------
// Returns a number from 0 to 100, or null when there is no image score.
const AI_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

async function getImageScore(itemA, itemB) {
  if (!itemA.images.length || !itemB.images.length) return null;

  // images are stored like "/uploads/abc.jpg", the service wants only "abc.jpg"
  const nameA = itemA.images[0].split('/').pop();
  const nameB = itemB.images[0].split('/').pop();

  try {
    const res = await fetch(AI_URL + '/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_a: nameA, image_b: nameB }),
      signal: AbortSignal.timeout(15000) // give up after 15 seconds
    });
    if (!res.ok) return null;

    const json = await res.json();
    return typeof json.score === 'number' ? json.score : null;
  } catch (err) {
    // service not running or too slow: score without images
    console.error('AI service not available:', err.message);
    return null;
  }
}

// Returns { score, reasons } for one lost item and one found item.
// imageScore is 0 to 100, or null if there is none.
function scorePair(lost, found, imageScore) {
  const hasImage = typeof imageScore === 'number';
  const w = hasImage ? WEIGHTS_WITH_IMAGE : WEIGHTS_NO_IMAGE;

  let score = 0;
  const reasons = [];

  // Category (we only compare items of the same category)
  score += w.category;
  reasons.push('Same category: ' + lost.category);

  // Color
  if (same(lost.color, found.color)) {
    score += w.color;
    reasons.push('Same color: ' + found.color);
  }

  // Brand
  if (same(lost.brand, found.brand)) {
    score += w.brand;
    reasons.push('Same brand: ' + found.brand);
  }

  // Title and description
  const textScore = overlap(
    words(lost.title + ' ' + lost.description),
    words(found.title + ' ' + found.description)
  );
  score += w.text * textScore;
  if (textScore >= 0.3) reasons.push('Similar title and description');

  // Place
  const placeScore = overlap(words(lost.locationText), words(found.locationText));
  score += w.place * placeScore;
  if (placeScore >= 0.3) reasons.push('Similar place: ' + found.locationText);

  // Date: found date must be on or after the lost date (1 day grace)
  const days = (new Date(found.date) - new Date(lost.date)) / (24 * 60 * 60 * 1000);
  if (days >= -1 && days <= DATE_WINDOW) {
    const gap = Math.max(days, 0);
    score += w.date * (1 - gap / DATE_WINDOW);
    const rounded = Math.round(gap);
    reasons.push(
      rounded === 0 ? 'Found on the same day it was lost'
        : 'Found ' + rounded + ' day(s) after it was lost'
    );
  }

  // Image
  if (hasImage) {
    score += w.image * (imageScore / 100);
    if (imageScore >= 70) reasons.push('Photos look very similar');
    else if (imageScore >= 50) reasons.push('Photos look somewhat similar');
  }

  return { score: Math.min(Math.round(score), 100), reasons };
}

// Called from routes/items.js after a new item is saved.
// Returns the list of NEW matches (we will use this for notifications later).
async function findMatchesFor(item) {
  const opposite = item.type === 'lost' ? 'found' : 'lost';

  const candidates = await Item.find({
    type: opposite,
    status: 'active',
    category: item.category,
    owner: { $ne: item.owner }   // never match a person with themselves
  }).limit(200);

  const created = [];

  for (const other of candidates) {
    const lost = item.type === 'lost' ? item : other;
    const found = item.type === 'found' ? item : other;

    // If the image service fails, we just score without images
    let imageScore = null;
    try {
      imageScore = await getImageScore(lost, found);
    } catch (err) {
      console.error('Image score failed:', err.message);
    }

    const result = scorePair(lost, found, imageScore);
    if (result.score < MIN_SCORE) continue;

    try {
      const out = await Match.updateOne(
        { lostItem: lost._id, foundItem: found._id },
        { $set: { score: result.score, reasons: result.reasons } },
        { upsert: true }
      );
      if (out.upsertedCount > 0) created.push({ lostItem: lost._id, foundItem: found._id, score: result.score });
    } catch (err) {
      if (err.code !== 11000) throw err; // 11000 = pair already exists, fine
    }
  }

  return created;
}

module.exports = { findMatchesFor, scorePair, getImageScore };