# ⚡ CEX Trade

A production-oriented Centralized Cryptocurrency Exchange (CEX) built from scratch with a focus on low latency, crash safety, and real-world trading system architecture.

---

## 🚀 Features

### Trading
- Spot trading with limit and market orders
- In-memory matching engine with price-time priority
- Self-trade prevention
- Partial fills and order cancellation
- Maker/taker distinction
- OHLCV candle generation on every fill (1m, 5m, 15m, 1h, 4h, 1d)
- Real-time ticker (24h stats)

### Performance
- RAM-first architecture — orderbook and balances live in memory
- RAM-generated order IDs — zero DB calls in critical path
- BullMQ + Redis for async DB writes — non-blocking order placement
- Redis AOF persistence — crash-safe job queue
- Market data cached in RAM — no DB lookup on order placement
- Single bulk queue job per order — all DB writes batched

### Real-time
- WebSocket server for live updates
- Market orderbook push on every change
- Live trade broadcast to market subscribers
- Personal balance updates on fill
- Order status updates

### Security
- Cookie-based JWT authentication
- Balance check before order placement
- Fund locking to prevent double spend
- Self-trade prevention
- Rate limiting (global, auth, order)
- Ownership verification on cancel

### Data
- PostgreSQL via Supabase
- Prisma ORM with type-safe queries
- Full order, fill, balance, and candle history
- Bootstrap on restart — rebuilds RAM state from DB
- Crash recovery — open orders and balances reloaded on startup

---

## 🏗️ Architecture

```
cex-trade/
├── backend/        # Trading engine, APIs, matching engine
├── frontend/        # React + Vite client
└── README.md
```

### How an order flows through the system

```
POST /api/orders
    ↓
Validate + check balance (RAM)
    ↓
Lock funds (RAM instantly)
    ↓
Push LOCK_AND_CREATE to BullMQ (Redis, ~2ms)
    ↓
Matching engine runs (pure RAM, ~0ms)
    ↓
Push SETTLE_ORDER to BullMQ (Redis, ~2ms)
    ↓
Broadcast orderbook + trades via WebSocket
    ↓
Response sent (~10ms total)

Meanwhile in background:
BullMQ Worker → writes order, fills, balances, candles to PostgreSQL
```

### In-memory store structure

```js
balances = {
  userId: {
    "USD": { available: 1200, locked: 300 },
    "SOL": { available: 5, locked: 0 },
  }
}

orderbook = {
  "sol": {
    asks: [{ price, qty, orderId, userId }, ...], // LOW → HIGH
    bids: [{ price, qty, orderId, userId }, ...], // HIGH → LOW
    lastTradedPrice: 100
  }
}
```

---

## 🛠️ Tech Stack

### Backend
- **Node.js + Express** — HTTP server
- **TypeScript** — fully typed codebase
- **PostgreSQL (Supabase)** — persistent storage
- **Prisma ORM** — type-safe DB access
- **Redis (Docker)** — BullMQ job queue + AOF persistence
- **BullMQ** — async background job processing
- **WebSockets (ws)** — real-time push
- **bcryptjs** — password hashing
- **jsonwebtoken** — JWT auth

### Frontend
- **React + Vite** — UI framework
- **TypeScript** — type safety
- **Tailwind CSS** — styling

### Infrastructure
- **Docker** — Redis container with AOF enabled
- **Supabase** — hosted PostgreSQL

---

## 📂 Project Structure

```
backend/
└── src/
    ├── controllers/           # Route handlers
    │   ├── auth.controller.ts
    │   ├── order.controller.ts
    │   └── market.controller.ts
    ├── routes/                # Express routers
    │   ├── auth.routes.ts
    │   ├── order.routes.ts
    │   └── market.routes.ts
    ├── lib/                   # Core logic
    │   ├── db.ts              # Prisma singleton
    │   ├── store.ts           # In-memory orderbook + balances
    │   ├── engine.ts          # Matching engine
    │   ├── queue.ts           # BullMQ queue
    │   ├── redis.ts           # Redis connection
    │   ├── candle.ts          # OHLCV candle builder
    │   ├── balanceSync.ts     # RAM ↔ DB balance sync
    │   └── websocket.ts       # WebSocket manager
    ├── workers/
    │   └── dbWorker.ts        # Background DB write processor
    ├── middlewares/
    │   ├── auth.ts            # JWT middleware
    │   └── rateLimiter.ts     # Rate limiting
    ├── types/
    │   └── index.ts           # Shared TypeScript types
    └── index.ts                # App entry + bootstrap

frontend/
└── src/
    ├── components/            # Reusable UI components
    ├── pages/                 # Route pages
    ├── hooks/                 # Custom React hooks
    ├── services/              # API + WebSocket clients
    ├── store/                 # State management
    ├── layouts/               # Page layouts
    └── lib/                   # Utilities
```

---

## ⚙️ Getting Started

### Prerequisites
- Node.js 18+
- Docker Desktop
- Supabase account

### 1. Clone

```bash
git clone https://github.com/Umang-Khemka/cex-exchange.git
cd cex-trade
```

### 2. Start Redis

```bash
docker run -d --name cex-redis -p 6379:6379 -v cex-redis-data:/data redis:alpine redis-server --appendonly yes
```

### 3. Backend setup

```bash
cd backend
npm install
cp .env.example .env
# fill in your Supabase URLs and JWT secret
npx prisma migrate dev
npx prisma generate
npx tsx prisma/seed.ts
npm run dev
```

### 4. Frontend setup

```bash
cd frontend
npm install
npm run dev
```

---

## 🔌 API Reference

### Auth

| Method | Endpoint             | Description       |
|--------|-----------------------|--------------------|
| POST   | `/api/auth/register`  | Register new user |
| POST   | `/api/auth/login`     | Login              |
| POST   | `/api/auth/logout`    | Logout             |
| GET    | `/api/auth/me`        | Get current user   |

### Orders

| Method | Endpoint                | Description     |
|--------|---------------------------|-------------------|
| POST   | `/api/orders`             | Place order       |
| DELETE | `/api/orders/:id`         | Cancel order       |
| GET    | `/api/orders`             | Order history       |
| GET    | `/api/orders/fills`       | Fill history        |
| GET    | `/api/orders/balance`     | Current balance     |
| POST   | `/api/orders/deposit`     | Deposit funds        |

### Markets

| Method | Endpoint                          | Description        |
|--------|--------------------------------------|-----------------------|
| GET    | `/api/markets`                       | List all markets       |
| GET    | `/api/markets/:symbol/orderbook`     | Live orderbook           |
| GET    | `/api/markets/:symbol/candles`       | OHLCV candle data         |
| GET    | `/api/markets/:symbol/ticker`        | 24h ticker stats            |

### WebSocket

```
ws://localhost:3000
```

**Client → Server messages:**

```json
{ "type": "subscribe_market", "market": "sol" }
{ "type": "unsubscribe_market", "market": "sol" }
{ "type": "auth", "userId": 1 }
```

**Server → Client messages:**

```json
{ "type": "orderbook", "market": "sol", "data": { "bids": [], "asks": [], "lastTradedPrice": 100 } }
{ "type": "trade", "market": "sol", "data": { "price": 100, "qty": 1, "side": "buy", "ts": 0 } }
{ "type": "balance", "userId": 1, "data": { "asset": "USD", "available": 1200, "locked": 300 } }
```

---

## 📈 Roadmap

### In Progress
- [x] JWT Authentication
- [x] In-memory matching engine
- [x] Limit and market orders
- [x] Self-trade prevention
- [x] BullMQ async DB writes
- [x] Redis AOF crash safety
- [x] OHLCV candle generation
- [x] WebSocket real-time updates
- [ ] Rate limiting
- [ ] Fee system (maker/taker)
- [ ] Email notifications (welcome, fill, reset)
- [ ] Payment gateway integration
- [ ] Trading UI (React frontend)

### Planned
- [ ] Stop loss / take profit orders
- [ ] Portfolio dashboard
- [ ] Admin dashboard
- [ ] Docker Compose setup
- [ ] CI/CD pipeline
- [ ] Monitoring and logging
- [ ] Margin trading
- [ ] Mobile app

---

## 📄 License

MIT License