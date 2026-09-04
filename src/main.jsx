import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown } from "lucide-react";
import { Application, Graphics, Text } from "pixi.js";
import {
  BOARD_INCHES,
  baseDiameterInches,
  chargeLanePoints,
  clamp,
  inchesToPixels,
  percentToPixels,
} from "./geometry.js";
import "./styles.css";

const sizes = Array.from({ length: 20 }, (_, i) => i + 1);
function CircleSelect({ disabled, values, onChange }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="control" disabled={disabled}>
          {values.length ? values.map((v) => `${v}″`).join(", ") : "Circles"}
          <ChevronDown size={14} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="menu" align="end">
          <button className="option clear" onClick={() => onChange([])}>
            Clear
          </button>
          {sizes.map((v) => (
            <button
              className="option"
              key={v}
              onClick={() =>
                onChange(
                  values.includes(v)
                    ? values.filter((x) => x !== v)
                    : [...values, v],
                )
              }
            >
              {v}″ {values.includes(v) && <Check size={14} />}
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function PixiBoard({
  models,
  selected,
  selectionBox,
  pendingMove,
  circles,
  chargeIds,
  rotationCharge,
  measuring,
  ruler,
  zoom,
  onSelect,
  onSelectionBox,
  onPreviewMove,
  onPreviewEnd,
  onRotatePreview,
  onRotateEnd,
  onRotate,
  onMeasure,
}) {
  const host = useRef(null),
    state = useRef({});
  state.current = {
    ...state.current,
    models,
    selected,
    selectionBox,
    pendingMove,
    circles,
    chargeIds,
    rotationCharge,
    measuring,
    ruler,
    zoom,
    onSelect,
    onSelectionBox,
    onPreviewMove,
    onPreviewEnd,
    onRotatePreview,
    onRotateEnd,
    onRotate,
    onMeasure,
  };
  useEffect(() => {
    state.current.draw?.();
  });
  useEffect(() => {
    let app,
      observer,
      disposed = false,
      hoveredId = null;
    const start = async () => {
      app = new Application();
      await app.init({
        background: 0x789e78,
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
      });
      if (disposed) {
        app.destroy();
        return;
      }
      app.stage.sortableChildren = true;
      host.current.appendChild(app.canvas);
      app.canvas.className = "pixi-canvas";
      app.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
      const point = (e) => {
        const box = app.canvas.getBoundingClientRect();
        return {
          x: clamp(((e.clientX - box.left) / box.width) * 100, 0, 100),
          y: clamp(((e.clientY - box.top) / box.height) * 100, 0, 100),
        };
      };
      const drag = (model, event) => {
        const originals = state.current.models.filter((entry) =>
          state.current.selected.includes(entry.id),
        );
        const start = { x: event.clientX, y: event.clientY };
        let latest = { x: model.x, y: model.y },
          moved = false;
        const moveGroup = (target) => {
          const requestedX = target.x - model.x,
            requestedY = target.y - model.y,
            minX = Math.max(...originals.map((entry) => 2 - entry.x)),
            maxX = Math.min(...originals.map((entry) => 98 - entry.x)),
            minY = Math.max(...originals.map((entry) => 2 - entry.y)),
            maxY = Math.min(...originals.map((entry) => 98 - entry.y)),
            xOffset = clamp(requestedX, minX, maxX),
            yOffset = clamp(requestedY, minY, maxY);
          state.current.onPreviewMove(
            originals.map((entry) => ({
              id: entry.id,
              x: entry.x + xOffset,
              y: entry.y + yOffset,
            })),
          );
        };
        const move = (e) => {
            latest = point(e);
            moved ||= Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4;
            if (moved) moveGroup(latest);
          },
          up = () => {
            window.removeEventListener("pointermove", move);
            if (!moved) return;
            moveGroup(latest);
            state.current.onPreviewEnd();
          };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up, { once: true });
      };
      const selectOnClick = (model, event) => {
        const start = { x: event.clientX, y: event.clientY };
        let moved = false;
        const move = (e) => {
          moved ||= Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4;
        };
        window.addEventListener("pointermove", move);
        window.addEventListener(
          "pointerup",
          () => {
            window.removeEventListener("pointermove", move);
            if (!moved) state.current.onSelect([model.id]);
          },
          { once: true },
        );
      };
      const turn = (model, event) => {
        const box = app.canvas.getBoundingClientRect(),
          center = {
            x: box.left + (box.width * model.x) / 100,
            y: box.top + (box.height * model.y) / 100,
          },
          angle = (e) =>
            Math.round(
              (((Math.atan2(e.clientX - center.x, -(e.clientY - center.y)) *
                180) /
                Math.PI +
                360) %
                360) *
                2,
            ) / 2,
          updateChargePreview = (e) => {
            if (state.current.chargeIds.includes(model.id)) return;
            const distance =
              (Math.hypot(e.clientX - center.x, e.clientY - center.y) /
                box.width) *
              BOARD_INCHES;
            state.current.onRotatePreview({
              id: model.id,
              length: Math.max(0, distance - baseDiameterInches(model) / 2),
            });
          },
          move = (e) => {
            updateChargePreview(e);
            state.current.onRotate(model.id, angle(e));
          };
        updateChargePreview(event);
        window.addEventListener("mousemove", move);
        window.addEventListener(
          "mouseup",
          () => {
            window.removeEventListener("mousemove", move);
            state.current.onRotateEnd();
          },
          { once: true },
        );
      };
      const measure = (event) => {
        const start = point(event),
          move = (e) => state.current.onMeasure({ a: start, b: point(e) });
        state.current.onMeasure({ a: start, b: start });
        window.addEventListener("pointermove", move);
        window.addEventListener(
          "pointerup",
          () => {
            window.removeEventListener("pointermove", move);
            state.current.onMeasure(undefined);
          },
          { once: true },
        );
      };
      const selectArea = (event) => {
        const start = point(event);
        const move = (e) =>
          state.current.onSelectionBox({ start, end: point(e) });
        state.current.onSelectionBox({ start, end: start });
        window.addEventListener("pointermove", move);
        window.addEventListener(
          "pointerup",
          (e) => {
            window.removeEventListener("pointermove", move);
            const end = point(e);
            const minX = Math.min(start.x, end.x),
              maxX = Math.max(start.x, end.x),
              minY = Math.min(start.y, end.y),
              maxY = Math.max(start.y, end.y);
            state.current.onSelectionBox(null);
            state.current.onSelect(
              state.current.models
                .filter(
                  (model) =>
                    model.x >= minX &&
                    model.x <= maxX &&
                    model.y >= minY &&
                    model.y <= maxY,
                )
                .map((model) => model.id),
            );
          },
          { once: true },
        );
      };
      const updateHover = (event) => {
        const pointer = point(event);
        const hit = [...state.current.models].reverse().find((model) => {
          const radius = (baseDiameterInches(model) / 2 / BOARD_INCHES) * 100;
          return Math.hypot(model.x - pointer.x, model.y - pointer.y) <= radius;
        });
        const nextHoveredId = hit?.id ?? null;
        if (hoveredId === nextHoveredId) return;
        hoveredId = nextHoveredId;
        draw();
      };
      app.canvas.addEventListener("pointermove", updateHover);
      app.canvas.addEventListener("pointerleave", () => {
        if (!hoveredId) return;
        hoveredId = null;
        draw();
      });
      const draw = () => {
        if (!app || disposed) return;
        const s = state.current,
          box = host.current.getBoundingClientRect(),
          side = Math.max(1, Math.min(box.width, box.height));
        app.renderer.resize(side, side);
        app.stage.removeChildren();
        const px = percentToPixels(side),
          inches = inchesToPixels(side),
          add = (g) => (app.stage.addChild(g), g),
          drawChargeLane = (charge, length) => {
            const points = chargeLanePoints(charge, length).flatMap((p) => [
              px(p.x),
              px(p.y),
            ]);
            add(
              new Graphics()
                .poly(points, true)
                .fill({ color: 0xf0dc88, alpha: 0.22 })
                .stroke({ color: 0xf0dc88, alpha: 0.8, width: 1 }),
            );
          };
        const background = add(
          new Graphics().rect(0, 0, side, side).fill(0x789e78),
        );
        background.eventMode = "static";
        background.cursor = s.measuring ? "crosshair" : "default";
        background.on("pointerdown", (e) => {
          if (s.measuring) {
            measure(e.nativeEvent);
            return;
          }
          if (e.button === 2 && s.selected.length === 1) {
            const model = s.models.find((m) => m.id === s.selected[0]);
            if (model) turn(model, e.nativeEvent);
            return;
          }
          if (e.button === 0) {
            s.onMeasure(null);
            selectArea(e.nativeEvent);
          }
        });
        const grid = add(new Graphics());
        for (let i = 0; i <= 8; i++) {
          const v = (side * i) / 8;
          grid.moveTo(v, 0).lineTo(v, side).moveTo(0, v).lineTo(side, v);
        }
        grid.stroke({ color: 0x436d54, alpha: 0.55, width: 1 });
        if (s.selectionBox) {
          const { start, end } = s.selectionBox;
          const x = px(Math.min(start.x, end.x)),
            y = px(Math.min(start.y, end.y)),
            width = px(Math.abs(end.x - start.x)),
            height = px(Math.abs(end.y - start.y));
          add(
            new Graphics()
              .rect(x, y, width, height)
              .fill({ color: 0xf0dc88, alpha: 0.12 })
              .stroke({ color: 0xf0dc88, alpha: 0.9, width: 1 }),
          );
        }
        s.models
          .filter((model) => s.chargeIds.includes(model.id))
          .forEach((charge) => drawChargeLane(charge, 10));
        if (s.rotationCharge) {
          const charge = s.models.find(
            (model) => model.id === s.rotationCharge.id,
          );
          if (charge) drawChargeLane(charge, s.rotationCharge.length);
        }
        Object.entries(s.circles).forEach(([id, values]) => {
          const model = s.models.find((m) => m.id === id);
          if (!model) return;
          values.forEach((range) => {
            const x = px(model.x),
              y = px(model.y),
              radius = inches(range + baseDiameterInches(model) / 2);
            const circle = new Graphics()
              .circle(x, y, radius)
              .fill({ color: 0xf0dc88, alpha: 0.11 })
              .stroke({ color: 0xf0dc88, width: 2 });
            circle.zIndex = 10;
            add(circle);
            const label = new Text({
              text: `${range}″`,
              style: {
                fill: 0xf0dc88,
                fontFamily: "DM Mono",
                fontSize: 11,
                fontWeight: "bold",
              },
            });
            label.anchor.set(0.5);
            label.position.set(x, y - radius + 10);
            label.zIndex = 12;
            const labelBackground = new Graphics()
              .roundRect(
                x - label.width / 2 - 4,
                y - radius + 2,
                label.width + 8,
                label.height + 4,
                3,
              )
              .fill({ color: 0x17251b, alpha: 0.7 });
            labelBackground.zIndex = 11;
            add(labelBackground);
            app.stage.addChild(label);
          });
        });
        if (s.ruler) {
          add(
            new Graphics()
              .moveTo(px(s.ruler.a.x), px(s.ruler.a.y))
              .lineTo(px(s.ruler.b.x), px(s.ruler.b.y))
              .stroke({ color: 0xf0dc88, width: 2 }),
          );
          const label = new Text({
            text: `${(Math.hypot(s.ruler.a.x - s.ruler.b.x, s.ruler.a.y - s.ruler.b.y) * 0.36).toFixed(1)}″`,
            style: { fill: 0xf0dc88, fontFamily: "DM Mono", fontSize: 13 },
          });
          label.anchor.set(0.5);
          label.position.set(
            px((s.ruler.a.x + s.ruler.b.x) / 2),
            px((s.ruler.a.y + s.ruler.b.y) / 2),
          );
          app.stage.addChild(label);
        }
        s.models.forEach((model) => {
          const x = px(model.x),
            y = px(model.y),
            radius = inches(baseDiameterInches(model) / 2),
            g = new Graphics();
          g.circle(x, y, radius)
            .fill(model.color)
            .stroke({ color: 0xeeeeee, width: 3 });
          const radians = ((model.rotation || 0) * Math.PI) / 180;
          if (hoveredId === model.id)
            g.circle(x, y, radius + 4).stroke({
              color: 0xe9e3d7,
              alpha: 0.6,
              width: 3,
            });
          if (s.selected.includes(model.id))
            g.circle(x, y, radius + 6).stroke({ color: 0xf0dc88, width: 3 });
          if (hoveredId === model.id || s.selected.includes(model.id)) {
            const forward = { x: Math.sin(radians), y: -Math.cos(radians) },
              sideways = { x: Math.cos(radians), y: Math.sin(radians) },
              tip = {
                x: x + forward.x * (radius + 9),
                y: y + forward.y * (radius + 9),
              },
              baseCenter = {
                x: x + forward.x * (radius + 2),
                y: y + forward.y * (radius + 2),
              },
              halfWidth = Math.max(3, radius * 0.25);
            g.poly(
              [
                tip.x,
                tip.y,
                baseCenter.x + sideways.x * halfWidth,
                baseCenter.y + sideways.y * halfWidth,
                baseCenter.x - sideways.x * halfWidth,
                baseCenter.y - sideways.y * halfWidth,
              ],
              true,
            ).fill(0x17251b);
          }
          g.eventMode = "static";
          g.cursor = "pointer";
          g.on("pointerdown", (e) => {
            e.stopPropagation();
            if (e.button === 2) turn(model, e.nativeEvent);
            else if (e.button === 0) {
              if (s.selected.includes(model.id)) drag(model, e.nativeEvent);
              else selectOnClick(model, e.nativeEvent);
            }
          });
          app.stage.addChild(g);
          const label = new Text({
            text: model.name[0],
            style: {
              fill: 0x17251b,
              fontFamily: "DM Serif Display",
              fontSize: Math.max(10, radius * 0.8),
            },
          });
          label.anchor.set(0.5);
          label.position.set(x, y);
          label.eventMode = "none";
          app.stage.addChild(label);
        });
        s.pendingMove?.models.forEach((position) => {
          const model = s.models.find((entry) => entry.id === position.id);
          if (!model) return;
          const x = px(position.x),
            y = px(position.y),
            radius = inches(baseDiameterInches(model) / 2),
            opacity = s.pendingMove.isDragging ? 0.45 : 0.65,
            outline = s.pendingMove.isDragging ? 0xeeeeee : 0xf0dc88;
          const ghost = new Graphics()
            .circle(x, y, radius)
            .fill({ color: model.color, alpha: opacity })
            .stroke({ color: outline, alpha: opacity, width: 3 });
          ghost.zIndex = 20;
          const radians = ((model.rotation || 0) * Math.PI) / 180,
            forward = { x: Math.sin(radians), y: -Math.cos(radians) },
            sideways = { x: Math.cos(radians), y: Math.sin(radians) },
            tip = {
              x: x + forward.x * (radius + 9),
              y: y + forward.y * (radius + 9),
            },
            baseCenter = {
              x: x + forward.x * (radius + 2),
              y: y + forward.y * (radius + 2),
            },
            halfWidth = Math.max(3, radius * 0.25);
          ghost
            .poly(
              [
                tip.x,
                tip.y,
                baseCenter.x + sideways.x * halfWidth,
                baseCenter.y + sideways.y * halfWidth,
                baseCenter.x - sideways.x * halfWidth,
                baseCenter.y - sideways.y * halfWidth,
              ],
              true,
            )
            .fill({ color: 0x17251b, alpha: opacity });
          app.stage.addChild(ghost);
          const modelLabel = new Text({
            text: model.name[0],
            style: {
              fill: 0x17251b,
              fontFamily: "DM Serif Display",
              fontSize: Math.max(10, radius * 0.8),
            },
          });
          modelLabel.alpha = opacity;
          modelLabel.anchor.set(0.5);
          modelLabel.position.set(x, y);
          modelLabel.zIndex = 21;
          app.stage.addChild(modelLabel);
          (s.circles[model.id] || []).forEach((range) => {
            const circleRadius = inches(range + baseDiameterInches(model) / 2);
            const circle = new Graphics()
              .circle(x, y, circleRadius)
              .fill({ color: 0xf0dc88, alpha: 0.11 * opacity })
              .stroke({ color: 0xf0dc88, alpha: opacity, width: 2 });
            circle.zIndex = 30;
            add(circle);
            const label = new Text({
              text: `${range}″`,
              style: {
                fill: 0xf0dc88,
                fontFamily: "DM Mono",
                fontSize: 11,
                fontWeight: "bold",
              },
            });
            label.alpha = opacity;
            label.anchor.set(0.5);
            label.position.set(x, y - circleRadius + 10);
            label.zIndex = 32;
            const labelBackground = new Graphics()
              .roundRect(
                x - label.width / 2 - 4,
                y - circleRadius + 2,
                label.width + 8,
                label.height + 4,
                3,
              )
              .fill({ color: 0x17251b, alpha: 0.7 * opacity });
            labelBackground.zIndex = 31;
            add(labelBackground);
            app.stage.addChild(label);
          });
        });
      };
      state.current.draw = draw;
      observer = new ResizeObserver(draw);
      observer.observe(host.current);
      draw();
    };
    start();
    return () => {
      disposed = true;
      observer?.disconnect();
      app?.destroy(true, { children: true });
    };
  }, []);
  return (
    <div
      ref={host}
      className={`board-canvas ${measuring ? "measuring" : ""}`}
      style={{ transform: `scale(${zoom})` }}
    />
  );
}

function App() {
  const [models, setModels] = useState([]),
    [selected, setSelected] = useState([]),
    [selectionBox, setSelectionBox] = useState(null),
    [pendingMove, setPendingMove] = useState(null),
    [circles, setCircles] = useState({}),
    [zoom, setZoom] = useState(1),
    [measuring, setMeasuring] = useState(false),
    [ruler, setRuler] = useState(null),
    [chargeIds, setChargeIds] = useState([]),
    [rotationCharge, setRotationCharge] = useState(null),
    sock = useRef();
  const selectedModels = models.filter((m) => selected.includes(m.id)),
    model = selectedModels.length === 1 ? selectedModels[0] : null,
    send = (message) =>
      sock.current?.readyState === 1 &&
      sock.current.send(JSON.stringify(message));
  useEffect(() => {
    const room = new URL(location).searchParams.get("room"),
      ws = (sock.current = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/socket${room ? `?room=${room}` : ""}`,
      ));
    ws.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (message.models) setModels(message.models);
      if (message.roomId)
        history.replaceState({}, "", `?room=${message.roomId}`);
    };
    return () => ws.close();
  }, []);
  const update = (id, patch) =>
      setModels((current) =>
        current.map((m) => (m.id === id ? { ...m, ...patch } : m)),
      ),
    move = (id, patch) => {
      const current = models.find((m) => m.id === id);
      if (!current) return;
      update(id, patch);
      send({
        type: "move",
        id,
        x: patch.x,
        y: patch.y,
        rotation: current.rotation || 0,
      });
    },
    turn = (id, rotation) => {
      update(id, { rotation });
      send({ type: "rotate", id, rotation });
    },
    rotate = (amount) =>
      selectedModels.forEach((entry) =>
        turn(entry.id, ((entry.rotation || 0) + amount + 360) % 360),
      ),
    moveSelection = (direction, step) =>
      selectedModels.forEach((entry) => {
        const rotation = ((entry.rotation || 0) * Math.PI) / 180;
        move(entry.id, {
          x: clamp(entry.x + Math.sin(rotation) * step * direction, 2, 98),
          y: clamp(entry.y - Math.cos(rotation) * step * direction, 2, 98),
        });
      }),
    moveBoardRelative = (xDirection, yDirection) =>
      selectedModels.forEach((entry) => {
        const step = (0.25 / BOARD_INCHES) * 100;
        move(entry.id, {
          x: clamp(entry.x + xDirection * step, 2, 98),
          y: clamp(entry.y + yDirection * step, 2, 98),
        });
      });
  useEffect(() => {
    const key = (e) => {
      if (e.key === "Escape" && pendingMove) {
        setPendingMove(null);
        e.preventDefault();
        return;
      }
      if (e.key === "Enter" && pendingMove && !pendingMove.isDragging) {
        pendingMove.models.forEach((position) =>
          move(position.id, { x: position.x, y: position.y }),
        );
        setPendingMove(null);
        e.preventDefault();
        return;
      }
      if (e.ctrlKey && e.key === "." && selectedModels.length) {
        setCircles((current) =>
          selectedModels.reduce(
            (next, entry) => ({ ...next, [entry.id]: [] }),
            { ...current },
          ),
        );
        e.preventDefault();
        return;
      }
      const digitShortcut = e.code.match(/^Digit([0-9])$/);
      if (e.ctrlKey && selectedModels.length && digitShortcut) {
        const digit = Number(digitShortcut[1]);
        const range = e.altKey ? (digit || 10) + 10 : digit || 10;
        setCircles((current) => {
          const everyModelHasRange = selectedModels.every((entry) =>
            (current[entry.id] || []).includes(range),
          );
          return selectedModels.reduce(
            (next, entry) => {
              const ranges = current[entry.id] || [];
              next[entry.id] = everyModelHasRange
                ? ranges.filter((value) => value !== range)
                : ranges.includes(range)
                  ? ranges
                  : [...ranges, range];
              return next;
            },
            { ...current },
          );
        });
        e.preventDefault();
        return;
      }
      if (e.key.toLowerCase() === "c" && selectedModels.length) {
        setChargeIds((current) => {
          const everyModelHasChargeLane = selectedModels.every((entry) =>
            current.includes(entry.id),
          );
          return everyModelHasChargeLane
            ? current.filter((id) => !selected.includes(id))
            : [...new Set([...current, ...selected])];
        });
        e.preventDefault();
        return;
      }
      if (!selectedModels.length) return;
      const step = (1 / BOARD_INCHES) * 100;
      if (e.shiftKey && e.key === "ArrowLeft") moveBoardRelative(-1, 0);
      else if (e.shiftKey && e.key === "ArrowRight") moveBoardRelative(1, 0);
      else if (e.shiftKey && e.key === "ArrowUp") moveBoardRelative(0, -1);
      else if (e.shiftKey && e.key === "ArrowDown") moveBoardRelative(0, 1);
      else if (e.key === "ArrowLeft") rotate(-15);
      else if (e.key === "ArrowRight") rotate(15);
      else if (e.key === "ArrowUp") moveSelection(1, step);
      else if (e.key === "ArrowDown") moveSelection(-1, step);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [model, pendingMove, selected, selectedModels]);
  const values = model ? circles[model.id] || [] : [];
  return (
    <main>
      <header>
        <div>
          <p>SHARED ONLINE TABLETOP</p>
          <h1>Mistboard</h1>
        </div>
        <div>● Live board</div>
      </header>
      <section className="table">
        <div className="tools">
          <button
            className="control"
            onClick={() => setZoom((z) => clamp(z - 0.2, 0.6, 2.5))}
          >
            −
          </button>
          <button
            className="control"
            onClick={() => setZoom((z) => clamp(z + 0.2, 0.6, 2.5))}
          >
            +
          </button>
          <button className="control" onClick={() => setZoom(1)}>
            Reset view
          </button>
          <button
            className={`control ${measuring ? "active" : ""}`}
            onClick={() => {
              setMeasuring((v) => !v);
              setRuler(null);
            }}
          >
            {measuring ? "Measuring" : "Measure"}
          </button>
          <CircleSelect
            disabled={!model}
            values={values}
            onChange={(value) =>
              setCircles((current) => ({ ...current, [model.id]: value }))
            }
          />
        </div>
        <PixiBoard
          models={models}
          selected={selected}
          selectionBox={selectionBox}
          pendingMove={pendingMove}
          circles={circles}
          chargeIds={chargeIds}
          rotationCharge={rotationCharge}
          measuring={measuring}
          ruler={ruler}
          zoom={zoom}
          onSelect={(ids) => {
            setSelected(ids);
            if (!ids.length) setRuler(null);
          }}
          onSelectionBox={setSelectionBox}
          onPreviewMove={(positions) =>
            setPendingMove({ isDragging: true, models: positions })
          }
          onPreviewEnd={() =>
            setPendingMove((current) =>
              current ? { ...current, isDragging: false } : current,
            )
          }
          onRotatePreview={setRotationCharge}
          onRotateEnd={() => setRotationCharge(null)}
          onRotate={turn}
          onMeasure={(next) => {
            if (next === undefined) setMeasuring(false);
            else setRuler(next);
          }}
        />
      </section>
      <footer>
        {model ? (
          <>
            <span>
              Selected: {model.name} · {Math.round(model.rotation || 0)}°{" "}
              <select
                value={model.baseMm ?? 30}
                onChange={(e) => {
                  const baseMm = Number(e.target.value);
                  update(model.id, { baseMm });
                  send({ type: "base", id: model.id, baseMm });
                }}
              >
                <option value="30">30 mm</option>
                <option value="40">40 mm</option>
                <option value="50">50 mm</option>
              </select>
            </span>
            <span>
              <button onClick={() => rotate(-15)}>↶</button>
              <button onClick={() => rotate(15)}>↷</button>
            </span>
          </>
        ) : selectedModels.length ? (
          <span>
            Selected: {selectedModels.length} models · Arrow keys move or rotate
            all
          </span>
        ) : (
          "Select a model"
        )}
        <span>36″ × 36″</span>
      </footer>
    </main>
  );
}
createRoot(document.getElementById("root")).render(<App />);
