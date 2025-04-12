// index.js
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const User = require('./models/User');
const Product = require('./models/Product');
const verifyToken = require('./middleware/verifyToken');
require('dotenv').config();
const Order = require('./models/Order');

const app = express();
const PORT = process.env.PORT || 4000;

// EJS setup
app.set('view engine', 'ejs');
app.set('views', './views');

// Middlewares
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static('public'));

// ✅ Global user injection middleware
app.use(async (req, res, next) => {
  const token = req.cookies.token;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userDoc = await User.findById(decoded.id);
      if (userDoc) {
        res.locals.user = {
          id: userDoc._id.toString(),
          name: userDoc.name,
          role: userDoc.role
        };
      } else {
        res.locals.user = null;
      }
    } catch (err) {
      res.locals.user = null;
    }
  } else {
    res.locals.user = null;
  }
  next();
});

// MongoDB Connection
mongoose.connect(process.env.MONGO_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

// Routes
app.get('/', (req, res) => {
  res.render('home', { error: null, message: req.query.message });
});

app.get('/register', (req, res) => {
  res.render('register');
});

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

app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.render('login', { error: 'Invalid credentials' });
  }

  const token = jwt.sign({ id: user._id, name: user.name, role: user.role }, process.env.JWT_SECRET);
  res.cookie('token', token);
  res.redirect('/dashboard');
});

app.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/?message=logout');
});

app.get('/dashboard', async (req, res) => {
  if (!res.locals.user) return res.redirect('/login');
  res.render('dashboard', { user: res.locals.user });
});

app.get('/products/add', verifyToken(['farmer']), (req, res) => {
  res.render('add-product');
});

app.post('/products/add', verifyToken(['farmer']), async (req, res) => {
  const { title, description, imageUrl, currentMarketPrice, sellingPrice } = req.body;

  const newProduct = new Product({
    title,
    description,
    imageUrl,
    currentMarketPrice,
    sellingPrice,
    createdBy: req.user.id
  });

  await newProduct.save();
  res.redirect('/products');
});

app.get('/products', async (req, res) => {
  const products = await Product.find().populate('createdBy');
  res.render('products', { products });
});

app.get('/products/edit/:id', verifyToken(['farmer']), async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product || product.createdBy.toString() !== req.user.id) {
    return res.status(403).send('Unauthorized to edit this product.');
  }

  res.render('edit-product', { product });
});

app.post('/products/edit/:id', verifyToken(['farmer']), async (req, res) => {
  const { title, description, imageUrl, currentMarketPrice, sellingPrice } = req.body;
  const product = await Product.findById(req.params.id);

  if (!product || product.createdBy.toString() !== req.user.id) {
    return res.status(403).send('Unauthorized to update this product.');
  }

  Object.assign(product, { title, description, imageUrl, currentMarketPrice, sellingPrice });
  await product.save();

  res.redirect('/products');
});

app.post('/products/delete/:id', verifyToken(['farmer']), async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product || product.createdBy.toString() !== req.user.id) {
    return res.status(403).send('Unauthorized to delete this product.');
  }

  await Product.findByIdAndDelete(req.params.id);
  res.redirect('/products');
});

app.use(async (req, res, next) => {
  const token = req.cookies.token;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userDoc = await User.findById(decoded.id);
      if (userDoc) {
        res.locals.user = {
          id: userDoc._id.toString(),
          name: userDoc.name,
          role: userDoc.role
        };
      } else {
        res.locals.user = null;
      }
    } catch (err) {
      res.locals.user = null;
    }
  } else {
    res.locals.user = null;
  }
  next();
});

const Cart = require('./models/Cart');

app.post('/cart/add/:productId', verifyToken(['customer']), async (req, res) => {
  const { productId } = req.params;
  const customerId = req.user.id;

  let cart = await Cart.findOne({ customerId });

  if (!cart) {
    cart = new Cart({ customerId, items: [] });
  }

  const existingItem = cart.items.find(item => item.product.toString() === productId);
  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    cart.items.push({ product: productId });
  }

  await cart.save();
  res.redirect('/cart');
});

app.get('/cart', verifyToken(['customer']), async (req, res) => {
  const customerId = req.user.id;

  const cart = await Cart.findOne({ customerId }).populate('items.product');
  res.render('cart', { cart });
});
app.post('/cart/remove/:productId', verifyToken(['customer']), async (req, res) => {
  const { productId } = req.params;
  const customerId = req.user.id;

  const cart = await Cart.findOne({ customerId });
  cart.items = cart.items.filter(item => item.product.toString() !== productId);
  await cart.save();

  res.redirect('/cart');
});

app.post('/cart/buy', verifyToken(['customer']), async (req, res) => {
  const cart = await Cart.findOne({ customerId: req.user.id }).populate('items.product');

  if (!cart || cart.items.length === 0) {
    return res.redirect('/cart?message=empty');
  }

  const totalAmount = cart.items.reduce((sum, item) => {
    return sum + item.product.sellingPrice * item.quantity;
  }, 0);

  const order = new Order({
    customerId: req.user.id,
    items: cart.items.map(item => ({
      product: item.product._id,
      quantity: item.quantity
    })),
    totalAmount
  });

  await order.save();
  await Cart.deleteOne({ customerId: req.user.id });

  res.redirect('/order-success');
});


// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
