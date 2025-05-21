const socket = io();

let gameState = {
  players: {},
  zombies: [],
  grid: []
};

socket.on('state', state => {
  gameState = state;
  render();
});

function send(action, data={}) {
  socket.emit(action, data);
}

function render() {
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  const size = gameState.grid.length;
  for (let y=0; y<size; y++) {
    const row = gameState.grid[y];
    for (let x=0; x<size; x++) {
      const cell = document.createElement('div');
      cell.classList.add('cell');
      cell.dataset.x = x;
      cell.dataset.y = y;
      const player = Object.values(gameState.players).find(p => p.x===x && p.y===y);
      const zombie = gameState.zombies.find(z => z.x===x && z.y===y);
      if (player) cell.classList.add('player');
      if (zombie) cell.classList.add('zombie');
      grid.appendChild(cell);
    }
  }
}

window.addEventListener('load', () => {
  document.getElementById('north').addEventListener('click', () => send('move',{dx:0,dy:-1}));
  document.getElementById('south').addEventListener('click', () => send('move',{dx:0,dy:1}));
  document.getElementById('west').addEventListener('click', () => send('move',{dx:-1,dy:0}));
  document.getElementById('east').addEventListener('click', () => send('move',{dx:1,dy:0}));
  document.getElementById('attack').addEventListener('click', () => send('attack'));
  document.getElementById('rest').addEventListener('click', () => send('rest'));
  document.getElementById('search').addEventListener('click', () => send('search'));
});
