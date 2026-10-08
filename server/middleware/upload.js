// upload.js - receives photos from the report form and saves them in /uploads.
// Only JPG, PNG and WebP, max 3 photos, max 5 MB each.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

const storage = multer.diskStorage({
  destination(req, file, cb) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    cb(null, UPLOADS_DIR);
  },
  // Random file name. The user's own file name is never used.
  filename(req, file, cb) {
    cb(null, crypto.randomBytes(16).toString('hex') + EXT[file.mimetype]);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 3 },
  fileFilter(req, file, cb) {
    if (EXT[file.mimetype]) return cb(null, true);
    const err = new Error('Only JPG, PNG or WebP photos are allowed.');
    err.status = 400;
    cb(err);
  }
});

// The browser says what the file is, but it can lie. Check the first bytes of the file.
function looksLikeImage(filePath) {
  const buf = Buffer.alloc(12);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, buf, 0, 12, 0);
  fs.closeSync(fd);

  const jpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const png = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const webp = buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  return jpeg || png || webp;
}

function removeFiles(files) {
  (files || []).forEach((f) => fs.unlink(f.path, () => {}));
}

function verifyImages(req, res, next) {
  const files = req.files || [];
  for (const file of files) {
    if (!looksLikeImage(file.path)) {
      removeFiles(files);
      return res.status(400).json({ message: 'One of the files is not a valid image.' });
    }
  }
  next();
}

// Use as: router.post('/', requireAuth, uploadImages, handler)
// The form field must be named "images".
const uploadImages = [upload.array('images', 3), verifyImages];

module.exports = { uploadImages, removeFiles, UPLOADS_DIR };
