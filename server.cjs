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

// HTTP server and Socket.IO will be attached later to support realtime dashboard
const http = require('http');
const { Server: IOServer } = require('socket.io');

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

// Codes schema (inventory of digital codes)
const CodeSchema = new mongoose.Schema({}, { strict: false, collection: 'codes' });
const Code = mongoose.models.Code || mongoose.model('Code', CodeSchema);

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

// --- Codes endpoints ---
// GET /api/codes?productId=...&status=available|sold
app.get('/api/codes', async (req, res) => {
  try {
    const { productId, status } = req.query;
    const filter = {};
    if (productId) filter.productId = String(productId);
    if (status) {
      if (String(status) === 'sold') filter.status = 'sold';
      else if (String(status) === 'available') filter.$or = [{ status: { $exists: false } }, { status: { $ne: 'sold' } }];
    }
    const codes = await Code.find(filter).lean().limit(10000).catch(() => []);
    res.json(codes || []);
  } catch (err) {
    console.error('GET /api/codes error', err);
    res.status(500).json({ error: 'Failed to fetch codes' });
  }
});

// GET /api/codes/stats/:productId -> { productId, available, sold, total }
app.get('/api/codes/stats/:productId', async (req, res) => {
  try {
    const productId = req.params.productId;

    // Prefer explicit 'codes' collection if present
    const collectionNames = (await mongoose.connection.db.listCollections().toArray()).map(c => c.name);
    if (collectionNames.includes('codes')) {
      // aggregate available and sold
      const soldCount = await Code.countDocuments({ productId, status: 'sold' }).catch(() => 0);
      const availableCount = await Code.countDocuments({ productId, $or: [{ status: { $exists: false } }, { status: { $ne: 'sold' } }] }).catch(() => 0);
      const total = soldCount + availableCount;
      return res.json({ productId, available: availableCount, sold: soldCount, total });
    }

    // Fallback: try to read from products.availableCodes and orders.deliveryCodes
    const prod = await Product.findOne({ id: productId }).lean().catch(() => null);
    let available = 0;
    if (prod) {
      const availArr = prod.availableCodes || prod.available_codes || [];
      available = Array.isArray(availArr) ? availArr.length : 0;
    }

    let sold = 0;
    try {
      const q = {};
      q[`deliveryCodes.${productId}`] = { $exists: true };
      const orders = await Order.find(q).lean();
      for (const o of orders) {
        const d = (o.deliveryCodes && o.deliveryCodes[productId]) || [];
        sold += Array.isArray(d) ? d.length : 0;
      }
    } catch (e) {
      sold = 0;
    }
    const total = available + sold;
    res.json({ productId, available, sold, total });
  } catch (err) {
    console.error('GET /api/codes/stats/:productId error', err);
    res.status(500).json({ error: 'Failed to compute code stats' });
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

// ---- Guard for write routes ----
const ENABLE_WRITES = process.env.ALLOW_WRITES === 'true';
if (!ENABLE_WRITES) {
  console.log('ℹ️ Write routes are disabled. Set ALLOW_WRITES=true to enable write endpoints.');
}

// Helper to emit resource changed events from write routes
function emitResourceChanged(collection, operationType, doc) {
  try {
    const payload = {
      collection,
      operationType,
      documentKey: doc && doc._id ? { _id: doc._id } : null,
      fullDocument: doc || null,
      ts: new Date()
    };
    io.emit('resource:changed', payload);
  } catch (e) {
    console.warn('emitResourceChanged failed', e && e.message ? e.message : e);
  }
}

// ---- Write endpoints (guarded) ----
app.post('/api/products', async (req, res) => {
  if (!ENABLE_WRITES) return res.status(403).json({ error: 'Writes disabled' });
  try {
    const doc = await Product.create(req.body);
    emitResourceChanged('products', 'insert', doc);
    res.json(doc);
  } catch (err) {
    console.error('POST /api/products error', err);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

app.put('/api/products/:id', async (req, res) => {
  if (!ENABLE_WRITES) return res.status(403).json({ error: 'Writes disabled' });
  try {
    const doc = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true }).lean();
    emitResourceChanged('products', 'update', doc);
    res.json(doc || {});
  } catch (err) {
    console.error('PUT /api/products/:id error', err);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  if (!ENABLE_WRITES) return res.status(403).json({ error: 'Writes disabled' });
  try {
    const result = await Product.deleteOne({ _id: req.params.id });
    emitResourceChanged('products', 'delete', { _id: req.params.id });
    res.json({ deletedCount: result.deletedCount });
  } catch (err) {
    console.error('DELETE /api/products/:id error', err);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// Orders write endpoints
app.post('/api/orders', async (req, res) => {
  if (!ENABLE_WRITES) return res.status(403).json({ error: 'Writes disabled' });
  try {
    const doc = await Order.create(req.body);
    emitResourceChanged('orders', 'insert', doc);
    res.json(doc);
  } catch (err) {
    console.error('POST /api/orders error', err);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

app.put('/api/orders/:id', async (req, res) => {
  if (!ENABLE_WRITES) return res.status(403).json({ error: 'Writes disabled' });
  try {
    const doc = await Order.findByIdAndUpdate(req.params.id, req.body, { new: true }).lean();
    emitResourceChanged('orders', 'update', doc);
    res.json(doc || {});
  } catch (err) {
    console.error('PUT /api/orders/:id error', err);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// Categories
app.post('/api/categories', async (req, res) => {
  if (!ENABLE_WRITES) return res.status(403).json({ error: 'Writes disabled' });
  try {
    const doc = await Category.create(req.body);
    emitResourceChanged('categories', 'insert', doc);
    res.json(doc);
  } catch (err) {
    console.error('POST /api/categories error', err);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

app.put('/api/categories/:id', async (req, res) => {
  if (!ENABLE_WRITES) return res.status(403).json({ error: 'Writes disabled' });
  try {
    const doc = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true }).lean();
    emitResourceChanged('categories', 'update', doc);
    res.json(doc || {});
  } catch (err) {
    console.error('PUT /api/categories/:id error', err);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// Settings (single document)
app.put('/api/settings', async (req, res) => {
  if (!ENABLE_WRITES) return res.status(403).json({ error: 'Writes disabled' });
  try {
    const doc = await Setting.findOneAndUpdate({}, req.body, { upsert: true, new: true }).lean();
    emitResourceChanged('settings', 'update', doc);
    res.json(doc || {});
  } catch (err) {
    console.error('PUT /api/settings error', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Payment methods and reviews (dynamic models)
const PaymentMethodModel = mongoose.models.PaymentMethod || mongoose.model('PaymentMethod', new mongoose.Schema({}, { strict: false, collection: 'payment_methods' }));
const ReviewModel = mongoose.models.Review || mongoose.model('Review', new mongoose.Schema({}, { strict: false, collection: 'reviews' }));

app.post('/api/payment-methods', async (req, res) => {
  if (!ENABLE_WRITES) return res.status(403).json({ error: 'Writes disabled' });
  try {
    const doc = await PaymentMethodModel.create(req.body);
    emitResourceChanged('payment_methods', 'insert', doc);
    res.json(doc);
  } catch (err) {
    console.error('POST /api/payment-methods error', err);
    res.status(500).json({ error: 'Failed to create payment method' });
  }
});

app.post('/api/reviews', async (req, res) => {
  if (!ENABLE_WRITES) return res.status(403).json({ error: 'Writes disabled' });
  try {
    const doc = await ReviewModel.create(req.body);
    emitResourceChanged('reviews', 'insert', doc);
    res.json(doc);
  } catch (err) {
    console.error('POST /api/reviews error', err);
    res.status(500).json({ error: 'Failed to create review' });
  }
});

// Static uploads (read-only)
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// Create HTTP server so Socket.IO can share the same server
const server = http.createServer(app);

// Socket.IO options and allowed origins (allow FRONTEND_ORIGIN env or all origins)
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*';
const io = new IOServer(server, {
  cors: {
    origin: FRONTEND_ORIGIN,
    methods: ['GET', 'POST']
  }
});

io.on('connection', (socket) => {
  console.log('🔌 Socket.IO client connected', socket.id);
  socket.emit('ready', { msg: 'Welcome to realtime API' });

  socket.on('disconnect', (reason) => {
    console.log('🔌 Socket.IO client disconnected', socket.id, reason);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Read-only server listening on port ${PORT}`);
  console.log(`📝 Health: https://backendpay-1.onrender.com/api/health`);
});

// Realtime: set up MongoDB change streams to emit events to connected clients.
// Enable with REALTIME=true (default true unless explicitly set to 'false')
const ENABLE_REALTIME = process.env.REALTIME !== 'false';
const changeStreams = [];

async function setupChangeStreams() {
  if (!ENABLE_REALTIME) return;
  if (mongoose.connection.readyState !== 1) {
    console.warn('Realtime disabled: MongoDB is not connected (change streams require a live connection)');
    return;
  }

  // Candidate collection names to watch (covers possible naming variations)
  const collectionsToWatch = [
    'products', 'orders', 'categories', 'settings', 'payment_methods', 'payments', 'reviews',
    'matajir_products','matajir_orders','matajir_categories','matajir_payments','matajir_reviews','matajir_settings'
  ];

  const db = mongoose.connection.db;
  for (const name of collectionsToWatch) {
    try {
      const coll = db.collection(name);
      // Start watching with updateLookup to get fullDocument on updates
      const stream = coll.watch([], { fullDocument: 'updateLookup' });
      stream.on('change', (change) => {
        try {
          const payload = {
            collection: name,
            operationType: change.operationType,
            documentKey: change.documentKey,
            fullDocument: change.fullDocument || null,
            ns: change.ns || null,
            clusterTime: change.clusterTime || null
          };
          io.emit('resource:changed', payload);
        } catch (e) {
          console.warn('Failed to emit change event', e);
        }
      });
      stream.on('error', (err) => {
        console.warn('Change stream error for', name, err && err.message ? err.message : err);
        try { stream.close(); } catch (_) {}
      });
      changeStreams.push(stream);
      console.log('👉 Watching collection for realtime:', name);
    } catch (err) {
      // Could be that collection doesn't exist or watch is unsupported (standalone mongod)
      console.info('Cannot watch collection', name, err && err.message ? err.message : err);
    }
  }
}

// If DB is already connected, set up change streams; otherwise, attach to open event
if (mongoose.connection.readyState === 1) {
  setupChangeStreams().catch((e) => console.warn('setupChangeStreams failed', e));
} else {
  mongoose.connection.once('open', () => {
    setupChangeStreams().catch((e) => console.warn('setupChangeStreams failed', e));
  });
}

function shutdown() {
  console.log('⚠️ Shutdown initiated');
  try {
    // Close change streams
    for (const s of changeStreams) {
      try { s.close(); } catch (_) {}
    }
  } catch (_) {}

  io.close();

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

