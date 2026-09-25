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

async function withDb(fn) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_NOT_SET');

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function initDb() {
  return withDb(async (c) => {
    await c.query(`
      CREATE TABLE IF NOT EXISTS products (
        id BIGSERIAL PRIMARY KEY,
        sku TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        unit TEXT,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
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
      CREATE TABLE IF NOT EXISTS orders (
        id BIGSERIAL PRIMARY KEY,
        order_no TEXT UNIQUE NOT NULL,
        customer_id BIGINT REFERENCES customers(id),
        status TEXT NOT NULL DEFAULT 'NEW',
        payment_status TEXT NOT NULL DEFAULT 'PAYMENT_PENDING',
        total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await c.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id BIGSERIAL PRIMARY KEY,
        order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id BIGINT NOT NULL REFERENCES products(id),
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        unit_price NUMERIC(12,2) NOT NULL DEFAULT 0
      )
    `);

    await c.query(`
      CREATE TABLE IF NOT EXISTS inventory_lots (
        id BIGSERIAL PRIMARY KEY,
        product_id BIGINT NOT NULL REFERENCES products(id),
        lot_no TEXT NOT NULL,
        expiry_date DATE,
        quantity_on_hand INTEGER NOT NULL DEFAULT 0,
        quantity_reserved INTEGER NOT NULL DEFAULT 0,
        UNIQUE(product_id, lot_no)
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
      CREATE TABLE IF NOT EXISTS dealer_ledger (
        id BIGSERIAL PRIMARY KEY,
        dealer_id BIGINT NOT NULL REFERENCES dealers(id),
        entry_type TEXT NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        reference_no TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await c.query(`
      CREATE TABLE IF NOT EXISTS return_requests (
        id BIGSERIAL PRIMARY KEY,
        return_no TEXT UNIQUE NOT NULL,
        order_id BIGINT REFERENCES orders(id),
        status TEXT NOT NULL DEFAULT 'REQUESTED',
        qc_result TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await c.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id BIGSERIAL PRIMARY KEY,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT,
        entity_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const seed = [
      ['TREX-TEA-60', 'Trex Tea', '60 saşe'],
      ['TREX-COFFEE-30', 'Trex Coffee', '30 saşe'],
      ['TREX-CAP-30', 'Trex Cap', '30 kapsül'],
      ['LIPOTEX-60', 'Lipotex Tea', '60 adet'],
      ['TREX-JEL', 'Trex Jel', '1 adet']
    ];

    for (const p of seed) {
      await c.query(
        `INSERT INTO products(sku, name, unit)
         VALUES($1, $2, $3)
         ON CONFLICT (sku) DO NOTHING`,
        p
      );
    }

    return { ok: true };
  });
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/health') {
      return json(res, 200, {
        ok: true,
        service: 'trex-platform-core-db-v2'
      });
    }

    if (url.pathname === '/db-status') {
      const row = await withDb(async (c) => {
        const result = await c.query(
          'SELECT current_database() db, NOW() ts'
        );
        return result.rows[0];
      });

      return json(res, 200, {
        connected: true,
        database: row.db,
        time: row.ts
      });
    }

    if (url.pathname === '/init-db') {
      return json(res, 200, await initDb());
    }

    if (url.pathname === '/api/v1/products') {
      const rows = await withDb(async (c) => {
        const result = await c.query(`
          SELECT id, sku, name, unit, active
          FROM products
          ORDER BY id
        `);

        return result.rows;
      });

      return json(res, 200, {
        success: true,
        data: rows
      });
    }

    return json(res, 200, {
      service: 'Trex Platform Core DB v2',
      routes: [
        '/health',
        '/db-status',
        '/init-db',
        '/api/v1/products'
      ]
    });
  } catch (e) {
    return json(res, 500, {
      ok: false,
      error: e.message
    });
  }
}).listen(port, '0.0.0.0');
