# Backend Startup Guide

## Quick Start

### 1. Install Dependencies
```powershell
cd backend
npm install
```

### 2. Configure Environment
```powershell
# Copy the template
Copy-Item .env.example .env

# Edit .env with your credentials
notepad .env
```

Required settings:
- `MONGO_URI` - Your MongoDB connection string
- `CHARGILY_SECRET_KEY` - Get from https://dashboard.chargily.net
- `PAYPAL_CLIENT_ID` & `PAYPAL_CLIENT_SECRET` - Get from https://developer.paypal.com

### 3. Start the Server
```powershell
npm start
```

Or with hot-reload (development):
```powershell
npm run dev
```

### 4. Verify Server is Running
```powershell
# Check health endpoint
curl http://localhost:5000/api/health

# Or open in browser
Start-Process http://localhost:5000/api/health
```

Expected response:
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2025-12-04T10:30:00.000Z"
}
```

## MongoDB Setup (Local Development)

### Option 1: Local MongoDB
```powershell
# Install MongoDB Community
# https://docs.mongodb.com/manual/tutorial/install-mongodb-on-windows/

# Start service
net start MongoDB

# Verify connection
mongosh
```

### Option 2: Docker
```powershell
# Start MongoDB container
docker run -d -p 27017:27017 --name mongodb mongo:latest

# Verify
docker ps
```

### Option 3: MongoDB Atlas (Cloud)
1. Create free account at https://www.mongodb.com/cloud/atlas
2. Create a cluster
3. Get connection string from "Connect" button
4. Add to `.env`:
```
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/paytest?retryWrites=true&w=majority
```

## Default Test Accounts

```
Admin Account:
  Email: admin@matajir.com
  Password: 123

User Account:
  Email: user@matajir.com
  Password: 123
```

## Testing Endpoints

### Login as Admin
```powershell
$body = @{
    email = "admin@matajir.com"
    password = "123"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:5000/api/auth/login" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body $body
```

### Get All Products
```powershell
Invoke-WebRequest http://localhost:5000/api/products | ConvertFrom-Json
```

### Create Order
```powershell
$body = @{
    userId = "u1"
    items = @(
        @{id = "p1"; name = "iTunes Card"; quantity = 1; price = 100}
    )
    total = 100
    paymentMethod = "Wallet"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:5000/api/orders" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body $body
```

## Troubleshooting

### MongoDB Connection Error
```
❌ MongoDB Connection Error: connect ECONNREFUSED 127.0.0.1:27017
```
**Solution:**
- Make sure MongoDB is running
- Check `MONGO_URI` in `.env`
- If using Atlas, verify whitelist IP and connection string

### Port Already in Use
```
Error: listen EADDRINUSE: address already in use :::5000
```
**Solution:**
```powershell
# Find process using port 5000
Get-Process | Where-Object {$_.ProcessName -like "*node*"}

# Kill the process
Stop-Process -Id <PID> -Force

# Or use different port
$env:PORT=5001; npm start
```

### CORS Errors
Make sure frontend is using correct API URL:
```javascript
// In frontend services, use:
const API_URL = 'https://backendpay-1.onrender.com/api'
```

## Production Deployment

### Heroku
```powershell
# Initialize Heroku
heroku login
heroku create your-app-name
heroku addons:create mongolab

# Deploy
git push heroku main

# View logs
heroku logs --tail
```

### Environment Variables
Set these on your hosting platform:
- `MONGO_URI`
- `CHARGILY_SECRET_KEY`
- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `NODE_ENV=production`

## API Documentation

See `README.md` for complete API reference.

---
Need help? Check the logs:
```powershell
# View real-time logs
npm start
```
