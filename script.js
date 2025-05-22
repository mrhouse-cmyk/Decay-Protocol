const gridSize = 10;
const maxHealth = 10;
const maxAP = 20;
const maxHunger = 100;
const maxFatigue = 100;
const visionRange = 1;
const areaTypes = ["hospital", "residential", "street", "warehouse", "office"];
const areaDescriptions = {
    hospital: 'A run-down hospital room littered with medical wrappers.',
    residential: 'A cramped residential apartment with scattered belongings.',
    street: 'A cracked street filled with abandoned cars.',
    warehouse: 'A dusty warehouse stacked with boxes.',
    office: 'A ransacked office floor covered in papers.',
    ocean: 'Endless waves crash against the island. The water looks too treacherous to cross.'
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
// Game area and turn counter
let areaGrid = [];
let turn = 0;

// Core player state
let player = {
  x: 0,
  y: 0,
  health: maxHealth,
  ap: maxAP,
  hunger: 0,
  fatigue: 0,
  conditions: { bleeding: false, infection: false },
  perks: [],
  xp: 0,
  level: 1,
  class: null,
  xpToNext: 100,
  achievements: [],
  stats: { kills: 0, searches: 0, tilesExplored: 0 },
  visionRange: 2,
  maxWeight: 20
};

// Other game state
let zombies = [];
let companions = [];
let inventory = [];
let players = {};

// Server connection
let socket;
let myId;
let serverEnabled = typeof io === 'function' || (typeof io !== 'undefined' && typeof io.connect === 'function');

if (serverEnabled) {
  // Always connect to the hosted backend so the game works from any origin
  socket = io("https://decay-protocol.onrender.com");
  socket.on('connect', () => {
    myId = socket.id;
    console.log("✅ Connected to server:", myId);
  });
  socket.on('state', (state) => {
    players = state.players || {};
    zombies = state.zombies || [];
    turn = state.turn || 0;
    if (state.worldState) worldState = state.worldState;
    if (players[myId]) player = players[myId];
    draw();
    updateStats();
    updateTurn();
  });
  socket.on('disconnect', () => {
    console.warn("⚠️ Disconnected from server.");
  });
  socket.on('connect_error', (err) => {
    console.error("❌ Connection error:", err.message);
  });
}

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

const itemDefinitions = {
    'First Aid Kit': { weight: 1, type: 'consumable', rarity: 'rare', description: 'Heals a large amount of health and cures infection.', stackable: true },
    'Bandage': { weight: 0.2, type: 'consumable', rarity: 'common', description: 'Stops bleeding and heals slightly.', stackable: true },
    'Energy Drink': { weight: 0.2, type: 'consumable', rarity: 'common', description: 'Restores a small amount of AP.', stackable: true },
    'Rations': { weight: 0.5, type: 'consumable', rarity: 'common', description: 'Simple food to stave off hunger.', stackable: true },
    'Wood Planks': { weight: 1, type: 'material', rarity: 'common', description: 'Sturdy planks used for barricading.', stackable: true },
    'Metal Panels': { weight: 2, type: 'material', rarity: 'rare', description: 'Scrap metal perfect for barricades.', stackable: true },
    'Heavy Furniture': { weight: 5, type: 'material', rarity: 'epic', description: 'Large pieces of furniture for strong barricades.', stackable: true },
    'Crowbar': { weight: 2, type: 'weapon', rarity: 'uncommon', description: 'A solid iron crowbar, useful for breaking into locked doors or barricading.', maxDurability: 10, damage: 2, ap: 2, range: 0, accuracy: 0.9 },
    'Bat': { weight: 2, type: 'weapon', rarity: 'common', description: 'A worn baseball bat.', maxDurability: 8, damage: 2, ap: 1, range: 0, accuracy: 0.9 },
    'Machete': { weight: 1.5, type: 'weapon', rarity: 'uncommon', description: 'A sharp machete.', maxDurability: 6, damage: 3, ap: 2, range: 0, accuracy: 0.9 },
    'Pistol': { weight: 1.5, type: 'weapon', rarity: 'rare', description: 'A basic handgun.', maxDurability: 10, damage: 3, ap: 2, range: 3, accuracy: 0.75, ammoType: '9mm Ammo', ammoUsed: 1 },
    'Shotgun': { weight: 3, type: 'weapon', rarity: 'rare', description: 'Powerful close range firearm.', maxDurability: 8, damage: 4, ap: 3, range: 2, accuracy: 0.7, ammoType: 'Shells', ammoUsed: 1, aoe: true },
    'Rifle': { weight: 4, type: 'weapon', rarity: 'epic', description: 'Long range rifle.', maxDurability: 12, damage: 5, ap: 4, range: 5, accuracy: 0.8, ammoType: 'Rifle Ammo', ammoUsed: 1 },
    '9mm Ammo': { weight: 0.1, type: 'ammo', rarity: 'common', description: '9mm rounds.', stackable: true },
    'Shells': { weight: 0.2, type: 'ammo', rarity: 'uncommon', description: 'Shotgun shells.', stackable: true },
    'Rifle Ammo': { weight: 0.2, type: 'ammo', rarity: 'rare', description: 'Rifle ammunition.', stackable: true },
    'Makeshift Shield': { weight: 3, type: 'tool', rarity: 'uncommon', description: 'A crude shield offering temporary protection.', maxDurability: 5 }
};

const craftingRecipes = [
    {
        result: 'Makeshift Shield',
        ingredients: { 'Wood Planks': 2, 'Metal Panels': 1 }
    }
];

const lootTables = {
    hospital: [
        { name: 'First Aid Kit', chance: 0.2 },
        { name: 'Bandage', chance: 0.5 },
        { name: 'Energy Drink', chance: 0.1 },
        { name: 'Rations', chance: 0.1 },
        { name: 'Wood Planks', chance: 0.1 },
        { name: 'Metal Panels', chance: 0.05 },
        { name: 'Crowbar', chance: 0.05 },
        { name: 'Pistol', chance: 0.05 },
        { name: '9mm Ammo', chance: 0.2 },
        { name: 'Heavy Furniture', chance: 0.02 }
    ],
    residential: [
        { name: 'Bandage', chance: 0.3 },
        { name: 'Energy Drink', chance: 0.2 },
        { name: 'Rations', chance: 0.2 },
        { name: 'Wood Planks', chance: 0.2 },
        { name: 'Metal Panels', chance: 0.1 },
        { name: 'Bat', chance: 0.05 },
        { name: 'Crowbar', chance: 0.05 },
        { name: '9mm Ammo', chance: 0.1 },
        { name: 'Heavy Furniture', chance: 0.05 }
    ],
    street: [
        { name: 'Bandage', chance: 0.1 },
        { name: 'Energy Drink', chance: 0.1 },
        { name: 'Rations', chance: 0.1 },
        { name: 'Wood Planks', chance: 0.15 },
        { name: 'Metal Panels', chance: 0.05 },
        { name: 'Crowbar', chance: 0.05 },
        { name: '9mm Ammo', chance: 0.05 }
    ],
    warehouse: [
        { name: 'Energy Drink', chance: 0.3 },
        { name: 'Bandage', chance: 0.2 },
        { name: 'Rations', chance: 0.2 },
        { name: 'Wood Planks', chance: 0.3 },
        { name: 'Metal Panels', chance: 0.2 },
        { name: 'Machete', chance: 0.1 },
        { name: 'Shotgun', chance: 0.05 },
        { name: 'Shells', chance: 0.15 },
        { name: 'Crowbar', chance: 0.15 },
        { name: 'Heavy Furniture', chance: 0.1 }
    ],
    office: [
        { name: 'Bandage', chance: 0.2 },
        { name: 'Energy Drink', chance: 0.2 },
        { name: 'Rations', chance: 0.1 },
        { name: 'Wood Planks', chance: 0.15 },
        { name: 'Metal Panels', chance: 0.1 },
        { name: 'Rifle', chance: 0.02 },
        { name: 'Rifle Ammo', chance: 0.1 },
        { name: 'Crowbar', chance: 0.05 },
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

const perkUnlocks = {
    2: 'Scavenger',
    4: 'Quiet'
};

const perkDescriptions = {
    Scavenger: 'Increased chance to find loot.',
    Quiet: 'Less noise when searching.',
    Sharpshooter: 'Increased accuracy with ranged weapons.',
    'Field Medic': 'Medical items heal more.',
    Tinkerer: 'Improved barricade strength.'
};

const classDefinitions = {
    scavenger: { perk: 'Scavenger', item: 'Crowbar' },
    soldier: { perk: 'Sharpshooter', item: 'Bat' },
    medic: { perk: 'Field Medic', item: 'Bandage' },
    engineer: { perk: 'Tinkerer', item: 'Wood Planks' }
};

const achievementDefinitions = {
    firstKill: { description: 'First zombie kill', condition: () => player.stats.kills >= 1 },
    tenKills: { description: 'Kill 10 zombies', condition: () => player.stats.kills >= 10 },
    explorer: { description: 'Explore 20 tiles', condition: () => player.stats.tilesExplored >= 20 }
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

function getTotalWeight() {
    return inventory.reduce((sum, item) => sum + item.weight * item.quantity, 0);
}

function updateWeight() {
    const weightEl = document.getElementById('current-weight');
    if (weightEl) weightEl.textContent = getTotalWeight().toFixed(1);
}

function findItem(name) {
    return inventory.find(it => it.name === name);
}

function addItemToInventory(name) {
    const def = itemDefinitions[name];
    if (!def) return false;
    if (getTotalWeight() + def.weight > player.maxWeight) {
        log(`You cannot carry the ${name}; it's too heavy.`);
        return false;
    }
    let item = findItem(name);
    if (item && def.stackable) {
        item.quantity += 1;
    } else {
        inventory.push({
            name,
            quantity: 1,
            weight: def.weight,
            durability: def.maxDurability || def.durability || null,
            maxDurability: def.maxDurability || null,
            type: def.type,
            description: def.description,
            rarity: def.rarity,
            stackable: def.stackable
        });
    }
    updateWeight();
    return true;
}

function removeItemFromInventory(name, qty = 1) {
    const item = findItem(name);
    if (!item) return false;
    if (item.stackable || item.quantity > qty) {
        item.quantity -= qty;
        if (item.quantity <= 0) inventory = inventory.filter(i => i !== item);
    } else {
        inventory = inventory.filter(i => i !== item);
    }
    updateWeight();
    return true;
}

function consumeAmmo(name, qty = 1) {
    const item = findItem(name);
    if (!item || item.quantity < qty) {
        log('Out of ammo!', 'warning');
        return false;
    }
    removeItemFromInventory(name, qty);
    return true;
}

function canCraft(recipe) {
    return Object.entries(recipe.ingredients).every(([name, qty]) => {
        const item = findItem(name);
        return item && item.quantity >= qty;
    });
}

function craftItem(index) {
    const recipe = craftingRecipes[index];
    if (!recipe) return;
    if (!canCraft(recipe)) {
        log('Missing ingredients for crafting.');
        return;
    }
    Object.entries(recipe.ingredients).forEach(([name, qty]) => {
        removeItemFromInventory(name, qty);
    });
    addItemToInventory(recipe.result);
    log(`Crafted ${recipe.result}.`);
    gainXP(10);
    checkAchievements();
    updateInventory();
}

function zombieAttack() {
    if (zombies.some(z => z.x === player.x && z.y === player.y)) {
        player.health -= 1;
        log('A zombie attacked you for 1 damage.');
        if (Math.random() < 0.3) player.conditions.bleeding = true;
        if (Math.random() < 0.2) player.conditions.infection = true;
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
    player.hunger = 0;
    player.fatigue = 0;
    player.conditions = { bleeding: false, infection: false };
    player.xp = 0;
    player.level = 1;
    player.xpToNext = 100;
    inventory = [];
    const cDef = classDefinitions[player.class] || null;
    player.perks = cDef ? [cDef.perk] : [];
    if (cDef) addItemToInventory(cDef.item);
    player.achievements = [];
    player.stats = { kills: 0, searches: 0, tilesExplored: 0 };
    player.visionRange = 2;
    createGrid();
    placePlayer();
    companions = [{ x: player.x, y: player.y, name: 'Companion' }];
    placeZombies(5);
    updateStats();
    const maxW = document.getElementById('max-weight');
    if (maxW) maxW.textContent = player.maxWeight;
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
            let type = areaTypes[Math.floor(Math.random() * areaTypes.length)];
            if (x === 0 || y === 0 || x === gridSize - 1 || y === gridSize - 1) {
                type = 'ocean';
            }
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
                passable: type !== 'ocean',
                barricaded: false,
                barricadeHealth: null,
                barricadeMaterial: null,
                searchedAt: -Infinity,
                visible: false,
                explored: false,
                spawnZone: (Math.random() < 0.05)
            };
            if (type !== 'ocean') assignTileAttributes(areaGrid[y][x]);
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
                t.passable &&
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
        if (areaGrid[pos.y][pos.x].passable) {
            zombies.push(createZombie(pos.x, pos.y));
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
            !areaGrid[pos.y][pos.x].passable ||
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
            'companion',
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
    companions.forEach(c => {
        if (areaGrid[c.y][c.x].visible) {
            const cell = getCell(c.x, c.y);
            cell.classList.add('companion');
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
    const weaponSelect = document.getElementById('weaponSelect');
    let wIdx = weaponSelect ? parseInt(weaponSelect.value) : -1;
    const wItem = inventory[wIdx];
    let range = 0;
    if (wItem && itemDefinitions[wItem.name]) range = itemDefinitions[wItem.name].range || 0;
    const inRange = zombies.some(z => {
        const dist = Math.abs(z.x - player.x) + Math.abs(z.y - player.y);
        if (range === 0) return dist === 0;
        return dist <= range && areaGrid[z.y][z.x].visible;
    });
    if (inRange) attackBtn.style.display = 'inline-block';
    else attackBtn.style.display = 'none';
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
    if (tile.type === 'ocean') {
        return areaDescriptions.ocean;
    }
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
        if (!tile.passable) {
            log('The ocean blocks your path.');
            return;
        }
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
        player.fatigue = Math.min(maxFatigue, player.fatigue + 2);
        player.hunger = Math.min(maxHunger, player.hunger + 1);
        if (tile.attributes.includes('locked') && !tile.unlocked) {
            tile.unlocked = true;
            log('You force your way into the locked area.');
        }
        const prev = { x: player.x, y: player.y };
        const newlyExplored = !tile.explored;
        player.x = nx;
        player.y = ny;
        companions.forEach(c => { c.x = prev.x; c.y = prev.y; });
        if (newlyExplored) {
            player.stats.tilesExplored += 1;
            gainXP(5);
            checkAchievements();
        }
        if (tile.attributes.includes('fire')) {
            player.health -= 3;
            log('The flames scorch you for 3 damage!', 'danger');
        }
        if (tile.attributes.includes('trap') && !tile.trapTriggered) {
            tile.trapTriggered = true;
            if (Math.random() < 0.5) {
                player.health -= 1;
                if (Math.random() < 0.5) player.conditions.bleeding = true;
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
    const weaponSelect = document.getElementById('weaponSelect');
    const wIdx = weaponSelect ? parseInt(weaponSelect.value) : -1;
    const item = inventory[wIdx];
    let def = { damage: 1, ap: 2, range: 0, accuracy: 0.8 };
    if (item && itemDefinitions[item.name] && itemDefinitions[item.name].type === 'weapon') {
        def = itemDefinitions[item.name];
    }
    if (player.perks.includes('Sharpshooter') && def.range > 0) {
        def = { ...def, accuracy: Math.min(1, (def.accuracy || 0.8) + 0.1) };
    }
    if (player.ap < def.ap) {
        log('Not enough AP to attack.');
        return;
    }

    let targets = [];
    if (def.range === 0) {
        targets = zombies.filter(z => z.x === player.x && z.y === player.y);
    } else {
        targets = zombies.filter(z => {
            const dist = Math.abs(z.x - player.x) + Math.abs(z.y - player.y);
            return dist <= def.range && areaGrid[z.y][z.x].visible;
        });
    }

    if (!targets.length) {
        log('No zombie in range.');
        return;
    }
    const target = targets[0];
    if (Math.random() < def.accuracy) {
        target.health -= def.damage;
        log('You hit the zombie.');
        if (def.aoe) {
            zombies.forEach(z => {
                if (z !== target && Math.abs(z.x - target.x) + Math.abs(z.y - target.y) <= 1) {
                    z.health -= def.damage;
                }
            });
        }
    } else {
        log('Your attack misses.');
    }

    if (def.ammoType) {
        if (!consumeAmmo(def.ammoType, def.ammoUsed || 1)) {
            return;
        }
    }
    if (item && item.durability != null) {
        item.durability -= 1;
        if (item.durability <= 0) {
            removeItemFromInventory(item.name, 1);
            log(`Your ${item.name} broke.`);
        }
    }

    player.ap -= def.ap;
    player.fatigue = Math.min(maxFatigue, player.fatigue + 2);
    player.hunger = Math.min(maxHunger, player.hunger + 1);

    if (target.health <= 0) {
        if (target.damageOnDeath) {
            player.health -= 1;
            log('The zombie explodes, injuring you!', 'danger');
        }
        zombies.splice(zombies.indexOf(target), 1);
        log('Zombie defeated!');
        player.stats.kills += 1;
        gainXP(20);
        checkAchievements();
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
        player.fatigue = Math.max(0, player.fatigue - 10);
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
    player.fatigue = Math.min(maxFatigue, player.fatigue + 2);
    player.hunger = Math.min(maxHunger, player.hunger + 1);
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
        if (addItemToInventory(item)) {
            log(`Found ${item} in the ${type}.`);
        }
    } else {
        log('Found nothing.');
    }
    player.stats.searches += 1;
    gainXP(5);
    checkAchievements();
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
    const weaponSelect = document.getElementById('weaponSelect');
    const craftSelect = document.getElementById('craftSelect');
    list.innerHTML = '';
    select.innerHTML = '';
    barricadeSelect.innerHTML = '';
    if (weaponSelect) weaponSelect.innerHTML = '';
    if (craftSelect) craftSelect.innerHTML = '';

    inventory.forEach((item, idx) => {
        const div = document.createElement('div');
        const dur = item.maxDurability ? ` (${item.durability}/${item.maxDurability})` : '';
        div.textContent = `${item.name} x${item.quantity}${dur}`;
        if (item.rarity === 'rare') div.classList.add('rare');
        if (item.rarity === 'epic') div.classList.add('epic');
        if (item.name === newItem) div.classList.add('flash');
        div.title = item.description || '';
        list.appendChild(div);
        if (item.type === 'consumable') {
            const opt = document.createElement('option');
            opt.value = idx;
            opt.textContent = item.name;
            select.appendChild(opt);
        }
        if (item.type === 'material') {
            const opt = document.createElement('option');
            opt.value = idx;
            opt.textContent = item.name;
            barricadeSelect.appendChild(opt);
        }
        if (item.type === 'weapon') {
            const opt = document.createElement('option');
            opt.value = idx;
            const durText = item.maxDurability ? ` (${item.durability}/${item.maxDurability})` : '';
            opt.textContent = item.name + durText;
            weaponSelect.appendChild(opt);
        }
    });
    if (weaponSelect && weaponSelect.options.length > 0) {
        weaponSelect.value = weaponSelect.options[0].value;
    }

    if (craftSelect) {
        craftingRecipes.forEach((rec, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = rec.result;
            if (!canCraft(rec)) opt.disabled = true;
            craftSelect.appendChild(opt);
        });
    }
    updateWeight();
}

function useItem() {
    const select = document.getElementById('inventorySelect');
    const idx = parseInt(select.value);
    const item = inventory[idx];
    if (!item) return;
    if (item.name === 'First Aid Kit') {
        const before = player.health;
        let heal = 5;
        if (player.perks.includes('Field Medic')) heal += 2;
        player.health = Math.min(maxHealth, player.health + heal);
        player.conditions.infection = false;
        log(`Used First Aid Kit and healed ${player.health - before} HP.`);
        removeItemFromInventory(item.name, 1);
    } else if (item.name === 'Energy Drink') {
        const before = player.ap;
        player.ap = Math.min(maxAP, player.ap + 5);
        log(`Used Energy Drink and restored ${player.ap - before} AP.`);
        removeItemFromInventory(item.name, 1);
    } else if (item.name === 'Bandage') {
        const before = player.health;
        let heal = 2;
        if (player.perks.includes('Field Medic')) heal += 1;
        player.health = Math.min(maxHealth, player.health + heal);
        player.conditions.bleeding = false;
        log(`Used Bandage and healed ${player.health - before} HP.`);
        removeItemFromInventory(item.name, 1);
    } else if (item.name === 'Rations') {
        const before = player.hunger;
        player.hunger = Math.max(0, player.hunger - 30);
        log(`Ate rations and reduced hunger by ${before - player.hunger}.`);
        removeItemFromInventory(item.name, 1);
    } else if (item.type === 'material') {
        log('Select Barricade and choose a material to build or reinforce.');
        return;
    }
    updateStats();
    updateInventory();
    draw();
    updateTileInfo();
}

function barricade() {
    if (electricalInterference()) return;
    const select = document.getElementById('barricadeSelect');
    const idx = parseInt(select.value);
    const item = inventory[idx];
    if (!item) {
        log('No barricade material selected.');
        return;
    }
    if (player.ap < 1) {
        log('Not enough AP to barricade.');
        return;
    }
    const tile = areaGrid[player.y][player.x];
    let add = 0;
    if (item.name === 'Wood Planks') add = 2;
    else if (item.name === 'Metal Panels') add = 3;
    else if (item.name === 'Heavy Furniture') add = 5;
    if (player.perks.includes('Tinkerer')) add += 1;
    if (!tile.barricaded) {
        tile.barricaded = true;
        tile.barricadeHealth = 0;
    }
    tile.barricadeHealth = Math.min(10, tile.barricadeHealth + add);
    tile.barricadeMaterial = item.name;
    removeItemFromInventory(item.name, 1);
    player.ap -= 1;
    player.fatigue = Math.min(maxFatigue, player.fatigue + 2);
    player.hunger = Math.min(maxHunger, player.hunger + 1);
    log(`You reinforced the barricade with ${item.name}. Strength: ${tile.barricadeHealth}/10.`);
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
    player.hunger = Math.min(maxHunger, player.hunger + 1);
    player.fatigue = Math.min(maxFatigue, player.fatigue + 1);
    if (player.hunger >= maxHunger) {
        player.health -= 1;
        log('Starvation hurts you.', 'danger');
    }
    if (player.fatigue >= maxFatigue) {
        player.health -= 1;
        log('Exhaustion takes its toll.', 'danger');
    }
    if (player.conditions.bleeding) {
        player.health -= 1;
        log('You bleed.', 'danger');
    }
    if (player.conditions.infection && worldState.turn % 3 === 0) {
        player.health -= 1;
        log('The infection worsens.', 'danger');
    }
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
        if (!t.passable) return false;
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

function gainXP(amount) {
    player.xp += amount;
    while (player.xp >= player.xpToNext) {
        player.xp -= player.xpToNext;
        player.level += 1;
        player.xpToNext = Math.floor(player.xpToNext * 1.5);
        log(`You reached level ${player.level}!`);
        if (perkUnlocks[player.level]) {
            const perk = perkUnlocks[player.level];
            if (!player.perks.includes(perk)) {
                player.perks.push(perk);
                log(`Perk unlocked: ${perk}!`);
            }
        }
    }
    updateStats();
}

function checkAchievements() {
    Object.entries(achievementDefinitions).forEach(([key, def]) => {
        if (def.condition() && !player.achievements.includes(key)) {
            player.achievements.push(key);
            log(`Achievement unlocked: ${def.description}!`);
        }
    });
    updateStats();
}

function updateStats() {
    const healthEl = document.getElementById('health');
    const apEl = document.getElementById('ap');
    const hungerEl = document.getElementById('hunger');
    const fatigueEl = document.getElementById('fatigue');
    const xpEl = document.getElementById('xp');
    const levelEl = document.getElementById('level');
    const perksEl = document.getElementById('perk-display');
    const achEl = document.getElementById('achievement-display');
    const healthFill = document.querySelector('#health-bar .fill');
    const apFill = document.querySelector('#ap-bar .fill');
    const hungerFill = document.querySelector('#hunger-bar .fill');
    const fatigueFill = document.querySelector('#fatigue-bar .fill');
    const xpFill = document.querySelector('#xp-bar .fill');
    healthEl.textContent = player.health;
    apEl.textContent = player.ap;
    hungerEl.textContent = player.hunger;
    fatigueEl.textContent = player.fatigue;
    if (xpEl) xpEl.textContent = `${player.xp}/${player.xpToNext}`;
    if (levelEl) levelEl.textContent = player.level;
    healthFill.style.transform = `scaleX(${player.health / maxHealth})`;
    apFill.style.transform = `scaleX(${player.ap / maxAP})`;
    hungerFill.style.transform = `scaleX(${(maxHunger - player.hunger) / maxHunger})`;
    fatigueFill.style.transform = `scaleX(${(maxFatigue - player.fatigue) / maxFatigue})`;
    if (xpFill) xpFill.style.transform = `scaleX(${player.xp / player.xpToNext})`;
    const statusEl = document.getElementById('status');
    const arr = [];
    if (player.conditions.bleeding) arr.push('Bleeding');
    if (player.conditions.infection) arr.push('Infected');
    statusEl.textContent = arr.join(', ');
    if (perksEl) perksEl.textContent = `Perks: ${player.perks.join(', ') || 'None'}`;
    if (achEl) achEl.textContent = `Achievements: ${player.achievements.map(a => achievementDefinitions[a].description).join(', ') || 'None'}`;
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
    const loginView = document.getElementById('account-login');
    const registerView = document.getElementById('account-register');
    const charView = document.getElementById('character-screen');
    const gameEl = document.getElementById('game');
    const topBar = document.getElementById('top-bar');
    const captchaQ = document.getElementById('captcha-question');
    let captchaA = 0;

    const show = v => {
        [loginView, registerView, charView].forEach(el => el.style.display = 'none');
        if (v) v.style.display = 'flex';
    };

    const genCaptcha = () => {
        const a = Math.floor(Math.random()*10);
        const b = Math.floor(Math.random()*10);
        captchaA = a + b;
        captchaQ.textContent = `What is ${a} + ${b}?`;
        document.getElementById('captcha-answer').value = '';
    };

    genCaptcha();
    show(loginView);

    document.getElementById('show-register').addEventListener('click', e => {
        e.preventDefault();
        genCaptcha();
        show(registerView);
    });
    document.getElementById('show-login').addEventListener('click', e => {
        e.preventDefault();
        show(loginView);
    });

    document.getElementById('loginButton').addEventListener('click', () => {
        const u = document.getElementById('login-username').value.trim();
        const p = document.getElementById('login-password').value;
        if (serverEnabled) socket.emit('login', { username: u, password: p });
    });

    document.getElementById('registerButton').addEventListener('click', () => {
        const email = document.getElementById('reg-email').value.trim();
        const username = document.getElementById('reg-username').value.trim();
        const password = document.getElementById('reg-password').value;
        const confirm = document.getElementById('reg-confirm').value;
        const captcha = document.getElementById('captcha-answer').value.trim();
        const errorEl = document.getElementById('register-error');
        const passValid = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}$/.test(password);
        if (!email.match(/^[^@]+@[^@]+\.[^@]+$/)) { errorEl.textContent = 'Invalid email'; return; }
        if (!passValid) { errorEl.textContent = 'Weak password'; return; }
        if (password !== confirm) { errorEl.textContent = 'Passwords do not match'; return; }
        if (parseInt(captcha) !== captchaA) { errorEl.textContent = 'Captcha incorrect'; return; }
        errorEl.textContent = '';
        if (serverEnabled) socket.emit('registerAccount', { email, username, password });
    });

    socket.on('loginSuccess', () => {
        show(charView);
    });
    socket.on('loginError', msg => alert(msg));
    socket.on('registerSuccess', () => { alert('Account created'); show(loginView); });
    socket.on('registerError', msg => { document.getElementById('register-error').textContent = msg; });

    document.getElementById('startButton').addEventListener('click', () => {
        const username = document.getElementById('username').value.trim();
        const charName = document.getElementById('charName').value.trim();
        const charSex = document.getElementById('charSex').value;
        const charClass = document.getElementById('charClass').value;
        player.class = charClass;
        if (serverEnabled) socket.emit('register', { username, charName, charSex, charClass });
        charView.style.display = 'none';
        gameEl.style.display = '';
        topBar.style.display = '';
        init();
    });
    const sendAction = act => {
        if (serverEnabled) {
            socket.emit('action', act);
        } else {
            switch (act.type) {
                case 'move':
                    move(act.dx, act.dy);
                    break;
                case 'attack':
                    attack();
                    break;
                case 'rest':
                    rest();
                    break;
                case 'search':
                    search();
                    break;
            }
        }
    };

    document.getElementById('north').addEventListener('click', () => sendAction({ type: 'move', dx: 0, dy: -1 }));
    document.getElementById('south').addEventListener('click', () => sendAction({ type: 'move', dx: 0, dy: 1 }));
    document.getElementById('west').addEventListener('click', () => sendAction({ type: 'move', dx: -1, dy: 0 }));
    document.getElementById('east').addEventListener('click', () => sendAction({ type: 'move', dx: 1, dy: 0 }));
    document.getElementById('attack').addEventListener('click', () => sendAction({ type: 'attack' }));
    document.getElementById('rest').addEventListener('click', () => sendAction({ type: 'rest' }));
    document.getElementById('search').addEventListener('click', () => sendAction({ type: 'search' }));
    document.getElementById('use').addEventListener('click', useItem);
    document.getElementById('barricade').addEventListener('click', barricade);
    const craftBtn = document.getElementById('craft');
    if (craftBtn) craftBtn.addEventListener('click', () => {
        const idx = document.getElementById('craftSelect').value;
        craftItem(parseInt(idx));
    });
    document.getElementById('highlightToggle').addEventListener('change', e => {
        document.body.classList.toggle('highlight-unexplored', e.target.checked);
    });
});
