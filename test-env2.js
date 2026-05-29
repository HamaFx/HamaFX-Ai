const { parseServerEnv } = require('./packages/shared/dist/index.js');
const fs = require('fs');
const dotenv = require('dotenv');

const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
for (const k in envConfig) {
  process.env[k] = envConfig[k];
}

try {
  const env = parseServerEnv(process.env);
  console.log('SUCCESS! ENV is valid.');
} catch (e) {
  console.error('ERROR VALIDATING ENV:', e.message);
}
