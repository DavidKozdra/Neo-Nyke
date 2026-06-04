
const {
  createRequestUrl,
} = require('../scripts/run-tests');

const DEFAULT_API_BASE = 'https://neonyke.davidkozdra.workers.dev/api';


const API_BASE = process.env.API_BASE || DEFAULT_API_BASE;

async function pingProd() {
  try {
    const response = await fetch(`${API_BASE}/health`);
    console.log('"prod:"', API_BASE);
    return await response.json();
  } catch (error) {
    return { error: 'Failed to ping production server', details: error.message };
  }
}

describe('server test network', () => {
 

  test('ping production server', async () => {
    const result = await pingProd();

    expect(result).toHaveProperty('ok');

    console.log(result ? `reachable ${JSON.stringify(result.seasonId)}` : 'no result');
  });
});