const express = require('express');
const crypto = require('crypto');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

const gridSize = 10;
const maxAP = 20;
const maxHealth = 10;

let players = {};
let zombies = [];
let turn = 0;
let worldState = { turn: 0 };
let accounts = {};
function hashPass(p){return crypto.createHash("sha256").update(p).digest("hex");}

function initPlayer(id, data = {}) {
    players[id] = {
        id,
        username: data.username || 'Guest',
        name: data.charName || 'Survivor',
        sex: data.charSex || 'other',
        charClass: data.charClass || 'scavenger',
        x: Math.floor(gridSize / 2),
        y: Math.floor(gridSize / 2),
        ap: maxAP,
        health: maxHealth,
        conditions: {}
    };
}

function handleMove(player, dx, dy) {
    const nx = player.x + dx;
    const ny = player.y + dy;
    if (player.ap <= 0) return;
    if (nx < 0 || nx >= gridSize || ny < 0 || ny >= gridSize) return;
    player.x = nx;
    player.y = ny;
    player.ap -= 1;
}

function handleAttack(player) {
    const target = zombies.find(z => z.x === player.x && z.y === player.y);
    if (!target || player.ap < 2) return;
    target.health -= 1;
    player.ap -= 2;
    if (target.health <= 0) {
        zombies.splice(zombies.indexOf(target), 1);
    }
}

function handleRest(player) {
    player.ap = Math.min(maxAP, player.ap + 5);
}

function applyStatusEffects(player) {
    if (player.health <= 0) {
        delete players[player.id];
    }
}

function checkForZombieEncounters(player) {
    zombies.forEach(z => {
        if (z.x === player.x && z.y === player.y) {
            player.health -= 1;
        }
    });
}

function broadcastGameState() {
    io.emit('state', { players, zombies, turn, worldState });
}

function handlePlayerAction(id, action) {
    const player = players[id];
    if (!player) return;

    switch (action.type) {
        case 'move':
            handleMove(player, action.dx, action.dy);
            break;
        case 'attack':
            handleAttack(player);
            break;
        case 'rest':
            handleRest(player);
            break;
        case 'search':
            break;
    }

    applyStatusEffects(player);
    checkForZombieEncounters(player);
    broadcastGameState();
}

function zombieTick() {
    const plist = Object.values(players);
    if (!plist.length) return;
    const target = plist[0];
    zombies.forEach(z => {
        if (z.x < target.x) z.x++;
        else if (z.x > target.x) z.x--;
        if (z.y < target.y) z.y++;
        else if (z.y > target.y) z.y--;
        if (z.x === target.x && z.y === target.y) {
            target.health -= 1;
        }
    });
    broadcastGameState();
}


io.on('connection', socket => {
    socket.authenticated = false;
    socket.emit('connected', { id: socket.id });

    socket.on('registerAccount', data => {
        const { email, username, password } = data || {};
        if (accounts[username]) return socket.emit('registerError', 'Username taken');
        if (!/^\S+@\S+\.\S+$/.test(email)) return socket.emit('registerError', 'Invalid email');
        const passwordHash = hashPass(password);
        accounts[username] = { email, passwordHash, createdAt: new Date().toISOString(), lastLogin: null };
        socket.emit('registerSuccess');
    });

    socket.on('login', data => {
        const { username, password } = data || {};
        const acc = accounts[username];
        if (!acc || acc.passwordHash !== hashPass(password)) return socket.emit('loginError', 'Invalid credentials');
        acc.lastLogin = new Date().toISOString();
        socket.authenticated = true;
        socket.username = username;
        socket.emit('loginSuccess');
    });

    socket.on('register', data => {
        if (!socket.authenticated) return;
        initPlayer(socket.id, { username: socket.username, ...data });
        broadcastGameState();
    });

    socket.on('action', action => {
        if (!socket.authenticated) return;
        handlePlayerAction(socket.id, action);
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        broadcastGameState();
    });
});
setInterval(zombieTick, 3000);

app.use(express.static(__dirname));

server.listen(PORT, () => console.log(`Server running on ${PORT}`));
