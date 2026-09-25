const http = require('http');
const { Client } = require('pg');

const port = process.env.PORT || 10000;

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';

    req.on('data', chunk => {
      data += chunk;

      if (data.length > 1_000_000) {
        reject(new Error('BODY_TOO_LARGE'));
        req.destroy();
      }
    });

    req.on('end', () => {
      if (!data) return resolve({});

      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error('INVALID_JSON'));
      }
    });

    req.on('error', reject);
  });
}

async function withDb(fn) {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL_NOT_SET');
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  await client.connect();

  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function audit(
  c,
  actor,
  action,
  entityType,
  entityId,
  details = {}
) {
  await c.query(
    `
    INSERT INTO audit_logs
    (
      actor,
      action,
      entity_type,
      entity_id,
      details
    )
    VALUES ($1,$2,$3,$4,$5)
    `,
    [
      actor,
      action,
      entityType,
      String(entityId || ''),
      JSON.stringify(details)
    ]
  );
}

async function initDb() {
  return withDb(async c => {
    await c.query(`
      CREATE TABLE IF NOT EXISTS products (
        id BIGSERIAL PRIMARY KEY,
        sku TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        unit TEXT,
        price NUMERIC(12,2) NOT NULL DEFAULT 0,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await c.query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS price
      NUMERIC(12,2) NOT NULL DEFAULT 0
    `);

    await c.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id BIGSERIAL PRIMARY KEY,
        full_name TEXT NOT NULL,
        email TEXT UNIQUE,
        phone TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await c.query(`
      CREATE TABLE IF NOT EXISTS dealers (
        id BIGSERIAL PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        dealer_level INTEGER NOT NULL DEFAULT 1
          CHECK (dealer_level BETWEEN 1 AND 4),
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await c.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id BIGSERIAL PRIMARY KEY,
        order_no TEXT UNIQUE NOT NULL,
        customer_id BIGINT REFERENCES customers(id),
        dealer_id BIGINT REFERENCES dealers(id),
        status TEXT NOT NULL DEFAULT 'NEW',
        payment_status TEXT NOT NULL DEFAULT 'PAYMENT_PENDING',
        payment_method TEXT,
        total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await c.query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS dealer_id
      BIGINT REFERENCES dealers(id)
    `);

    await c.query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS updated_at
      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    `);

    await c.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id BIGSERIAL PRIMARY KEY,
        order_id BIGINT NOT NULL
          REFERENCES orders(id) ON DELETE CASCADE,
        product_id BIGINT NOT NULL
          REFERENCES products(id),
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        unit_price NUMERIC(12,2) NOT NULL DEFAULT 0
      )
    `);

    await c.query(`
      CREATE TABLE IF NOT EXISTS inventory_lots (
        id BIGSERIAL PRIMARY KEY,
        product_id BIGINT NOT NULL
          REFERENCES products(id),
        lot_no TEXT NOT NULL,
        expiry_date DATE,
        quantity_on_hand INTEGER NOT NULL DEFAULT 0,
        quantity_reserved INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(product_id, lot_no),
        CHECK (quantity_on_hand >= 0),
        CHECK (quantity_reserved >= 0),
        CHECK (quantity_reserved <= quantity_on_hand)
      )
    `);

    await c.query(`
      CREATE TABLE IF NOT EXISTS order_inventory_allocations (
        id BIGSERIAL PRIMARY KEY,
        order_id BIGINT NOT NULL
          REFERENCES orders(id) ON DELETE CASCADE,
        order_item_id BIGINT NOT NULL
          REFERENCES order_items(id) ON DELETE CASCADE,
        inventory_lot_id BIGINT NOT NULL
          REFERENCES inventory_lots(id),
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        consumed BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await c.query(`
      CREATE TABLE IF NOT EXISTS order_status_history (
        id BIGSERIAL PRIMARY KEY,
        order_id BIGINT NOT NULL
          REFERENCES orders(id) ON DELETE CASCADE,
        old_status TEXT,
        new_status TEXT NOT NULL,
        actor TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await c.query(`
      CREATE TABLE IF NOT EXISTS dealer_commission_rules (
        id BIGSERIAL PRIMARY KEY,
        product_id BIGINT NOT NULL REFERENCES products(id),
        dealer_level INTEGER NOT NULL
          CHECK (dealer_level BETWEEN 1 AND 4),
        amount_per_unit NUMERIC(12,2)
          NOT NULL DEFAULT 0,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        UNIQUE(product_id, dealer_level)
      )
    `);

    await c.query(`
      CREATE TABLE IF NOT EXISTS dealer_ledger (
        id BIGSERIAL PRIMARY KEY,
        dealer_id BIGINT NOT NULL
          REFERENCES dealers(id),
        order_id BIGINT REFERENCES orders(id),
        entry_type TEXT NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        reference_no TEXT,
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await c.query(`
      ALTER TABLE dealer_ledger
      ADD COLUMN IF NOT EXISTS order_id
      BIGINT REFERENCES orders(id)
    `);

    await c.query(`
      CREATE TABLE IF NOT EXISTS return_requests (
        id BIGSERIAL PRIMARY KEY,
        return
