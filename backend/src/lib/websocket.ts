import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";

type WSMessage =
  | { type: "orderbook";   market: string; data: any }
  | { type: "trade";       market: string; data: any }
  | { type: "balance";     userId: number; data: any }
  | { type: "orderUpdate"; userId: number; data: any };

class WebSocketManager {
  private wss:        WebSocketServer | null        = null;
  private marketSubs: Map<string, Set<WebSocket>>   = new Map();
  private userSockets: Map<number, WebSocket>       = new Map();

  init(server: Server) {
    this.wss = new WebSocketServer({ server });

    this.wss.on("connection", (ws) => {
      console.log("🔌 Client connected");

      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          this.handleMessage(ws, msg);
        } catch {
          ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
        }
      });

      ws.on("close", () => {
        this.removeClient(ws);
        console.log("🔌 Client disconnected");
      });

      ws.send(JSON.stringify({ type: "connected", message: "Welcome to CEX" }));
    });
  }

  private handleMessage(ws: WebSocket, msg: any) {
    switch (msg.type) {
      case "subscribe_market": {
        const market = msg.market as string;
        if (!this.marketSubs.has(market)) {
          this.marketSubs.set(market, new Set());
        }
        this.marketSubs.get(market)!.add(ws);
        ws.send(JSON.stringify({ type: "subscribed", market }));
        break;
      }

      case "unsubscribe_market": {
        const market = msg.market as string;
        this.marketSubs.get(market)?.delete(ws);
        ws.send(JSON.stringify({ type: "unsubscribed", market }));
        break;
      }

      case "auth": {
        const userId = msg.userId as number;
        this.userSockets.set(userId, ws);
        ws.send(JSON.stringify({ type: "authed", userId }));
        break;
      }

      default:
        ws.send(JSON.stringify({ type: "error", message: "Unknown message type" }));
    }
  }

  private removeClient(ws: WebSocket) {
    this.marketSubs.forEach((clients) => clients.delete(ws));
    this.userSockets.forEach((socket, userId) => {
      if (socket === ws) this.userSockets.delete(userId);
    });
  }

  // ── Broadcast methods ──────────────────────────

  broadcastOrderbook(market: string, data: any) {
    const clients = this.marketSubs.get(market);
    if (!clients) return;
    const msg = JSON.stringify({ type: "orderbook", market, data });
    clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    });
  }

  broadcastTrade(market: string, data: any) {
    const clients = this.marketSubs.get(market);
    if (!clients) return;
    const msg = JSON.stringify({ type: "trade", market, data });
    clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    });
  }

  sendBalanceUpdate(userId: number, data: any) {
    const ws = this.userSockets.get(userId);
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "balance", userId, data }));
    }
  }

  sendOrderUpdate(userId: number, data: any) {
    const ws = this.userSockets.get(userId);
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "orderUpdate", userId, data }));
    }
  }
}

export const wsManager = new WebSocketManager();