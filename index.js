const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const User = require('./models/User');
const Product = require('./models/Product');
const Order = require('./models/Order');
const Cart = require('./models/Cart');
const Chat = require('./models/Chat');
const Message = require('./models/Message');
const verifyToken = require('./middleware/verifyToken');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 4000;

// View engine
app.set('view engine', 'ejs');
app.set('views', './views');

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB connection
mongoose.connect(process.env.MONGO_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

// Global user middleware
app.use(async (req, res, next) => {
  const token = req.cookies.token;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userDoc = await User.findById(decoded.id);
      if (userDoc) {
        res.locals.user = req.user = {
          id: userDoc._id.toString(),
          name: userDoc.name,
          role: userDoc.role
        };
      }
    } catch {
      res.locals.user = null;
    }
  } else {
    res.locals.user = null;
  }
  next();
});

// Routes
app.get('/', (req, res) => {
  res.render('home', { error: null, message: req.query.message });
});

// Auth
app.get('/register', (req, res) => res.render('register'));
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

app.get('/login', (req, res) => res.render('login', { error: null }));
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
  res.redirect('/');
});

// Dashboard
app.get('/dashboard', (req, res) => {
  if (!res.locals.user) return res.redirect('/login');
  res.render('dashboard', { user: res.locals.user });
});

// Products
app.get('/products', async (req, res) => {
  const products = await Product.find().populate('createdBy');
  res.render('products', { products });
});
app.get('/products/add', verifyToken(['farmer']), (req, res) => res.render('add-product'));
app.post('/products/add', verifyToken(['farmer']), async (req, res) => {
  const { title, description, imageUrl, currentMarketPrice, sellingPrice } = req.body;
  const newProduct = new Product({ title, description, imageUrl, currentMarketPrice, sellingPrice, createdBy: req.user.id });
  await newProduct.save();
  res.redirect('/products');
});
app.get('/products/edit/:id', verifyToken(['farmer']), async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product || product.createdBy.toString() !== req.user.id) return res.status(403).send('Unauthorized');
  res.render('edit-product', { product });
});
app.post('/products/edit/:id', verifyToken(['farmer']), async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product || product.createdBy.toString() !== req.user.id) return res.status(403).send('Unauthorized');
  Object.assign(product, req.body);
  await product.save();
  res.redirect('/products');
});
app.post('/products/delete/:id', verifyToken(['farmer']), async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product || product.createdBy.toString() !== req.user.id) return res.status(403).send('Unauthorized');
  await Product.findByIdAndDelete(req.params.id);
  res.redirect('/products');
});

// Cart
app.post('/cart/add/:productId', verifyToken(['customer']), async (req, res) => {
  const { productId } = req.params;
  const customerId = req.user.id;
  let cart = await Cart.findOne({ customerId });
  if (!cart) cart = new Cart({ customerId, items: [] });

  const existing = cart.items.find(item => item.product.toString() === productId);
  if (existing) existing.quantity++;
  else cart.items.push({ product: productId });

  await cart.save();
  res.redirect('/cart');
});
app.get('/cart', verifyToken(['customer']), async (req, res) => {
  const cart = await Cart.findOne({ customerId: req.user.id }).populate('items.product');
  res.render('cart', { cart });
});
app.post('/cart/remove/:productId', verifyToken(['customer']), async (req, res) => {
  const cart = await Cart.findOne({ customerId: req.user.id });
  cart.items = cart.items.filter(item => item.product.toString() !== req.params.productId);
  await cart.save();
  res.redirect('/cart');
});
app.post('/cart/buy', verifyToken(['customer']), async (req, res) => {
  const cart = await Cart.findOne({ customerId: req.user.id }).populate('items.product');
  if (!cart || cart.items.length === 0) return res.redirect('/cart');
  const totalAmount = cart.items.reduce((sum, item) => sum + item.product.sellingPrice * item.quantity, 0);
  const order = new Order({
    customerId: req.user.id,
    items: cart.items.map(i => ({ product: i.product._id, quantity: i.quantity })),
    totalAmount
  });
  await order.save();
  await Cart.deleteOne({ customerId: req.user.id });
  res.redirect('/order-success');
});

// ✅ FIXED Chat Route
app.get('/chat/:farmerId', verifyToken(['customer', 'farmer']), async (req, res) => {
  const { farmerId } = req.params;
  const userId = req.user.id;

  if (!mongoose.Types.ObjectId.isValid(farmerId) || !mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).send('❌ Invalid user or farmer ID.');
  }

  let chat = await Chat.findOne({ participants: { $all: [userId, farmerId] } });

  if (!chat) {
    chat = new Chat({ participants: [userId, farmerId] });
    await chat.save();
  }

  const messages = await Message.find({ chatId: chat._id }).populate('sender');
  const receiverUser = await User.findById(farmerId);
  const receiverName = receiverUser ? receiverUser.name : 'User';

  res.render('chat', {
    messages,
    chatId: chat._id,
    userId,
    receiverId: farmerId,
    receiverName
  });
});

app.post('/chat/send', verifyToken(['customer', 'farmer']), async (req, res) => {
  const { chatId, content, receiverId } = req.body;
  const newMessage = new Message({
    chatId,
    sender: req.user.id,
    content
  });
  await newMessage.save();
  res.redirect(`/chat/${receiverId}`);
});

app.get('/messages', verifyToken(['farmer']), async (req, res) => {
  const chats = await Chat.find({ participants: req.user.id }).populate('participants');
  const conversations = chats.map(chat => {
    const other = chat.participants.find(p => p._id.toString() !== req.user.id);
    return { chatId: chat._id, customer: other };
  });
  res.render('inbox', { conversations });
});

// Views
app.get('/about', (req, res) => res.render('about'));
const Farmer = require('./models/Farmer');
// Add at the top
const fs = require('fs');
const csv = require('csv-parser');

app.get('/nearby-farmers', (req, res) => {
  const farmers = [];
  fs.createReadStream(path.join(__dirname, 'india_crop_locations.csv'))
    .pipe(csv())
    .on('data', (row) => {
      farmers.push(row);
    })
    .on('end', () => {
      res.render('map-nearby', { farmers });
    });
});




app.get('/api/farmers', async (req, res) => {
  try {
    const farmers = await Farmer.find();
    res.json(farmers);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch farmers' });
  }
});
// Route to render map with farmer data
app.get('/map/farmers', async (req, res) => {
  const farmers = await User.find({ role: 'farmer' });
  res.render('farmers-map', { farmers });
});


// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
