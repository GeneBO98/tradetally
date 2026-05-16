#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const migrationsDir = path.resolve(__dirname, '../migrations');
const prefixAllowlistPath = path.resolve(__dirname, '../config/migration-prefix-allowlist.json');

function strictPrefixMode() {
  return process.env.MIGRATION_PREFIX_STRICT === 'true' || process.argv.includes('--strict-prefixes');
}

function loadPrefixAllowlist() {
  if (!fs.existsSync(prefixAllowlistPath)) return {};
  return JSON.parse(fs.readFileSync(prefixAllowlistPath, 'utf8'));
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function getMigrationFiles() {
  if (!fs.existsSync(migrationsDir)) return [];
  return fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();
}

function validateMigrations(files) {
  const errors = [];
  const warnings = [];
  const seenNames = new Set();
  const numericPrefixes = new Map();
  const prefixAllowlist = loadPrefixAllowlist();
  const enforceStrictPrefixes = strictPrefixMode();

  const manifest = files.map((file) => {
    const fullPath = path.join(migrationsDir, file);
    const content = fs.readFileSync(fullPath, 'utf8');
    const match = file.match(/^(\d+)_[-a-zA-Z0-9_]+\.sql$/);

    if (!match) {
      errors.push(`${file}: migration filename must start with a numeric prefix and use snake_case`);
    }

    if (seenNames.has(file)) {
      errors.push(`${file}: duplicate migration filename`);
    }
    seenNames.add(file);

    if (match) {
      const prefix = match[1];
      if (!numericPrefixes.has(prefix)) {
        numericPrefixes.set(prefix, []);
      }
      numericPrefixes.get(prefix).push(file);
    }

    if (content.trim().length === 0) {
      errors.push(`${file}: migration is empty`);
    }

    return {
      file,
      bytes: Buffer.byteLength(content),
      checksum: sha256(content)
    };
  });

  for (const [prefix, prefixFiles] of numericPrefixes.entries()) {
    if (prefixFiles.length > 1) {
      const allowlisted = prefixAllowlist[prefix] || [];
      const allowed = allowlisted.length === prefixFiles.length &&
        allowlisted.every(file => prefixFiles.includes(file));
      if (enforceStrictPrefixes && !allowed) {
        errors.push(`prefix ${prefix} is not monotonic/unique for new migrations: ${prefixFiles.join(', ')}`);
      } else {
        warnings.push(`prefix ${prefix} is used by multiple migrations: ${prefixFiles.join(', ')}`);
      }
    }
  }

  return { errors, warnings, manifest };
}

function main() {
  const files = getMigrationFiles();
  const result = validateMigrations(files);

  console.log(`Checked ${files.length} migration file(s)`);
  result.warnings.forEach(warning => console.warn(`WARNING: ${warning}`));

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result.manifest, null, 2));
  } else {
    result.manifest.forEach(item => {
      console.log(`${item.file}  ${item.checksum}`);
    });
  }

  if (result.errors.length > 0) {
    result.errors.forEach(error => console.error(`ERROR: ${error}`));
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { validateMigrations, getMigrationFiles };
