# ShopKart — Vighnesh_Store

ShopKart is an Amazon-inspired shopping app with original branding. It includes an Expo/React Native client, an Express REST API, Neon PostgreSQL persistence, JWT authentication, and optional Razorpay test-mode payments.

## Included

- Product discovery, category browsing, text search, price filters, sorting and pagination
- Product detail, stock-aware cart, wishlist, account, saved addresses and order history
- Checkout with server-calculated totals, delivery fee and transactional stock/order updates
- Cash on delivery, plus Razorpay order creation and provider-side captured-payment verification
- Admin dashboard for products, stock, categories, order fulfilment and summary metrics
- Database migrations and repeatable sample product/category seed data

## Requirements

- Node.js 22.13.0 or newer and npm
- A Neon PostgreSQL database
- Expo Go for non-payment development; native Android/iOS tooling for Razorpay checkout

## Backend setup

In PowerShell, from the project root:

```powershell
cd backend
npm install
Copy-Item .env.example .env
```

Edit `backend/.env` and set:

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@YOUR-NEON-HOST/DB?sslmode=require
JWT_SECRET=use-a-long-random-secret-at-least-32-characters
PORT=4000
CORS_ORIGIN=*
```

Copy the connection string from the Neon console. Keep the complete string, including its SSL options, private. `.env` is ignored by Git; never put this URL or the JWT secret in the mobile app.

Create the schema and seed the catalogue:

```powershell
npm run db:migrate
npm run db:seed
```

`db:seed` creates sample categories and products. To create/promote an initial admin, optionally set these in `backend/.env` before seeding:

```dotenv
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=choose-a-unique-password
```

Run the API:

```powershell
npm run dev
```

`GET http://localhost:4000/health` checks both the server and database connection. API routes are under `/api`. The server refuses to start without `DATABASE_URL` and a sufficiently long `JWT_SECRET`; database errors are logged server-side and returned without credential details.

## Mobile setup

In a second PowerShell terminal, from the project root:

```powershell
cd mobile
npm install
Copy-Item .env.example .env
npm start
```

The default API URL uses `http://10.0.2.2:4000/api` for the Android emulator and `http://localhost:4000/api` for the iOS simulator. For a physical phone on the same Wi-Fi, set `EXPO_PUBLIC_API_URL` in `mobile/.env` to your computer's LAN address, for example `http://192.168.1.25:4000/api`; the backend port must be reachable from the phone.

For a phone on another Wi-Fi network or mobile data, deploy the API first using the [Render deployment instructions](#deploy-the-api-to-render), then set `EXPO_PUBLIC_API_URL` to the deployed HTTPS API URL. Start Expo with `npx expo start --tunnel --clear` and scan its QR code with Expo Go. The Expo tunnel provides the app bundle; the deployed API URL provides catalogue and account data. Restart Expo whenever you change the API URL.

Run a native app from Expo's terminal with `a` (Android) or `i` (iOS). Android/iOS simulator builds also work with:

```powershell
npx expo run:android
npx expo run:ios
```

The Razorpay React Native SDK requires a native development build and does not run in Expo Go. Configure the native build before testing online payments. Cash on delivery and the rest of the app can be developed with Expo Go.

## Deploy the API to Render

The root `render.yaml` is a Render Blueprint for the Express API. It uses Render's free web-service plan, which sleeps after inactivity and can take time to respond to the first request after waking. The API is public at its Render HTTPS URL; keep credentials in Render's environment settings, not in the mobile app or source control.

1. Push this project to a GitHub repository. In Render, create a Blueprint instance from that repository and apply `render.yaml`.
2. When prompted, enter the production Neon connection string as `DATABASE_URL`. Render generates `JWT_SECRET`; do not replace it with a value committed to the repository.
3. If the Neon database does not already have the ShopKart schema, run `npm run db:migrate` from `backend/` with the production `DATABASE_URL` set in your local environment. Do not run the seed command unless you want sample data in that database.
4. Wait for the Render health check at `/health` to pass, then copy the service's HTTPS URL (for example, `https://shopkart-api.onrender.com`).
5. In `mobile/.env`, set `EXPO_PUBLIC_API_URL` to that URL with `/api` appended:

   ```dotenv
   EXPO_PUBLIC_API_URL=https://shopkart-api.onrender.com/api
   ```

6. From `mobile/`, restart Expo with `npx expo start --tunnel --clear` and scan the new QR code. The first request after the free service has slept may take a while; retry after it wakes.

Add `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` as backend environment variables in Render only if enabling online payments. Use test-mode credentials while developing.

The full browser app is available at `https://<your-render-service>.onrender.com`. Visitors can browse products, create an account or sign in, manage a cart and addresses, and place cash-on-delivery orders. The catalog-only page remains available at `/store`; its downloadable QR links to the full browser app. Browser checkout currently offers cash on delivery. Razorpay checkout is available in the native mobile app only. A public app-download listing is not configured.

Render builds the browser app from `mobile/` as part of the backend build. When configuring a Web Service manually, use `backend` as the root directory, `npm ci && npm run build` as the build command, `npm start` as the start command, and `/health` as the health check path.

## Razorpay test mode

Online payment is optional. Without provider credentials, choose cash on delivery. To enable test checkout, set these **backend-only** values in `backend/.env` using Razorpay test-mode API keys:

```dotenv
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
```

The key ID is returned to the client only for opening the provider's checkout; the key secret is never sent to the app. ShopKart verifies the provider signature and independently checks that Razorpay reports the payment as captured, with the expected order, amount and currency, before marking the order paid. No card data is stored by ShopKart. Configure Razorpay test credentials and use its documented test payment details; never use live keys during development.

## Useful scripts

From `backend/`:

```powershell
npm run dev
npm start
npm test
npm run db:migrate
npm run db:seed
```

From `mobile/`:

```powershell
npm start
npm run android
npm run ios
```

## API overview

Public endpoints: `GET /api/categories`, `GET /api/products`, `GET /api/products/:id`, `POST /api/auth/register`, `POST /api/auth/login`.

Authenticated endpoints cover profile, cart, wishlist, addresses, checkout, order history and order details. Use `Authorization: Bearer <JWT>`. Admin endpoints under `/api/admin` require an admin JWT. Search supports `q`, `category`, `minPrice`, `maxPrice`, `sort`, `page` and `limit`.

Order creation locks the products during stock checks, snapshots address and item details, updates stock and clears the cart in one PostgreSQL transaction. The server calculates item totals and delivery fee (₹49 below ₹999; free at/above ₹999). Payment status stays pending until verified with the provider.

## Configuration / deployment notes

- Supply your own Neon `DATABASE_URL`, random `JWT_SECRET`, and (only if using online payments) Razorpay test keys.
- The seed script creates sample data; replace sample image URLs and catalogue content before launch.
- For production, set `CORS_ORIGIN` to the deployed client origin, use HTTPS, configure backups/monitoring, and apply migrations as part of deployment.
- The app is a functional starter, not a substitute for production operations such as tax/shipping rules, refunds, payment webhooks, fraud controls, privacy notices or store publishing setup.
- `npm audit --omit=dev` currently reports upstream transitive advisories in Expo's CLI (`node-forge`) and Metro's image tooling (`image-size`). These are build/development tools and are not included in the exported app bundle; recheck the audit and update Expo when upstream patched releases are available.
