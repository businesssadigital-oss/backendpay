const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// Simple .env parser (no new deps)
function readEnv(envPath) {
  try {
    const raw = fs.readFileSync(envPath, 'utf8');
    const lines = raw.split(/\r?\n/);
    const out = {};
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1).trim();
      // strip optional surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      out[key] = val;
    }
    return out;
  } catch (err) {
    return {};
  }
}

async function migrate() {
  const repoRoot = path.resolve(__dirname);
  const env = readEnv(path.join(repoRoot, '.env'));

  const sourceUri = process.env.SOURCE_MONGO || 'https://backendpay-1.onrender.com/paytest';
  const targetUri = process.env.MONGO_URI || env.MONGO_URI;

  if (!targetUri) {
    console.error('Target MONGO_URI not found. Please set it in backend/.env or export MONGO_URI.');
    process.exit(1);
  }

  console.log('Source URI:', sourceUri);
  console.log('Target URI:', targetUri.replace(/(?<=:\/\/.*:).*@/, '****@'));

  // Create two separate mongoose connections and wait until connected
  const srcConn = mongoose.createConnection(sourceUri, {
    // tighter timeouts in case of network issues
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
  });
  await srcConn.asPromise();

  const tgtConn = mongoose.createConnection(targetUri, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 20000,
  });
  await tgtConn.asPromise();

  try {
    const srcDb = srcConn.db;
    const tgtDb = tgtConn.db;

    const collections = await srcDb.listCollections().toArray();
    if (!collections.length) {
      console.log('No collections found in source DB. Nothing to migrate.');
      return;
    }

    for (const collInfo of collections) {
      const name = collInfo.name;
      console.log('\n--- Migrating collection:', name);

      const srcColl = srcDb.collection(name);
      const tgtColl = tgtDb.collection(name);

      // Drop target collection if exists to avoid duplicates
      const existing = await tgtDb.listCollections({ name }).toArray();
      if (existing.length) {
        console.log('Dropping existing target collection:', name);
        await tgtColl.drop().catch(() => {});
      }

      // Copy indexes
      const indexes = await srcColl.indexes();
      // Fetch documents in batches
      const cursor = srcColl.find({});
      const batchSize = 1000;
      let docsBatch = [];
      let total = 0;
      while (await cursor.hasNext()) {
        const doc = await cursor.next();
        // Remove _id to allow Mongo to keep it, but we want to preserve original _id, so keep it
        docsBatch.push(doc);
        if (docsBatch.length >= batchSize) {
          await tgtColl.insertMany(docsBatch, { ordered: false }).catch(e => console.error('InsertMany error:', e.message));
          total += docsBatch.length;
          console.log(`Inserted ${total} documents so far...`);
          docsBatch = [];
        }
      }
      if (docsBatch.length) {
        await tgtColl.insertMany(docsBatch, { ordered: false }).catch(e => console.error('InsertMany error:', e.message));
        total += docsBatch.length;
      }
      console.log(`Finished inserting ${total} documents into ${name}`);

      // Recreate indexes on target (skip default _id)
      for (const idx of indexes) {
        try {
          if (idx.name === '_id_') continue;
          const key = idx.key;
          const options = { ...idx };
          delete options.key;
          // ensure we don't try to recreate index on a dropped collection during migration
          await tgtColl.createIndex(key, options);
          console.log('Created index', idx.name);
        } catch (err) {
          console.warn('Could not create index', idx.name, err.message);
        }
      }
    }

    console.log('\nMigration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err.message);
  } finally {
    await srcConn.close().catch(() => {});
    await tgtConn.close().catch(() => {});
    process.exit(0);
  }
}

migrate().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
