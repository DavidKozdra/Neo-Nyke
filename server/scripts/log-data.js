const fs = require('node:fs');
const path = require('node:path');

const logFile = path.join(".", '..', 'logs', 'mainlog.txt');

/**
 * Append one line to the server log file.
 *
 * @param {string} data Log message text.
 */
function writeToLog(data) {
    fs.appendFileSync(logFile, `${data}\n`);
}

/**
 * Read the full server log file as text.
 *
 * @returns {string} Log file contents.
 */
function readLog() {
    return fs.readFileSync(logFile, 'utf-8');
}

if (require.main === module) {
    writeToLog('This is a test log entry.');
    console.log(readLog());
}

module.exports = {
    writeToLog,
    readLog,
};