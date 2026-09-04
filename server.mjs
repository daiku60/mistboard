import { createHash, randomUUID } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const STARTING_MODELS = [
  ["iron-1", "Ironclad", "#8da3b8", 26, 31],
  ["iron-2", "Sparrow", "#c4d3df", 38, 48],
  ["iron-3", "Wayfarer", "#728ca7", 24, 66],
  ["ember-1", "Ember", "#d58359", 74, 30],
  ["ember-2", "Ashen", "#f0b16e", 64, 52],
  ["ember-3", "Kindler", "#a85942", 77, 68],
].map(([id, name, color, x, y], index) => ({
  baseMm: [30, 40, 50, 30, 40, 50][index],
  id,
  name,
  color,
  rotation: 0,
  x,
  y,
}));

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

export class RoomStore {
  constructor({ roomTtlMs = 15 * 60 * 1000 } = {}) {
    this.roomTtlMs = roomTtlMs;
    this.rooms = new Map();
  }

  get(roomId) {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = {
        clients: new Set(),
        chargeIds: [],
        circles: {},
        expiryTimer: null,
        models: structuredClone(STARTING_MODELS),
      };
      this.rooms.set(roomId, room);
    }
    return room;
  }

  join(roomId, client) {
    const room = this.get(roomId);
    if (room.expiryTimer) clearTimeout(room.expiryTimer);
    room.expiryTimer = null;
    room.clients.add(client);
    return room;
  }

  leave(roomId, client) {
    const room = this.rooms.get(roomId);
    if (
      !room ||
      !room.clients.delete(client) ||
      room.clients.size > 0 ||
      room.expiryTimer
    )
      return;
    room.expiryTimer = setTimeout(() => {
      const current = this.rooms.get(roomId);
      if (current && current.clients.size === 0) this.rooms.delete(roomId);
    }, this.roomTtlMs);
  }

  move(roomId, { id, rotation, x, y }) {
    if (typeof id !== "string" || !Number.isFinite(x) || !Number.isFinite(y))
      return false;
    const model = this.get(roomId).models.find((entry) => entry.id === id);
    if (!model) return false;
    model.x = Math.max(2, Math.min(98, x));
    model.y = Math.max(2, Math.min(98, y));
    if (Number.isFinite(rotation))
      model.rotation = ((rotation % 360) + 360) % 360;
    return true;
  }

  setBase(roomId, { id, baseMm }) {
    if (![30, 40, 50].includes(baseMm)) return false;
    const model = this.get(roomId).models.find((entry) => entry.id === id);
    if (!model) return false;
    model.baseMm = baseMm;
    return true;
  }

  rotate(roomId, { id, rotation }) {
    if (typeof id !== "string" || !Number.isFinite(rotation)) return false;
    const model = this.get(roomId).models.find((entry) => entry.id === id);
    if (!model) return false;
    model.rotation = ((rotation % 360) + 360) % 360;
    return true;
  }

  setCircles(roomId, { circles }) {
    if (!circles || Array.isArray(circles) || typeof circles !== "object")
      return false;
    const room = this.get(roomId),
      modelIds = new Set(room.models.map((model) => model.id));
    for (const [id, ranges] of Object.entries(circles)) {
      if (
        !modelIds.has(id) ||
        !Array.isArray(ranges) ||
        ranges.some(
          (range) => !Number.isInteger(range) || range < 1 || range > 20,
        )
      )
        return false;
    }
    room.circles = structuredClone(circles);
    return true;
  }

  setChargeLanes(roomId, { chargeIds }) {
    if (!Array.isArray(chargeIds)) return false;
    const room = this.get(roomId),
      modelIds = new Set(room.models.map((model) => model.id));
    if (chargeIds.some((id) => typeof id !== "string" || !modelIds.has(id)))
      return false;
    room.chargeIds = [...new Set(chargeIds)];
    return true;
  }
}

function frame(payload, opcode = 1) {
  const data = Buffer.isBuffer(payload)
    ? payload
    : Buffer.from(JSON.stringify(payload));
  if (data.length < 126)
    return Buffer.concat([Buffer.from([0x80 | opcode, data.length]), data]);
  if (data.length < 65_536)
    return Buffer.concat([
      Buffer.from([0x80 | opcode, 126, data.length >> 8, data.length & 255]),
      data,
    ]);
  throw new Error("WebSocket payload is too large");
}

function send(socket, payload, opcode = 1) {
  if (socket.destroyed || !socket.writable) return false;
  try {
    socket.write(frame(payload, opcode));
    return true;
  } catch {
    return false;
  }
}

function readFrames(socket, handlers) {
  let input = Buffer.alloc(0);
  socket.on("data", (chunk) => {
    input = Buffer.concat([input, chunk]);
    while (input.length >= 2) {
      const first = input[0];
      const second = input[1];
      const masked = Boolean(second & 0x80);
      let length = second & 0x7f;
      let offset = 2;
      if (!masked) return socket.destroy();
      if (length === 126) {
        if (input.length < 4) return;
        length = input.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) return socket.destroy();
      const total = offset + 4 + length;
      if (input.length < total) return;
      const mask = input.subarray(offset, offset + 4);
      const data = Buffer.from(input.subarray(offset + 4, total));
      for (let index = 0; index < data.length; index += 1)
        data[index] ^= mask[index % 4];
      input = input.subarray(total);

      const opcode = first & 0x0f;
      if (opcode === 8) return socket.end();
      if (opcode === 9) send(socket, data, 10);
      if (opcode === 1) handlers.message(data.toString("utf8"));
    }
  });
}

export function createMistboardServer({
  publicDirectory = join(process.cwd(), "public"),
  roomTtlMs,
} = {}) {
  const store = new RoomStore({ roomTtlMs });
  const clients = new Set();

  function count(roomId) {
    return store.get(roomId).clients.size;
  }

  function broadcast(roomId, message) {
    for (const client of store.get(roomId).clients)
      send(client.socket, message);
  }

  function removeClient(client) {
    if (!clients.delete(client)) return;
    store.leave(client.roomId, client);
    broadcast(client.roomId, { type: "presence", count: count(client.roomId) });
  }

  const server = createServer((request, response) => {
    const pathname = request.url?.split("?")[0] ?? "/";
    const filePath = normalize(
      join(publicDirectory, pathname === "/" ? "index.html" : pathname),
    );
    if (!filePath.startsWith(publicDirectory) || !existsSync(filePath))
      return response.writeHead(404).end("Not found");
    response.writeHead(200, {
      "content-type":
        MIME_TYPES[extname(filePath)] ?? "application/octet-stream",
    });
    const file = createReadStream(filePath);
    file.on("error", () => response.end());
    file.pipe(response);
  });

  server.on("upgrade", (request, socket) => {
    const roomId =
      new URL(request.url, `http://${request.headers.host}`).searchParams
        .get("room")
        ?.replace(/[^a-zA-Z0-9-]/g, "")
        .slice(0, 40) || randomUUID();
    const key = request.headers["sec-websocket-key"];
    if (!key) return socket.destroy();
    const accept = createHash("sha1")
      .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest("base64");
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );

    const client = { id: randomUUID(), roomId, socket };
    clients.add(client);
    const room = store.join(roomId, client);
    send(socket, {
      type: "room",
      roomId,
      clientId: client.id,
      models: room.models,
      circles: room.circles,
      chargeIds: room.chargeIds,
    });
    broadcast(roomId, { type: "presence", count: count(roomId) });
    socket.once("close", () => removeClient(client));
    socket.once("error", () => removeClient(client));
    readFrames(socket, {
      message(raw) {
        try {
          const message = JSON.parse(raw);
          if (message.type === "preview" && Array.isArray(message.models)) {
            const models = message.models
              .filter(
                ({ id, x, y }) =>
                  typeof id === "string" &&
                  Number.isFinite(x) &&
                  Number.isFinite(y),
              )
              .map(({ id, x, y }) => ({
                id,
                x: Math.max(2, Math.min(98, x)),
                y: Math.max(2, Math.min(98, y)),
              }));
            broadcast(roomId, {
              type: "preview",
              senderId: client.id,
              preview: { isDragging: Boolean(message.isDragging), models },
            });
            return;
          }
          if (message.type === "previewClear") {
            broadcast(roomId, { type: "previewClear", senderId: client.id });
            return;
          }
          const changed =
            message.type === "move"
              ? store.move(roomId, message)
              : message.type === "rotate"
                ? store.rotate(roomId, message)
                : message.type === "base"
                  ? store.setBase(roomId, message)
                  : message.type === "circles"
                    ? store.setCircles(roomId, message)
                    : message.type === "chargeLanes"
                      ? store.setChargeLanes(roomId, message)
                      : false;
          if (!changed) return;
          broadcast(roomId, {
            type: "state",
            models: store.get(roomId).models,
            circles: store.get(roomId).circles,
            chargeIds: store.get(roomId).chargeIds,
          });
        } catch {
          // Invalid client messages do not affect the room.
        }
      },
    });
  });

  return { server, store };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { server } = createMistboardServer();
  const port = Number(process.env.PORT ?? 3000);
  server.listen(port, () =>
    console.log(`Mistboard is running at http://localhost:${port}`),
  );
}
