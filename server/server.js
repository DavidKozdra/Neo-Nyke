const express = require('express');
const app = express();
const PORT = process.env.PORT || 3004;
var seed = Math.floor(Math.random() * 1000000000);

// Middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/seed', (req, res) => {
    console.log(`Seed requested, current seed: ${seed}`);   
    res.json({ seed });
});

let leaderboard = [
    {
        name: 'ExamplePlayer',
        floor: 42,
        seed:  seed,
        character: 'Neo',
        time: 3600,
        submittedAt: Date.now(),
    },
    {
        name: 'AnotherPlayer',
        floor: 35,
        seed:  seed,
        character: 'Rogue',
        time: 4200,
        submittedAt: Date.now(),
    },
];


app.get('/leadbyPage', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const pageSize = 10;
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const pageData = leaderboard.slice(startIndex, endIndex);
    res.json({
        page,
        pageSize,
        totalEntries: leaderboard.length,
        hasMore: endIndex < leaderboard.length,
        data: pageData,
    });
});

app.post('/leaderboard', (req, res) => {
    const { name, floor, seed: runSeed, character, time } = req.body;
    if (!name || !floor || runSeed === undefined) {
        return res.status(400).json({ error: 'Missing required fields: name, floor, seed' });
    }

    if (runSeed !== String(seed)) {
        return res.status(400).json({ error: 'Invalid seed for this week\'s leaderboard' });
    }

    const entry = {
        name: String(name).slice(0, 32),
        floor: Number(floor),
        seed: String(runSeed),
        character: String(character || ''),
        time: Number(time) || 0,
        submittedAt: Date.now(),
    };
    leaderboard.push(entry);
    leaderboard.sort((a, b) => b.floor - a.floor || a.time - b.time);
    res.json({ ok: true, rank: leaderboard.indexOf(entry) + 1 });
});

// cron for weekly seed — resets every Monday at midnight
const cron = require('node-cron');
cron.schedule('0 0 * * 1', () => {
    console.log('Generating new seed for the week...');
    const newSeed = Math.floor(Math.random() * 1000000000);
    console.log(`New seed generated: ${newSeed}`);
    seed = newSeed;
    leaderboard = [];
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
