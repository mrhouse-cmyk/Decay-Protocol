const gridSize = 10;
const maxHealth = 10;
const maxAP = 20;
const areaTypes = ["hospital", "residential", "street", "warehouse", "office"];
const areaDescriptions = {
    hospital: 'A run-down hospital room littered with medical wrappers.',
    residential: 'A cramped residential apartment with scattered belongings.',
    street: 'A cracked street filled with abandoned cars.',
    warehouse: 'A dusty warehouse stacked with boxes.',
    office: 'A ransacked office floor covered in papers.'
};
let areaGrid = [];
let turn = 0;
let player = { x: 0, y: 0, health: maxHealth, ap: maxAP, perks: [] };
let zombies = [];
let inventory = {};

const barricadeDescriptors = {
    'Wood Planks': 'rough planks nailed across the entry.',
    'Metal Panels': 'hastily welded scrap sheets blocking the path.',
    'Heavy Furniture': 'a wall of broken furniture braced in place.'
};

const lootTables = {
    hospital: [
        { name: 'First Aid Kit', chance: 0.2 },
        { name: 'Bandage', chance: 0.5 },
        { name: 'Energy Drink', chance: 0.1 },
        { name: 'Wood Planks', chance: 0.1 },
        { name: 'Metal Panels', chance: 0.05 },
        { name: 'Heavy Furniture', chance: 0.02 }
    ],
    residential: [
        { name: 'Bandage', chance: 0.3 },
        { name: 'Energy Drink', chance: 0.2 },
        { name: 'Wood Planks', chance: 0.2 },
        { name: 'Metal Panels', chance: 0.1 },
        { name: 'Heavy Furniture', chance: 0.05 }
    ],
    street: [
        { name: 'Bandage', chance: 0.1 },
        { name: 'Energy Drink', chance: 0.1 },
        { name: 'Wood Planks', chance: 0.15 },
        { name: 'Metal Panels', chance: 0.05 }
    ],
    warehouse: [
        { name: 'Energy Drink', chance: 0.3 },
        { name: 'Bandage', chance: 0.2 },
        { name: 'Wood Planks', chance: 0.3 },
        { name: 'Metal Panels', chance: 0.2 },
        { name: 'Heavy Furniture', chance: 0.1 }
    ],
    office: [
        { name: 'Bandage', chance: 0.2 },
        { name: 'Energy Drink', chance: 0.2 },
        { name: 'Wood Planks', chance: 0.15 },
        { name: 'Metal Panels', chance: 0.1 },
        { name: 'Heavy Furniture', chance: 0.05 }
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
    updateTurn();
    updateTileInfo();
    updateInventory();
    draw();
    log('Game started.');
    log(getDescriptionForTile(player.x, player.y));
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
            cell.addEventListener('mouseenter', () => {
                const desc = getDescriptionForTile(x, y);
                const tile = areaGrid[y][x];
                let extra = '';
                if (tile.barricaded) {
                    extra = `Barricade strength: ${tile.barricadeHealth}/10.`;
                }
                document.getElementById('tile-desc').textContent = `${desc} ${extra}`.trim();
            });
            cell.addEventListener('mouseleave', updateTileInfo);
            areaGrid[y][x] = {
                type,
                description: areaDescriptions[type],
                barricaded: false,
                barricadeHealth: null,
                barricadeMaterial: null,
                searchedAt: -Infinity
            };
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

function rollLoot(type, bonus = 0) {
    const table = lootTables[type] || [];
    let roll = Math.random() - bonus;
    let cumulative = 0;
    for (const item of table) {
        cumulative += item.chance;
        if (roll < cumulative) {
            return item.name;
        }
    }
    return null;
}

function spawnZombieAtEdge() {
    const options = [];
    for (let x = 0; x < gridSize; x++) {
        options.push({ x, y: 0 });
        options.push({ x, y: gridSize - 1 });
    }
    for (let y = 1; y < gridSize - 1; y++) {
        options.push({ x: 0, y });
        options.push({ x: gridSize - 1, y });
    }
    while (options.length) {
        const idx = Math.floor(Math.random() * options.length);
        const pos = options.splice(idx, 1)[0];
        if ((pos.x === player.x && pos.y === player.y) ||
            zombies.some(z => z.x === pos.x && z.y === pos.y) ||
            areaGrid[pos.y][pos.x].barricaded) {
            continue;
        }
        zombies.push({ x: pos.x, y: pos.y });
        return true;
    }
    return false;
}

function draw() {
    const cells = document.querySelectorAll('.cell');
    cells.forEach(cell => {
        cell.classList.remove('player', 'zombie', 'barricaded', 'searched',
            'barricade-strong', 'barricade-weak', 'barricade-critical');
        const x = parseInt(cell.dataset.x);
        const y = parseInt(cell.dataset.y);
        const tile = areaGrid[y][x];
        if (tile.barricaded) {
            let tier = 'barricade-strong';
            if (tile.barricadeHealth <= 3) {
                tier = 'barricade-critical';
            } else if (tile.barricadeHealth <= 6) {
                tier = 'barricade-weak';
            }
            cell.classList.add('barricaded', tier);
        }
        if (turn - tile.searchedAt < 3) {
            cell.classList.add('searched');
        }
        cell.title = getDescriptionForTile(x, y);
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

function countAdjacentZombies(x, y) {
    const dirs = [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 }
    ];
    let count = 0;
    dirs.forEach(d => {
        const nx = x + d.x;
        const ny = y + d.y;
        if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) {
            if (zombies.some(z => z.x === nx && z.y === ny)) {
                count += 1;
            }
        }
    });
    return count;
}

function getDescriptionForTile(x, y) {
    const tile = areaGrid[y][x];
    const base = tile.description || '';
    let barricadeText = '';
    if (tile.barricaded && tile.barricadeMaterial) {
        barricadeText = `The area is barricaded with ${barricadeDescriptors[tile.barricadeMaterial]}`;
    } else {
        const dirs = [
            { x: 1, y: 0 },
            { x: -1, y: 0 },
            { x: 0, y: 1 },
            { x: 0, y: -1 }
        ];
        for (const d of dirs) {
            const nx = x + d.x;
            const ny = y + d.y;
            if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) {
                const neighbor = areaGrid[ny][nx];
                if (neighbor.barricaded && neighbor.barricadeMaterial) {
                    barricadeText = `The area is barricaded with ${barricadeDescriptors[neighbor.barricadeMaterial]}`;
                    break;
                }
            }
        }
    }
    const count = countAdjacentZombies(x, y);
    let mod = '';
    if (count === 0) {
        mod = "It's eerily quiet.";
    } else if (count <= 2) {
        mod = 'You hear faint groaning nearby.';
    } else {
        mod = 'The area is swarming with the dead.';
    }
    return `${base} ${barricadeText} ${mod}`.trim();
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
        log(getDescriptionForTile(nx, ny));
        updateTileInfo();
        moveZombies(prev);
        draw();
        updateStats();
        zombieAttack();
        nextTurn();
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
    nextTurn();
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
    nextTurn();
}

function search() {
    const tile = areaGrid[player.y][player.x];
    if (turn - tile.searchedAt < 3) {
        log('This area has already been picked clean. Try again later.');
        return;
    }
    if (player.ap < 2) {
        log('Not enough AP to search.');
        return;
    }
    player.ap -= 2;
    const type = tile.type;
    const bonus = player.perks.includes('Scavenger') ? 0.1 : 0;
    const item = rollLoot(type, bonus);
    if (item) {
        inventory[item] = (inventory[item] || 0) + 1;
        log(`Found ${item} in the ${type}.`);
    } else {
        log('Found nothing.');
    }
    tile.searchedAt = turn;
    const noiseChance = player.perks.includes('Quiet') ? 0.1 : 0.2;
    if (Math.random() < noiseChance) {
        if (spawnZombieAtEdge()) {
            log('The noise of your search attracted a nearby zombie!');
        }
    }
    moveZombies({ x: player.x, y: player.y });
    draw();
    updateStats();
    updateInventory(item);
    zombieAttack();
    nextTurn();
}

function updateInventory(newItem = null) {
    const list = document.getElementById('inventory-list');
    const select = document.getElementById('inventorySelect');
    const barricadeSelect = document.getElementById('barricadeSelect');
    list.innerHTML = '';
    select.innerHTML = '';
    barricadeSelect.innerHTML = '';
    const rarityMap = {
        'Bandage': 'common',
        'Energy Drink': 'common',
        'First Aid Kit': 'rare',
        'Wood Planks': 'common',
        'Metal Panels': 'rare',
        'Heavy Furniture': 'epic'
    };

    Object.keys(inventory).forEach(name => {
        const count = inventory[name];
        if (count > 0) {
            const div = document.createElement('div');
            div.textContent = `${name} x${count}`;
            const rarity = rarityMap[name];
            if (rarity === 'rare') div.classList.add('rare');
            if (rarity === 'epic') div.classList.add('epic');
            if (name === newItem) div.classList.add('flash');
            list.appendChild(div);
            if (['First Aid Kit', 'Bandage', 'Energy Drink'].includes(name)) {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                select.appendChild(opt);
            }
            if (['Wood Planks', 'Metal Panels', 'Heavy Furniture'].includes(name)) {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                barricadeSelect.appendChild(opt);
            }
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
    } else if (item === 'Wood Planks' || item === 'Metal Panels' || item === 'Heavy Furniture') {
        log('Select Barricade and choose a material to build or reinforce.');
        return;
    }
    inventory[item] -= 1;
    if (inventory[item] <= 0) delete inventory[item];
    updateStats();
    updateInventory();
    draw();
    updateTileInfo();
}

function barricade() {
    const select = document.getElementById('barricadeSelect');
    const item = select.value;
    if (!item || !inventory[item]) {
        log('No barricade material selected.');
        return;
    }
    if (player.ap < 1) {
        log('Not enough AP to barricade.');
        return;
    }
    const tile = areaGrid[player.y][player.x];
    let add = 0;
    if (item === 'Wood Planks') add = 2;
    else if (item === 'Metal Panels') add = 3;
    else if (item === 'Heavy Furniture') add = 5;
    if (!tile.barricaded) {
        tile.barricaded = true;
        tile.barricadeHealth = 0;
    }
    tile.barricadeHealth = Math.min(10, tile.barricadeHealth + add);
    tile.barricadeMaterial = item;
    inventory[item] -= 1;
    if (inventory[item] <= 0) delete inventory[item];
    player.ap -= 1;
    log(`You reinforced the barricade with ${item}. Strength: ${tile.barricadeHealth}/10.`);
    moveZombies({ x: player.x, y: player.y });
    draw();
    updateTileInfo();
    updateStats();
    updateInventory();
    zombieAttack();
    nextTurn();
}

function degradeBarricades() {
    for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
            const tile = areaGrid[y][x];
            if (tile.barricaded) {
                const damage = countAdjacentZombies(x, y);
                if (damage > 0) {
                    tile.barricadeHealth -= damage;
                    if (tile.barricadeHealth <= 0) {
                        tile.barricaded = false;
                        tile.barricadeHealth = null;
                        tile.barricadeMaterial = null;
                        log('The barricade has been broken down by the undead!');
                    }
                }
            }
        }
    }
}

function nextTurn() {
    degradeBarricades();
    draw();
    const desc = getDescriptionForTile(player.x, player.y);
    log(desc);
    updateTileInfo();
    turn += 1;
    updateTurn();
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
            if (areaGrid[ny][nx].barricaded) return false;
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
    const healthEl = document.getElementById('health');
    const apEl = document.getElementById('ap');
    const healthFill = document.querySelector('#health-bar .fill');
    const apFill = document.querySelector('#ap-bar .fill');
    healthEl.textContent = player.health;
    apEl.textContent = player.ap;
    healthFill.style.transform = `scaleX(${player.health / maxHealth})`;
    apFill.style.transform = `scaleX(${player.ap / maxAP})`;
}

function updateTurn() {
    document.getElementById('turn').textContent = turn;
}

function updateTileInfo() {
    const desc = getDescriptionForTile(player.x, player.y);
    const tile = areaGrid[player.y][player.x];
    let extra = '';
    if (tile.barricaded) {
        extra = `Barricade strength: ${tile.barricadeHealth}/10.`;
    }
    document.getElementById('tile-desc').textContent = `${desc} ${extra}`.trim();
}

function log(message, type = 'info') {
    const logEl = document.getElementById('log');
    const entry = document.createElement('div');
    const time = new Date().toLocaleTimeString();
    entry.textContent = `[${time}] ${message}`;
    entry.classList.add(type);
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
    document.getElementById('barricade').addEventListener('click', barricade);
});