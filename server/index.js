const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('./models/User.js');
const Place = require('./models/Place.js');
const Booking = require('./models/Booking.js');
const cookieParser = require('cookie-parser');
const imageDownloader = require('image-downloader');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const multer = require('multer');
const fs = require('fs');
const mime = require('mime-types');
require('dotenv').config();

const app = express();
const router = express.Router();

const bcryptSalt = bcrypt.genSaltSync(10);
const jwtSecret = process.env.JWT_SECRET || 'fallbackSecret';
const bucket = 'dawid-booking-app';

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/farmmarketplace', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

app.use(express.json());
app.use(cookieParser());
app.use('/uploads', express.static(__dirname + '/uploads'));
app.use(cors({
  credentials: true,
  origin: 'http://127.0.0.1:5173',
}));

// Register
router.post('/register', async (req, res) => {
  const { name, email, password, role } = req.body;

  if (!['farmer', 'customer'].includes(role)) {
    return res.status(400).json({ message: 'Invalid role specified.' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = new User({ name, email, password: hashedPassword, role });

  await user.save();
  res.status(201).json({ message: 'User registered successfully' });
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { id: user._id, role: user.role },
    jwtSecret,
    { expiresIn: '7d' }
  );

  res.json({ token, user: { name: user.name, role: user.role } });
});

// Token verification
const verifyToken = (roles = []) => {
  return (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: 'Unauthorized' });

    jwt.verify(token, jwtSecret, (err, user) => {
      if (err || (roles.length && !roles.includes(user.role))) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      req.user = user;
      next();
    });
  };
};

// Dummy postProduct route (farmer only)
const postProduct = (req, res) => {
  res.json({ message: "Product posted successfully by farmer." });
};

router.post('/products', verifyToken(['farmer']), postProduct);

app.use('/api', router);

app.listen(4000, () => {
  console.log("✅ Server running at http://localhost:4000");
});
