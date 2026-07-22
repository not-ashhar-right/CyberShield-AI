import { spawn } from 'child_process';
import dns from 'dns/promises';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// Load env files
const cwd = process.cwd();
const envFiles = [path.resolve(cwd, '.env.local'), path.resolve(cwd, '.env')];

for (const envFile of envFiles) {
  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile, override: true });
  }
}

async function resolveUrlToIPv4(urlStr) {
  if (!urlStr) return urlStr;
  try {
    // Regex to match postgresql connection string and extract hostname
    // Format: postgresql://user:password@hostname:port/db...
    const match = urlStr.match(/^(postgresql:\/\/.*?@)(.*?)(:\d+.*)$/);
    if (!match) return urlStr;
    
    const [_, prefix, host, suffix] = match;
    
    // If it's already an IP address, don't resolve
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
      return urlStr;
    }
    
    const result = await dns.lookup(host, { family: 4 });
    const ip = result.address;
    
    return `${prefix}${ip}${suffix}`;
  } catch (err) {
    console.warn(`⚠️ Warning: Failed to resolve host to IPv4: ${err.message}`);
    return urlStr;
  }
}

async function run() {
  const args = process.argv.slice(2);
  
  if (process.env.DATABASE_URL) {
    process.env.DATABASE_URL = await resolveUrlToIPv4(process.env.DATABASE_URL);
  }
  if (process.env.DIRECT_URL) {
    process.env.DIRECT_URL = await resolveUrlToIPv4(process.env.DIRECT_URL);
  }
  
  // Spawn the prisma CLI command
  const isWindows = process.platform === 'win32';
  const cmd = isWindows ? 'npx.cmd' : 'npx';
  
  const child = spawn(cmd, ['prisma', ...args], {
    stdio: 'inherit',
    env: process.env,
    shell: true
  });
  
  child.on('close', (code) => {
    process.exit(code ?? 0);
  });
}

run().catch((err) => {
  console.error('Fatal error in Prisma IPv4 wrapper:', err);
  process.exit(1);
});
