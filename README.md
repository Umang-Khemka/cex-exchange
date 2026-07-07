# ⚡ CEX Trade

A production-oriented Centralized Cryptocurrency Exchange (CEX) built from scratch with a focus on scalability, low latency, and real-world trading system architecture.

## 🚀 Features

- User Authentication
- Spot Trading Engine
- Real-time Order Book
- Market & Limit Orders
- Trade Matching Engine
- Wallet & Balance Management
- Live Price Updates via WebSockets
- Redis Pub/Sub
- BullMQ Background Jobs
- PostgreSQL Persistence
- Dockerized Services
- REST API + WebSocket API

---

## 🏗️ Architecture

```
cex-trade/
│
├── backend/        # Trading engine, APIs, matching engine
├── frontend/       # React + Vite client
└── README.md
```

---

## 🛠️ Tech Stack

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS

### Backend

- Node.js
- Express
- TypeScript
- PostgreSQL
- Redis
- BullMQ
- WebSockets
- Prisma

---

## 📂 Project Structure

```
backend/
    src/
        controllers/
        routes/
        services/
        models/
        middleware/
        websocket/
        jobs/
        lib/

frontend/
    src/
        components/
        pages/
        hooks/
        services/
        store/
        layouts/
        lib/
```

---

## ⚙️ Getting Started

### Clone

```bash
git clone <repo-url>
cd cex-trade
```

### Backend

```bash
cd backend
npm install
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## 🎯 Goals

This project aims to replicate the architecture of a real-world centralized exchange by implementing:

- Low-latency order matching
- In-memory order books
- Persistent trade history
- Scalable WebSocket infrastructure
- Background job processing
- Event-driven architecture
- Fault-tolerant services

---

## 📈 Planned Features

- [ ] JWT Authentication
- [ ] Portfolio Dashboard
- [ ] TradingView Charts
- [ ] Candlestick Generation
- [ ] Order Matching Engine
- [ ] Stop Loss Orders
- [ ] Take Profit Orders
- [ ] Margin Trading
- [ ] Admin Dashboard
- [ ] Notifications
- [ ] Docker Compose
- [ ] CI/CD Pipeline
- [ ] Monitoring & Logging

---

## 📄 License

MIT License.