#!/usr/bin/env node
const { extractIocsFromFile } = require('./lib/ioc');

if (process.argv.length < 3) {
  console.error('Usage: extract_iocs.js <js-file>');
  process.exit(1);
}

console.log(JSON.stringify(extractIocsFromFile(process.argv[2]), null, 2));
