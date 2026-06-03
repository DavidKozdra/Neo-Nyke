const { spawnSync } = require('node:child_process');

const result = spawnSync('git', ['rev-parse', '--git-dir'], {
  stdio: 'ignore',
});

if (result.status === 0) {
  const configResult = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], {
    stdio: 'inherit',
  });

  if (configResult.error) {
    throw configResult.error;
  }

  if (configResult.status !== 0) {
    process.exit(configResult.status ?? 1);
  }
}
