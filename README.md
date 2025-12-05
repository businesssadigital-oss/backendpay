# Diziri Pay - Backend Server

Express.js + MongoDB API server for the Diziri Pay digital products marketplace.

## Features

✅ **REST API** - Full CRUD operations for products, orders, users, payments
✅ **MongoDB Integration** - Persistent data storage with Mongoose ODM
✅ **Payment Processing** - Chargily Pay & PayPal integration
✅ **Authentication** - User login and registration
✅ **Digital Code Management** - Inventory system for game codes and gift cards
✅ **Order Management** - Transaction processing with automatic code delivery
✅ **Reviews System** - Product ratings and reviews

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB (local or Atlas)
- **ORM**: Mongoose
- **Payment**: Chargily Pay, PayPal
- **Middleware**: CORS, body-parser

## Installation

### Prerequisites

- Node.js 16+ 
- MongoDB (local or Atlas connection string)
- PayPal and Chargily Pay API credentials

### Setup

1. **Install dependencies:**
```bash
npm install
```

2. **Configure environment:**
```bash
# Copy template
cp .env.example .env

# Edit .env with your credentials
# MONGO_URI, CHARGILY keys, PAYPAL keys
```

3. **Start the server:**
```bash
# Development
npm run dev

# Production
npm start
```

Server runs on `http://localhost:5000` by default.

## API Endpoints

### Health Check
```
GET /api/health
```

### Products
```
GET    /api/products                    # List all products
POST   /api/products                    # Create product (admin)
PUT    /api/products/:id                # Update product (admin)
DELETE /api/products/:id                # Delete product (admin)
POST   /api/products/:id/codes          # Add codes to product (admin)
```

### Categories
```
GET    /api/categories                  # List categories
POST   /api/categories                  # Create category (admin)
DELETE /api/categories/:id              # Delete category (admin)
```

### Authentication
```
POST   /api/auth/login                  # User login
POST   /api/auth/register               # User registration
```

### Orders
```
GET    /api/orders                      # List all orders
POST   /api/orders                      # Create order (checkout)
PUT    /api/orders/:orderId/paypal/:paypalOrderId  # Update with PayPal ID
```

### Payment Methods
```
GET    /api/payment-methods             # List payment methods
PUT    /api/payment-methods/:id         # Update payment method (admin)
```

### Reviews
```
GET    /api/reviews                     # List all reviews
POST   /api/reviews                     # Add review
```

### Digital Codes
```
GET    /api/codes                       # List codes
GET    /api/codes/stats/:productId      # Code statistics
POST   /api/codes                       # Add codes
PUT    /api/codes/:id                   # Mark code as sold
DELETE /api/codes/:id                   # Delete code
```

### Payment Processing
```
POST   /api/chargily/checkout           # Create Chargily Pay session
POST   /api/paypal/create-order         # Create PayPal order
POST   /api/paypal/capture-order        # Capture PayPal payment
```

## Database Schema

### Product
```javascript
{
  id: String,
  name: String,
  description: String,
  price: Number,
  category: String,
  image: String,
  rating: Number,
  stock: Number,
  availableCodes: [String]
}
```

### User
```javascript
{
  id: String,
  name: String,
  email: String,
  password: String, // Should be hashed in production
  role: String, // 'user' or 'admin'
  balance: Number
}
```

### Order
```javascript
{
  id: String,
  userId: String,
  date: String (ISO),
  items: Array,
  total: Number,
  status: String,
  deliveryCodes: Object,
  paymentMethod: String,
  paypalOrderId: String
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 5000 | Server port |
| `MONGO_URI` | mongodb://127.0.0.1:27017/paytest | MongoDB connection |
| `CHARGILY_PUBLIC_KEY` | - | Chargily API public key |
| `CHARGILY_SECRET_KEY` | - | Chargily API secret key |
| `PAYPAL_CLIENT_ID` | - | PayPal client ID |
| `PAYPAL_CLIENT_SECRET` | - | PayPal client secret |

## Default Credentials (Development)

```
Email: admin@matajir.com
Password: 123
Role: admin

Email: user@matajir.com
Password: 123
Role: user
```

⚠️ **Change these in production!**

## Error Handling

The API returns standardized error responses:

```json
{
  "message": "Error description in Arabic",
  "timestamp": "2025-12-04T10:30:00.000Z"
}
```

## MongoDB Setup

### Local Development
```bash
# Start MongoDB service
mongod

# Or with Docker
docker run -d -p 27017:27017 -e MONGO_INITDB_ROOT_USERNAME=admin -e MONGO_INITDB_ROOT_PASSWORD=password mongo
```

### Production (MongoDB Atlas)
1. Create cluster at https://www.mongodb.com/cloud/atlas
2. Copy connection string
3. Add to `.env`:
```
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/paytest?retryWrites=true&w=majority
```

## Deployment

### Heroku
```bash
git push heroku main
```

### Railway / Render
Connect your Git repository and deploy automatically.

### Docker
```bash
docker build -t diziri-pay-backend .
docker run -p 5000:5000 -e MONGO_URI=... diziri-pay-backend
```

## Security Notes

⚠️ **Development only - Not production ready**

- Passwords are stored in plaintext (hash in production)
- Admin endpoints removed (implement proper authentication)
- Use HTTPS only in production
- Implement rate limiting
- Add input validation and sanitization
- Secure environment variables

## License

MIT
