/*
Integration test for /api/orders/confirm
Requires Node 18+ (global fetch available) or run with a fetch polyfill.

What it does:
1) POST /api/codes to add two test codes for product 'p1'
2) POST /api/orders/confirm to buy quantity=2 for user 'u2'
3) GET /api/codes?productId=p1&status=sold and verify sold codes include the ones delivered
4) GET /api/codes/stats/p1 and verify sold count increased

Usage (from repository root):
  node backend/tests/integration/confirm-order-test.mjs

You can override API base via env var API_BASE, e.g. in PowerShell:
  $env:API_BASE = 'https://backendpay-1.onrender.com'; node backend/tests/integration/confirm-order-test.mjs
*/

const API_BASE = process.env.API_BASE || 'https://backendpay-1.onrender.com';
let PRODUCT_ID = process.env.TEST_PRODUCT_ID || '';
const USER_ID = process.env.TEST_USER_ID || 'u2';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let AUTH_TOKEN = '';

async function postJson(path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (AUTH_TOKEN) headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

async function getJson(path) {
  const res = await fetch(`${API_BASE}${path}`);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

(async () => {
  console.log('Integration test: confirm-order');
  console.log('API_BASE =', API_BASE);

    // If no PRODUCT_ID provided, try to fetch available products from API and pick the first
    if (!PRODUCT_ID) {
      console.log('No TEST_PRODUCT_ID provided — fetching /api/products to pick a product');
      const prods = await getJson('/api/products');
      if (prods.status === 200 && Array.isArray(prods.body) && prods.body.length > 0) {
        PRODUCT_ID = prods.body[0].id;
        console.log('Selected product from API:', PRODUCT_ID, '-', prods.body[0].name);
      } else {
        console.log('No products returned from API, attempting to create a lightweight test product');
        const createResp = await postJson('/api/products', { id: `p_test_${Date.now()}`, name: 'TEST PRODUCT', description: 'autocreated for integration test', price: 11, category: 'cards', image: '', rating: 0, stock: 100, availableCodes: [] });
        if (createResp.status === 201) {
          PRODUCT_ID = createResp.body.id;
          console.log('Created test product:', PRODUCT_ID);
        } else {
          console.error('Failed to ensure a product exists for testing', createResp);
          process.exit(2);
        }
      }
    }

      // If admin credentials provided via env, login to obtain token for protected endpoints
      const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || 'admin@matajir.com';
      const ADMIN_PWD = process.env.TEST_ADMIN_PWD || '123';
      console.log('Logging in as admin to obtain token...');
      const loginResp = await postJson('/api/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PWD });
      if (loginResp.status === 200 && loginResp.body && loginResp.body.token) {
        AUTH_TOKEN = loginResp.body.token;
        console.log('Obtained admin token');
      } else {
        console.warn('Admin login failed or no token returned — continuing without auth (may fail on protected endpoints)');
      }

      // 1) Add codes (two unique codes)
    const testCodes = [`TEST-${Date.now()}-A`, `TEST-${Date.now()}-B`];
  console.log('Adding test codes:', testCodes);
  const addResp = await postJson('/api/codes', { productId: PRODUCT_ID, codes: testCodes });
  if (addResp.status !== 201) {
    console.error('Failed to add codes', addResp.status, addResp.body);
    process.exit(2);
  }
  console.log('Added codes:', addResp.body.codes ? addResp.body.codes.map(c => c.code) : testCodes);

  // Wait a moment for DB consistency
  await sleep(300);

  // 2) Confirm order (buy quantity = testCodes.length)
  const quantity = testCodes.length;
  console.log(`Creating order confirm for product ${PRODUCT_ID}, user ${USER_ID}, qty ${quantity}`);
  const confirmResp = await postJson('/api/orders/confirm', { productId: PRODUCT_ID, userId: USER_ID, quantity });
  if (confirmResp.status !== 200 && confirmResp.status !== 201) {
    console.error('confirm-order failed', confirmResp.status, confirmResp.body);
    process.exit(3);
  }
  console.log('confirm-order response:', confirmResp.body);

  const orderId = confirmResp.body.orderId || (confirmResp.body.order && confirmResp.body.order.id);
  if (!orderId) {
    console.error('Order id not returned');
    process.exit(4);
  }

  // 3) Verify codes marked sold
  await sleep(300);
  const soldResp = await getJson(`/api/codes?productId=${PRODUCT_ID}&status=sold`);
  if (soldResp.status !== 200) {
    console.error('Failed fetching sold codes', soldResp.status, soldResp.body);
    process.exit(5);
  }
  const soldCodes = Array.isArray(soldResp.body) ? soldResp.body.map(c => c.code) : [];
  console.log('Sold codes in DB (latest):', soldCodes.slice(0, 10));

  // Check that every delivery code in the order is present and marked sold
  const delivered = confirmResp.body.deliveryCodes && confirmResp.body.deliveryCodes[PRODUCT_ID];
  if (!delivered || delivered.length !== quantity) {
    console.error('Delivered codes not returned correctly in confirm response', delivered);
    process.exit(6);
  }

  const missing = delivered.filter(c => !soldCodes.includes(c));
  if (missing.length > 0) {
    console.error('Some delivered codes are NOT marked as sold in DB:', missing);
    process.exit(7);
  }

  console.log('All delivered codes are marked sold in DB ✅');

  // 4) Verify stats endpoint
  const statsResp = await getJson(`/api/codes/stats/${PRODUCT_ID}`);
  if (statsResp.status !== 200) {
    console.error('Failed to fetch stats', statsResp.status, statsResp.body);
    process.exit(8);
  }

  const stats = statsResp.body;
  console.log('Stats:', stats);

  if (!('sold' in stats) || stats.sold < quantity) {
    console.error('Stats sold count is incorrect:', stats);
    process.exit(9);
  }

  console.log('Stats show sold >=', quantity, '✅');

  console.log('\nINTEGRATION TEST PASSED');
  process.exit(0);
})();
