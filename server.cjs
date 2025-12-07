
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
// fs/path used elsewhere (keep requires if needed later)
const fs = require('fs').promises;
const path = require('path');

// --- Configuration ---
const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://dariripay:s.a.2016%40S@pay.w8d4cp7.mongodb.net/?appName=pay';

// Note: admin editor endpoints removed for production safety.

// --- Chargily Pay Credentials (Test Mode) ---
const CHARGILY_PUBLIC_KEY = process.env.CHARGILY_PUBLIC_KEY ;
const CHARGILY_SECRET_KEY = process.env.CHARGILY_SECRET_KEY ;

// --- PayPal Credentials (Test Mode) ---
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID ;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET ;
const PAYPAL_BASE_URL = 'https://api-m.sandbox.paypal.com';

// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// adminAuth middleware removed (editor endpoints cleaned up)

// --- MongoDB Connection with Better Error Handling ---
mongoose.connect(MONGO_URI, {
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 10000
})
  .then(() => {
    console.log('✅ MongoDB Connected to:', MONGO_URI);
  })
  .catch(err => {
    console.error('❌ MongoDB Connection Error:', err.message);
    process.exit(1);
  });

// Monitor connection events
mongoose.connection.on('disconnected', () => {
  console.log('⚠️ MongoDB disconnected');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB error:', err.message);
});

// --- Schemas & Models ---

const ProductSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  name: String,
  description: String,
  price: Number,
  category: String,
  image: String,
  rating: { type: Number, default: 0 },
  stock: { type: Number, default: 0 },
  availableCodes: [String] // Embedded inventory for simplicity
});

const UserSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  name: String,
  email: { type: String, unique: true },
  password: String, // In production, hash this!
  role: { type: String, default: 'user' },
  balance: { type: Number, default: 0 }
});

const OrderSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  userId: String,
  date: String,
  items: Array,
  total: Number,
  status: String,
  deliveryCodes: Object,
  paymentMethod: String,
  paypalOrderId: String
});

const CategorySchema = new mongoose.Schema({
  id: { type: String, unique: true },
  name: String
});

const PaymentMethodSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  name: String,
  type: String,
  isActive: Boolean,
  description: String
});

const ReviewSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  productId: String,
  userId: String,
  userName: String,
  rating: Number,
  comment: String,
  date: String
});

const CodeSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  productId: String,
  code: { type: String, required: true },
  status: { type: String, enum: ['available', 'sold'], default: 'available' },
  createdAt: { type: Date, default: Date.now },
  soldAt: { type: Date, default: null },
  soldTo: { type: String, default: null },
  orderId: { type: String, default: null }
});

// Create composite unique index to prevent duplicate codes for the same product
CodeSchema.index({ productId: 1, code: 1 }, { unique: true, sparse: true });

const Product = mongoose.model('Product', ProductSchema);
const User = mongoose.model('User', UserSchema);
const Order = mongoose.model('Order', OrderSchema);
const Category = mongoose.model('Category', CategorySchema);
const PaymentMethod = mongoose.model('PaymentMethod', PaymentMethodSchema);
const Review = mongoose.model('Review', ReviewSchema);
const Code = mongoose.model('Code', CodeSchema);

// --- Settings Schema (single document) ---
const SettingsSchema = new mongoose.Schema({
  siteName: { type: String, default: 'ماتاجر - Matajir' },
  siteDescription: { type: String, default: 'منصة عربية لبيع البطاقات الرقمية والاشتراكات' },
  logoUrl: { type: String, default: '' },
  footerText: { type: String, default: 'جميع الحقوق محفوظة © ماتاجر' },
  socialLinks: {
    facebook: { type: String, default: '' },
    twitter: { type: String, default: '' },
    instagram: { type: String, default: '' },
    telegram: { type: String, default: '' },
    youtube: { type: String, default: '' }
  }
});

const Settings = mongoose.model('Settings', SettingsSchema);

// --- Seeding Data (If Empty) ---
const seedData = async () => {
    // Simple check if DB is empty
    const pCount = await Product.countDocuments();
    if (pCount === 0) {
        console.log('Seeding Database...');
        
        // Mock Data (Copied from constants.ts logic)
        const categories = [
            { id: 'games', name: 'ألعاب' },
            { id: 'cards', name: 'بطاقات' },
            { id: 'subscriptions', name: 'اشتراكات' }
        ];
        
        const generateFakeCode = () => 'XXXX-XXXX-XXXX-XXXX'.replace(/X/g, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".charAt(Math.floor(Math.random() * 36)));

        const products = [
            { id: 'p1', name: 'iTunes Card $100', description: 'بطاقة آيتونز أمريكي', price: 100, category: 'cards', image: 'https://picsum.photos/seed/itunes/400/400', rating: 4.8, stock: 50, availableCodes: Array(50).fill(0).map(generateFakeCode) },
            { id: 'p2', name: 'PUBG UC - 660', description: 'شحن ببجي فوري', price: 9.99, category: 'games', image: 'https://picsum.photos/seed/pubg/400/400', rating: 4.9, stock: 1000, availableCodes: Array(100).fill(0).map(generateFakeCode) },
            // Add more seed products here if needed
        ];

        const users = [
            { id: 'u1', name: 'مدير النظام', email: 'admin@matajir.com', password: '123', role: 'admin', balance: 1000 },
            { id: 'u2', name: 'أحمد محمد', email: 'user@matajir.com', password: '123', role: 'user', balance: 50 }
        ];

        const methods = [
            { id: 'pm_card', name: 'بطاقة ائتمان', type: 'card', isActive: true, description: 'دفع آمن' },
            { id: 'pm_chargily', name: 'Chargily Pay', type: 'card', isActive: true, description: 'دفع محلي آمن عبر البطاقة الذهبية و CIB' },
            { id: 'pm_paypal', name: 'PayPal', type: 'paypal', isActive: true, description: 'الدفع السريع عبر حساب باي بال' },
            { id: 'pm_wallet', name: 'محفظة المنصة', type: 'wallet', isActive: false, description: 'رصيدك الحالي' }
        ];

        await Category.insertMany(categories);
        await Product.insertMany(products);
        await User.insertMany(users);
        await PaymentMethod.insertMany(methods);
        console.log('Database Seeded!');
    }
};

// --- Error Handling Middleware ---
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// --- Routes ---

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// Products
app.get('/api/products', asyncHandler(async (req, res) => {
    const products = await Product.find();
    res.json(products);
}));

app.post('/api/products', asyncHandler(async (req, res) => {
    const product = new Product(req.body);
    await product.save();
    res.status(201).json(product);
}));

app.put('/api/products/:id', asyncHandler(async (req, res) => {
    const product = await Product.findOneAndUpdate({ id: req.params.id }, req.body, { new: true });
    if (!product) return res.status(404).json({ message: 'المنتج غير موجود' });
    res.json(product);
}));

app.delete('/api/products/:id', asyncHandler(async (req, res) => {
    const product = await Product.findOneAndDelete({ id: req.params.id });
    if (!product) return res.status(404).json({ message: 'المنتج غير موجود' });
    res.json({ success: true });
}));

// Categories
app.get('/api/categories', asyncHandler(async (req, res) => {
  const categories = await Category.find();
  res.json(categories);
}));

app.post('/api/categories', asyncHandler(async (req, res) => {
    const cat = new Category(req.body);
    await cat.save();
    res.status(201).json(cat);
}));

app.delete('/api/categories/:id', asyncHandler(async (req, res) => {
    const category = await Category.findOneAndDelete({ id: req.params.id });
    if (!category) return res.status(404).json({ message: 'الفئة غير موجودة' });
    res.json({ success: true });
}));

// --- Codes Management (in Database) ---
// GET /api/codes?productId=xxx&status=available  -> list codes
app.get('/api/codes', asyncHandler(async (req, res) => {
  const { productId, status } = req.query;
  const filter = {};
  if (productId) filter.productId = String(productId);
  if (status) filter.status = String(status);

  const codes = await Code.find(filter).sort({ createdAt: -1 });
  console.log(`📋 Retrieved ${codes.length} codes with filter:`, filter);
  res.json(codes);
}));

// POST /api/codes -> add codes in bulk (with duplicate prevention)
app.post('/api/codes', asyncHandler(async (req, res) => {
  const { productId, codes } = req.body;
  if (!productId || !Array.isArray(codes) || codes.length === 0) {
    return res.status(400).json({ message: 'productId and codes array are required' });
  }

  const productIdStr = String(productId);
  const codesToInsert = [];
  const newCodes = [];
  let duplicateCount = 0;

  // Check which codes already exist for this product
  for (const c of codes) {
    const codeStr = String(c).trim();
    const existing = await Code.findOne({ productId: productIdStr, code: codeStr });
    
    if (!existing) {
      // Code doesn't exist, safe to add
      const newCode = {
        id: `code-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        productId: productIdStr,
        code: codeStr,
        status: 'available',
        createdAt: new Date()
      };
      codesToInsert.push(newCode);
      newCodes.push(codeStr);
    } else {
      // Code already exists for this product, skip it
      duplicateCount++;
      console.log(`⚠️ Skipped duplicate code "${codeStr}" for product ${productId}`);
    }
  }

  // Insert only new codes
  let result = [];
  if (codesToInsert.length > 0) {
    result = await Code.insertMany(codesToInsert);
    console.log(`✅ Added ${result.length} codes for product ${productId} (${duplicateCount} duplicates skipped)`);
  } else {
    console.log(`ℹ️ No new codes to add for product ${productId} (all ${codes.length} were duplicates)`);
  }

  // Update Product document's availableCodes with only new codes
  if (newCodes.length > 0) {
    try {
      await Product.updateOne(
        { id: productIdStr },
        { 
          $push: { availableCodes: { $each: newCodes } }, 
          $inc: { stock: newCodes.length } 
        }
      );
    } catch (err) {
      console.error('⚠️ Failed to update Product with new codes:', err.message);
    }
  }

  res.status(201).json({ count: result.length, duplicates: duplicateCount, codes: result });
}));

// PUT /api/codes/:id -> mark code as sold
app.put('/api/codes/:id', asyncHandler(async (req, res) => {
  const { status, soldTo, orderId } = req.body;
  const code = await Code.findOneAndUpdate(
    { id: req.params.id },
    { 
      status: status || 'sold',
      soldAt: new Date(),
      soldTo: soldTo || null,
      orderId: orderId || null
    },
    { new: true }
  );

  if (!code) return res.status(404).json({ message: 'الكود غير موجود' });
  res.json(code);
}));

// DELETE /api/codes/:id -> delete code
app.delete('/api/codes/:id', asyncHandler(async (req, res) => {
  const code = await Code.findOneAndDelete({ id: req.params.id });
  if (!code) return res.status(404).json({ message: 'الكود غير موجود' });
  res.json({ success: true });
}));

// GET /api/codes/stats/:productId -> stats for a product
app.get('/api/codes/stats/:productId', asyncHandler(async (req, res) => {
  const { productId } = req.params;
  
  // Count codes by status
  const available = await Code.countDocuments({ productId: String(productId), status: 'available' });
  const sold = await Code.countDocuments({ productId: String(productId), status: 'sold' });
  const total = available + sold;
  
  console.log(`📊 Stats for product ${productId}: available=${available}, sold=${sold}, total=${total}`);
  
  res.json({ productId, available, sold, total });
}));

// Payment Methods
app.get('/api/payment-methods', asyncHandler(async (req, res) => {
  const methods = await PaymentMethod.find();
  res.json(methods);
}));

app.put('/api/payment-methods/:id', asyncHandler(async (req, res) => {
    const method = await PaymentMethod.findOneAndUpdate({ id: req.params.id }, req.body, { new: true });
    if (!method) return res.status(404).json({ message: 'طريقة الدفع غير موجودة' });
    res.json(method);
}));

// --- Settings endpoints (GET/PUT) ---
app.get('/api/settings', asyncHandler(async (req, res) => {
  // Return the single settings document (or defaults)
  let doc = await Settings.findOne().lean();
  if (!doc) {
    // Provide reasonable defaults if not present
    doc = {
      siteName: 'ماتاجر - Matajir',
      siteDescription: 'منصة عربية لبيع البطاقات الرقمية والاشتراكات',
      logoUrl: '',
      footerText: 'جميع الحقوق محفوظة © ماتاجر',
      socialLinks: { facebook: '', twitter: '', instagram: '', telegram: '', youtube: '' }
    };
  }
  res.json(doc);
}));

app.put('/api/settings', asyncHandler(async (req, res) => {
  const payload = req.body || {};
  const updated = await Settings.findOneAndUpdate({}, payload, { upsert: true, new: true, setDefaultsOnInsert: true });
  res.json(updated);
}));

// Users & Auth
app.get('/api/users', asyncHandler(async (req, res) => {
  const users = await User.find();
  res.json(users);
}));

app.post('/api/auth/login', asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'البريد والكلمة المرورية مطلوبة' });
    }
    
    const user = await User.findOne({ email, password });
    if (!user) return res.status(401).json({ message: 'بيانات الدخول غير صحيحة' });
    res.json(user);
}));

app.post('/api/auth/register', asyncHandler(async (req, res) => {
    const { email, password, name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'البريد والكلمة المرورية مطلوبة' });
    }
    
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'البريد الإلكتروني مسجل مسبقاً' });
    
    const user = new User({ 
      id: `u-${Date.now()}`,
      email, 
      password, 
      name: name || 'مستخدم جديد',
      role: 'user'
    });
    await user.save();
    res.status(201).json(user);
}));

// Orders & Transaction Logic
app.get('/api/orders', asyncHandler(async (req, res) => {
  const orders = await Order.find();
  res.json(orders);
}));

app.post('/api/orders', asyncHandler(async (req, res) => {
    const { userId, items, total, paymentMethod } = req.body;
    
    if (!userId || !items || !total) {
      return res.status(400).json({ message: 'معلومات الطلب غير كاملة' });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const orderId = `ord-${Date.now()}`;
        const deliveryCodes = {};

        // Process each item
        for (const item of items) {
            const product = await Product.findOne({ id: item.id }).session(session);
            
            if (!product) throw new Error(`المنتج ${item.name} غير موجود`);
            if (product.stock < item.quantity) throw new Error(`الكمية المطلوبة من ${item.name} غير متوفرة`);

            // Deduct codes
            const codesToDeliver = [];
            
            for(let i = 0; i < item.quantity; i++) {
                if(product.availableCodes.length > 0) {
                    codesToDeliver.push(product.availableCodes.pop());
                } else {
                    codesToDeliver.push(`AUTO-${Math.random().toString(36).substr(2, 9).toUpperCase()}`);
                }
            }
            
            product.stock -= item.quantity;
            product.markModified('availableCodes'); 
            await product.save({ session });
            
            deliveryCodes[item.id] = codesToDeliver;
        }

        const order = new Order({
            id: orderId,
            userId,
            date: new Date().toISOString(),
            items,
            total,
            status: 'completed',
            deliveryCodes,
            paymentMethod: paymentMethod || 'unknown'
        });

        await order.save({ session });
        // Mark delivered codes as sold in Codes collection as well
        try {
          const allDeliveredCodes = Object.values(deliveryCodes).flat();
          if (allDeliveredCodes.length > 0) {
            await Code.updateMany(
              { productId: { $in: Object.keys(deliveryCodes) }, code: { $in: allDeliveredCodes } },
              {
                $set: {
                  status: 'sold',
                  soldAt: new Date(),
                  soldTo: userId || null,
                  orderId: orderId
                }
              },
              { session }
            );
          }
        } catch (err) {
          console.warn('Warning: failed to mark codes as sold in Codes collection', err.message);
        }

        await session.commitTransaction();
        res.status(201).json(order);

    } catch (error) {
        await session.abortTransaction();
        res.status(400).json({ message: error.message });
    } finally {
        session.endSession();
    }
}));

// Confirm Order (mark codes sold and create an order) - safer endpoint used by checkout flow
app.post('/api/orders/confirm', asyncHandler(async (req, res) => {
  const { productId, userId, quantity } = req.body || {};

  if (!productId || !userId || !quantity || quantity <= 0) {
    return res.status(400).json({ message: 'productId, userId and positive quantity are required' });
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // Fetch product to compute total and validate
    const product = await Product.findOne({ id: String(productId) }).session(session);
    if (!product) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'المنتج غير موجود' });
    }

    // Find available codes
    const codes = await Code.find({ productId: String(productId), status: 'available' }).limit(Number(quantity)).session(session);
    if (!codes || codes.length < Number(quantity)) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'لا يوجد أكواد كافية لهذا المنتج' });
    }

    // 1) Create Order document
    const orderId = `ord-${Date.now()}`;
    const items = [{ productId: String(productId), quantity: Number(quantity) }];
    const total = (product.price || 0) * Number(quantity);

    const order = new Order({
      id: orderId,
      userId: String(userId),
      date: new Date().toISOString(),
      items,
      total,
      status: 'completed',
      deliveryCodes: {},
      paymentMethod: 'Chargily Pay'
    });

    // 2) Attach codes to order.deliveryCodes
    order.deliveryCodes[String(productId)] = codes.map(c => c.code);
    await order.save({ session });

    // 3) Mark codes as sold
    const codeIds = codes.map(c => c._id);
    await Code.updateMany(
      { _id: { $in: codeIds } },
      {
        $set: {
          status: 'sold',
          soldAt: new Date(),
          soldTo: String(userId),
          orderId: order.id
        }
      },
      { session }
    );

    // 4) Update Product.availableCodes and stock to remove sold codes
    const soldCodeValues = codes.map(c => c.code);
    product.availableCodes = (product.availableCodes || []).filter(code => !soldCodeValues.includes(code));
    product.stock = (product.availableCodes || []).length;
    product.markModified('availableCodes');
    await product.save({ session });

    await session.commitTransaction();

    return res.json({ success: true, orderId: order.id, deliveryCodes: order.deliveryCodes });
  } catch (err) {
    await session.abortTransaction();
    console.error('confirmOrder error:', err);
    return res.status(500).json({ message: 'خطأ في تأكيد الطلب' });
  } finally {
    session.endSession();
  }
}));

// Update Order with PayPal ID
app.put('/api/orders/:orderId/paypal/:paypalOrderId', asyncHandler(async (req, res) => {
    const { orderId, paypalOrderId } = req.params;
    
    if (!orderId || !paypalOrderId) {
        return res.status(400).json({ message: 'معرّفات مطلوبة' });
    }
    
    const order = await Order.findOneAndUpdate(
        { id: orderId },
        { paypalOrderId },
        { new: true }
    );
    
    if (!order) {
        return res.status(404).json({ message: 'الطلب غير موجود' });
    }
    
    console.log(`✅ تم تحديث الطلب ${orderId} بـ PayPal ID: ${paypalOrderId}`);
    res.json(order);
}));

// Reviews
app.get('/api/reviews', asyncHandler(async (req, res) => {
  const reviews = await Review.find();
  res.json(reviews);
}));

app.post('/api/reviews', asyncHandler(async (req, res) => {
    const { productId, userId, userName, rating, comment } = req.body;
    
    if (!productId || !userId || !rating) {
      return res.status(400).json({ message: 'معلومات التقييم غير كاملة' });
    }
    
    const review = new Review({
      id: `rev-${Date.now()}`,
      productId,
      userId,
      userName: userName || 'مستخدم',
      rating,
      comment,
      date: new Date().toISOString()
    });
    
    await review.save();
    
    // Update product average rating
    const productReviews = await Review.find({ productId });
    const avg = productReviews.reduce((sum, r) => sum + r.rating, 0) / productReviews.length;
    
    await Product.findOneAndUpdate(
        { id: productId }, 
        { rating: Number(avg.toFixed(1)) }
    );
    
    res.status(201).json(review);
}));

// Admin editor endpoints removed — use local editor/IDE to modify source files.

// --- Chargily Pay Integration ---
app.post('/api/chargily/checkout', asyncHandler(async (req, res) => {
    const { amount, success_url, failure_url, description } = req.body;
    
    if (!amount) {
      return res.status(400).json({ message: 'المبلغ مطلوب' });
    }
    
    try {
        const amountDZD = Math.round(amount * 200);

        const response = await fetch('https://pay.chargily.net/test/api/v2/checkouts', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CHARGILY_SECRET_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: amountDZD,
                currency: 'dzd',
                description: description || 'شراء منتجات',
                success_url: success_url || 'http://localhost:3000/success',
                failure_url: failure_url || 'http://localhost:3000/failed'
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'فشل إنشاء جلسة الدفع');
        res.json({ checkout_url: data.checkout_url });

    } catch (error) {
        console.error('❌ Chargily Payment Error:', error.message);
        res.status(500).json({ message: error.message });
    }
}));

// --- PayPal Integration Helpers ---
async function getPayPalAccessToken() {
    try {
        const auth = Buffer.from(PAYPAL_CLIENT_ID + ':' + PAYPAL_CLIENT_SECRET).toString('base64');
        const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
            method: 'POST',
            body: 'grant_type=client_credentials',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        
        if (!response.ok) throw new Error('فشل الحصول على رمز الدخول');
        const data = await response.json();
        return data.access_token;
    } catch (error) {
        console.error('❌ PayPal Token Error:', error.message);
        throw error;
    }
}

app.post('/api/paypal/create-order', asyncHandler(async (req, res) => {
    const { amount, description } = req.body;
    
    if (!amount) {
      return res.status(400).json({ message: 'المبلغ مطلوب' });
    }
    
    try {
        const accessToken = await getPayPalAccessToken();
        
        const orderPayload = {
            intent: 'CAPTURE',
            purchase_units: [{
                description: description || 'شراء منتجات',
                amount: {
                    currency_code: 'USD',
                    value: Number(amount).toFixed(2)
                }
            }]
        };
        
        console.log('📤 Sending PayPal Create Order:', orderPayload);
        
        const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify(orderPayload)
        });

        const data = await response.json();
        
        if (!response.ok) {
            console.error('❌ PayPal Create Order Error Response:', data);
            throw new Error(data.message || data.details?.[0]?.issue || 'فشل إنشاء طلب PayPal');
        }
        
        console.log('✅ PayPal Order Created:', data.id);
        res.json(data);
    } catch (error) {
        console.error('❌ PayPal Create Order Error:', error.message);
        res.status(500).json({ error: error.message });
    }
}));

app.post('/api/paypal/capture-order', asyncHandler(async (req, res) => {
    const { orderID } = req.body;
    
    if (!orderID) {
      return res.status(400).json({ message: 'معرّف الطلب مطلوب' });
    }
    
    try {
        const accessToken = await getPayPalAccessToken();

        const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders/${orderID}/capture`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            }
        });

        const data = await response.json();
        
        if (!response.ok) {
            console.error('❌ PayPal Error Response:', data);
            throw new Error(data.message || data.details?.[0]?.issue || 'فشل تأكيد الطلب');
        }
        
        res.json(data);
    } catch (error) {
        console.error('❌ PayPal Capture Order Error:', error.message);
        res.status(500).json({ error: error.message });
    }
}));

// --- Global Error Handler ---
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);
  res.status(err.status || 500).json({
    message: err.message || 'خطأ في الخادم',
    timestamp: new Date().toISOString()
  });
});

// --- 404 Handler ---
app.use((req, res) => {
  res.status(404).json({ message: 'المسار غير موجود' });
});

// --- Start Server ---
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅ Server running on port ${PORT}`);
    console.log(`📝 API: https://backendpay-1.onrender.com/api`);
    console.log(`🏥 Health Check: https://backendpay-1.onrender.com/api/health`);
    seedData();
});

// --- Graceful Shutdown ---
process.on('SIGTERM', () => {
  console.log('⚠️ SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    mongoose.connection.close();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('⚠️ SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    mongoose.connection.close();
    process.exit(0);
  });
});
