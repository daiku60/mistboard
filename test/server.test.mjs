import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { RoomStore } from "../server.mjs";

test("Mistboard exposes a dependency-free server command", async () => {
  const config = JSON.parse(await readFile("package.json", "utf8"));
  assert.equal(config.scripts.dev, "node server.mjs");
});

test("rooms start with independent board state", () => {
  const store = new RoomStore();
  assert.equal(store.get("first").models.length, 6);
  store.move("first", { id: "iron-1", x: 50, y: 50 });
  assert.equal(store.get("second").models[0].x, 26);
});

test("movement is validated and constrained to the board", () => {
  const store = new RoomStore();
  assert.equal(store.move("room", { id: "iron-1", x: -4, y: 300 }), true);
  assert.deepEqual(store.get("room").models[0], { id: "iron-1", name: "Ironclad", color: "#8da3b8", x: 2, y: 98 });
  assert.equal(store.move("room", { id: "unknown", x: 30, y: 30 }), false);
  assert.equal(store.move("room", { id: "iron-1", x: "bad", y: 30 }), false);
});

test("leaving the last player retains the room until its expiry", () => {
  const store = new RoomStore({ roomTtlMs: 60_000 });
  const player = {};
  store.join("room", player);
  store.leave("room", player);
  assert.equal(store.rooms.has("room"), true);
  clearTimeout(store.rooms.get("room").expiryTimer);
});
