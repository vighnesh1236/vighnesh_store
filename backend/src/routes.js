import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { pool, query } from './db.js';
import { adminOnly, asyncRoute, authenticate } from './middleware.js';
import { addressSchema, idParam, loginSchema, parse, productPatchSchema, productSchema, registrationSchema } from './validation.js';

const router = Router();
const fail = (status, message) => Object.assign(new Error(message), { status });
function bodyObject(req) {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    throw fail(400, 'Request body must be a JSON object');
  }
  return req.body;
}
const productSelect = `
  SELECT p.id, p.category_id, c.name AS category_name, p.name, p.description, p.price,
         p.compare_at_price, p.stock, p.rating, p.review_count, p.created_at,
         COALESCE(json_agg(json_build_object('id', pi.id, 'url', pi.image_url, 'position', pi.position))
           FILTER (WHERE pi.id IS NOT NULL), '[]') AS images
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN product_images pi ON pi.product_id = p.id`;

function tokenFor(user) {
  return jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function validId(raw) {
  const result = idParam.safeParse(raw);
  if (!result.success) throw fail(400, 'Invalid ID');
  return result.data;
}

function validated(schema, input) {
  const result = parse(schema, input);
  if (result.error) throw fail(400, result.error);
  return result.data;
}

async function ensureWishlist(userId, client = pool) {
  const result = await client.query(
    'INSERT INTO wishlists(user_id) VALUES($1) ON CONFLICT(user_id) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING id',
    [userId]
  );
  return result.rows[0].id;
}

router.post('/auth/register', asyncRoute(async (req, res) => {
  const data = validated(registrationSchema, bodyObject(req));
  const passwordHash = await bcrypt.hash(data.password, 12);
  try {
    const result = await query(
      'INSERT INTO users(name, email, password_hash) VALUES($1, lower($2), $3) RETURNING id, name, email, role',
      [data.name, data.email, passwordHash]
    );
    const user = result.rows[0];
    await ensureWishlist(user.id);
    res.status(201).json({ user, token: tokenFor(user) });
  } catch (error) {
    if (error.code === '23505') throw fail(409, 'An account with that email already exists');
    throw error;
  }
}));

router.post('/auth/login', asyncRoute(async (req, res) => {
  const data = validated(loginSchema, bodyObject(req));
  const result = await query('SELECT id, name, email, role, password_hash FROM users WHERE email = lower($1)', [data.email]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(data.password, user.password_hash))) throw fail(401, 'Email or password is incorrect');
  delete user.password_hash;
  await ensureWishlist(user.id);
  res.json({ user, token: tokenFor(user) });
}));

router.get('/auth/me', authenticate, asyncRoute(async (req, res) => {
  const result = await query('SELECT id, name, email, role, created_at FROM users WHERE id = $1', [req.user.id]);
  if (!result.rows[0]) throw fail(404, 'User not found');
  res.json({ user: result.rows[0] });
}));

router.get('/categories', asyncRoute(async (_req, res) => {
  const result = await query(
    `SELECT c.id, c.name, c.slug, c.icon, COUNT(p.id)::int AS product_count
     FROM categories c LEFT JOIN products p ON p.category_id = c.id AND p.is_active = TRUE
     GROUP BY c.id ORDER BY c.name`
  );
  res.json({ categories: result.rows });
}));

router.get('/products', asyncRoute(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(40, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const conditions = ['p.is_active = TRUE'];
  const values = [];
  const add = (value) => { values.push(value); return `$${values.length}`; };
  const search = String(req.query.q ?? '').trim().slice(0, 120);
  if (search) {
    const placeholder = add(search);
    conditions.push(`(to_tsvector('english', p.name || ' ' || p.description) @@ plainto_tsquery('english', ${placeholder})
      OR p.name ILIKE '%' || ${placeholder} || '%')`);
  }
  if (req.query.category) conditions.push(`p.category_id = ${add(validId(req.query.category))}`);
  if (req.query.minPrice !== undefined) {
    const min = Number(req.query.minPrice);
    if (!Number.isFinite(min) || min < 0) throw fail(400, 'Invalid minimum price');
    conditions.push(`p.price >= ${add(min)}`);
  }
  if (req.query.maxPrice !== undefined) {
    const max = Number(req.query.maxPrice);
    if (!Number.isFinite(max) || max < 0) throw fail(400, 'Invalid maximum price');
    conditions.push(`p.price <= ${add(max)}`);
  }
  const orderBy = {
    relevance: 'p.created_at DESC',
    price_asc: 'p.price ASC',
    price_desc: 'p.price DESC',
    rating: 'p.rating DESC, p.review_count DESC',
    newest: 'p.created_at DESC'
  }[req.query.sort ?? 'relevance'];
  if (!orderBy) throw fail(400, 'Unsupported sort option');
  const where = conditions.join(' AND ');
  const count = await query(`SELECT COUNT(*)::int AS total FROM products p WHERE ${where}`, values);
  const rows = await query(
    `${productSelect} WHERE ${where} GROUP BY p.id, c.name ORDER BY ${orderBy}
     LIMIT ${add(limit)} OFFSET ${add((page - 1) * limit)}`,
    values
  );
  const total = count.rows[0].total;
  res.json({ products: rows.rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}));

router.get('/products/:id', asyncRoute(async (req, res) => {
  const result = await query(`${productSelect} WHERE p.id = $1 AND p.is_active = TRUE GROUP BY p.id, c.name`, [validId(req.params.id)]);
  if (!result.rows[0]) throw fail(404, 'Product not found');
  res.json({ product: result.rows[0] });
}));

router.get('/cart', authenticate, asyncRoute(async (req, res) => {
  const result = await query(
    `SELECT ci.product_id, ci.quantity, p.name, p.price, p.stock,
      (SELECT pi.image_url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.position LIMIT 1) AS image_url
     FROM cart_items ci JOIN products p ON p.id = ci.product_id
     WHERE ci.user_id = $1 ORDER BY ci.created_at DESC`,
    [req.user.id]
  );
  const subtotal = result.rows.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
  res.json({ items: result.rows, subtotal });
}));

router.post('/cart/items', authenticate, asyncRoute(async (req, res) => {
  const body = bodyObject(req);
  const productId = validId(body.product_id);
  const quantity = Number(body.quantity ?? 1);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw fail(400, 'Quantity must be between 1 and 99');
  const result = await query('SELECT stock FROM products WHERE id = $1 AND is_active = TRUE', [productId]);
  if (!result.rows[0]) throw fail(404, 'Product not found');
  if (result.rows[0].stock < quantity) throw fail(409, 'Not enough stock available');
  const updated = await query(
    `INSERT INTO cart_items(user_id, product_id, quantity) VALUES($1, $2, $3)
     ON CONFLICT(user_id, product_id) DO UPDATE
       SET quantity = cart_items.quantity + EXCLUDED.quantity, updated_at = NOW()
       WHERE cart_items.quantity + EXCLUDED.quantity <=
         (SELECT stock FROM products WHERE id = EXCLUDED.product_id)
     RETURNING product_id`,
    [req.user.id, productId, quantity]
  );
  if (!updated.rowCount) throw fail(409, 'Adding this quantity would exceed available stock');
  res.status(201).json({ message: 'Cart updated' });
}));

router.patch('/cart/items/:productId', authenticate, asyncRoute(async (req, res) => {
  const productId = validId(req.params.productId);
  const quantity = Number(bodyObject(req).quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw fail(400, 'Quantity must be between 1 and 99');
  const result = await query(
    `UPDATE cart_items ci SET quantity = $3, updated_at = NOW()
     FROM products p WHERE ci.user_id = $1 AND ci.product_id = $2 AND p.id = ci.product_id AND p.stock >= $3
     RETURNING ci.product_id`,
    [req.user.id, productId, quantity]
  );
  if (!result.rowCount) throw fail(409, 'Item is unavailable or quantity exceeds stock');
  res.json({ message: 'Quantity updated' });
}));

router.delete('/cart/items/:productId', authenticate, asyncRoute(async (req, res) => {
  await query('DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2', [req.user.id, validId(req.params.productId)]);
  res.status(204).end();
}));

router.get('/wishlist', authenticate, asyncRoute(async (req, res) => {
  const wishlistId = await ensureWishlist(req.user.id);
  const result = await query(
    `${productSelect} JOIN wishlist_items wi ON wi.product_id = p.id
     WHERE wi.wishlist_id = $1 AND p.is_active = TRUE GROUP BY p.id, c.name ORDER BY MAX(wi.created_at) DESC`,
    [wishlistId]
  );
  res.json({ products: result.rows });
}));

router.post('/wishlist/:productId', authenticate, asyncRoute(async (req, res) => {
  const productId = validId(req.params.productId);
  const wishlistId = await ensureWishlist(req.user.id);
  const exists = await query('SELECT id FROM products WHERE id = $1 AND is_active = TRUE', [productId]);
  if (!exists.rowCount) throw fail(404, 'Product not found');
  await query('INSERT INTO wishlist_items(wishlist_id, product_id) VALUES($1, $2) ON CONFLICT DO NOTHING', [wishlistId, productId]);
  res.status(201).json({ message: 'Added to wishlist' });
}));

router.delete('/wishlist/:productId', authenticate, asyncRoute(async (req, res) => {
  await query(
    'DELETE FROM wishlist_items wi USING wishlists w WHERE wi.wishlist_id = w.id AND w.user_id = $1 AND wi.product_id = $2',
    [req.user.id, validId(req.params.productId)]
  );
  res.status(204).end();
}));

router.get('/addresses', authenticate, asyncRoute(async (req, res) => {
  const result = await query('SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC', [req.user.id]);
  res.json({ addresses: result.rows });
}));

router.post('/addresses', authenticate, asyncRoute(async (req, res) => {
  const data = validated(addressSchema, bodyObject(req));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (data.is_default) await client.query('UPDATE addresses SET is_default = FALSE WHERE user_id = $1', [req.user.id]);
    const result = await client.query(
      `INSERT INTO addresses(user_id, full_name, phone, line1, line2, city, state, postal_code, country, is_default)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.user.id, data.full_name, data.phone, data.line1, data.line2, data.city, data.state, data.postal_code, data.country, data.is_default]
    );
    await client.query('COMMIT');
    res.status(201).json({ address: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.patch('/addresses/:id', authenticate, asyncRoute(async (req, res) => {
  const id = validId(req.params.id);
  const data = validated(addressSchema.partial(), bodyObject(req));
  if (!Object.keys(data).length) throw fail(400, 'At least one address field is required');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (data.is_default) await client.query('UPDATE addresses SET is_default = FALSE WHERE user_id = $1', [req.user.id]);
    const fields = Object.keys(data);
    const values = fields.map((field) => data[field]);
    const assignments = fields.map((field, index) => `${field} = $${index + 3}`);
    const result = await client.query(
      `UPDATE addresses SET ${assignments.join(', ')}, updated_at = NOW()
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [id, req.user.id, ...values]
    );
    if (!result.rowCount) throw fail(404, 'Address not found');
    await client.query('COMMIT');
    res.json({ address: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.delete('/addresses/:id', authenticate, asyncRoute(async (req, res) => {
  const result = await query('DELETE FROM addresses WHERE id = $1 AND user_id = $2', [validId(req.params.id), req.user.id]);
  if (!result.rowCount) throw fail(404, 'Address not found');
  res.status(204).end();
}));

router.post('/orders', authenticate, asyncRoute(async (req, res) => {
  const body = bodyObject(req);
  const addressId = validId(body.address_id);
  const paymentMethod = body.payment_method ?? 'cod';
  if (!['cod', 'razorpay'].includes(paymentMethod)) throw fail(400, 'Unsupported payment method');
  if (paymentMethod === 'razorpay' && (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET)) {
    throw fail(503, 'Online payments are not configured; choose cash on delivery');
  }

  const client = await pool.connect();
  let order;
  try {
    await client.query('BEGIN');
    const addressResult = await client.query('SELECT * FROM addresses WHERE id = $1 AND user_id = $2 FOR SHARE', [addressId, req.user.id]);
    const address = addressResult.rows[0];
    if (!address) throw fail(404, 'Delivery address not found');
    const itemsResult = await client.query(
      `SELECT ci.product_id, ci.quantity, p.name, p.price, p.stock,
        (SELECT pi.image_url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.position LIMIT 1) AS image_url
       FROM cart_items ci JOIN products p ON p.id = ci.product_id
       WHERE ci.user_id = $1 AND p.is_active = TRUE ORDER BY p.id FOR UPDATE OF p`,
      [req.user.id]
    );
    if (!itemsResult.rowCount) throw fail(400, 'Your cart is empty');
    if (itemsResult.rows.some((item) => item.stock < item.quantity)) throw fail(409, 'One or more items are out of stock');
    const subtotalCents = itemsResult.rows.reduce((sum, item) => sum + Math.round(Number(item.price) * 100) * item.quantity, 0);
    const subtotal = subtotalCents / 100;
    const deliveryFee = subtotal >= 999 ? 0 : 49;
    const total = subtotal + deliveryFee;
    const orderResult = await client.query(
      `INSERT INTO orders(user_id, address_id, status, payment_method, subtotal, delivery_fee, total, address_snapshot)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.id, addressId, paymentMethod === 'cod' ? 'placed' : 'pending_payment', paymentMethod, subtotal, deliveryFee, total, JSON.stringify(address)]
    );
    order = orderResult.rows[0];
    for (const item of itemsResult.rows) {
      await client.query(
        `INSERT INTO order_items(order_id, product_id, product_name, image_url, unit_price, quantity, line_total)
         VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [order.id, item.product_id, item.name, item.image_url, item.price, item.quantity, Math.round(Number(item.price) * 100) * item.quantity / 100]
      );
      await client.query('UPDATE products SET stock = stock - $1, updated_at = NOW() WHERE id = $2', [item.quantity, item.product_id]);
    }
    await client.query('DELETE FROM cart_items WHERE user_id = $1', [req.user.id]);
    if (paymentMethod === 'cod') {
      await client.query(
        `INSERT INTO payments(order_id, provider, amount, status) VALUES($1, 'cod', $2, 'created')`,
        [order.id, total]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  res.status(201).json({ order });
}));

router.post('/orders/:id/payment-intent', authenticate, asyncRoute(async (req, res) => {
  const orderId = validId(req.params.id);
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) throw fail(503, 'Online payments are not configured');
  const result = await query(
    `SELECT id, total, status, payment_method FROM orders WHERE id = $1 AND user_id = $2`,
    [orderId, req.user.id]
  );
  const order = result.rows[0];
  if (!order) throw fail(404, 'Order not found');
  if (order.payment_method !== 'razorpay' || order.status !== 'pending_payment') throw fail(409, 'This order cannot accept another payment');
  const razorpay = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
  const providerOrder = await razorpay.orders.create({
    amount: Math.round(Number(order.total) * 100), currency: 'INR', receipt: `shopkart-${order.id}-${Date.now()}`
  });
  const payment = await query(
    `INSERT INTO payments(order_id, provider, provider_order_id, amount)
     VALUES($1, 'razorpay', $2, $3) RETURNING provider_order_id, amount, currency, status`,
    [order.id, providerOrder.id, order.total]
  );
  res.status(201).json({ payment: { ...payment.rows[0], key_id: process.env.RAZORPAY_KEY_ID } });
}));

router.post('/orders/:id/verify-payment', authenticate, asyncRoute(async (req, res) => {
  const orderId = validId(req.params.id);
  const { razorpay_order_id: providerOrderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = bodyObject(req);
  if (![providerOrderId, paymentId, signature].every((value) => typeof value === 'string' && value.length > 0)) {
    throw fail(400, 'Payment verification details are required');
  }
  const paymentResult = await query(
    `SELECT p.*, o.user_id FROM payments p JOIN orders o ON o.id = p.order_id
     WHERE p.order_id = $1 AND p.provider_order_id = $2 AND o.user_id = $3`,
    [orderId, providerOrderId, req.user.id]
  );
  const payment = paymentResult.rows[0];
  if (!payment) throw fail(404, 'Payment not found');
  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${providerOrderId}|${paymentId}`).digest('hex');
  const suppliedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (suppliedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) {
    throw fail(400, 'Payment signature is invalid');
  }
  const razorpay = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
  const providerPayment = await razorpay.payments.fetch(paymentId);
  if (providerPayment.order_id !== providerOrderId || providerPayment.status !== 'captured' ||
      Number(providerPayment.amount) !== Math.round(Number(payment.amount) * 100) || providerPayment.currency !== payment.currency) {
    throw fail(409, 'Payment has not been captured by the provider');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE payments SET provider_payment_id = $1, status = 'captured', updated_at = NOW() WHERE id = $2`,
      [paymentId, payment.id]
    );
    const result = await client.query(
      `UPDATE orders SET payment_status = 'paid', status = 'placed', updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND status = 'pending_payment' RETURNING *`,
      [orderId, req.user.id]
    );
    if (!result.rowCount) throw fail(409, 'This order is no longer awaiting payment');
    await client.query('COMMIT');
    res.json({ order: result.rows[0], payment_status: 'paid' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.get('/orders', authenticate, asyncRoute(async (req, res) => {
  const result = await query('SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
  res.json({ orders: result.rows });
}));

router.get('/orders/:id', authenticate, asyncRoute(async (req, res) => {
  const id = validId(req.params.id);
  const result = await query('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [id, req.user.id]);
  if (!result.rows[0]) throw fail(404, 'Order not found');
  const items = await query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY id', [id]);
  res.json({ order: { ...result.rows[0], items: items.rows } });
}));

router.get('/admin/summary', authenticate, adminOnly, asyncRoute(async (_req, res) => {
  const result = await query(
    `SELECT (SELECT COUNT(*)::int FROM products) AS products,
      (SELECT COUNT(*)::int FROM orders) AS orders,
      (SELECT COUNT(*)::int FROM users WHERE role = 'customer') AS customers,
      (SELECT COALESCE(SUM(total), 0) FROM orders WHERE payment_status = 'paid') AS revenue,
      (SELECT COUNT(*)::int FROM products WHERE stock < 5) AS low_stock`
  );
  res.json({ summary: result.rows[0] });
}));

router.post('/admin/products', authenticate, adminOnly, asyncRoute(async (req, res) => {
  const data = validated(productSchema, bodyObject(req));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO products(category_id, name, description, price, compare_at_price, stock)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
      [data.category_id ?? null, data.name, data.description, data.price, data.compare_at_price ?? null, data.stock]
    );
    if (data.image_url) await client.query('INSERT INTO product_images(product_id, image_url) VALUES($1,$2)', [result.rows[0].id, data.image_url]);
    await client.query('COMMIT');
    res.status(201).json({ id: result.rows[0].id });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.patch('/admin/products/:id', authenticate, adminOnly, asyncRoute(async (req, res) => {
  const id = validId(req.params.id);
  const data = validated(productPatchSchema, bodyObject(req));
  if (!Object.keys(data).length) throw fail(400, 'At least one product field is required');
  const { image_url: imageUrl, ...fields } = data;
  if (fields.price !== undefined || fields.compare_at_price !== undefined) {
    const current = await query('SELECT price, compare_at_price FROM products WHERE id = $1', [id]);
    if (!current.rowCount) throw fail(404, 'Product not found');
    const price = fields.price ?? Number(current.rows[0].price);
    const compareAt = fields.compare_at_price === undefined ? current.rows[0].compare_at_price : fields.compare_at_price;
    if (compareAt != null && Number(compareAt) < Number(price)) throw fail(400, 'Compare-at price must be greater than or equal to price');
  }
  const keys = Object.keys(fields);
  const values = keys.map((key) => fields[key]);
  const assignments = keys.map((key, index) => `${key} = $${index + 2}`);
  if (assignments.length) {
    const result = await query(
      `UPDATE products SET ${assignments.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING id`,
      [id, ...values]
    );
    if (!result.rowCount) throw fail(404, 'Product not found');
  }
  if (imageUrl) {
    const product = await query('SELECT id FROM products WHERE id = $1', [id]);
    if (!product.rowCount) throw fail(404, 'Product not found');
    await query(
      `INSERT INTO product_images(product_id, image_url, position) VALUES($1,$2,0)
       ON CONFLICT(product_id, position) DO UPDATE SET image_url = EXCLUDED.image_url`,
      [id, imageUrl]
    );
  }
  res.json({ message: 'Product updated' });
}));

router.delete('/admin/products/:id', authenticate, adminOnly, asyncRoute(async (req, res) => {
  const result = await query('UPDATE products SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id', [validId(req.params.id)]);
  if (!result.rowCount) throw fail(404, 'Product not found');
  res.status(204).end();
}));

router.post('/admin/categories', authenticate, adminOnly, asyncRoute(async (req, res) => {
  const body = bodyObject(req);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
  const icon = typeof body.icon === 'string' ? body.icon.slice(0, 16) : '🛍️';
  if (name.length < 2 || name.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw fail(400, 'A category name and valid slug are required');
  }
  const result = await query('INSERT INTO categories(name, slug, icon) VALUES($1,$2,$3) RETURNING *', [name, slug, icon]);
  res.status(201).json({ category: result.rows[0] });
}));

router.get('/admin/orders', authenticate, adminOnly, asyncRoute(async (_req, res) => {
  const result = await query(
    `SELECT o.*, u.name AS customer_name, u.email AS customer_email
     FROM orders o JOIN users u ON u.id = o.user_id ORDER BY o.created_at DESC LIMIT 200`
  );
  res.json({ orders: result.rows });
}));

router.patch('/admin/orders/:id', authenticate, adminOnly, asyncRoute(async (req, res) => {
  const id = validId(req.params.id);
  const allowed = ['processing', 'shipped', 'delivered'];
  const body = bodyObject(req);
  if (!allowed.includes(body.status)) throw fail(400, 'Invalid order status');
  const result = await query('UPDATE orders SET status = $2, updated_at = NOW() WHERE id = $1 AND status <> $3 RETURNING *', [id, body.status, 'pending_payment']);
  if (!result.rowCount) throw fail(404, 'Order not found');
  res.json({ order: result.rows[0] });
}));

export default router;
