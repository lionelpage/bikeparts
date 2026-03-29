/**
 * Orbea — scraping HTML avec cheerio
 * Site : https://www.orbea.com/en-us/
 *
 * Orbea a un site bien structuré.
 * Ils exposent aussi leurs produits via des balises <script type="application/ld+json">
 * (schema.org Product), ce qui est la source la plus fiable.
 */
const cheerio        = require('cheerio');
const { http, sleep } = require('../utils/http');
const { saveBike }   = require('../utils/save');
const { log, stats } = require('../utils/logger');

const BRAND = 'Orbea';
const BASE  = 'https://www.orbea.com';

const CATEGORIES = [
  { path: '/en-us/road/',     category: 'road'   },
  { path: '/en-us/mountain/', category: 'mtb'    },
  { path: '/en-us/gravel/',   category: 'gravel' },
  { path: '/en-us/urban/',    category: 'urban'  },
  { path: '/en-us/electric/', category: 'ebike'  },
  { path: '/en-us/triathlon/', category: 'tt'    },
];

async function scrapeOrbea() {
  let inserted = 0, updated = 0, skipped = 0, errors = 0;

  for (const { path, category } of CATEGORIES) {
    log(BRAND, `→ ${path}`);
    try {
      const { data: html } = await http.get(`${BASE}${path}`, {
        headers: { Referer: BASE },
      });
      const $ = cheerio.load(html);

      // ── Méthode 1 : JSON-LD (schema.org) ────────────────────
      // C'est le moyen le plus robuste — Orbea l'inclut souvent
      const jsonLdBlocks = $('script[type="application/ld+json"]');
      let foundViaJsonLd = 0;

      jsonLdBlocks.each((_, el) => {
        try {
          const data = JSON.parse($(el).html());
          const items = Array.isArray(data) ? data
            : data['@graph'] ? data['@graph']
            : [data];

          for (const item of items) {
            if (item['@type'] !== 'Product') continue;
            const name  = item.name || '';
            const year  = extractYear(name) || new Date().getFullYear();
            const image = item.image?.[0] || item.image || null;
            const url   = item.url || null;

            // Orbea liste les coloris dans offers ou dans des variantes
            const offers = item.offers ? (Array.isArray(item.offers) ? item.offers : [item.offers]) : [{}];
            for (const offer of offers) {
              saveBike({
                brand: BRAND, model: cleanModel(name), year,
                color:      offer.color || null,
                category,
                image_url:  image,
                source_url: url,
                source:     'orbea_jsonld',
              }).then((r) => {
                if (r === 'inserted') { inserted++; foundViaJsonLd++; }
                else if (r === 'updated') updated++;
                else skipped++;
              });
            }
          }
        } catch { /* JSON invalide, on ignore */ }
      });

      if (foundViaJsonLd > 0) {
        log(BRAND, `  ${foundViaJsonLd} produits via JSON-LD`);
        await sleep(1000);
        continue;
      }

      // ── Méthode 2 : scraping HTML classique ─────────────────
      const cards = $('[class*="product-card"], [class*="ProductCard"], .bike, article.product, .product-item');
      log(BRAND, `  ${cards.length} cards HTML`);

      for (let i = 0; i < cards.length; i++) {
        const $el   = $(cards[i]);
        const name  = $el.find('h2, h3, [class*="title"], [class*="name"]').first().text().trim();
        if (!name) continue;
        const href  = $el.find('a').first().attr('href') || '';
        const img   = $el.find('img').first();
        const imgSrc = img.attr('src') || img.attr('data-src') || img.attr('data-lazy') || null;
        const year  = extractYear(name) || new Date().getFullYear();

        const r = await saveBike({
          brand: BRAND, model: cleanModel(name), year, category,
          image_url:  imgSrc ? toAbsolute(imgSrc) : null,
          source_url: href   ? toAbsolute(href)   : null,
          source:     'orbea_html',
        });
        if (r === 'inserted') inserted++;
        else if (r === 'updated') updated++;
        else skipped++;
        await sleep(100);
      }

      await sleep(1200);
    } catch (err) {
      log(BRAND, `✗ ${path}: ${err.message}`);
      errors++;
    }
  }

  await sleep(1000);
  stats(BRAND, inserted, updated, skipped, errors);
  return { inserted, updated, skipped, errors };
}

function toAbsolute(url) {
  if (!url || url.startsWith('data:')) return null;
  if (url.startsWith('http')) return url;
  return `${BASE}${url.startsWith('/') ? '' : '/'}${url}`;
}

function extractYear(str) {
  const m = str?.match(/20(1[5-9]|2[0-9])/);
  return m ? parseInt(m[0]) : null;
}

function cleanModel(name) {
  return name.replace(/orbea\s*/i, '').replace(/\s+/g, ' ').trim();
}

module.exports = scrapeOrbea;
