/**
 * Local / optional PM2 helper for Client/server (JSON db). Do NOT use on the production VPS
 * if live traffic uses ~/backend/server.js + SQLite — switching PM2 between them breaks production.
 *
 * From repo root: pm2 start ecosystem.config.cjs
 */
const path = require('path');

const repoRoot = __dirname;
const serverDir = path.join(repoRoot, 'server');

module.exports = {
  apps: [
    {
      name: 'dataplus-api',
      cwd: serverDir,
      script: 'index.js',
      interpreter: 'node',
      // Server loads ../.env and ../.env.local from repo root (see server/index.js)
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
