const board = document.querySelector("#board");
const roomEl = document.querySelector("#room");
const status = document.querySelector("#status");
const statusDot = document.querySelector("#status-dot");
const players = document.querySelector("#players");
const selectedModel = document.querySelector("#selected-model");
const zoomLabel = document.querySelector("#zoom-label");

let attempt = 0;
let models = [];
let selectedId = null;
let socket;
const view = { x: 0, y: 0, zoom: 1 };
const requestedRoom = new URL(location.href).searchParams.get("room");

function updateConnection(label, isOnline) {
  status.textContent = label;
  statusDot.classList.toggle("online", isOnline);
}

function updateSelection() {
  const model = models.find((entry) => entry.id === selectedId);
  selectedModel.textContent = model ? `Selected: ${model.name}` : "No model selected";
}

function applyView() {
  board.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`;
  zoomLabel.value = `${Math.round(view.zoom * 100)}%`;
  zoomLabel.textContent = zoomLabel.value;
}

function setZoom(nextZoom, clientX, clientY) {
  const zoom = Math.max(0.6, Math.min(2.5, nextZoom));
  const rect = board.parentElement.getBoundingClientRect();
  const dx = (clientX ?? rect.left + rect.width / 2) - rect.left - rect.width / 2;
  const dy = (clientY ?? rect.top + rect.height / 2) - rect.top - rect.height / 2;
  view.x = dx - ((dx - view.x) * zoom) / view.zoom;
  view.y = dy - ((dy - view.y) * zoom) / view.zoom;
  view.zoom = zoom;
  applyView();
}

function resetView() {
  Object.assign(view, { x: 0, y: 0, zoom: 1 });
  applyView();
}

function render() {
  board.replaceChildren(...models.map((model) => {
    const token = document.createElement("button");
    token.className = `model ${selectedId === model.id ? "selected" : ""}`;
    token.style.cssText = `left:${model.x}%;top:${model.y}%;--model-color:${model.color}`;
    token.dataset.id = model.id;
    token.setAttribute("aria-label", `Move ${model.name}`);
    token.setAttribute("aria-pressed", String(selectedId === model.id));
    token.innerHTML = `<span>${model.name.slice(0, 1)}</span><em>${model.name}</em>`;
    token.addEventListener("pointerdown", startDrag);
    return token;
  }));
  updateSelection();
}

function startDrag(event) {
  if (socket?.readyState !== WebSocket.OPEN) return;
  event.stopPropagation();
  selectedId = event.currentTarget.dataset.id;
  const move = (pointer) => {
    const rect = board.getBoundingClientRect();
    const model = models.find((entry) => entry.id === selectedId);
    model.x = Math.max(2, Math.min(98, ((pointer.clientX - rect.left) / rect.width) * 100));
    model.y = Math.max(2, Math.min(98, ((pointer.clientY - rect.top) / rect.height) * 100));
    render();
  };
  const end = () => {
    const model = models.find((entry) => entry.id === selectedId);
    if (model && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "move", id: model.id, x: model.x, y: model.y }));
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end, { once: true });
  render();
}

board.addEventListener("pointerdown", (event) => {
  if (event.target !== board || event.button !== 0) return;
  const start = { x: event.clientX, y: event.clientY, viewX: view.x, viewY: view.y };
  board.classList.add("panning");
  board.setPointerCapture(event.pointerId);
  const pan = (pointer) => {
    view.x = start.viewX + pointer.clientX - start.x;
    view.y = start.viewY + pointer.clientY - start.y;
    applyView();
  };
  const end = () => {
    board.classList.remove("panning");
    board.removeEventListener("pointermove", pan);
    board.removeEventListener("pointerup", end);
  };
  board.addEventListener("pointermove", pan);
  board.addEventListener("pointerup", end, { once: true });
});

board.addEventListener("wheel", (event) => {
  event.preventDefault();
  setZoom(view.zoom * (event.deltaY < 0 ? 1.1 : 0.9), event.clientX, event.clientY);
}, { passive: false });

function connect() {
  updateConnection(attempt ? "Reconnecting…" : "Connecting…", false);
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${protocol}://${location.host}/socket${requestedRoom ? `?room=${encodeURIComponent(requestedRoom)}` : ""}`);
  socket.addEventListener("open", () => { attempt = 0; updateConnection("Live board", true); });
  socket.addEventListener("close", () => {
    updateConnection("Reconnecting…", false);
    const delay = Math.min(8000, 500 * 2 ** attempt++);
    window.setTimeout(connect, delay);
  });
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.type === "room") {
      roomEl.textContent = message.roomId.slice(0, 8).toUpperCase();
      history.replaceState({}, "", `?room=${message.roomId}`);
      models = message.models;
      render();
    }
    if (message.type === "state") { models = message.models; render(); }
    if (message.type === "presence") players.textContent = message.count === 1 ? "Just you" : `${message.count} players connected`;
  });
}

document.querySelector("#zoom-in").addEventListener("click", () => setZoom(view.zoom * 1.2));
document.querySelector("#zoom-out").addEventListener("click", () => setZoom(view.zoom / 1.2));
document.querySelector("#reset-view").addEventListener("click", resetView);
document.querySelector("#copy-link").addEventListener("click", async () => {
  await navigator.clipboard.writeText(location.href);
  document.querySelector("#copy-link").textContent = "Invite link copied";
  window.setTimeout(() => { document.querySelector("#copy-link").textContent = "Copy invite link"; }, 1600);
});

applyView();
connect();
