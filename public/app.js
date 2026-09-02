const board = document.querySelector("#board");
const roomEl = document.querySelector("#room");
const status = document.querySelector("#status");
const statusDot = document.querySelector("#status-dot");
const players = document.querySelector("#players");

let attempt = 0;
let models = [];
let selectedId = null;
let socket;
const requestedRoom = new URL(location.href).searchParams.get("room");

function updateConnection(label, isOnline) {
  status.textContent = label;
  statusDot.classList.toggle("online", isOnline);
}

function render() {
  board.replaceChildren(...models.map((model) => {
    const token = document.createElement("button");
    token.className = `model ${selectedId === model.id ? "selected" : ""}`;
    token.style.cssText = `left:${model.x}%;top:${model.y}%;--model-color:${model.color}`;
    token.dataset.id = model.id;
    token.setAttribute("aria-label", `Move ${model.name}`);
    token.innerHTML = `<span>${model.name.slice(0, 1)}</span><em>${model.name}</em>`;
    token.addEventListener("pointerdown", startDrag);
    return token;
  }));
}

function startDrag(event) {
  if (socket?.readyState !== WebSocket.OPEN) return;
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
    socket.send(JSON.stringify({ type: "move", id: model.id, x: model.x, y: model.y }));
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end, { once: true });
  render();
}

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

document.querySelector("#copy-link").addEventListener("click", async () => {
  await navigator.clipboard.writeText(location.href);
  document.querySelector("#copy-link").textContent = "Invite link copied";
  window.setTimeout(() => { document.querySelector("#copy-link").textContent = "Copy invite link"; }, 1600);
});

connect();
