// Clean read-only server (alternative to server.cjs)
// Purpose: minimal read-only endpoints that fetch from MongoDB only.

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://dariripay:s.a.2016%40S@pay.w8d4cp7.mongodb.net/?appName=pay';

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err && err.message ? err.message : err));

const S = (n) => new mongoose.Schema({}, { strict: false, collection: n });
const Product = mongoose.models.Product || mongoose.model('Product', S('products'));
const Category = mongoose.models.Category || mongoose.model('Category', S('categories'));
const Order = mongoose.models.Order || mongoose.model('Order', S('orders'));
const Setting = mongoose.models.Setting || mongoose.model('Setting', S('settings'));

app.get('/api/health', (req, res) => {
  res.json({ ok: mongoose.connection.readyState === 1, state: mongoose.connection.readyState });
});

app.get('/api/products', async (req, res) => {
  try { res.json(await Product.find({}).lean().limit(1000)); }
  catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch products' }); }
});

app.get('/api/categories', async (req, res) => {
  try { res.json(await Category.find({}).lean()); }
  catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch categories' }); }
});

app.get('/api/orders', async (req, res) => {
  try { res.json(await Order.find({}).lean().limit(500)); }
  catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch orders' }); }
});

app.get('/api/settings', async (req, res) => {
  try { res.json((await Setting.findOne({}).lean()) || {}); }
  catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch settings' }); }
});

app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

app.listen(PORT, () => console.log(`✅ Clean server listening on ${PORT}`));
