const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
var seed = Math.floor(Math.random() * 1000000);
// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/newSeed', (req, res) => {
    res.json({ seed });
});


let leaderboard = [];
// Routes
app.get('/leadbyPage', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const pageSize = 10;
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const pageData = leaderboard.slice(startIndex, endIndex);
    res.json({ page, pageSize, totalEntries: leaderboard.length, data: pageData });
});


// cron for todays seed
const cron = require('node-cron');
cron.schedule('0 0 * * *', () => {
    console.log('Generating new seed for the day...');
    // Logic to generate and store new seed goes here
    // For example, you could save it to a file or database
    const newSeed = Math.floor(Math.random() * 1000000);
    console.log(`New seed generated: ${newSeed}`);
    seed = newSeed; // Update the global seed variable
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


