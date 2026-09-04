import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { RoomStore } from "../server.mjs";

test("Mistboard exposes a dependency-free server command", async () => {
  const config = JSON.parse(await readFile("package.json", "utf8"));
  assert.equal(config.scripts.dev, "npm run build:controls && node server.mjs");
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
  assert.deepEqual(store.get("room").models[0], {
    baseMm: 30,
    id: "iron-1",
    name: "Ironclad",
    color: "#8da3b8",
    rotation: 0,
    x: 2,
    y: 98,
  });
  assert.equal(store.move("room", { id: "unknown", x: 30, y: 30 }), false);
  assert.equal(store.move("room", { id: "iron-1", x: "bad", y: 30 }), false);
});

test("movement retains a model's facing", () => {
  const store = new RoomStore();
  store.rotate("room", { id: "iron-1", rotation: 90 });
  store.move("room", { id: "iron-1", x: 30, y: 30 });
  assert.equal(store.get("room").models[0].rotation, 90);
});

test("rotation is validated and normalized", () => {
  const store = new RoomStore();
  assert.equal(store.rotate("room", { id: "iron-1", rotation: -15 }), true);
  assert.equal(store.get("room").models[0].rotation, 345);
  assert.equal(store.rotate("room", { id: "iron-1", rotation: "bad" }), false);
});

test("circles and charge lanes are shared room state", () => {
  const store = new RoomStore();
  assert.equal(
    store.setCircles("room", {
      circles: { "iron-1": [3, 10], "ember-1": [20] },
    }),
    true,
  );
  assert.equal(
    store.setChargeLanes("room", { chargeIds: ["iron-1", "ember-1"] }),
    true,
  );
  assert.deepEqual(store.get("room").circles, {
    "iron-1": [3, 10],
    "ember-1": [20],
  });
  assert.deepEqual(store.get("room").chargeIds, ["iron-1", "ember-1"]);
  assert.equal(store.setCircles("room", { circles: { unknown: [3] } }), false);
  assert.equal(store.setChargeLanes("room", { chargeIds: ["unknown"] }), false);
});

test("leaving the last player retains the room until its expiry", () => {
  const store = new RoomStore({ roomTtlMs: 60_000 });
  const player = {};
  store.join("room", player);
  store.leave("room", player);
  assert.equal(store.rooms.has("room"), true);
  clearTimeout(store.rooms.get("room").expiryTimer);
});
