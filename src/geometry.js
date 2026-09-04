export const BOARD_INCHES = 36;
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const baseDiameterInches = (model) => (model.baseMm ?? 30) / 25.4;
export const percentToPixels = (side) => (percent) => (side * percent) / 100;
export const inchesToPixels = (side) => (inches) =>
  (side * inches) / BOARD_INCHES;
export function chargeLanePoints(model, length) {
  const angle = ((model.rotation || 0) * Math.PI) / 180,
    forward = { x: Math.sin(angle), y: -Math.cos(angle) },
    side = { x: Math.cos(angle), y: Math.sin(angle) },
    halfBase = (baseDiameterInches(model) / 2 / BOARD_INCHES) * 100,
    start = {
      x: model.x + forward.x * halfBase,
      y: model.y + forward.y * halfBase,
    },
    end = {
      x: start.x + ((forward.x * length) / BOARD_INCHES) * 100,
      y: start.y + ((forward.y * length) / BOARD_INCHES) * 100,
    };
  return [
    { x: start.x + side.x * halfBase, y: start.y + side.y * halfBase },
    { x: start.x - side.x * halfBase, y: start.y - side.y * halfBase },
    { x: end.x - side.x * halfBase, y: end.y - side.y * halfBase },
    { x: end.x + side.x * halfBase, y: end.y + side.y * halfBase },
  ];
}
