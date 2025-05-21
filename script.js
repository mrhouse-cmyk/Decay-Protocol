const gridSize = 10;
const maxHealth = 10;
const maxAP = 20;
const areaTypes = ["hospital", "residential", "street", "warehouse", "office"];
let areaGrid = [];
let player = { x: 0, y: 0, health: maxHealth, ap: maxAP };
let zombies = [];
let inventory = {};

const lootTables = {
    hospital: [
        { name: 'First Aid Kit', chance: 0.2 },
        { name: 'Bandage', chance: 0.5 },
        { name: 'Energy Drink', chance: 0.1 }
    ],
    residential: [
        { name: 'Bandage', chance: 0.3 },
        { name: 'Energy Drink', chance: 0.2 }
    ],
    street: [
        { name: 'Bandage', chance: 0.1 },
        { name: 'Energy Drink', chance: 0.1 }
    ],
    warehouse: [
        { name: 'Energy Drink', chance: 0.3 },
        { name: 'Bandage', chance: 0.2 }
    ],
    office: [
        { name: 'Bandage', chance: 0.2 },
        { name: 'Energy Drink', chance: 0.2 }
    ]
};

function disableControls() {
    document.querySelectorAll('#controls button').forEach(btn => btn.disabled = true);
}

function zombieAttack() {
    if (zombies.some(z => z.x === player.x && z.y === player.y)) {
        player.health -= 1;
        log('A zombie attacked you for 1 damage.');
        if (player.health <= 0) {
            player.health = 0;
            log('You have died.');
            disableControls();
        }
        updateStats();
    }
}

function init() {
    createGrid();
    placePlayer();
    placeZombies(5);
    updateStats();
    updateInventory();
    log('Game started.');
}

function createGrid() {
    const grid = document.getElementById('grid');
    for (let y = 0; y < gridSize; y++) {
        areaGrid[y] = [];
        for (let x = 0; x < gridSize; x++) {
            const cell = document.createElement('div');
            const type = areaTypes[Math.floor(Math.random() * areaTypes.length)];
            cell.classList.add('cell', `area-${type}`);
            cell.dataset.x = x;
            cell.dataset.y = y;
            cell.dataset.type = type;
            areaGrid[y][x] = type;
            grid.appendChild(cell);
        }
    }
}

function placePlayer() {
    player.x = Math.floor(gridSize / 2);
    player.y = Math.floor(gridSize / 2);
    draw();
}

function placeZombies(count) {
    zombies = [];
    while (zombies.length < count) {
        const zx = Math.floor(Math.random() * gridSize);
        const zy = Math.floor(Math.random() * gridSize);
        if ((zx !== player.x || zy !== player.y) && !zombies.some(z => z.x === zx && z.y === zy)) {
            zombies.push({ x: zx, y: zy });
        }
    }
    draw();
}

function rollLoot(type) {
    const table = lootTables[type] || [];
    let roll = Math.random();
    let cumulative = 0;
    for (const item of table) {
        cumulative += item.chance;
        if (roll < cumulative) {
            return item.name;
        }
    }
    return null;
}

function draw() {
    const cells = document.querySelectorAll('.cell');
    cells.forEach(cell => {
        cell.classList.remove('player', 'zombie');
    });
    zombies.forEach(z => {
        const cell = getCell(z.x, z.y);
        cell.classList.add('zombie');
    });
    const playerCell = getCell(player.x, player.y);
    playerCell.classList.add('player');

    const attackBtn = document.getElementById('attack');
    if (zombies.some(z => z.x === player.x && z.y === player.y)) {
        attackBtn.style.display = 'inline-block';
    } else {
        attackBtn.style.display = 'none';
    }
}

function getCell(x, y) {
    return document.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
}

function move(dx, dy) {
    if (player.ap <= 0) {
        log('Not enough AP to move.');
        return;
    }
    const nx = player.x + dx;
    const ny = player.y + dy;
    if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) {
        const prev = { x: player.x, y: player.y };
        player.x = nx;
        player.y = ny;
        player.ap -= 1;
        log(`Moved to (${nx}, ${ny}).`);
        moveZombies(prev);
        draw();
        updateStats();
        zombieAttack();
    }
}

function attack() {
    if (player.ap < 2) {
        log('Not enough AP to attack.');
        return;
    }
    const index = zombies.findIndex(z => z.x === player.x && z.y === player.y);
    if (index !== -1) {
        zombies.splice(index, 1);
        player.ap -= 2;
        log('Zombie defeated!');
    }
    moveZombies({ x: player.x, y: player.y });
    draw();
    updateStats();
    zombieAttack();
}

function rest() {
    const before = player.ap;
    player.ap = Math.min(maxAP, player.ap + 5);
    const gained = player.ap - before;
    if (gained > 0) {
        log(`Rested and regained ${gained} AP.`);
    } else {
        log('AP is already full.');
    }
    moveZombies({ x: player.x, y: player.y });
    draw();
    updateStats();
    zombieAttack();
}

function search() {
    if (player.ap < 2) {
        log('Not enough AP to search.');
        return;
    }
    player.ap -= 2;
    const type = areaGrid[player.y][player.x];
    const item = rollLoot(type);
    if (item) {
        inventory[item] = (inventory[item] || 0) + 1;
        log(`Found ${item} in the ${type}.`);
    } else {
        log('Found nothing.');
    }
    moveZombies({ x: player.x, y: player.y });
    draw();
    updateStats();
    updateInventory();
    zombieAttack();
}

function updateInventory() {
    const list = document.getElementById('inventory-list');
    const select = document.getElementById('inventorySelect');
    list.innerHTML = '';
    select.innerHTML = '';
    Object.keys(inventory).forEach(name => {
        const count = inventory[name];
        if (count > 0) {
            const div = document.createElement('div');
            div.textContent = `${name} x${count}`;
            list.appendChild(div);
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            select.appendChild(opt);
        }
    });
}

function useItem() {
    const select = document.getElementById('inventorySelect');
    const item = select.value;
    if (!item || !inventory[item]) return;
    if (item === 'First Aid Kit') {
        const before = player.health;
        player.health = Math.min(maxHealth, player.health + 5);
        log(`Used First Aid Kit and healed ${player.health - before} HP.`);
    } else if (item === 'Energy Drink') {
        const before = player.ap;
        player.ap = Math.min(maxAP, player.ap + 5);
        log(`Used Energy Drink and restored ${player.ap - before} AP.`);
    } else if (item === 'Bandage') {
        const before = player.health;
        player.health = Math.min(maxHealth, player.health + 2);
        log(`Used Bandage and healed ${player.health - before} HP.`);
    }
    inventory[item] -= 1;
    if (inventory[item] <= 0) delete inventory[item];
    updateStats();
    updateInventory();
}

function moveZombies(prevPos) {
    const newPositions = [];
    zombies = zombies.map(z => {
        let target = { x: z.x, y: z.y };
        const dx = player.x - z.x;
        const dy = player.y - z.y;

        const tryMove = (nx, ny) => {
            if (nx < 0 || nx >= gridSize || ny < 0 || ny >= gridSize) return false;
            if (nx === player.x && ny === player.y) return false;
            if (newPositions.some(p => p.x === nx && p.y === ny)) return false;
            return true;
        };

        const horiz = { x: z.x + Math.sign(dx), y: z.y };
        const vert = { x: z.x, y: z.y + Math.sign(dy) };

        if (Math.abs(dx) >= Math.abs(dy)) {
            if (dx !== 0 && tryMove(horiz.x, horiz.y)) {
                target = horiz;
            } else if (dy !== 0 && tryMove(vert.x, vert.y)) {
                target = vert;
            }
        } else {
            if (dy !== 0 && tryMove(vert.x, vert.y)) {
                target = vert;
            } else if (dx !== 0 && tryMove(horiz.x, horiz.y)) {
                target = horiz;
            }
        }

        if (target.x === prevPos.x && target.y === prevPos.y) {
            log('A zombie shambles into where you just were.');
        }

        newPositions.push(target);
        return target;
    });

    zombies.forEach(z => {
        if (Math.abs(z.x - player.x) + Math.abs(z.y - player.y) === 1) {
            log('A zombie is dangerously close!');
        }
    });
}

function updateStats() {
    document.getElementById('health').textContent = player.health;
    document.getElementById('ap').textContent = player.ap;
}

function log(message) {
    const logEl = document.getElementById('log');
    const entry = document.createElement('div');
    entry.textContent = message;
    logEl.prepend(entry);
}

// Bind buttons
window.addEventListener('load', () => {
    init();
    document.getElementById('north').addEventListener('click', () => move(0, -1));
    document.getElementById('south').addEventListener('click', () => move(0, 1));
    document.getElementById('west').addEventListener('click', () => move(-1, 0));
    document.getElementById('east').addEventListener('click', () => move(1, 0));
    document.getElementById('attack').addEventListener('click', attack);
    document.getElementById('rest').addEventListener('click', rest);
    document.getElementById('search').addEventListener('click', search);
    document.getElementById('use').addEventListener('click', useItem);
});