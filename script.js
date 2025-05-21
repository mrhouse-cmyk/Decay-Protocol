const gridSize = 10;
const maxHealth = 10;
const maxAP = 20;
const visionRange = 1;
const areaTypes = ["hospital", "residential", "street", "warehouse", "office"];
const areaDescriptions = {
    hospital: 'A run-down hospital room littered with medical wrappers.',
    residential: 'A cramped residential apartment with scattered belongings.',
    street: 'A cracked street filled with abandoned cars.',
    warehouse: 'A dusty warehouse stacked with boxes.',
    office: 'A ransacked office floor covered in papers.'
};

const attributeTypes = [
    'trap',        // chance to injure the player on entry
    'loot_chest',  // contains rare loot once
    'locked',      // costs extra AP to enter the first time
    'storage',     // can be searched repeatedly with diminishing returns
    'safe',        // zombies cannot enter or spawn here
    'collapsed',   // impassable terrain
    'fire',        // burning tile that deals damage
    'radiation',   // damages player over time
    'quarantine'   // blocked off area
];

function assignTileAttributes(tile) {
    tile.attributes = [];
    if (Math.random() < 0.05) tile.attributes.push('trap');
    if (Math.random() < 0.03) tile.attributes.push('loot_chest');
    if (Math.random() < 0.04) tile.attributes.push('locked');
    if (Math.random() < 0.05) {
        tile.attributes.push('storage');
        tile.storageUses = 3;
    }
    if (Math.random() < 0.02) tile.attributes.push('safe');
    if (Math.random() < 0.03) tile.attributes.push('collapsed');
    if (Math.random() < 0.02) tile.attributes.push('fire');
    if (Math.random() < 0.01) tile.attributes.push('radiation');
    if (Math.random() < 0.01) tile.attributes.push('quarantine');
    tile.lootChestOpened = false;
    tile.unlocked = false;
}
let areaGrid = [];
let turn = 0;
let player = { x: 0, y: 0, health: maxHealth, ap: maxAP, perks: [], visionRange: 2 };
let zombies = [];
let inventory = {};

let worldState = {
    turn: 0,
    timeOfDay: 'day',
    activeEvents: [],
    eventDuration: {},
    weather: 'clear'
};

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

const zombieTypes = {
    walker: { health: 3, speed: 1, behavior: "aggressive", damageOnDeath: false, armored: false },
    runner: { health: 2, speed: 2, behavior: "aggressive", damageOnDeath: false, armored: false },
    brute:  { health: 5, speed: 1, behavior: "aggressive", damageOnDeath: false, armored: true  },
    crawler:{ health: 2, speed: 1, behavior: "lurker",     damageOnDeath: false, armored: false },
    exploder:{ health: 1, speed: 1, behavior: "aggressive", damageOnDeath: true,  armored: false }
};

const zombieSpawnTable = {
    hospital: ["crawler", "walker"],
    residential: ["walker", "runner"],
    street: ["walker", "runner"],
    warehouse: ["brute", "walker"],
    office: ["walker", "crawler"]
};


const globalEventDefinitions = {
    acidRain: {
        duration: 3,
        onStart() {
            log('Acid rain begins falling. Seek shelter!');
            player.visionRange = Math.max(1, player.visionRange - 1);
        },
        onTurn() {
            if (areaGrid[player.y][player.x].type === 'street') {
                player.health -= 1;
                updateStats();
                log('The acid rain burns your skin!', 'danger');
            }
        },
        onEnd() {
            player.visionRange = worldState.timeOfDay === 'day' ? 2 : 1;
            log('The acid rain subsides.');
        }
    },
    electricalStorm: {
        duration: () => Math.floor(Math.random() * 2) + 1,
        onStart() {
            log('Lightning flashes in the distance... the city\u2019s nerves twitch.');
        },
        onEnd() { log('The electrical storm passes.'); }
    },
    hordeSurge: {
        duration: 3,
        onStart() {
            for (let i = 0; i < 5; i++) spawnZombieAtEdge();
            log('The groans of the dead echo louder than ever.');
        },
        onEnd() { log('The surge of undead fades.'); }
    },
    airdrop: {
        duration: 0,
        onStart() {
            let spawned = false;
            while (!spawned) {
                const x = Math.floor(Math.random() * gridSize);
                const y = Math.floor(Math.random() * gridSize);
                const tile = areaGrid[y][x];
                if (!tile.attributes.includes('collapsed')) {
                    tile.attributes.push('loot_chest', 'locked');
                    tile.airdrop = true;
                    spawned = true;
                }
            }
            log('A drone whirrs overhead and disappears into the fog.');
        }
    }
};

function disableControls() {
    document.querySelectorAll('#controls button').forEach(btn => btn.disabled = true);
}

function electricalInterference() {
    if (worldState.activeEvents.includes('electricalStorm') && Math.random() < 0.5) {
        log('Electrical interference disrupts your action!');
        moveZombies({ x: player.x, y: player.y });
        draw();
        zombieAttack();
        nextTurn();
        return true;
    }
    return false;
}

function triggerEvent(name) {
    const def = globalEventDefinitions[name];
    if (!def) return;
    worldState.activeEvents.push(name);
    const dur = typeof def.duration === 'function' ? def.duration() : def.duration;
    if (dur > 0) worldState.eventDuration[name] = dur;
    if (def.onStart) def.onStart();
}

function processActiveEvents() {
    worldState.activeEvents.slice().forEach(name => {
        const def = globalEventDefinitions[name];
        if (def.onTurn) def.onTurn();
        if (worldState.eventDuration[name] != null) {
            worldState.eventDuration[name] -= 1;
            if (worldState.eventDuration[name] <= 0) {
                delete worldState.eventDuration[name];
                worldState.activeEvents = worldState.activeEvents.filter(e => e !== name);
                if (def.onEnd) def.onEnd();
            }
        }
    });
}

function processTileEvents() {
    const newFires = [];
    for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
            const tile = areaGrid[y][x];
            if (tile.attributes.includes('fire')) {
                const dirs = [
                    { x: 1, y: 0 },
                    { x: -1, y: 0 },
                    { x: 0, y: 1 },
                    { x: 0, y: -1 }
                ];
                dirs.forEach(d => {
                    const nx = x + d.x;
                    const ny = y + d.y;
                    if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) {
                        const nTile = areaGrid[ny][nx];
                        if (!nTile.attributes.includes('fire') && Math.random() < 0.2) {
                            newFires.push(nTile);
                        }
                    }
                });
            }
        }
    }
    if (newFires.length) log('The flames are spreading!');
    newFires.forEach(t => t.attributes.push('fire'));
}

function rollGlobalEvent() {
    if (worldState.turn % 5 === 0 && Math.random() < 0.5) {
        const keys = Object.keys(globalEventDefinitions);
        const name = keys[Math.floor(Math.random() * keys.length)];
        triggerEvent(name);
    }
}

function zombieAttack() {
    if (zombies.some(z => z.x === player.x && z.y === player.y)) {
        player.health -= 1;
        log('A zombie attacked you for 1 damage.');
        if (worldState.activeEvents.includes('electricalStorm') && Math.random() < 0.5) {
            player.health -= 1;
            log('The storm drives the zombie into a frenzy! Another hit!', 'danger');
        }
        if (player.health <= 0) {
            player.health = 0;
            log('You have died.');
            disableControls();
        }
        updateStats();
    }
}

function init() {
    worldState.turn = 0;
    worldState.timeOfDay = 'day';
    worldState.activeEvents = [];
    worldState.eventDuration = {};
    player.visionRange = 2;
    createGrid();
    placePlayer();
    placeZombies(5);
    updateStats();
    updateTurn();
    updateTileInfo();
    updateInventory();
    updateVisibility();
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
                searchedAt: -Infinity,
                visible: false,
                explored: false, spawnZone: (rand() < 0.05)
            };
            assignTileAttributes(areaGrid[y][x]);
            grid.appendChild(cell);
        }
    }
}

function placePlayer() {
    player.x = Math.floor(gridSize / 2);
    player.y = Math.floor(gridSize / 2);
    draw();
}

function updateVisibility() {
    for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
            areaGrid[y][x].visible = false;
        }
    }
    const range = player.visionRange || visionRange;
    for (let dy = -range; dy <= range; dy++) {
        for (let dx = -range; dx <= range; dx++) {
            const nx = player.x + dx;
            const ny = player.y + dy;
            if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) <= range) {
                    const tile = areaGrid[ny][nx];
                    tile.visible = true;
                    tile.explored = true;
                }
            }
        }
    }
}

function placeZombies(count) {
    zombies = [];
    const all = [];
    const zones = [];
    for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
            const t = areaGrid[y][x];
            if ((x !== player.x || y !== player.y) &&
                !t.barricaded &&
                !t.attributes.includes('safe') &&
                !t.attributes.includes('collapsed')) {
                all.push({ x, y });
                if (t.spawnZone) zones.push({ x, y });
            }
        }
    }
    while (zombies.length < count && all.length) {
        const pool = zones.length ? zones : all;
        const idx = Math.floor(Math.random() * pool.length);
        const pos = pool.splice(idx, 1)[0];
        const idxAll = all.findIndex(p => p.x === pos.x && p.y === pos.y);
        if (idxAll !== -1) all.splice(idxAll, 1);
        zombies.push(createZombie(pos.x, pos.y));
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

function createZombie(x, y) {
    const areaType = areaGrid[y][x].type;
    const table = zombieSpawnTable[areaType] || ['walker'];
    const type = table[Math.floor(Math.random() * table.length)];
    const def = zombieTypes[type] || zombieTypes.walker;
    return {
        x,
        y,
        type,
        health: def.health,
        speed: def.speed,
        behavior: def.behavior,
        damageOnDeath: def.damageOnDeath,
        armored: def.armored
    };
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
    for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
            if (areaGrid[y][x].spawnZone) options.push({ x, y });
        }
    }
    while (options.length) {
        const idx = Math.floor(Math.random() * options.length);
        const pos = options.splice(idx, 1)[0];
        if ((pos.x === player.x && pos.y === player.y) ||
            zombies.some(z => z.x === pos.x && z.y === pos.y) ||
            areaGrid[pos.y][pos.x].barricaded ||
            areaGrid[pos.y][pos.x].attributes.includes('safe') ||
            areaGrid[pos.y][pos.x].attributes.includes('collapsed')) {
            continue;
        }
        zombies.push(createZombie(pos.x, pos.y));
        return true;
    }
    return false;
}

function draw() {
    updateVisibility();
    const cells = document.querySelectorAll('.cell');
    cells.forEach(cell => {
        cell.classList.remove(
            'player',
            'zombie',
            'barricaded',
            'searched',
            'barricade-strong',
            'barricade-weak',
            'barricade-critical',
            'tile-visible',
            'tile-explored',
            'tile-unexplored'
        );
        const x = parseInt(cell.dataset.x);
        const y = parseInt(cell.dataset.y);
        const tile = areaGrid[y][x];

        if (tile.visible) {
            if (tile.spawnZone) cell.classList.add("spawn-zone");
            cell.classList.add('tile-visible');
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
        } else if (tile.explored) {
            cell.classList.add('tile-explored');
            cell.title = '';
        } else {
            cell.classList.add('tile-unexplored');
            cell.title = '';
        }
    });
    zombies.forEach(z => {
        if (areaGrid[z.y][z.x].visible) {
            const cell = getCell(z.x, z.y);
            cell.classList.add('zombie', `zombie-${z.type}`);
        }
    });
    const playerCell = getCell(player.x, player.y);
    playerCell.classList.add('player', 'tile-visible');

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
    let attrText = '';
    if (tile.attributes.includes('safe')) attrText += ' It feels safe here.';
    if (tile.attributes.includes('loot_chest') && !tile.lootChestOpened) attrText += ' A loot chest rests here.';
    if (tile.attributes.includes('storage')) attrText += ' There might be supplies around.';
    if (tile.attributes.includes('trap') && !tile.trapTriggered) attrText += ' You sense a trap.';
    if (tile.attributes.includes('locked') && !tile.unlocked) attrText += ' The entrance is locked.';
    if (tile.attributes.includes('collapsed')) attrText += ' Debris blocks the way.';
    if (tile.attributes.includes('fire')) attrText += ' Flames roar here.';
    if (tile.attributes.includes('radiation')) attrText += ' A sickly glow radiates.';
    if (tile.attributes.includes('quarantine')) attrText += ' Military barricades stand here.';
    if (tile.spawnZone) attrText += ' Signs of heavy undead activity.';
    return `${base} ${barricadeText} ${attrText} ${mod}`.trim();
}

function move(dx, dy) {
    if (electricalInterference()) return;
    if (player.ap <= 0) {
        log('Not enough AP to move.');
        return;
    }
    const nx = player.x + dx;
    const ny = player.y + dy;
    if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) {
        const tile = areaGrid[ny][nx];
        if (tile.attributes.includes('collapsed')) {
            log('The way is blocked by debris.');
            return;
        }
        if (tile.attributes.includes('quarantine')) {
            log('Military barricades block your path.');
            return;
        }
        let cost = 1;
        if (tile.attributes.includes('locked') && !tile.unlocked) {
            cost += 1;
        }
        if (player.ap < cost) {
            log('Not enough AP to move.');
            return;
        }
        player.ap -= cost;
        if (tile.attributes.includes('locked') && !tile.unlocked) {
            tile.unlocked = true;
            log('You force your way into the locked area.');
        }
        const prev = { x: player.x, y: player.y };
        player.x = nx;
        player.y = ny;
        if (tile.attributes.includes('fire')) {
            player.health -= 3;
            log('The flames scorch you for 3 damage!', 'danger');
        }
        if (tile.attributes.includes('trap') && !tile.trapTriggered) {
            tile.trapTriggered = true;
            if (Math.random() < 0.5) {
                player.health -= 1;
                log('You triggered a trap and took 1 damage.', 'danger');
                if (player.health <= 0) {
                    player.health = 0;
                    log('You have died.');
                    disableControls();
                }
            } else {
                log('You narrowly avoid a trap.');
            }
            updateStats();
        }
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
    if (electricalInterference()) return;
    if (player.ap < 2) {
        log('Not enough AP to attack.');
        return;
    }
    const index = zombies.findIndex(z => z.x === player.x && z.y === player.y);
    if (index !== -1) {
        const z = zombies[index];
        z.health -= 1;
        player.ap -= 2;
        log('You strike the zombie.');
        if (z.health <= 0) {
            if (z.damageOnDeath) {
                player.health -= 1;
                log('The zombie explodes, injuring you!', 'danger');
            }
            zombies.splice(index, 1);
            log('Zombie defeated!');
        }
    }
    moveZombies({ x: player.x, y: player.y });
    draw();
    updateStats();
    zombieAttack();
    nextTurn();
}

function rest() {
    if (electricalInterference()) return;
    const tile = areaGrid[player.y][player.x];
    if (worldState.timeOfDay === 'night' && !tile.attributes.includes('safe') && !tile.barricaded) {
        log("It's too dangerous to rest here at night.");
    } else {
        const before = player.ap;
        player.ap = Math.min(maxAP, player.ap + 5);
        const gained = player.ap - before;
        if (gained > 0) {
            log(`Rested and regained ${gained} AP.`);
        } else {
            log('AP is already full.');
        }
    }
    moveZombies({ x: player.x, y: player.y });
    draw();
    updateStats();
    zombieAttack();
    nextTurn();
}

function search() {
    if (electricalInterference()) return;
    const tile = areaGrid[player.y][player.x];
    if (!tile.attributes.includes('storage') && turn - tile.searchedAt < 3) {
        log('This area has already been picked clean. Try again later.');
        return;
    }
    if (player.ap < 2) {
        log('Not enough AP to search.');
        return;
    }
    player.ap -= 2;
    const type = tile.type;
    let bonus = player.perks.includes('Scavenger') ? 0.1 : 0;
    let item;
    if (tile.attributes.includes('loot_chest') && !tile.lootChestOpened) {
        let extra = 0.3;
        if (tile.airdrop) extra += 0.5;
        item = rollLoot(type, bonus + extra);
        tile.lootChestOpened = true;
        tile.attributes = tile.attributes.filter(a => a !== 'loot_chest');
        if (tile.airdrop) delete tile.airdrop;
        log('You crack open a loot chest.');
    } else {
        if (tile.attributes.includes('storage')) {
            tile.storageUses = tile.storageUses || 3;
            bonus -= (3 - tile.storageUses) * 0.1;
            tile.storageUses -= 1;
            if (tile.storageUses <= 0) {
                tile.attributes = tile.attributes.filter(a => a !== 'storage');
            }
        }
        item = rollLoot(type, bonus);
    }
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
    if (electricalInterference()) return;
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
    processTileEvents();
    processActiveEvents();
    if (areaGrid[player.y][player.x].attributes.includes('radiation')) {
        player.health -= 1;
        log('The radiation saps your strength.', 'danger');
        updateStats();
    }
    draw();
    const desc = getDescriptionForTile(player.x, player.y);
    log(desc);
    updateTileInfo();
    turn += 1;
    worldState.turn = turn;
    if (worldState.turn % 10 === 0) {
        worldState.timeOfDay = worldState.timeOfDay === 'day' ? 'night' : 'day';
        player.visionRange = worldState.timeOfDay === 'day' ? 2 : 1;
        log(worldState.timeOfDay === 'day' ? 'A faint blue light hints that dawn is coming…' : 'Dusk settles in over the city.');
    }
    rollGlobalEvent();
    updateTurn();
}

function moveZombies(prevPos) {
    if (worldState.timeOfDay === 'day' && worldState.turn % 2 === 1) return;
    const newPositions = [];

    const tryMove = (nx, ny) => {
        if (nx < 0 || nx >= gridSize || ny < 0 || ny >= gridSize) return false;
        if (nx === player.x && ny === player.y) return false;
        if (newPositions.some(p => p.x === nx && p.y === ny)) return false;
        const t = areaGrid[ny][nx];
        if (t.barricaded) return false;
        if (t.attributes.includes('safe')) return false;
        if (t.attributes.includes('collapsed')) return false;
        return true;
    };

    const stepToward = z => {
        let target = { x: z.x, y: z.y };
        const dx = player.x - z.x;
        const dy = player.y - z.y;
        const horiz = { x: z.x + Math.sign(dx), y: z.y };
        const vert = { x: z.x, y: z.y + Math.sign(dy) };
        if (Math.abs(dx) >= Math.abs(dy)) {
            if (dx !== 0 && tryMove(horiz.x, horiz.y)) target = horiz;
            else if (dy !== 0 && tryMove(vert.x, vert.y)) target = vert;
        } else {
            if (dy !== 0 && tryMove(vert.x, vert.y)) target = vert;
            else if (dx !== 0 && tryMove(horiz.x, horiz.y)) target = horiz;
        }
        if (target.x === prevPos.x && target.y === prevPos.y) {
            log('A zombie shambles into where you just were.');
        }
        newPositions.push(target);
        return target;
    };

    const stepRandom = z => {
        const dirs = [
            { x: 1, y: 0 }, { x: -1, y: 0 },
            { x: 0, y: 1 }, { x: 0, y: -1 }
        ];
        const shuffled = dirs.sort(() => Math.random() - 0.5);
        for (const d of shuffled) {
            const nx = z.x + d.x;
            const ny = z.y + d.y;
            if (tryMove(nx, ny)) return { x: nx, y: ny };
        }
        newPositions.push({ x: z.x, y: z.y });
        return z;
    };

    zombies = zombies.map(z => {
        let moved = { ...z };
        let steps = z.speed || 1;
        if (worldState.activeEvents.includes('hordeSurge')) steps += 1;
        for (let i = 0; i < steps; i++) {
            let mover = stepToward;
            if (moved.behavior === 'wander') mover = stepRandom;
            if (moved.behavior === 'lurker' &&
                Math.abs(player.x - moved.x) + Math.abs(player.y - moved.y) > 2) {
                mover = stepRandom;
            }
            if (worldState.activeEvents.includes('electricalStorm')) {
                const r = Math.random();
                if (r < 0.33) continue;
                moved = mover(moved);
                if (r > 0.66) moved = mover(moved);
            } else {
                moved = mover(moved);
            }
        }
        return moved;
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
    document.getElementById('highlightToggle').addEventListener('change', e => {
        document.body.classList.toggle('highlight-unexplored', e.target.checked);
    });
});