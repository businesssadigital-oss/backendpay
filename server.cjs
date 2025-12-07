// Minimal read-only server
// This server exposes only safe, read-only endpoints to fetch data from MongoDB.

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

require('dotenv').config();

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || process.env.MONGO_URL || 'mongodb+srv://dariripay:s.a.2016%40S@pay.w8d4cp7.mongodb.net/?appName=pay';

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

if (!MONGO_URI) {
  console.warn('⚠️ No MONGO_URI set in environment. Set MONGO_URI in .env to connect to your DB.');
}

async function connectDb() {
  try {
    await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err && err.message ? err.message : err);
  }
}

if (MONGO_URI) {
  connectDb();
} else {
  console.log('ℹ️ Running without MongoDB connection (read-only mode, endpoints will return empty results)');
}

// Flexible schemas for reading collections
const ProductSchema = new mongoose.Schema({}, { strict: false, collection: 'products' });
const CategorySchema = new mongoose.Schema({}, { strict: false, collection: 'categories' });
const OrderSchema = new mongoose.Schema({}, { strict: false, collection: 'orders' });
const SettingSchema = new mongoose.Schema({}, { strict: false, collection: 'settings' });

const Product = mongoose.models.Product || mongoose.model('Product', ProductSchema);
const Category = mongoose.models.Category || mongoose.model('Category', CategorySchema);
const Order = mongoose.models.Order || mongoose.model('Order', OrderSchema);
const Setting = mongoose.models.Setting || mongoose.model('Setting', SettingSchema);

// Health
app.get('/api/health', (req, res) => {
  const state = mongoose.connection.readyState; // 0 disconnected, 1 connected
  res.json({ ok: state === 1, mongoState: state });
});

// Read-only endpoints
app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find({}).lean().limit(1000);
    res.json(products);
  } catch (err) {
    console.error('GET /api/products error', err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

app.get('/api/categories', async (req, res) => {
  try {
    const categories = await Category.find({}).lean();
    res.json(categories);
  } catch (err) {
    console.error('GET /api/categories error', err);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

app.get('/api/orders', async (req, res) => {
  try {
    const orders = await Order.find({}).lean().limit(500);
    res.json(orders);
  } catch (err) {
    console.error('GET /api/orders error', err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

app.get('/api/settings', async (req, res) => {
  try {
    const settings = await Setting.findOne({}).lean();
    res.json(settings || {});
  } catch (err) {
    console.error('GET /api/settings error', err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Payment methods (safe read-only)
app.get('/api/payment-methods', async (req, res) => {
  try {
    // attempt to read collection if exists; return empty array if not
    const PaymentMethod = mongoose.models.PaymentMethod || mongoose.model('PaymentMethod', new mongoose.Schema({}, { strict: false, collection: 'payment_methods' }));
    const methods = await PaymentMethod.find({}).lean().catch(() => []);
    res.json(methods || []);
  } catch (err) {
    console.error('GET /api/payment-methods error', err);
    res.status(500).json({ error: 'Failed to fetch payment methods' });
  }
});

// Reviews (safe read-only)
app.get('/api/reviews', async (req, res) => {
  try {
    const Review = mongoose.models.Review || mongoose.model('Review', new mongoose.Schema({}, { strict: false, collection: 'reviews' }));
    const reviews = await Review.find({}).lean().catch(() => []);
    res.json(reviews || []);
  } catch (err) {
    console.error('GET /api/reviews error', err);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

// Static uploads (read-only)
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Read-only server listening on port ${PORT}`);
  console.log(`📝 Health: http://localhost:${PORT}/api/health`);
});

function shutdown() {
  console.log('⚠️ Shutdown initiated');
  server.close(() => {
    // mongoose.connection.close() returns a promise in modern mongoose
    mongoose.connection.close(false).then(() => {
      console.log('✅ MongoDB connection closed');
      process.exit(0);
    }).catch(() => {
      // ignore close errors and exit
      process.exit(0);
    });
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

