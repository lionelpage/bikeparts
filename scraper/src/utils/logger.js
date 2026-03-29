function log(brand, msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [${brand.padEnd(12)}] ${msg}`);
}

function stats(brand, inserted, updated, skipped, errors) {
  log(brand, `✓ inserted=${inserted} updated=${updated} skipped=${skipped} errors=${errors}`);
}

module.exports = { log, stats };
