const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const cron = require('node-cron');
const { version } = require('./package.json');

const app = express();
const PORT = process.env.PORT || 3004;

// Cryptographically strong seed
let seed = crypto.randomInt(0, 1_000_000_000);

// Security headers
app.use(helmet());

// CORS — restrict to your game's origin in production via env var
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

// Body size cap — prevent memory exhaustion
app.use(express.json({ limit: '4kb' }));
app.use(express.urlencoded({ extended: true, limit: '4kb' }));

// Rate limiters
const readLimiter = rateLimit({
    windowMs: 60_000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
});
const writeLimiter = rateLimit({
    windowMs: 60_000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
});

// Constants
const MAX_FLOOR = 10_000;
const MAX_TIME  = 86_400; // 24 h in seconds
const VALID_CHARACTERS = new Set(['Neo', 'Rogue']); // extend as needed

let leaderboard = [
    { name: 'ExamplePlayer', floor: 42, seed, character: 'Neo',   time: 3600, submittedAt: Date.now() },
    { name: 'AnotherPlayer', floor: 35, seed, character: 'Rogue',  time: 4200, submittedAt: Date.now() },
];

// ── Special days & blog posts ────────────────────────────────────────────────
// Add entries here. type: 'birthday' | 'holiday' | 'update' | 'event'
// Special days use mm-dd matching (year ignored). Blog posts use `date` for display only.
const NOTICES = [
  // ── Special days (recur every year) ──
  {
    id: 'kiah-birthday',
    type: 'birthday',
    mmdd: '04-06',
    title: "Happy Birthday, Kiah!",
    body: "Wishing you an amazing day from everyone in the dungeon. 🎂",
    icon: '🎂',
    accent: '#f47ebd',
  },
  {
    id: 'christmas',
    type: 'holiday',
    mmdd: '12-25',
    title: "Merry Christmas!",
    body: "The dungeon is decorated. May your runs be merry and your loot be plentiful.",
    icon: '🎄',
    accent: '#4caf50',
  },
  {
    id: 'festival-of-lights',
    type: 'holiday',
    mmdd: '12-01',
    mmddEnd: '12-08',
    title: "Festival of Lights",
    body: "The halls of the dungeon glow bright. Happy Hanukkah to all who celebrate!",
    icon: '🕎',
    accent: '#4fc3f7',
  },
  // ── Blog / update posts ──
  {
    id: 'update-gaming-branch',
    type: 'update',
    date: '2026-05-16',
    title: "GAMING Branch — What's New",
    body: "Birthday cards, inventory pause fix, shop affordability colours, and 2× health HUD. More to come.",
    icon: '📋',
    accent: '#a8c8ff',
  },
];

app.get('/notices', readLimiter, (req, res) => {
    res.json({ notices: NOTICES });
});

app.get('/version', readLimiter, (req, res) => {
    res.json({ version });
});

app.get('/health', readLimiter, (req, res) => {
    res.json({ ok: true });
});

app.get('/seed', readLimiter, (req, res) => {
    res.json({ seed });
});

app.get('/leadbyPage', readLimiter, (req, res) => {
    const page     = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = 10;
    const startIndex = (page - 1) * pageSize;
    const pageData   = leaderboard.slice(startIndex, startIndex + pageSize);
    res.json({
        page,
        pageSize,
        totalEntries: leaderboard.length,
        hasMore: startIndex + pageSize < leaderboard.length,
        data: pageData,
    });
});

app.post('/leaderboard', writeLimiter, (req, res) => {
    const { name, floor, seed: runSeed, character, time } = req.body;

    if (!name || floor === undefined || runSeed === undefined) {
        return res.status(400).json({ error: 'Missing required fields: name, floor, seed' });
    }

    if (String(runSeed) !== String(seed)) {
        return res.status(400).json({ error: "Invalid seed for this week's leaderboard" });
    }

    const floorNum = Number(floor);
    const timeNum  = Number(time) || 0;

    if (!Number.isInteger(floorNum) || floorNum < 1 || floorNum > MAX_FLOOR) {
        return res.status(400).json({ error: 'Invalid floor value' });
    }
    if (!Number.isFinite(timeNum) || timeNum < 0 || timeNum > MAX_TIME) {
        return res.status(400).json({ error: 'Invalid time value' });
    }

    const cleanName = String(name).trim().slice(0, 32);
    if (!cleanName) {
        return res.status(400).json({ error: 'Name cannot be blank' });
    }

    const cleanCharacter = String(character || '').slice(0, 32);
    if (character && !VALID_CHARACTERS.has(cleanCharacter)) {
        return res.status(400).json({ error: 'Invalid character' });
    }

    const entry = {
        name: cleanName,
        floor: floorNum,
        seed: String(runSeed),
        character: cleanCharacter,
        time: timeNum,
        submittedAt: Date.now(),
    };

    leaderboard.push(entry);
    leaderboard.sort((a, b) => b.floor - a.floor || a.time - b.time);

    // O(1) rank: entry is the last element with its floor+time combo after sort
    const rank = leaderboard.indexOf(entry) + 1;
    res.json({ ok: true, rank });
});

// Weekly seed reset — every Monday at midnight
cron.schedule('0 0 * * 1', () => {
    seed = crypto.randomInt(0, 1_000_000_000);
    leaderboard = [];
    console.log('Weekly reset: new seed generated');
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
