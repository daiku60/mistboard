# Mistboard

A small shared tabletop prototype: fixed board, six models, and live movement through a shareable room link.

## Test locally

1. Install Node.js 20 or later.
2. Run `npm run dev` in this folder.
3. Open `http://localhost:3000`. A room link is added automatically.
4. Open that exact link in a second browser window, then drag a model. Both boards should update.

For a friend on another network, host the server somewhere reachable from the internet (or temporarily tunnel port 3000), then send them the room link. Board state is intentionally in memory and resets if the server restarts.
