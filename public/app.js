const board = document.querySelector("#board");
const roomEl = document.querySelector("#room");
const status = document.querySelector("#status");
const statusDot = document.querySelector("#status-dot");
const players = document.querySelector("#players");
const selectionPanel = document.querySelector("#selection-panel");
const selectedModel = document.querySelector("#selected-model");
const modelDetails = document.querySelector("#model-details");
const rotationValue = document.querySelector("#rotation-value");
const zoomLabel = document.querySelector("#zoom-label");

let attempt = 0;
let models = [];
let selectedId = null;
let socket;
const view = { x: 0, y: 0, zoom: 1 };
const requestedRoom = new URL(location.href).searchParams.get("room");

function updateConnection(label, isOnline) { status.textContent = label; statusDot.classList.toggle("online", isOnline); }
function selected() { return models.find((entry) => entry.id === selectedId); }
function send(message) { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); }
function acceptModels(incoming) {
  models = incoming.map((model) => {
    const previous = models.find((entry) => entry.id === model.id);
    return { ...model, rotation: Number.isFinite(model.rotation) ? model.rotation : previous?.rotation ?? 0 };
  });
}

function updateSelection() {
  const model = selected();
  selectionPanel.hidden = !model;
  if (!model) return;
  selectedModel.textContent = model.name;
  modelDetails.textContent = `Position ${model.x.toFixed(1)}, ${model.y.toFixed(1)}`;
  rotationValue.value = `${Math.round(model.rotation ?? 0)}°`;
  rotationValue.textContent = rotationValue.value;
}

function applyView() { board.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`; zoomLabel.value = `${Math.round(view.zoom * 100)}%`; zoomLabel.textContent = zoomLabel.value; }
function setZoom(nextZoom, clientX, clientY) { const zoom = Math.max(0.6, Math.min(2.5, nextZoom)); const rect = board.parentElement.getBoundingClientRect(); const dx = (clientX ?? rect.left + rect.width / 2) - rect.left - rect.width / 2; const dy = (clientY ?? rect.top + rect.height / 2) - rect.top - rect.height / 2; view.x = dx - ((dx - view.x) * zoom) / view.zoom; view.y = dy - ((dy - view.y) * zoom) / view.zoom; view.zoom = zoom; applyView(); }
function resetView() { Object.assign(view, { x: 0, y: 0, zoom: 1 }); applyView(); }

function render() {
  board.replaceChildren(...models.map((model) => {
    const token = document.createElement("button");
    token.className = `model ${selectedId === model.id ? "selected" : ""}`;
    token.style.cssText = `left:${model.x}%;top:${model.y}%;--model-color:${model.color};--rotation:${model.rotation ?? 0}deg`;
    token.dataset.id = model.id;
    token.setAttribute("aria-label", `Move ${model.name}`);
    token.setAttribute("aria-pressed", String(selectedId === model.id));
    token.innerHTML = `<span>${model.name.slice(0, 1)}</span><em>${model.name}</em>`;
    token.addEventListener("pointerdown", startDrag);
    return token;
  }));
  updateSelection();
}

function moveSelected(dx, dy) {
  const model = selected();
  if (!model) return;
  model.x = Math.max(2, Math.min(98, model.x + dx));
  model.y = Math.max(2, Math.min(98, model.y + dy));
  send({ type: "move", id: model.id, rotation: model.rotation, x: model.x, y: model.y });
  render();
}

function moveSelectedAlongFacing(distance) {
  const model = selected();
  if (!model) return;
  const radians = ((Number.isFinite(model.rotation) ? model.rotation : 0) * Math.PI) / 180;
  moveSelected(Math.sin(radians) * distance, -Math.cos(radians) * distance);
}

function rotateSelected(degrees) {
  const model = selected();
  if (!model) return;
  const currentRotation = Number.isFinite(model.rotation) ? model.rotation : 0;
  model.rotation = ((currentRotation + degrees) % 360 + 360) % 360;
  send({ type: "rotate", id: model.id, rotation: model.rotation });
  render();
}

function startDrag(event) {
  if (socket?.readyState !== WebSocket.OPEN) return;
  event.stopPropagation(); selectedId = event.currentTarget.dataset.id;
  const move = (pointer) => { const rect = board.getBoundingClientRect(); const model = selected(); model.x = Math.max(2, Math.min(98, ((pointer.clientX - rect.left) / rect.width) * 100)); model.y = Math.max(2, Math.min(98, ((pointer.clientY - rect.top) / rect.height) * 100)); render(); };
  const end = () => { const model = selected(); if (model) send({ type: "move", id: model.id, rotation: model.rotation, x: model.x, y: model.y }); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); };
  window.addEventListener("pointermove", move); window.addEventListener("pointerup", end, { once: true }); render();
}

board.addEventListener("pointerdown", (event) => { if (event.target !== board || event.button !== 0) return; const start = { x: event.clientX, y: event.clientY, viewX: view.x, viewY: view.y }; board.classList.add("panning"); board.setPointerCapture(event.pointerId); const pan = (pointer) => { view.x = start.viewX + pointer.clientX - start.x; view.y = start.viewY + pointer.clientY - start.y; applyView(); }; const end = () => { board.classList.remove("panning"); board.removeEventListener("pointermove", pan); board.removeEventListener("pointerup", end); }; board.addEventListener("pointermove", pan); board.addEventListener("pointerup", end, { once: true }); });
board.addEventListener("wheel", (event) => { event.preventDefault(); setZoom(view.zoom * (event.deltaY < 0 ? 1.1 : 0.9), event.clientX, event.clientY); }, { passive: false });

window.addEventListener("keydown", (event) => {
  if (!selected() || event.metaKey || event.ctrlKey || event.altKey || event.target.matches("input, textarea, select")) return;
  const step = event.shiftKey ? 5 : 1;
  const actions = { ArrowUp: () => moveSelectedAlongFacing(step), ArrowDown: () => moveSelectedAlongFacing(-step), ArrowLeft: () => rotateSelected(-15), ArrowRight: () => rotateSelected(15), "[": () => rotateSelected(-15), "]": () => rotateSelected(15), r: () => rotateSelected(-(selected().rotation ?? 0)), Escape: () => { selectedId = null; render(); } };
  if (!actions[event.key]) return;
  event.preventDefault(); actions[event.key]();
});

function connect() { updateConnection(attempt ? "Reconnecting…" : "Connecting…", false); const protocol = location.protocol === "https:" ? "wss" : "ws"; socket = new WebSocket(`${protocol}://${location.host}/socket${requestedRoom ? `?room=${encodeURIComponent(requestedRoom)}` : ""}`); socket.addEventListener("open", () => { attempt = 0; updateConnection("Live board", true); }); socket.addEventListener("close", () => { updateConnection("Reconnecting…", false); window.setTimeout(connect, Math.min(8000, 500 * 2 ** attempt++)); }); socket.addEventListener("message", ({ data }) => { const message = JSON.parse(data); if (message.type === "room") { roomEl.textContent = message.roomId.slice(0, 8).toUpperCase(); history.replaceState({}, "", `?room=${message.roomId}`); acceptModels(message.models); render(); } if (message.type === "state") { acceptModels(message.models); render(); } if (message.type === "presence") players.textContent = message.count === 1 ? "Just you" : `${message.count} players connected`; }); }

document.querySelector("#zoom-in").addEventListener("click", () => setZoom(view.zoom * 1.2)); document.querySelector("#zoom-out").addEventListener("click", () => setZoom(view.zoom / 1.2)); document.querySelector("#reset-view").addEventListener("click", resetView); document.querySelector("#rotate-left").addEventListener("click", () => rotateSelected(-15)); document.querySelector("#rotate-right").addEventListener("click", () => rotateSelected(15)); document.querySelector("#copy-link").addEventListener("click", async () => { await navigator.clipboard.writeText(location.href); document.querySelector("#copy-link").textContent = "Invite link copied"; window.setTimeout(() => { document.querySelector("#copy-link").textContent = "Copy invite link"; }, 1600); });
applyView(); connect();
