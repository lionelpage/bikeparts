require('dotenv').config();
const pool = require('./db');

const scrapers = {
  bikeindex:   require('./scrapers/bikeindex'),
  canyon:      require('./scrapers/canyon'),
  giant:       require('./scrapers/giant'),
  cube:        require('./scrapers/cube'),
  orbea:       require('./scrapers/orbea'),
  trek:        require('./scrapers/trek'),
  specialized: require('./scrapers/specialized'),
};

// Argument : 'all' | 'bikeindex' | 'canyon' | ...
const target = (process.argv[2] || 'all').toLowerCase();

async function run() {
  const start = Date.now();
  console.log(`\n${'═'.repeat(55)}`);
  console.log(`  BikeParts Scraper — ${new Date().toLocaleString('fr-FR')}`);
  console.log(`  Cible : ${target}`);
  console.log(`${'═'.repeat(55)}\n`);

  // Attendre que la BDD soit prête
  await waitForDb();

  const toRun = target === 'all'
    ? Object.entries(scrapers)
    : Object.entries(scrapers).filter(([name]) => name === target);

  if (toRun.length === 0) {
    console.error(`✗ Scraper inconnu : "${target}"`);
    console.error(`  Disponibles : ${Object.keys(scrapers).join(', ')}, all`);
    process.exit(1);
  }

  let totalInserted = 0, totalUpdated = 0, totalErrors = 0;

  for (const [name, scraper] of toRun) {
    console.log(`\n${'─'.repeat(55)}`);
    console.log(`  ▶  ${name.toUpperCase()}`);
    console.log(`${'─'.repeat(55)}`);
    try {
      const result = await scraper();
      totalInserted += result?.inserted || 0;
      totalUpdated  += result?.updated  || 0;
      totalErrors   += result?.errors   || 0;
    } catch (err) {
      console.error(`[${name}] ERREUR CRITIQUE: ${err.message}`);
      totalErrors++;
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n${'═'.repeat(55)}`);
  console.log(`  RÉSUMÉ GLOBAL`);
  console.log(`  ✓ Insérés : ${totalInserted}`);
  console.log(`  ✓ Mis à jour : ${totalUpdated}`);
  console.log(`  ✗ Erreurs : ${totalErrors}`);
  console.log(`  ⏱  Durée : ${elapsed}s`);
  console.log(`${'═'.repeat(55)}\n`);

  await pool.end();
  process.exit(totalErrors > 0 ? 1 : 0);
}

async function waitForDb(retries = 10) {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query('SELECT 1');
      console.log('  ✓ PostgreSQL connecté');
      return;
    } catch {
      console.log(`  ⏳ Attente BDD (${i + 1}/${retries})…`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  console.error('  ✗ Impossible de se connecter à PostgreSQL');
  process.exit(1);
}

run().catch((err) => {
  console.error('Erreur fatale:', err);
  process.exit(1);
});
