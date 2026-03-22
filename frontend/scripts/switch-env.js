const fs = require('fs');
const path = require('path');

const env = process.argv[2];
const validEnvs = ['prod', 'stg', 'staging', 'production'];

if (!env || !validEnvs.includes(env)) {
  console.error('Usage: node scripts/switch-env.js <prod|stg>');
  process.exit(1);
}

const sourceFile = (env === 'prod' || env == "production") ? '.env.production' : '.env.staging';
const targetFile = '.env.local';

const sourcePath = path.resolve(__dirname, '..', sourceFile);
const targetPath = path.resolve(__dirname, '..', targetFile);

if (!fs.existsSync(sourcePath)) {
  console.error(`Source file not found: ${sourceFile}`);
  process.exit(1);
}

try {
  fs.copyFileSync(sourcePath, targetPath);
  console.log(`Successfully switched to ${env} environment (${sourceFile} -> ${targetFile})`);
} catch (err) {
  console.error('Error copying environment file:', err);
  process.exit(1);
}
