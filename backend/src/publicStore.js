import { Router } from 'express';
import QRCode from 'qrcode';
import { query } from './db.js';
import { asyncRoute } from './middleware.js';

const router = Router();
const PAGE_SIZE = 24;
const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const css = `
  :root { color-scheme: light; font-family: Arial, sans-serif; color: #172033; background: #f2f4f7; }
  * { box-sizing: border-box; }
  body { margin: 0; }
  header { padding: 22px max(20px, calc((100% - 1120px) / 2)); color: white; background: #101d32; }
  header a { color: inherit; text-decoration: none; }
  h1 { margin: 0; font-size: 28px; }
  main { max-width: 1120px; margin: 28px auto; padding: 0 20px; }
  .share { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 24px; padding: 18px; border-radius: 12px; background: white; }
  .share h2 { margin: 0 0 6px; font-size: 18px; }
  .share p { margin: 0; color: #687385; }
  .share img { width: 112px; height: 112px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 16px; }
  .card { overflow: hidden; border-radius: 12px; background: white; }
  .card img, .placeholder { display: block; width: 100%; aspect-ratio: 1 / 1; object-fit: cover; background: #e6e8eb; }
  .placeholder { display: grid; place-items: center; color: #687385; }
  .details { padding: 14px; }
  .category, .muted { color: #687385; font-size: 13px; }
  .name { margin: 7px 0; font-size: 16px; }
  .description { min-height: 36px; margin: 0 0 10px; color: #687385; font-size: 13px; }
  .price { color: #101d32; font-size: 18px; font-weight: 700; }
  .compare { margin-left: 8px; color: #687385; font-size: 13px; }
  .pagination { display: flex; align-items: center; justify-content: center; gap: 20px; margin: 28px 0; }
  .pagination a { color: #101d32; }
  @media (max-width: 520px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; } .share { padding: 14px; } .share img { width: 88px; height: 88px; } }
`;

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function safeImageUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function publicStoreUrl(req) {
  const configuredUrl = process.env.PUBLIC_STORE_URL;
  const renderUrl = process.env.RENDER_EXTERNAL_URL;
  const url = configuredUrl
    ? new URL(configuredUrl)
    : new URL('/store', renderUrl || `${req.protocol}://${req.get('host')}`);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('PUBLIC_STORE_URL must use HTTP or HTTPS');
  }
  return url.href;
}

router.get('/store.css', (_req, res) => {
  res.type('text/css').send(css);
});

router.get('/qr.png', asyncRoute(async (req, res) => {
  const image = await QRCode.toBuffer(publicStoreUrl(req), { type: 'png', width: 320, margin: 2 });
  res.type('png').set('Cache-Control', 'public, max-age=3600').send(image);
}));

router.get('/', asyncRoute(async (req, res) => {
  const requestedPage = Number.parseInt(req.query.page, 10);
  const count = await query('SELECT COUNT(*)::int AS total FROM products WHERE is_active = TRUE');
  const total = count.rows[0].total;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, pages) : 1;
  const result = await query(
    `SELECT p.name, p.description, p.price, p.compare_at_price, p.stock, p.rating,
            c.name AS category_name,
            (SELECT pi.image_url FROM product_images pi
             WHERE pi.product_id = p.id ORDER BY pi.position LIMIT 1) AS image_url
     FROM products p LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.is_active = TRUE ORDER BY p.created_at DESC, p.id DESC
     LIMIT $1 OFFSET $2`,
    [PAGE_SIZE, (page - 1) * PAGE_SIZE]
  );
  const cards = result.rows.map((product) => {
    const imageUrl = safeImageUrl(product.image_url);
    const comparePrice = product.compare_at_price && Number(product.compare_at_price) > Number(product.price)
      ? `<del class="compare">${escapeHtml(money.format(Number(product.compare_at_price)))}</del>`
      : '';
    return `<article class="card">
      ${imageUrl
        ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(product.name)}" loading="lazy">`
        : '<div class="placeholder">No image</div>'}
      <div class="details">
        <div class="category">${escapeHtml(product.category_name || 'ShopKart')}</div>
        <h2 class="name">${escapeHtml(product.name)}</h2>
        <p class="description">${escapeHtml(product.description)}</p>
        <div class="price">${escapeHtml(money.format(Number(product.price)))}${comparePrice}</div>
        <div class="muted">${Number(product.stock) > 0 ? 'In stock' : 'Currently unavailable'}</div>
      </div>
    </article>`;
  }).join('');
  const pagination = pages > 1
    ? `<nav class="pagination" aria-label="Product pages">
        ${page > 1 ? `<a href="/store?page=${page - 1}">Previous</a>` : ''}
        <span>Page ${page} of ${pages}</span>
        ${page < pages ? `<a href="/store?page=${page + 1}">Next</a>` : ''}
      </nav>`
    : '';
  res.type('html').send(`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="description" content="Browse products from ShopKart.">
        <title>ShopKart Store</title>
        <link rel="stylesheet" href="/store/store.css">
      </head>
      <body>
        <header><h1><a href="/store">ShopKart</a></h1></header>
        <main>
          <section class="share">
            <div><h2>Share our store</h2><p>Scan this QR code to browse our products.</p></div>
            <a href="/store/qr.png" download="shopkart-store-qr.png" aria-label="Download ShopKart store QR code">
              <img src="/store/qr.png" alt="QR code linking to the ShopKart store">
            </a>
          </section>
          <h2>Our products</h2>
          ${cards ? `<section class="grid">${cards}</section>` : '<p>No products are available right now.</p>'}
          ${pagination}
        </main>
      </body>
    </html>`);
}));

export default router;
