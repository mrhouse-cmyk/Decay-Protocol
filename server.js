const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const gridSize = 10;
function createGrid() {
  const grid = [];
  for (let y=0;y<gridSize;y++) {
    const row = [];
    for (let x=0;x<gridSize;x++) row.push({});
    grid.push(row);
  }
  return grid;
}

const gameState = {
  players: {},
  zombies: [],
  grid: createGrid()
};

function addPlayer(id) {
  gameState.players[id] = { x: Math.floor(gridSize/2), y: Math.floor(gridSize/2), health: 10, ap: 20 };
}

function removePlayer(id) {
  delete gameState.players[id];
}

io.on('connection', socket => {
  addPlayer(socket.id);
  socket.emit('state', gameState);

  socket.on('move', ({dx,dy}) => {
    const p = gameState.players[socket.id];
    if (!p) return;
    const nx = p.x + dx;
    const ny = p.y + dy;
    if (nx>=0 && nx<gridSize && ny>=0 && ny<gridSize) {
      p.x = nx; p.y = ny;
    }
  });

  socket.on('attack', () => {
    // simple attack: remove zombie on same tile
    const p = gameState.players[socket.id];
    if (!p) return;
    const zi = gameState.zombies.findIndex(z=>z.x===p.x && z.y===p.y);
    if (zi>=0) gameState.zombies.splice(zi,1);
  });

  socket.on('search', () => {
    // placeholder for search logic
  });

  socket.on('rest', () => {
    const p = gameState.players[socket.id];
    if (p) p.ap = 20;
  });

  socket.on('disconnect', () => {
    removePlayer(socket.id);
  });
});

function moveZombies() {
  gameState.zombies.forEach(z => {
    const dir = [ [1,0],[-1,0],[0,1],[0,-1] ][Math.floor(Math.random()*4)];
    const nx = z.x + dir[0];
    const ny = z.y + dir[1];
    if (nx>=0 && nx<gridSize && ny>=0 && ny<gridSize) { z.x = nx; z.y = ny; }
  });
}

setInterval(() => {
  moveZombies();
  io.emit('state', gameState);
}, 1000);

server.listen(3000, () => {
  console.log('Server listening on port 3000');
});
