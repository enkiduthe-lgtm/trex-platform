const http = require('http');
const crypto = require('crypto');
const { Client } = require('pg');

const port = process.env.PORT || 10000;
const SESSION_HOURS = 12;

function send(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization'
  });
  res.end(JSON.stringify(data));
}

function body(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => raw += c);
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error('INVALID_JSON')); }
    });
    req.on('error', reject);
  });
}

async function db(fn) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_NOT_SET');

  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  await c.connect();

  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

async function audit(c, action, type, id, details = {}) {
  await c.query(
    `INSERT INTO audit_logs(actor,action,entity_type,entity_id,details)
     VALUES('demo-api',$1,$2,$3,$4)`,
    [action, type, String(id), JSON.stringify(details)]
  );
}

function hashPassword(
  password,
  salt = crypto.randomBytes(16).toString('hex')
) {
  const hash = crypto
    .scryptSync(password, salt, 64)
    .toString('hex');

  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) {
    return false;
  }

  const [salt, expectedHex] =
    stored.split(':');

  const actual =
    crypto.scryptSync(
      password,
      salt,
      64
    );

  const expected =
    Buffer.from(
      expectedHex,
      'hex'
    );

  return (
    expected.length === actual.length &&
    crypto.timingSafeEqual(
      expected,
      actual
    )
  );
}

function newToken() {
  return crypto
    .randomBytes(32)
    .toString('hex');
}

function tokenHash(token) {
  return crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
}

function bearer(req) {
  const h =
    req.headers.authorization || '';

  return h.startsWith('Bearer ')
    ? h.slice(7).trim()
    : null;
}

async function getAuth(req) {
  const token =
    bearer(req);

  if (!token) {
    return null;
  }

  return db(async c => {
    const r =
      await c.query(
        `SELECT
           u.id,
           u.email,
           u.full_name,
           u.role,
           u.dealer_id,
           u.customer_id
         FROM auth_sessions s
         JOIN app_users u
           ON u.id=s.user_id
         WHERE
           s.token_hash=$1
           AND s.revoked_at IS NULL
           AND s.expires_at>NOW()
           AND u.active=TRUE`,
        [
          tokenHash(token)
        ]
      );

    return r.rows[0] || null;
  });
}

async function initDb() {
  return db(async c => {

    await c.query(`
      CREATE TABLE IF NOT EXISTS products(
        id BIGSERIAL PRIMARY KEY,
        sku TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        unit TEXT,
        price NUMERIC(12,2) NOT NULL DEFAULT 0,
        active BOOLEAN NOT NULL DEFAULT TRUE
      );

      CREATE TABLE IF NOT EXISTS customers(
        id BIGSERIAL PRIMARY KEY,
        full_name TEXT NOT NULL,
        email TEXT UNIQUE,
        phone TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS dealers(
        id BIGSERIAL PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        dealer_level INT NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'ACTIVE'
      );

      CREATE TABLE IF NOT EXISTS orders(
        id BIGSERIAL PRIMARY KEY,
        order_no TEXT UNIQUE NOT NULL,
        customer_id BIGINT REFERENCES customers(id),
        dealer_id BIGINT REFERENCES dealers(id),
        status TEXT NOT NULL DEFAULT 'NEW',
        payment_status TEXT NOT NULL DEFAULT 'PAYMENT_PENDING',
        payment_method TEXT,
        total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS order_items(
        id BIGSERIAL PRIMARY KEY,
        order_id BIGINT REFERENCES orders(id) ON DELETE CASCADE,
        product_id BIGINT REFERENCES products(id),
        quantity INT NOT NULL CHECK(quantity>0),
        unit_price NUMERIC(12,2) NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS inventory_lots(
        id BIGSERIAL PRIMARY KEY,
        product_id BIGINT REFERENCES products(id),
        lot_no TEXT NOT NULL,
        expiry_date DATE,
        quantity_on_hand INT NOT NULL DEFAULT 0,
        quantity_reserved INT NOT NULL DEFAULT 0,
        UNIQUE(product_id,lot_no)
      );

      CREATE TABLE IF NOT EXISTS order_inventory_allocations(
        id BIGSERIAL PRIMARY KEY,
        order_id BIGINT REFERENCES orders(id) ON DELETE CASCADE,
        order_item_id BIGINT REFERENCES order_items(id) ON DELETE CASCADE,
        inventory_lot_id BIGINT REFERENCES inventory_lots(id),
        quantity INT NOT NULL CHECK(quantity>0),
        consumed BOOLEAN NOT NULL DEFAULT FALSE
      );

      CREATE TABLE IF NOT EXISTS order_status_history(
        id BIGSERIAL PRIMARY KEY,
        order_id BIGINT REFERENCES orders(id) ON DELETE CASCADE,
        old_status TEXT,
        new_status TEXT NOT NULL,
        actor TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS dealer_commission_rules(
        id BIGSERIAL PRIMARY KEY,
        product_id BIGINT REFERENCES products(id),
        dealer_level INT NOT NULL,
        amount_per_unit NUMERIC(12,2) NOT NULL DEFAULT 0,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        UNIQUE(product_id,dealer_level)
      );

      CREATE TABLE IF NOT EXISTS dealer_ledger(
        id BIGSERIAL PRIMARY KEY,
        dealer_id BIGINT REFERENCES dealers(id),
        order_id BIGINT REFERENCES orders(id),
        entry_type TEXT NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        reference_no TEXT,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS return_requests(
        id BIGSERIAL PRIMARY KEY,
        return_no TEXT UNIQUE NOT NULL,
        order_id BIGINT REFERENCES orders(id),
        status TEXT NOT NULL DEFAULT 'REQUESTED',
        reason TEXT,
        qc_result TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS return_items(
        id BIGSERIAL PRIMARY KEY,
        return_request_id BIGINT REFERENCES return_requests(id) ON DELETE CASCADE,
        order_item_id BIGINT REFERENCES order_items(id),
        quantity INT NOT NULL CHECK(quantity>0),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(return_request_id,order_item_id)
      );

      CREATE TABLE IF NOT EXISTS audit_logs(
        id BIGSERIAL PRIMARY KEY,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT,
        entity_id TEXT,
        details JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS app_users(
        id BIGSERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        full_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL
          CHECK(
            role IN(
              'ADMIN',
              'DEALER',
              'STAFF',
              'CUSTOMER'
            )
          ),
        dealer_id BIGINT REFERENCES dealers(id),
        customer_id BIGINT REFERENCES customers(id),
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS auth_sessions(
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL
          REFERENCES app_users(id)
          ON DELETE CASCADE,
        token_hash TEXT UNIQUE NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        revoked_at TIMESTAMPTZ
      );
    `);

    await c.query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS dealer_id
      BIGINT REFERENCES dealers(id);

      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS updated_at
      TIMESTAMPTZ DEFAULT NOW();

      ALTER TABLE dealer_ledger
      ADD COLUMN IF NOT EXISTS order_id
      BIGINT REFERENCES orders(id);

      ALTER TABLE dealer_ledger
      ADD COLUMN IF NOT EXISTS description TEXT;

      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS price
      NUMERIC(12,2) NOT NULL DEFAULT 0;

      ALTER TABLE audit_logs
      ADD COLUMN IF NOT EXISTS details JSONB;

      ALTER TABLE return_requests
      ADD COLUMN IF NOT EXISTS reason TEXT;

      ALTER TABLE return_requests
      ADD COLUMN IF NOT EXISTS qc_result TEXT;
    `);

    const products = [
      [
        'TREX-TEA-60',
        'Trex Tea',
        '60 saşe'
      ],
      [
        'TREX-COFFEE-30',
        'Trex Coffee',
        '30 saşe'
      ],
      [
        'TREX-CAP-30',
        'Trex Cap',
        '30 kapsül'
      ],
      [
        'LIPOTEX-60',
        'Lipotex Tea',
        '60 adet'
      ],
      [
        'TREX-JEL',
        'Trex Jel',
        '1 adet'
      ]
    ];

    for (const p of products) {
      await c.query(
        `INSERT INTO products(
          sku,
          name,
          unit
        )
        VALUES(
          $1,
          $2,
          $3
        )
        ON CONFLICT(sku)
        DO NOTHING`,
        p
      );
    }

    const ids =
      await c.query(
        `SELECT id
         FROM products`
      );

    for (const p of ids.rows) {
      for (
        let level = 1;
        level <= 4;
        level++
      ) {
        await c.query(
          `INSERT INTO dealer_commission_rules(
            product_id,
            dealer_level,
            amount_per_unit
          )
          VALUES(
            $1,
            $2,
            $3
          )
          ON CONFLICT(
            product_id,
            dealer_level
          )
          DO NOTHING`,
          [
            p.id,
            level,
            level * 10
          ]
        );
      }
    }

    return {
      ok: true,
      version:
        '1.0.0-demo.15'
    };
  });
}

async function createOrder(data) {
  return db(async c => {

    await c.query('BEGIN');

    try {

      if (!data.customer_id) {
        throw new Error(
          'CUSTOMER_ID_REQUIRED'
        );
      }

      if (!data.items?.length) {
        throw new Error(
          'ORDER_ITEMS_REQUIRED'
        );
      }

      const orderNo =
        'TRX-' + Date.now();

      let total = 0;

      const items = [];

      for (const i of data.items) {

        const r =
          await c.query(
            `SELECT
              id,
              price
            FROM products
            WHERE
              id=$1
              AND active=TRUE`,
            [
              i.product_id
            ]
          );

        if (!r.rowCount) {
          throw new Error(
            'PRODUCT_NOT_FOUND'
          );
        }

        const qty =
          Number(
            i.quantity
          );

        if (
          !Number.isInteger(qty)
          ||
          qty < 1
        ) {
          throw new Error(
            'INVALID_QUANTITY'
          );
        }

        const price =
          i.unit_price !== undefined
            ? Number(
                i.unit_price
              )
            : Number(
                r.rows[0].price
              );

        total +=
          price * qty;

        items.push({
          product_id:
            i.product_id,
          quantity:
            qty,
          unit_price:
            price
        });
      }

      const r =
        await c.query(
          `INSERT INTO orders(
            order_no,
            customer_id,
            dealer_id,
            payment_method,
            total_amount
          )
          VALUES(
            $1,
            $2,
            $3,
            $4,
            $5
          )
          RETURNING *`,
          [
            orderNo,
            data.customer_id,
            data.dealer_id || null,
            data.payment_method || 'MOCK',
            total
          ]
        );

      const order =
        r.rows[0];

      for (const i of items) {

        await c.query(
          `INSERT INTO order_items(
            order_id,
            product_id,
            quantity,
            unit_price
          )
          VALUES(
            $1,
            $2,
            $3,
            $4
          )`,
          [
            order.id,
            i.product_id,
            i.quantity,
            i.unit_price
          ]
        );
      }

      await c.query(
        `INSERT INTO order_status_history(
          order_id,
          new_status,
          actor
        )
        VALUES(
          $1,
          'NEW',
          'demo-api'
        )`,
        [
          order.id
        ]
      );

      await audit(
        c,
        'ORDER_CREATED',
        'order',
        order.id
      );

      await c.query(
        'COMMIT'
      );

      return order;

    } catch (e) {

      await c.query(
        'ROLLBACK'
      );

      throw e;
    }
  });
}
async function reserve(orderId) {
  return db(async c => {

    await c.query(
      'BEGIN'
    );

    try {

      const o =
        await c.query(
          `SELECT *
           FROM orders
           WHERE id=$1
           FOR UPDATE`,
          [
            orderId
          ]
        );

      if (!o.rowCount) {
        throw new Error(
          'ORDER_NOT_FOUND'
        );
      }

      if (
        ![
          'APPROVED',
          'PAYMENT_PENDING'
        ].includes(
          o.rows[0].status
        )
      ) {
        throw new Error(
          'ORDER_NOT_RESERVABLE'
        );
      }

      const exists =
        await c.query(
          `SELECT id
           FROM order_inventory_allocations
           WHERE order_id=$1
           LIMIT 1`,
          [
            orderId
          ]
        );

      if (exists.rowCount) {
        throw new Error(
          'ORDER_ALREADY_RESERVED'
        );
      }

      const items =
        await c.query(
          `SELECT *
           FROM order_items
           WHERE order_id=$1`,
          [
            orderId
          ]
        );

      for (
        const item
        of items.rows
      ) {

        let remaining =
          Number(
            item.quantity
          );

        const lots =
          await c.query(
            `SELECT *
             FROM inventory_lots
             WHERE
               product_id=$1
               AND
               quantity_on_hand
               -
               quantity_reserved
               > 0
             ORDER BY
               expiry_date ASC
               NULLS LAST,
               id ASC
             FOR UPDATE`,
            [
              item.product_id
            ]
          );

        for (
          const lot
          of lots.rows
        ) {

          if (
            remaining <= 0
          ) {
            break;
          }

          const available =
            Number(
              lot.quantity_on_hand
            )
            -
            Number(
              lot.quantity_reserved
            );

          const take =
            Math.min(
              available,
              remaining
            );

          if (
            take <= 0
          ) {
            continue;
          }

          await c.query(
            `UPDATE inventory_lots
             SET
               quantity_reserved=
               quantity_reserved+$1
             WHERE id=$2`,
            [
              take,
              lot.id
            ]
          );

          await c.query(
            `INSERT INTO
             order_inventory_allocations(
               order_id,
               order_item_id,
               inventory_lot_id,
               quantity
             )
             VALUES(
               $1,
               $2,
               $3,
               $4
             )`,
            [
              orderId,
              item.id,
              lot.id,
              take
            ]
          );

          remaining -=
            take;
        }

        if (
          remaining > 0
        ) {
          throw new Error(
            'INSUFFICIENT_STOCK'
          );
        }
      }

      await c.query(
        `UPDATE orders
         SET
           status='STOCK_RESERVED',
           updated_at=NOW()
         WHERE id=$1`,
        [
          orderId
        ]
      );

      await audit(
        c,
        'STOCK_RESERVED',
        'order',
        orderId
      );

      await c.query(
        'COMMIT'
      );

      return {
        success: true,
        order_id:
          orderId,
        status:
          'STOCK_RESERVED'
      };

    } catch (e) {

      await c.query(
        'ROLLBACK'
      );

      throw e;
    }
  });
}

async function consume(
  c,
  orderId
) {

  const a =
    await c.query(
      `SELECT *
       FROM order_inventory_allocations
       WHERE
         order_id=$1
         AND consumed=FALSE
       FOR UPDATE`,
      [
        orderId
      ]
    );

  if (!a.rowCount) {
    throw new Error(
      'NO_STOCK_RESERVATION'
    );
  }

  for (
    const x
    of a.rows
  ) {

    const changed =
      await c.query(
        `UPDATE inventory_lots
         SET
           quantity_on_hand=
           quantity_on_hand-$1,

           quantity_reserved=
           quantity_reserved-$1

         WHERE
           id=$2
           AND quantity_on_hand >= $1
           AND quantity_reserved >= $1

         RETURNING id`,
        [
          x.quantity,
          x.inventory_lot_id
        ]
      );

    if (
      !changed.rowCount
    ) {
      throw new Error(
        'STOCK_INVARIANT_VIOLATION'
      );
    }

    await c.query(
      `UPDATE
       order_inventory_allocations
       SET
         consumed=TRUE
       WHERE id=$1`,
      [
        x.id
      ]
    );
  }
}

async function release(
  c,
  orderId
) {

  const a =
    await c.query(
      `SELECT *
       FROM order_inventory_allocations
       WHERE
         order_id=$1
         AND consumed=FALSE
       FOR UPDATE`,
      [
        orderId
      ]
    );

  for (
    const x
    of a.rows
  ) {

    await c.query(
      `UPDATE inventory_lots
       SET
         quantity_reserved=
         GREATEST(
           quantity_reserved-$1,
           0
         )
       WHERE id=$2`,
      [
        x.quantity,
        x.inventory_lot_id
      ]
    );
  }

  await c.query(
    `DELETE FROM
     order_inventory_allocations
     WHERE
       order_id=$1
       AND consumed=FALSE`,
    [
      orderId
    ]
  );
}

const transitions = {

  NEW: [
    'PAYMENT_PENDING',
    'APPROVED',
    'CANCELLED'
  ],

  PAYMENT_PENDING: [
    'APPROVED',
    'CANCELLED'
  ],

  APPROVED: [
    'STOCK_RESERVED',
    'CANCELLED'
  ],

  STOCK_RESERVED: [
    'PICKING',
    'CANCELLED'
  ],

  PICKING: [
    'PACKING',
    'PROBLEM',
    'CANCELLED'
  ],

  PACKING: [
    'READY_TO_SHIP',
    'PROBLEM'
  ],

  READY_TO_SHIP: [
    'SHIPPED',
    'PROBLEM'
  ],

  SHIPPED: [
    'DELIVERED',
    'PROBLEM'
  ],

  DELIVERED: [
    'COMPLETED'
  ],

  COMPLETED: [],

  CANCELLED: [],

  PROBLEM: [
    'PICKING',
    'PACKING',
    'READY_TO_SHIP',
    'CANCELLED'
  ]
};

async function status(
  orderId,
  next
) {

  return db(async c => {

    await c.query(
      'BEGIN'
    );

    try {

      const r =
        await c.query(
          `SELECT *
           FROM orders
           WHERE id=$1
           FOR UPDATE`,
          [
            orderId
          ]
        );

      if (!r.rowCount) {
        throw new Error(
          'ORDER_NOT_FOUND'
        );
      }

      const order =
        r.rows[0];

      if (
        order.status === next
      ) {

        await c.query(
          'COMMIT'
        );

        return order;
      }

      if (
        !(
          transitions[
            order.status
          ] || []
        ).includes(next)
      ) {
        throw new Error(
          'INVALID_STATUS_TRANSITION'
        );
      }

      if (
        next === 'SHIPPED'
      ) {
        await consume(
          c,
          orderId
        );
      }

      if (
        next === 'CANCELLED'
      ) {
        await release(
          c,
          orderId
        );
      }

      await c.query(
        `UPDATE orders
         SET
           status=$1,
           updated_at=NOW()
         WHERE id=$2`,
        [
          next,
          orderId
        ]
      );

      await c.query(
        `INSERT INTO
         order_status_history(
           order_id,
           old_status,
           new_status,
           actor
         )
         VALUES(
           $1,
           $2,
           $3,
           'demo-api'
         )`,
        [
          orderId,
          order.status,
          next
        ]
      );

      if (
        next === 'COMPLETED'
        &&
        order.dealer_id
      ) {

        const exists =
          await c.query(
            `SELECT id
             FROM dealer_ledger
             WHERE
               order_id=$1
               AND
               entry_type=
               'COMMISSION_ACCRUAL'`,
            [
              orderId
            ]
          );

        if (
          !exists.rowCount
        ) {

          const dealer =
            await c.query(
              `SELECT
                 dealer_level
               FROM dealers
               WHERE id=$1`,
              [
                order.dealer_id
              ]
            );

          const items =
            await c.query(
              `SELECT *
               FROM order_items
               WHERE order_id=$1`,
              [
                orderId
              ]
            );

          let commission = 0;

          for (
            const i
            of items.rows
          ) {

            const rule =
              await c.query(
                `SELECT
                   amount_per_unit
                 FROM
                   dealer_commission_rules
                 WHERE
                   product_id=$1
                   AND
                   dealer_level=$2
                   AND
                   active=TRUE`,
                [
                  i.product_id,
                  dealer.rows[0]
                    .dealer_level
                ]
              );

            if (
              rule.rowCount
            ) {

              commission +=
                Number(
                  rule.rows[0]
                    .amount_per_unit
                )
                *
                Number(
                  i.quantity
                );
            }
          }

          if (
            commission > 0
          ) {

            await c.query(
              `INSERT INTO
               dealer_ledger(
                 dealer_id,
                 order_id,
                 entry_type,
                 amount,
                 reference_no,
                 description
               )
               VALUES(
                 $1,
                 $2,
                 'COMMISSION_ACCRUAL',
                 $3,
                 $4,
                 'Sipariş prim tahakkuku'
               )`,
              [
                order.dealer_id,
                orderId,
                commission,
                order.order_no
              ]
            );
          }
        }
      }

      await audit(
        c,
        'ORDER_STATUS_CHANGED',
        'order',
        orderId,
        {
          old_status:
            order.status,
          new_status:
            next
        }
      );

      await c.query(
        'COMMIT'
      );

      return {
        ...order,
        status:
          next
      };

    } catch (e) {

      await c.query(
        'ROLLBACK'
      );

      throw e;
    }
  });
}

async function createReturn(
  data
) {

  return db(async c => {

    await c.query(
      'BEGIN'
    );

    try {

      if (
        !data.order_id
      ) {
        throw new Error(
          'ORDER_ID_REQUIRED'
        );
      }

      if (
        !Array.isArray(
          data.items
        )
        ||
        !data.items.length
      ) {
        throw new Error(
          'RETURN_ITEMS_REQUIRED'
        );
      }

      const order =
        await c.query(
          `SELECT *
           FROM orders
           WHERE id=$1
           FOR UPDATE`,
          [
            data.order_id
          ]
        );

      if (
        !order.rowCount
      ) {
        throw new Error(
          'ORDER_NOT_FOUND'
        );
      }

      const returnNo =
        'RET-' + Date.now();

      const created =
        await c.query(
          `INSERT INTO
           return_requests(
             return_no,
             order_id,
             reason
           )
           VALUES(
             $1,
             $2,
             $3
           )
           RETURNING *`,
          [
            returnNo,
            data.order_id,
            data.reason || null
          ]
        );

      const ret =
        created.rows[0];

      for (
        const item
        of data.items
      ) {

        const quantity =
          Number(
            item.quantity
          );

        if (
          !Number.isInteger(
            quantity
          )
          ||
          quantity < 1
        ) {
          throw new Error(
            'INVALID_RETURN_QUANTITY'
          );
        }

        const orderItem =
          await c.query(
            `SELECT *
             FROM order_items
             WHERE
               id=$1
               AND
               order_id=$2`,
            [
              item.order_item_id,
              data.order_id
            ]
          );

        if (
          !orderItem.rowCount
        ) {
          throw new Error(
            'ORDER_ITEM_NOT_FOUND'
          );
        }

        const previous =
          await c.query(
            `SELECT
               COALESCE(
                 SUM(
                   ri.quantity
                 ),
                 0
               )::int
               quantity
             FROM return_items ri
             JOIN return_requests rr
               ON
               rr.id=
               ri.return_request_id
             WHERE
               ri.order_item_id=$1
               AND
               rr.status
               <>
               'REJECTED'`,
            [
              item.order_item_id
            ]
          );

        const alreadyReturned =
          Number(
            previous.rows[0]
              .quantity || 0
          );

        const orderedQuantity =
          Number(
            orderItem.rows[0]
              .quantity
          );

        if (
          alreadyReturned
          +
          quantity
          >
          orderedQuantity
        ) {
          throw new Error(
            'RETURN_QUANTITY_EXCEEDS_ORDER'
          );
        }

        await c.query(
          `INSERT INTO
           return_items(
             return_request_id,
             order_item_id,
             quantity
           )
           VALUES(
             $1,
             $2,
             $3
           )`,
          [
            ret.id,
            item.order_item_id,
            quantity
          ]
        );
      }

      await audit(
        c,
        'RETURN_REQUESTED',
        'return_request',
        ret.id,
        {
          order_id:
            data.order_id,
          items:
            data.items
        }
      );

      await c.query(
        'COMMIT'
      );

      return ret;

    } catch (e) {

      await c.query(
        'ROLLBACK'
      );

      throw e;
    }
  });
}

async function approveReturn(
  returnId
) {

  return db(async c => {

    await c.query(
      'BEGIN'
    );

    try {

      const rr =
        await c.query(
          `SELECT
             rr.*,
             o.dealer_id,
             o.order_no
           FROM return_requests rr
           JOIN orders o
             ON o.id=
             rr.order_id
           WHERE
             rr.id=$1
           FOR UPDATE`,
          [
            returnId
          ]
        );

      if (!rr.rowCount) {
        throw new Error(
          'RETURN_NOT_FOUND'
        );
      }

      const ret =
        rr.rows[0];

      if (
        ret.status ===
        'APPROVED'
      ) {
        throw new Error(
          'RETURN_ALREADY_APPROVED'
        );
      }

      const items =
        await c.query(
          `SELECT
             ri.quantity
               return_quantity,
             oi.product_id
           FROM return_items ri
           JOIN order_items oi
             ON
             oi.id=
             ri.order_item_id
           WHERE
             ri.return_request_id=$1`,
          [
            returnId
          ]
        );

      if (
        !items.rowCount
      ) {
        throw new Error(
          'RETURN_ITEMS_REQUIRED'
        );
      }

      let clawback = 0;

      if (
        ret.dealer_id
      ) {

        const dealer =
          await c.query(
            `SELECT
               dealer_level
             FROM dealers
             WHERE id=$1`,
            [
              ret.dealer_id
            ]
          );

        if (
          !dealer.rowCount
        ) {
          throw new Error(
            'DEALER_NOT_FOUND'
          );
        }

        for (
          const item
          of items.rows
        ) {

          const rule =
            await c.query(
              `SELECT
                 amount_per_unit
               FROM
                 dealer_commission_rules
               WHERE
                 product_id=$1
                 AND
                 dealer_level=$2
                 AND
                 active=TRUE`,
              [
                item.product_id,
                dealer.rows[0]
                  .dealer_level
              ]
            );

          if (
            rule.rowCount
          ) {

            clawback +=
              Number(
                rule.rows[0]
                  .amount_per_unit
              )
              *
              Number(
                item.return_quantity
              );
          }
        }

        const accrued =
          await c.query(
            `SELECT
               COALESCE(
                 SUM(amount),
                 0
               )
               amount
             FROM dealer_ledger
             WHERE
               order_id=$1
               AND
               entry_type=
               'COMMISSION_ACCRUAL'`,
            [
              ret.order_id
            ]
          );

        const previous =
          await c.query(
            `SELECT
               COALESCE(
                 SUM(amount),
                 0
               )
               amount
             FROM dealer_ledger
             WHERE
               order_id=$1
               AND
               entry_type=
               'COMMISSION_CLAWBACK'`,
            [
              ret.order_id
            ]
          );

        const remaining =
          Math.max(
            Number(
              accrued.rows[0]
                .amount || 0
            )
            -
            Math.abs(
              Number(
                previous.rows[0]
                  .amount || 0
              )
            ),
            0
          );

        clawback =
          Math.min(
            clawback,
            remaining
          );

        if (
          clawback > 0
        ) {

          await c.query(
            `INSERT INTO
             dealer_ledger(
               dealer_id,
               order_id,
               entry_type,
               amount,
               reference_no,
               description
             )
             VALUES(
               $1,
               $2,
               'COMMISSION_CLAWBACK',
               $3,
               $4,
               'İade edilen adetlere göre prim geri alma'
             )`,
            [
              ret.dealer_id,
              ret.order_id,
              -clawback,
              ret.return_no
            ]
          );
        }
      }

      await c.query(
        `UPDATE
         return_requests
         SET
           status='APPROVED',
           qc_result='APPROVED'
         WHERE id=$1`,
        [
          returnId
        ]
      );

      await audit(
        c,
        'RETURN_APPROVED',
        'return_request',
        returnId,
        {
          order_id:
            ret.order_id,
          commission_clawback:
            clawback
        }
      );

      await c.query(
        'COMMIT'
      );

      return {
        return_id:
          returnId,
        status:
          'APPROVED',
        commission_clawback:
          clawback
      };

    } catch (e) {

      await c.query(
        'ROLLBACK'
      );

      throw e;
    }
  });
}
const server =
  http.createServer(
    async (
      req,
      res
    ) => {

      try {

        const u =
          new URL(
            req.url,
            'http://localhost'
          );

        if (
          req.method ===
          'OPTIONS'
        ) {

          res.writeHead(
            204,
            {
              'Access-Control-Allow-Origin':
                '*',

              'Access-Control-Allow-Methods':
                'GET,POST,OPTIONS',

              'Access-Control-Allow-Headers':
                'Content-Type,Authorization'
            }
          );

          return res.end();
        }

        if (
          req.method === 'GET'
          &&
          u.pathname === '/'
        ) {

          return send(
            res,
            200,
            {
              service:
                'Trex Platform Core API',

              version:
                '1.0.0-demo.15',

              database:
                'PostgreSQL',

              payment_provider:
                'mock',

              shipping_provider:
                'mock',

              auth:
                'session-token'
            }
          );
        }

        if (
          req.method === 'GET'
          &&
          u.pathname ===
          '/health'
        ) {

          return send(
            res,
            200,
            {
              ok: true,
              version: '15'
            }
          );
        }

        if (
          req.method === 'GET'
          &&
          u.pathname ===
          '/init-db'
        ) {

          return send(
            res,
            200,
            await initDb()
          );
        }

        if (
          req.method === 'GET'
          &&
          u.pathname ===
          '/api/v1/auth/bootstrap-status'
        ) {

          const data =
            await db(
              async c => {

                const r =
                  await c.query(
                    `SELECT
                       COUNT(*)::int
                       count
                     FROM app_users`
                  );

                return {
                  has_users:
                    r.rows[0]
                      .count > 0,

                  user_count:
                    r.rows[0]
                      .count
                };
              }
            );

          return send(
            res,
            200,
            {
              success: true,
              data
            }
          );
        }

        if (
          req.method === 'POST'
          &&
          u.pathname ===
          '/api/v1/auth/login'
        ) {

          const b =
            await body(req);

          if (
            !b.email
            ||
            !b.password
          ) {
            throw Object.assign(
              new Error(
                'EMAIL_AND_PASSWORD_REQUIRED'
              ),
              {
                statusCode: 400
              }
            );
          }

          const result =
            await db(
              async c => {

                const r =
                  await c.query(
                    `SELECT *
                     FROM app_users
                     WHERE
                       LOWER(email)=
                       LOWER($1)
                       AND
                       active=TRUE`,
                    [
                      b.email
                    ]
                  );

                if (
                  !r.rowCount
                  ||
                  !verifyPassword(
                    b.password,
                    r.rows[0]
                      .password_hash
                  )
                ) {
                  throw Object.assign(
                    new Error(
                      'INVALID_CREDENTIALS'
                    ),
                    {
                      statusCode: 401
                    }
                  );
                }

                const user =
                  r.rows[0];

                const token =
                  newToken();

                await c.query(
                  `INSERT INTO
                   auth_sessions(
                     user_id,
                     token_hash,
                     expires_at
                   )
                   VALUES(
                     $1,
                     $2,
                     NOW()
                     +
                     (
                       $3
                       ||
                       ' hours'
                     )::interval
                   )`,
                  [
                    user.id,
                    tokenHash(token),
                    String(
                      SESSION_HOURS
                    )
                  ]
                );

                await audit(
                  c,
                  'LOGIN',
                  'app_user',
                  user.id,
                  {
                    role:
                      user.role
                  }
                );

                return {
                  token,

                  expires_in_hours:
                    SESSION_HOURS,

                  user: {
                    id:
                      user.id,

                    email:
                      user.email,

                    full_name:
                      user.full_name,

                    role:
                      user.role,

                    dealer_id:
                      user.dealer_id,

                    customer_id:
                      user.customer_id
                  }
                };
              }
            );

          return send(
            res,
            200,
            {
              success: true,
              data: result
            }
          );
        }

        if (
          req.method === 'GET'
          &&
          u.pathname ===
          '/api/v1/auth/me'
        ) {

          const user =
            await getAuth(req);

          if (!user) {
            throw Object.assign(
              new Error(
                'UNAUTHORIZED'
              ),
              {
                statusCode: 401
              }
            );
          }

          return send(
            res,
            200,
            {
              success: true,
              data: user
            }
          );
        }

        if (
          req.method === 'POST'
          &&
          u.pathname ===
          '/api/v1/auth/logout'
        ) {

          const token =
            bearer(req);

          if (!token) {
            throw Object.assign(
              new Error(
                'UNAUTHORIZED'
              ),
              {
                statusCode: 401
              }
            );
          }

          await db(
            async c => {

              await c.query(
                `UPDATE auth_sessions
                 SET
                   revoked_at=NOW()
                 WHERE
                   token_hash=$1`,
                [
                  tokenHash(token)
                ]
              );
            }
          );

          return send(
            res,
            200,
            {
              success: true
            }
          );
        }

        if (
          req.method === 'POST'
          &&
          u.pathname ===
          '/api/v1/auth/bootstrap-admin'
        ) {

          const b =
            await body(req);

          if (
            !process.env
              .DEMO_BOOTSTRAP_SECRET
            ||
            b.secret
            !==
            process.env
              .DEMO_BOOTSTRAP_SECRET
          ) {
            throw Object.assign(
              new Error(
                'FORBIDDEN'
              ),
              {
                statusCode: 403
              }
            );
          }

          if (
            !b.email
            ||
            !b.password
            ||
            !b.full_name
          ) {
            throw Object.assign(
              new Error(
                'EMAIL_PASSWORD_NAME_REQUIRED'
              ),
              {
                statusCode: 400
              }
            );
          }

          const row =
            await db(
              async c => {

                const count =
                  await c.query(
                    `SELECT
                       COUNT(*)::int
                       count
                     FROM app_users`
                  );

                if (
                  count.rows[0]
                    .count > 0
                ) {
                  throw Object.assign(
                    new Error(
                      'BOOTSTRAP_ALREADY_COMPLETED'
                    ),
                    {
                      statusCode: 409
                    }
                  );
                }

                return (
                  await c.query(
                    `INSERT INTO
                     app_users(
                       email,
                       full_name,
                       password_hash,
                       role
                     )
                     VALUES(
                       $1,
                       $2,
                       $3,
                       'ADMIN'
                     )
                     RETURNING
                       id,
                       email,
                       full_name,
                       role,
                       created_at`,
                    [
                      b.email,
                      b.full_name,
                      hashPassword(
                        b.password
                      )
                    ]
                  )
                ).rows[0];
              }
            );

          return send(
            res,
            201,
            {
              success: true,
              data: row
            }
          );
        }

        if (
          req.method === 'GET'
          &&
          u.pathname ===
          '/api/v1/dashboard'
        ) {

          const data =
            await db(
              async c => {

                const [
                  orders,
                  customers,
                  dealers,
                  stock,
                  returns
                ] =
                  await Promise.all(
                    [
                      c.query(
                        `SELECT
                           COUNT(*)::int
                           count,
                           COALESCE(
                             SUM(
                               total_amount
                             ),
                             0
                           )
                           total
                         FROM orders`
                      ),

                      c.query(
                        `SELECT
                           COUNT(*)::int
                           count
                         FROM customers`
                      ),

                      c.query(
                        `SELECT
                           COUNT(*)::int
                           count
                         FROM dealers
                         WHERE
                           status='ACTIVE'`
                      ),

                      c.query(
                        `SELECT
                           COALESCE(
                             SUM(
                               quantity_on_hand
                             ),
                             0
                           )::int
                           total
                         FROM
                           inventory_lots`
                      ),

                      c.query(
                        `SELECT
                           COUNT(*)::int
                           count
                         FROM return_requests
                         WHERE
                           status='REQUESTED'`
                      )
                    ]
                  );

                const latestOrders =
                  await c.query(
                    `SELECT
                       id,
                       order_no,
                       status,
                       total_amount,
                       created_at
                     FROM orders
                     ORDER BY
                       id DESC
                     LIMIT 10`
                  );

                return {
                  orders:
                    orders.rows[0]
                      .count,

                  revenue:
                    Number(
                      orders.rows[0]
                        .total
                    ),

                  customers:
                    customers.rows[0]
                      .count,

                  active_dealers:
                    dealers.rows[0]
                      .count,

                  stock_units:
                    stock.rows[0]
                      .total,

                  pending_returns:
                    returns.rows[0]
                      .count,

                  latest_orders:
                    latestOrders.rows
                };
              }
            );

          return send(
            res,
            200,
            {
              success: true,
              data
            }
          );
        }

        if (
          req.method === 'GET'
          &&
          u.pathname ===
          '/api/v1/products'
        ) {

          return send(
            res,
            200,
            {
              success: true,

              data:
                await db(
                  async c =>
                    (
                      await c.query(
                        `SELECT *
                         FROM products
                         ORDER BY id`
                      )
                    ).rows
                )
            }
          );
        }

        if (
          req.method === 'POST'
          &&
          u.pathname ===
          '/api/v1/customers'
        ) {

          const b =
            await body(req);

          const row =
            await db(
              async c =>
                (
                  await c.query(
                    `INSERT INTO
                     customers(
                       full_name,
                       email,
                       phone
                     )
                     VALUES(
                       $1,
                       $2,
                       $3
                     )
                     RETURNING *`,
                    [
                      b.full_name,
                      b.email || null,
                      b.phone || null
                    ]
                  )
                ).rows[0]
            );

          return send(
            res,
            201,
            {
              success: true,
              data: row
            }
          );
        }

        if (
          req.method === 'GET'
          &&
          u.pathname ===
          '/api/v1/customers'
        ) {

          return send(
            res,
            200,
            {
              success: true,

              data:
                await db(
                  async c =>
                    (
                      await c.query(
                        `SELECT *
                         FROM customers
                         ORDER BY id DESC`
                      )
                    ).rows
                )
            }
          );
        }

        if (
          req.method === 'POST'
          &&
          u.pathname ===
          '/api/v1/orders'
        ) {

          return send(
            res,
            201,
            {
              success: true,

              data:
                await createOrder(
                  await body(req)
                )
            }
          );
        }

        if (
          req.method === 'GET'
          &&
          u.pathname ===
          '/api/v1/orders'
        ) {

          return send(
            res,
            200,
            {
              success: true,

              data:
                await db(
                  async c =>
                    (
                      await c.query(
                        `SELECT *
                         FROM orders
                         ORDER BY id DESC`
                      )
                    ).rows
                )
            }
          );
        }

        const reserveMatch =
          u.pathname.match(
            /^\/api\/v1\/orders\/(\d+)\/reserve-stock$/
          );

        if (
          req.method === 'POST'
          &&
          reserveMatch
        ) {

          return send(
            res,
            200,
            await reserve(
              Number(
                reserveMatch[1]
              )
            )
          );
        }

        const statusMatch =
          u.pathname.match(
            /^\/api\/v1\/orders\/(\d+)\/status$/
          );

        if (
          req.method === 'POST'
          &&
          statusMatch
        ) {

          const b =
            await body(req);

          return send(
            res,
            200,
            {
              success: true,

              data:
                await status(
                  Number(
                    statusMatch[1]
                  ),
                  b.status
                )
            }
          );
        }

        const paymentMatch =
          u.pathname.match(
            /^\/api\/v1\/orders\/(\d+)\/payment-status$/
          );

        if (
          req.method === 'POST'
          &&
          paymentMatch
        ) {

          const b =
            await body(req);

          const allowed = [
            'PAYMENT_PENDING',
            'PAID',
            'FAILED',
            'REFUNDED',
            'COD_PENDING'
          ];

          if (
            !allowed.includes(
              b.payment_status
            )
          ) {
            throw new Error(
              'INVALID_PAYMENT_STATUS'
            );
          }

          const result =
            await db(
              async c => {

                await c.query(
                  'BEGIN'
                );

                try {

                  const current =
                    await c.query(
                      `SELECT *
                       FROM orders
                       WHERE id=$1
                       FOR UPDATE`,
                      [
                        Number(
                          paymentMatch[1]
                        )
                      ]
                    );

                  if (
                    !current.rowCount
                  ) {
                    throw new Error(
                      'ORDER_NOT_FOUND'
                    );
                  }

                  const order =
                    current.rows[0];

                  const updated =
                    await c.query(
                      `UPDATE orders
                       SET
                         payment_status=$1,
                         updated_at=NOW()
                       WHERE id=$2
                       RETURNING *`,
                      [
                        b.payment_status,
                        Number(
                          paymentMatch[1]
                        )
                      ]
                    );

                  await audit(
                    c,
                    'PAYMENT_STATUS_CHANGED',
                    'order',
                    order.id,
                    {
                      old_payment_status:
                        order.payment_status,

                      new_payment_status:
                        b.payment_status
                    }
                  );

                  await c.query(
                    'COMMIT'
                  );

                  return updated.rows[0];

                } catch (e) {

                  await c.query(
                    'ROLLBACK'
                  );

                  throw e;
                }
              }
            );

          return send(
            res,
            200,
            {
              success: true,
              data: result
            }
          );
        }

        if (
          req.method === 'POST'
          &&
          u.pathname ===
          '/api/v1/inventory/lots'
        ) {

          const b =
            await body(req);

          const row =
            await db(
              async c =>
                (
                  await c.query(
                    `INSERT INTO
                     inventory_lots(
                       product_id,
                       lot_no,
                       expiry_date,
                       quantity_on_hand
                     )
                     VALUES(
                       $1,
                       $2,
                       $3,
                       $4
                     )
                     RETURNING *`,
                    [
                      b.product_id,
                      b.lot_no,
                      b.expiry_date || null,
                      Number(
                        b.quantity_on_hand
                        || 0
                      )
                    ]
                  )
                ).rows[0]
            );

          return send(
            res,
            201,
            {
              success: true,
              data: row
            }
          );
        }

        if (
          req.method === 'GET'
          &&
          u.pathname ===
          '/api/v1/inventory/lots'
        ) {

          return send(
            res,
            200,
            {
              success: true,

              data:
                await db(
                  async c =>
                    (
                      await c.query(
                        `SELECT
                           l.*,
                           p.name
                             product_name,
                           p.sku
                         FROM
                           inventory_lots l
                         JOIN products p
                           ON
                           p.id=
                           l.product_id
                         ORDER BY
                           l.expiry_date
                           ASC
                           NULLS LAST,
                           l.id`
                      )
                    ).rows
                )
            }
          );
        }

        if (
          req.method === 'POST'
          &&
          u.pathname ===
          '/api/v1/dealers'
        ) {

          const b =
            await body(req);

          const row =
            await db(
              async c =>
                (
                  await c.query(
                    `INSERT INTO
                     dealers(
                       code,
                       name,
                       dealer_level,
                       status
                     )
                     VALUES(
                       $1,
                       $2,
                       $3,
                       $4
                     )
                     RETURNING *`,
                    [
                      b.code,
                      b.name,
                      Number(
                        b.dealer_level || 1
                      ),
                      b.status || 'ACTIVE'
                    ]
                  )
                ).rows[0]
            );

          return send(
            res,
            201,
            {
              success: true,
              data: row
            }
          );
        }

        if (
          req.method === 'GET'
          &&
          u.pathname ===
          '/api/v1/dealers'
        ) {

          return send(
            res,
            200,
            {
              success: true,

              data:
                await db(
                  async c =>
                    (
                      await c.query(
                        `SELECT *
                         FROM dealers
                         ORDER BY id DESC`
                      )
                    ).rows
                )
            }
          );
        }

        if (
          req.method === 'GET'
          &&
          u.pathname ===
          '/api/v1/dealer-ledger'
        ) {

          return send(
            res,
            200,
            {
              success: true,

              data:
                await db(
                  async c =>
                    (
                      await c.query(
                        `SELECT
                           dl.*,
                           d.name
                             dealer_name
                         FROM dealer_ledger dl
                         JOIN dealers d
                           ON
                           d.id=
                           dl.dealer_id
                         ORDER BY
                           dl.id DESC`
                      )
                    ).rows
                )
            }
          );
        }

        if (
          req.method === 'POST'
          &&
          u.pathname ===
          '/api/v1/returns'
        ) {

          return send(
            res,
            201,
            {
              success: true,

              data:
                await createReturn(
                  await body(req)
                )
            }
          );
        }

        const returnApproveMatch =
          u.pathname.match(
            /^\/api\/v1\/returns\/(\d+)\/approve$/
          );

        if (
          req.method === 'POST'
          &&
          returnApproveMatch
        ) {

          return send(
            res,
            200,
            {
              success: true,

              data:
                await approveReturn(
                  Number(
                    returnApproveMatch[1]
                  )
                )
            }
          );
        }

        if (
          req.method === 'GET'
          &&
          u.pathname ===
          '/api/v1/returns'
        ) {

          return send(
            res,
            200,
            {
              success: true,

              data:
                await db(
                  async c =>
                    (
                      await c.query(
                        `SELECT
                           rr.*,
                           COALESCE(
                             json_agg(
                               json_build_object(
                                 'id',
                                 ri.id,
                                 'order_item_id',
                                 ri.order_item_id,
                                 'quantity',
                                 ri.quantity
                               )
                             )
                             FILTER(
                               WHERE
                                 ri.id
                                 IS NOT NULL
                             ),
                             '[]'
                           )
                           items
                         FROM
                           return_requests rr
                         LEFT JOIN
                           return_items ri
                           ON
                           ri.return_request_id=
                           rr.id
                         GROUP BY
                           rr.id
                         ORDER BY
                           rr.id DESC`
                      )
                    ).rows
                )
            }
          );
        }

        if (
          req.method === 'GET'
          &&
          u.pathname ===
          '/api/v1/audit-logs'
        ) {

          return send(
            res,
            200,
            {
              success: true,

              data:
                await db(
                  async c =>
                    (
                      await c.query(
                        `SELECT *
                         FROM audit_logs
                         ORDER BY id DESC
                         LIMIT 100`
                      )
                    ).rows
                )
            }
          );
        }

        return send(
          res,
          404,
          {
            success: false,
            error:
              'NOT_FOUND'
          }
        );

      } catch (e) {

        console.error(e);

        const statusCode =
          e.statusCode
          ||
          (
            [
              'INVALID_JSON',
              'EMAIL_AND_PASSWORD_REQUIRED',
              'EMAIL_PASSWORD_NAME_REQUIRED',
              'INVALID_PAYMENT_STATUS',
              'CUSTOMER_ID_REQUIRED',
              'ORDER_ITEMS_REQUIRED',
              'INVALID_QUANTITY',
              'ORDER_ID_REQUIRED',
              'RETURN_ITEMS_REQUIRED',
              'INVALID_RETURN_QUANTITY',
              'RETURN_QUANTITY_EXCEEDS_ORDER'
            ].includes(
              e.message
            )
              ? 400
              : 500
          );

        return send(
          res,
          statusCode,
          {
            success: false,
            error:
              e.message
          }
        );
      }
    }
  );

server.listen(
  port,
  '0.0.0.0',
  async () => {

    console.log(
      'Trex Platform Core API v15 running'
    );

    try {

      await initDb();

      console.log(
        'Database schema v15 ready'
      );

    } catch (e) {

      console.error(
        'Database initialization failed:',
        e.message
      );
    }
  }
);
