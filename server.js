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

    req.on('data', c => {
      raw += c;
    });

    req.on('end', () => {
      try {
        resolve(
          raw
            ? JSON.parse(raw)
            : {}
        );
      } catch {
        reject(
          new Error('INVALID_JSON')
        );
      }
    });

    req.on('error', reject);
  });
}

async function db(fn) {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL_NOT_SET');
  }

  const c = new Client({
    connectionString:
      process.env.DATABASE_URL,

    ssl: {
      rejectUnauthorized: false
    }
  });

  await c.connect();

  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

async function audit(
  c,
  action,
  type,
  id,
  details = {}
) {
  await c.query(
    `INSERT INTO audit_logs(
      actor,
      action,
      entity_type,
      entity_id,
      details
    )
    VALUES(
      'demo-api',
      $1,
      $2,
      $3,
      $4
    )`,
    [
      action,
      type,
      String(id),
      JSON.stringify(details)
    ]
  );
}

function hashPassword(
  password,
  salt = crypto
    .randomBytes(16)
    .toString('hex')
) {
  const hash = crypto
    .scryptSync(
      password,
      salt,
      64
    )
    .toString('hex');

  return `${salt}:${hash}`;
}

function verifyPassword(
  password,
  stored
) {
  if (
    !stored ||
    !stored.includes(':')
  ) {
    return false;
  }

  const [
    salt,
    expectedHex
  ] = stored.split(':');

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
    expected.length ===
    actual.length
    &&
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
    req.headers.authorization
    || '';

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

          AND
          s.revoked_at
          IS NULL

          AND
          s.expires_at>NOW()

          AND
          u.active=TRUE`,
        [
          tokenHash(token)
        ]
      );

    return (
      r.rows[0]
      || null
    );
  });
}

function requireRole(
  user,
  allowed
) {
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

  if (
    !allowed.includes(
      user.role
    )
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
        customer_id BIGINT
          REFERENCES customers(id),

        dealer_id BIGINT
          REFERENCES dealers(id),

        status TEXT NOT NULL
          DEFAULT 'NEW',

        payment_status TEXT NOT NULL
          DEFAULT 'PAYMENT_PENDING',

        payment_method TEXT,

        total_amount NUMERIC(12,2)
          NOT NULL
          DEFAULT 0,

        created_at TIMESTAMPTZ
          DEFAULT NOW(),

        updated_at TIMESTAMPTZ
          DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS order_items(
        id BIGSERIAL PRIMARY KEY,

        order_id BIGINT
          REFERENCES orders(id)
          ON DELETE CASCADE,

        product_id BIGINT
          REFERENCES products(id),

        quantity INT NOT NULL
          CHECK(quantity>0),

        unit_price NUMERIC(12,2)
          NOT NULL
          DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS inventory_lots(
        id BIGSERIAL PRIMARY KEY,

        product_id BIGINT
          REFERENCES products(id),

        lot_no TEXT NOT NULL,

        expiry_date DATE,

        quantity_on_hand INT
          NOT NULL
          DEFAULT 0,

        quantity_reserved INT
          NOT NULL
          DEFAULT 0,

        UNIQUE(
          product_id,
          lot_no
        )
      );

      CREATE TABLE IF NOT EXISTS order_inventory_allocations(
        id BIGSERIAL PRIMARY KEY,

        order_id BIGINT
          REFERENCES orders(id)
          ON DELETE CASCADE,

        order_item_id BIGINT
          REFERENCES order_items(id)
          ON DELETE CASCADE,

        inventory_lot_id BIGINT
          REFERENCES inventory_lots(id),

        quantity INT NOT NULL
          CHECK(quantity>0),

        consumed BOOLEAN
          NOT NULL
          DEFAULT FALSE
      );

      CREATE TABLE IF NOT EXISTS order_status_history(
        id BIGSERIAL PRIMARY KEY,

        order_id BIGINT
          REFERENCES orders(id)
          ON DELETE CASCADE,

        old_status TEXT,

        new_status TEXT NOT NULL,

        actor TEXT,

        created_at TIMESTAMPTZ
          DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS dealer_commission_rules(
        id BIGSERIAL PRIMARY KEY,

        product_id BIGINT
          REFERENCES products(id),

        dealer_level INT NOT NULL,

        amount_per_unit NUMERIC(12,2)
          NOT NULL
          DEFAULT 0,

        active BOOLEAN
          NOT NULL
          DEFAULT TRUE,

        UNIQUE(
          product_id,
          dealer_level
        )
      );

      CREATE TABLE IF NOT EXISTS dealer_ledger(
        id BIGSERIAL PRIMARY KEY,

        dealer_id BIGINT
          REFERENCES dealers(id),

        order_id BIGINT
          REFERENCES orders(id),

        entry_type TEXT NOT NULL,

        amount NUMERIC(12,2)
          NOT NULL,

        reference_no TEXT,

        description TEXT,

        created_at TIMESTAMPTZ
          DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS return_requests(
        id BIGSERIAL PRIMARY KEY,

        return_no TEXT
          UNIQUE
          NOT NULL,

        order_id BIGINT
          REFERENCES orders(id),

        status TEXT
          NOT NULL
          DEFAULT 'REQUESTED',

        reason TEXT,

        qc_result TEXT,

        created_at TIMESTAMPTZ
          DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS return_items(
        id BIGSERIAL PRIMARY KEY,

        return_request_id BIGINT
          REFERENCES return_requests(id)
          ON DELETE CASCADE,

        order_item_id BIGINT
          REFERENCES order_items(id),

        quantity INT NOT NULL
          CHECK(quantity>0),

        created_at TIMESTAMPTZ
          DEFAULT NOW(),

        UNIQUE(
          return_request_id,
          order_item_id
        )
      );

      CREATE TABLE IF NOT EXISTS audit_logs(
        id BIGSERIAL PRIMARY KEY,

        actor TEXT NOT NULL,

        action TEXT NOT NULL,

        entity_type TEXT,

        entity_id TEXT,

        details JSONB,

        created_at TIMESTAMPTZ
          DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS app_users(
        id BIGSERIAL PRIMARY KEY,

        email TEXT
          UNIQUE
          NOT NULL,

        full_name TEXT
          NOT NULL,

        password_hash TEXT
          NOT NULL,

        role TEXT
          NOT NULL
          CHECK(
            role IN(
              'ADMIN',
              'DEALER',
              'STAFF',
              'CUSTOMER'
            )
          ),

        dealer_id BIGINT
          REFERENCES dealers(id),

        customer_id BIGINT
          REFERENCES customers(id),

        active BOOLEAN
          NOT NULL
          DEFAULT TRUE,

        created_at TIMESTAMPTZ
          DEFAULT NOW(),

        updated_at TIMESTAMPTZ
          DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS auth_sessions(
        id BIGSERIAL PRIMARY KEY,

        user_id BIGINT
          NOT NULL
          REFERENCES app_users(id)
          ON DELETE CASCADE,

        token_hash TEXT
          UNIQUE
          NOT NULL,

        expires_at TIMESTAMPTZ
          NOT NULL,

        created_at TIMESTAMPTZ
          DEFAULT NOW(),

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
      NUMERIC(12,2)
      NOT NULL DEFAULT 0;

      ALTER TABLE audit_logs
      ADD COLUMN IF NOT EXISTS details
      JSONB;

      ALTER TABLE return_requests
      ADD COLUMN IF NOT EXISTS reason
      TEXT;

      ALTER TABLE return_requests
      ADD COLUMN IF NOT EXISTS qc_result
      TEXT;
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

    for (
      const p
      of products
    ) {
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

    for (
      const p
      of ids.rows
    ) {

      for (
        let level = 1;
        level <= 4;
        level++
      ) {

        await c.query(
          `INSERT INTO
           dealer_commission_rules(
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

    await c.query(
      'BEGIN'
    );

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

      for (
        const i
        of data.items
      ) {

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
            data.payment_method
              || 'MOCK',
            total
          ]
        );

      const order =
        r.rows[0];

      for (
        const i
        of items
      ) {

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

      if (
        exists.rowCount
      ) {
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
               quantity_reserved
               =
               quantity_reserved
               +
               $1
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
           quantity_on_hand
           =
           quantity_on_hand
           -
           $1,

           quantity_reserved
           =
           quantity_reserved
           -
           $1

         WHERE id=$2

         AND
           quantity_on_hand
           >=
           $1

         AND
           quantity_reserved
           >=
           $1

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
         quantity_reserved
         =
         GREATEST(
           quantity_reserved
           -
           $1,
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
          ]
          || []
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
