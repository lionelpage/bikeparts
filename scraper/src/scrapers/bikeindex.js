/**
 * Bike Index API v3 — https://bikeindex.org/documentation/api_v3
 * Endpoint public, aucune clé requise.
 * Récupère les vélos par marque, page par page.
 */
const { http, sleep } = require('../utils/http');
const { saveBike }    = require('../utils/save');
const { log, stats }  = require('../utils/logger');

const BRAND  = 'BikeIndex';
const BASE   = 'https://bikeindex.org/api/v3';
const PER_PAGE = 25;

// Marques à récupérer (correspond aux slugs BikeIndex)
const MANUFACTURERS = [
  'Trek', 'Specialized', 'Giant', 'Canyon', 'Scott',
  'Cannondale', 'Cube', 'Orbea', 'BMC', 'Cervelo',
  'Merida', 'Focus', 'Felt', 'Lapierre', 'Bianchi',
  'Colnago', 'Pinarello', 'De Rosa', 'Look',
  'Santa Cruz', 'Yeti', 'GT', 'Kona',
];

async function scrapeBikeIndex() {
  let inserted = 0, updated = 0, skipped = 0, errors = 0;

  for (const manufacturer of MANUFACTURERS) {
    log(BRAND, `→ ${manufacturer}`);
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      try {
        const { data } = await http.get(`${BASE}/bikes`, {
          params: {
            manufacturer: manufacturer,
            page,
            per_page: PER_PAGE,
          },
        });

        const bikes = data.bikes || [];
        if (bikes.length === 0) { hasMore = false; break; }

        for (const bike of bikes) {
          // BikeIndex retourne : manufacturer_name, frame_model, year, primary_frame_color, cycle_type
          const result = await saveBike({
            brand:      bike.manufacturer_name || manufacturer,
            model:      bike.frame_model || bike.description || 'Unknown',
            year:       bike.year || new Date().getFullYear(),
            color:      bike.primary_frame_color || null,
            category:   mapCycleType(bike.cycle_type_slug),
            image_url:  bike.thumb || bike.large_img || null,
            source_url: `https://bikeindex.org/bikes/${bike.id}`,
            source:     'bikeindex',
          });
          if (result === 'inserted') inserted++;
          else if (result === 'updated') updated++;
          else skipped++;
        }

        hasMore = bikes.length === PER_PAGE;
        page++;
        await sleep(300); // respecter le rate limit
      } catch (err) {
        log(BRAND, `✗ ${manufacturer} page ${page}: ${err.message}`);
        errors++;
        hasMore = false;
      }
    }
    await sleep(500);
  }

  stats(BRAND, inserted, updated, skipped, errors);
  return { inserted, updated, skipped, errors };
}

function mapCycleType(slug) {
  const map = {
    road:      'road',
    mountain:  'mtb',
    hybrid:    'urban',
    bmx:       'bmx',
    cargo:     'urban',
    'e-bike':  'ebike',
    gravel:    'gravel',
  };
  return map[slug] || null;
}

module.exports = scrapeBikeIndex;
