// server.js
const WebSocket = require("ws");
const wss = new WebSocket.Server({ port: 8080 });

const rooms = new Map(); // roomId => Set<ws>

console.log("시그널링 서버 실행 중 → ws://localhost:8080");

wss.on("connection", (ws) => {
  let currentRoom = null;

  ws.on("message", (rawData) => {
    let msg;
    try {
      msg = JSON.parse(rawData);
    } catch (e) {
      console.error("JSON 파싱 실패:", rawData);
      return;
    }

    // 방 입장 처리
    if (msg.type === "join") {
      const roomId = msg.room.toString();

      if (!rooms.has(roomId)) rooms.set(roomId, new Set());
      const room = rooms.get(roomId);

      // 2명 제한
      if (room.size >= 2) {
        ws.send(JSON.stringify({ type: "full" }));
        return;
      }

      room.add(ws);
      currentRoom = roomId;

      ws.send(JSON.stringify({ type: "joined", count: room.size }));
      console.log(`방 ${roomId} 입장 (${room.size}명)`);

      // 2명 모이면 Offer 시작
      if (room.size === 2) {
        const [a, b] = Array.from(room);
        a.send(JSON.stringify({ type: "start-offer" }));
      }

      return;
    }

    // 시그널링 (offer, answer, ice)
    if (currentRoom && rooms.has(currentRoom)) {
      const room = rooms.get(currentRoom);

      room.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(rawData);
        }
      });
    }
  });

  ws.on("close", () => {
    if (currentRoom && rooms.has(currentRoom)) {
      const room = rooms.get(currentRoom);
      room.delete(ws);

      room.forEach((client) => {
        client.send(JSON.stringify({ type: "partner-left" }));
      });

      if (room.size === 0) rooms.delete(currentRoom);
    }
  });
});
