// User.js - what a user looks like in MongoDB.

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required.'], trim: true, minlength: 2, maxlength: 60 },
    email: {
      type: String,
      required: [true, 'Email is required.'],
      unique: true, // MongoDB refuses two users with the same email
      lowercase: true,
      trim: true
    },
    // Stores the HASHED password. select:false keeps it out of normal queries,
    // so it can never be sent to the browser by accident.
    password: { type: String, required: true, select: false }
  },
  { timestamps: true } // adds createdAt and updatedAt automatically
);

module.exports = mongoose.model('User', userSchema);
