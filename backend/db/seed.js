import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const categories = [
  { name: 'Electronics', slug: 'electronics', icon: '📱' },
  { name: 'Fashion', slug: 'fashion', icon: '👕' },
  { name: 'Home & Kitchen', slug: 'home-kitchen', icon: '🏠' },
  { name: 'Beauty', slug: 'beauty', icon: '✨' },
  { name: 'Books', slug: 'books', icon: '📚' },
  { name: 'Sports', slug: 'sports', icon: '⚽' }
];
const products = [
  ['Everyday Wireless Headphones', 'Comfortable wireless audio with rich, balanced sound.', 2499, 3999, 36, 4.5, 'electronics', 'https://images.unsplash.com/photo-1505740420928-5e560c06d30b?w=900'],
  ['Smart Watch Series Active', 'Track your activity, sleep and everyday notifications.', 4299, 5999, 24, 4.3, 'electronics', 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=900'],
  ['Classic Everyday Backpack', 'A durable, roomy backpack designed for daily commutes.', 1899, 2599, 50, 4.4, 'fashion', 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=900'],
  ['Ceramic Pour-over Coffee Set', 'A simple ceramic set for a better morning coffee ritual.', 1299, 1799, 18, 4.7, 'home-kitchen', 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=900'],
  ['Daily Hydration Skincare Kit', 'A gentle, fragrance-free skincare routine for daily use.', 999, 1499, 42, 4.2, 'beauty', 'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=900'],
  ['The Art of Everyday Living', 'A thoughtful hardcover for ideas, creativity and inspiration.', 599, 799, 63, 4.6, 'books', 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=900'],
  ['Performance Running Shoes', 'Lightweight cushioning and a flexible everyday fit.', 3199, 4499, 31, 4.5, 'fashion', 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=900'],
  ['Insulated Steel Water Bottle', 'Leak-resistant double-wall insulation for hot or cold drinks.', 799, 1099, 75, 4.1, 'sports', 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=900']
];

let client;
try {
  client = await pool.connect();
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  await client.query('BEGIN');
  for (const category of categories) {
    await client.query(
      `INSERT INTO categories(name, slug, icon) VALUES($1, $2, $3)
       ON CONFLICT(slug) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon`,
      [category.name, category.slug, category.icon]
    );
  }
  for (const [name, description, price, compareAt, stock, rating, slug, image] of products) {
    const result = await client.query(
      `INSERT INTO products(category_id, name, description, price, compare_at_price, stock, rating, review_count)
       SELECT c.id, $1, $2, $3, $4, $5, $6, floor(random() * 400 + 40)::int
       FROM categories c WHERE c.slug = $7
         AND NOT EXISTS (SELECT 1 FROM products existing WHERE existing.name = $1)
       RETURNING id`,
      [name, description, price, compareAt, stock, rating, slug]
    );
    if (result.rows[0]) {
      await client.query('INSERT INTO product_images(product_id, image_url) VALUES($1, $2)', [result.rows[0].id, image]);
    }
  }
  if (adminEmail && adminPassword) {
    const hash = await bcrypt.hash(adminPassword, 12);
    await client.query(
      `INSERT INTO users(name, email, password_hash, role) VALUES('ShopKart Admin', lower($1), $2, 'admin')
       ON CONFLICT(email) DO UPDATE SET role = 'admin'`,
      [adminEmail, hash]
    );
  }
  await client.query('COMMIT');
  console.log(`Seeded ${categories.length} categories and sample products.${adminEmail ? ' Admin account configured.' : ''}`);
} catch (error) {
  if (client) await client.query('ROLLBACK');
  throw error;
} finally {
  client?.release();
  await pool.end();
}
