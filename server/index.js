const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const User = require('./models/User');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;

// ✅ Set EJS as view engine and views directory
app.set('view engine', 'ejs');
app.set('views', './views');

// ✅ Middlewares
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ✅ Static file serving (CSS, JS, images from /public folder)
app.use(express.static('public')); // So /public/images/image.png becomes /images/image.png

// ✅ Connect to MongoDB
mongoose.connect(process.env.MONGO_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB connected'))
.catch((err) => console.error('❌ MongoDB connection error:', err));

// ✅ Routes

// GET: Home Page
app.get('/', (req, res) => {
  res.render('home', { error: null });
});

// GET: Register Page
app.get('/register', (req, res) => {
  res.render('register');
});

// POST: Register User
app.post('/register', async (req, res) => {
  const { name, email, password, role, city, state, country, pincode } = req.body;

  const hashedPassword = await bcrypt.hash(password, 10);

  const newUser = new User({
    name,
    email,
    password: hashedPassword,
    role,
    location: role === 'farmer' ? { city, state, country, pincode } : undefined
  });

  await newUser.save();

  res.redirect('/?message=registered');
});

// GET: Login Page
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

// POST: Login User
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.render('login', { error: 'Invalid credentials' });
  }

  const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET);
  res.cookie('token', token);
  res.redirect('/dashboard');
});

// GET: Dashboard Page (Protected)
app.get('/dashboard', (req, res) => {
  const token = req.cookies.token;
  if (!token) return res.redirect('/');

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.render('dashboard', {
      role: decoded.role,
      query: req.query
    });
  } catch (err) {
    return res.redirect('/');
  }
});

app.get('/about', (req, res) => {
  res.render('about');
});


// ✅ Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
