// ✅ Correct for CommonJS
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  role: { type: String, enum: ['farmer', 'customer'], default: 'customer' },
  location: {
    city: String,
    state: String,
    country: String,
    pincode: String,
    coordinates: {
      type: [Number],
      index: '2dsphere'
    }
  }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
