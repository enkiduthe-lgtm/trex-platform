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
      ADD COLUMN IF NOT EXISTS price NUMERIC(12,2) NOT NULL DEFAULT 0
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
        payment_method TEXT,
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
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await c.query(`
      CREATE TABLE IF NOT EXISTS return_requests (
        id BIGSERIAL PRIMARY KEY,
        return_no TEXT UNIQUE NOT NULL,
        order_id BIGINT REFERENCES orders(id),
        status TEXT NOT NULL DEFAULT 'REQUESTED',
        reason TEXT,
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
        details JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const products = [
      ['TREX-TEA-60', 'Trex Tea', '60 saşe'],
      ['TREX-COFFEE-30', 'Trex Coffee', '30 saşe'],
      ['TREX-CAP-30', 'Trex Cap', '30 kapsül'],
      ['LIPOTEX-60', 'Lipotex Tea', '60 adet'],
      ['TREX-JEL', 'Trex Jel', '1 adet']
    ];

    for (const p of products) {
      await c.query(
        `
        INSERT INTO products (sku, name, unit)
        VALUES ($1, $2, $3)
        ON CONFLICT (sku) DO NOTHING
        `,
        p
      );
    }

    return { ok: true };
  });
}

async function audit(c, actor, action, entityType, entityId, details = {}) {
  await c.query(
    `
    INSERT INTO audit_logs
    (actor, action, entity_type, entity_id, details)
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

async function createOrder(body) {
  return withDb(async c => {
    await c.query('BEGIN');

    try {
      if (!body.customer_id) {
        throw new Error('CUSTOMER_ID_REQUIRED');
      }

      if (!Array.isArray(body.items) || body.items.length === 0) {
        throw new Error('ORDER_ITEMS_REQUIRED');
      }

      const orderNo =
        'TRX-' +
        Date.now().toString().slice(-10);

      let total = 0;

      const calculatedItems = [];

      for (const item of body.items) {
        const productResult = await c.query(
          `
          SELECT id, name, price
          FROM products
          WHERE id = $1
          AND active = TRUE
          `,
          [item.product_id]
        );

        if (!productResult.rowCount) {
          throw new Error('PRODUCT_NOT_FOUND');
        }

        const product = productResult.rows[0];
        const quantity = Number(item.quantity);

        if (!Number.isInteger(quantity) || quantity <= 0) {
          throw new Error('INVALID_QUANTITY');
        }

        const unitPrice =
          item.unit_price !== undefined
            ? Number(item.unit_price)
            : Number(product.price);

        total += unitPrice * quantity;

        calculatedItems.push({
          product_id: product.id,
          quantity,
          unit_price: unitPrice
        });
      }

      const orderResult = await c.query(
        `
        INSERT INTO orders
        (
          order_no,
          customer_id,
          status,
          payment_status,
          payment_method,
          total_amount
        )
        VALUES
        ($1,$2,'NEW','PAYMENT_PENDING',$3,$4)
        RETURNING *
        `,
        [
          orderNo,
          body.customer_id,
          body.payment_method || 'MOCK',
          total
        ]
      );

      const order = orderResult.rows[0];

      for (const item of calculatedItems) {
        await c.query(
          `
          INSERT INTO order_items
          (order_id, product_id, quantity, unit_price)
          VALUES ($1,$2,$3,$4)
          `,
          [
            order.id,
            item.product_id,
            item.quantity,
            item.unit_price
          ]
        );
      }

      await audit(
        c,
        'demo-api',
        'ORDER_CREATED',
        'order',
        order.id,
        { order_no: order.order_no }
      );

      await c.query('COMMIT');

      return order;
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    }
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');

    if (req.method === 'GET' && url.pathname === '/') {
      return json(res, 200, {
        service: 'Trex Platform Core API',
        version: '1.0.0-demo.12',
        database: 'PostgreSQL',
        environment: 'demo',
        payment_provider: 'mock',
        shipping_provider: 'mock'
      });
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, {
        ok: true,
        service: 'trex-platform-core-api'
      });
    }

    if (req.method === 'GET' && url.pathname === '/db-status') {
      const row = await withDb(async c => {
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

    if (req.method === 'GET' && url.pathname === '/init-db') {
      return json(res, 200, await initDb());
    }

    if (
      req.method === 'GET' &&
      url.pathname === '/api/v1/products'
    ) {
      const rows = await withDb(async c => {
        const r = await c.query(`
          SELECT
            id,
            sku,
            name,
            unit,
            price,
            active
          FROM products
          ORDER BY id
        `);

        return r.rows;
      });

      return json(res, 200, {
        success: true,
        data: rows
      });
    }

    if (
      req.method === 'POST' &&
      url.pathname === '/api/v1/customers'
    ) {
      const body = await readBody(req);

      if (!body.full_name) {
        throw new Error('FULL_NAME_REQUIRED');
      }

      const customer = await withDb(async c => {
        const r = await c.query(
          `
          INSERT INTO customers
          (full_name, email, phone)
          VALUES ($1,$2,$3)
          RETURNING *
          `,
          [
            body.full_name,
            body.email || null,
            body.phone || null
          ]
        );

        await audit(
          c,
          'demo-api',
          'CUSTOMER_CREATED',
          'customer',
          r.rows[0].id
        );

        return r.rows[0];
      });

      return json(res, 201, {
        success: true,
        data: customer
      });
    }

    if (
      req.method === 'GET' &&
      url.pathname === '/api/v1/customers'
    ) {
      const rows = await withDb(async c => {
        const r = await c.query(`
          SELECT *
          FROM customers
          ORDER BY id DESC
        `);

        return r.rows;
      });

      return json(res, 200, {
        success: true,
        data: rows
      });
    }

    if (
      req.method === 'POST' &&
      url.pathname === '/api/v1/orders'
    ) {
      const body = await readBody(req);
      const order = await createOrder(body);

      return json(res, 201, {
        success: true,
        data: order
      });
    }

    if (
      req.method === 'GET' &&
      url.pathname === '/api/v1/orders'
    ) {
      const rows = await withDb(async c => {
        const r = await c.query(`
          SELECT
            o.*,
            c.full_name AS customer_name
          FROM orders o
          LEFT JOIN customers c
            ON c.id = o.customer_id
          ORDER BY o.id DESC
        `);

        return r.rows;
      });

      return json(res, 200, {
        success: true,
        data: rows
      });
    }

    if (
      req.method === 'POST' &&
      url.pathname === '/api/v1/inventory/lots'
    ) {
      const body = await readBody(req);

      const lot = await withDb(async c => {
        const r = await c.query(
          `
          INSERT INTO inventory_lots
          (
            product_id,
            lot_no,
            expiry_date,
            quantity_on_hand
          )
          VALUES ($1,$2,$3,$4)
          RETURNING *
          `,
          [
            body.product_id,
            body.lot_no,
            body.expiry_date || null,
            Number(body.quantity_on_hand || 0)
          ]
        );

        await audit(
          c,
          'demo-api',
          'INVENTORY_LOT_CREATED',
          'inventory_lot',
          r.rows[0].id
        );

        return r.rows[0];
      });

      return json(res, 201, {
        success: true,
        data: lot
      });
    }

    if (
      req.method === 'GET' &&
      url.pathname === '/api/v1/inventory/lots'
    ) {
      const rows = await withDb(async c => {
        const r = await c.query(`
          SELECT
            l.*,
            p.name AS product_name,
            p.sku
          FROM inventory_lots l
          JOIN products p
            ON p.id = l.product_id
          ORDER BY
            l.expiry_date NULLS LAST,
            l.id
        `);

        return r.rows;
      });

      return json(res, 200, {
        success: true,
        data: rows
      });
    }

    if (
      req.method === 'POST' &&
      url.pathname === '/api/v1/dealers'
    ) {
      const body = await readBody(req);

      const dealer = await withDb(async c => {
        const r = await c.query(
          `
          INSERT INTO dealers
          (code, name, dealer_level, status)
          VALUES ($1,$2,$3,$4)
          RETURNING *
          `,
          [
            body.code,
            body.name,
            Number(body.dealer_level || 1),
            body.status || 'ACTIVE'
          ]
        );

        await audit(
          c,
          'demo-api',
          'DEALER_CREATED',
          'dealer',
          r.rows[0].id
        );

        return r.rows[0];
      });

      return json(res, 201, {
        success: true,
        data: dealer
      });
    }

    if (
      req.method === 'GET' &&
      url.pathname === '/api/v1/dealers'
    ) {
      const rows = await withDb(async c => {
        const r = await c.query(`
          SELECT *
          FROM dealers
          ORDER BY id DESC
        `);

        return r.rows;
      });

      return json(res, 200, {
        success: true,
        data: rows
      });
    }

    if (
      req.method === 'POST' &&
      url.pathname === '/api/v1/dealer-ledger'
    ) {
      const body = await readBody(req);

      const row = await withDb(async c => {
        const r = await c.query(
          `
          INSERT INTO dealer_ledger
          (
            dealer_id,
            entry_type,
            amount,
            reference_no,
            description
          )
          VALUES ($1,$2,$3,$4,$5)
          RETURNING *
          `,
          [
            body.dealer_id,
            body.entry_type,
            body.amount,
            body.reference_no || null,
            body.description || null
          ]
        );

        await audit(
          c,
          'demo-api',
          'DEALER_LEDGER_CREATED',
          'dealer_ledger',
          r.rows[0].id
        );

        return r.rows[0];
      });

      return json(res, 201, {
        success: true,
        data: row
      });
    }

    if (
      req.method === 'GET' &&
      url.pathname === '/api/v1/dealer-ledger'
    ) {
      const rows = await withDb(async c => {
        const r = await c.query(`
          SELECT
            dl.*,
            d.name AS dealer_name,
            d.code AS dealer_code
          FROM dealer_ledger dl
          JOIN dealers d
            ON d.id = dl.dealer_id
          ORDER BY dl.id DESC
        `);

        return r.rows;
      });

      return json(res, 200, {
        success: true,
        data: rows
      });
    }

    if (
      req.method === 'POST' &&
      url.pathname === '/api/v1/returns'
    ) {
      const body = await readBody(req);

      const returnNo =
        'RET-' +
        Date.now().toString().slice(-10);

      const row = await withDb(async c => {
        const r = await c.query(
          `
          INSERT INTO return_requests
          (
            return_no,
            order_id,
            status,
            reason
          )
          VALUES ($1,$2,'REQUESTED',$3)
          RETURNING *
          `,
          [
            returnNo,
            body.order_id,
            body.reason || null
          ]
        );

        await audit(
          c,
          'demo-api',
          'RETURN_REQUEST_CREATED',
          'return_request',
          r.rows[0].id
        );

        return r.rows[0];
      });

      return json(res, 201, {
        success: true,
        data: row
      });
    }

    if (
      req.method === 'GET' &&
      url.pathname === '/api/v1/returns'
    ) {
      const rows = await withDb(async c => {
        const r = await c.query(`
          SELECT *
          FROM return_requests
          ORDER BY id DESC
        `);

        return r.rows;
      });

      return json(res, 200, {
        success: true,
        data: rows
      });
    }

    if (
      req.method === 'GET' &&
      url.pathname === '/api/v1/audit-logs'
    ) {
      const rows = await withDb(async c => {
        const r = await c.query(`
          SELECT *
          FROM audit_logs
          ORDER BY id DESC
          LIMIT 100
        `);

        return r.rows;
      });

      return json(res, 200, {
        success: true,
        data: rows
      });
    }

    return json(res, 404, {
      success: false,
      error: 'NOT_FOUND'
    });

  } catch (e) {
    console.error(e);

    return json(res, 500, {
      success: false,
      error: e.message
    });
  }
});

server.listen(port, '0.0.0.0', async () => {
  console.log('Trex Platform Core API running on port', port);

  try {
    await initDb();
    console.log('Database schema ready');
  } catch (e) {
    console.error('Database initialization failed:', e.message);
  }
});
