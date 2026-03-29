/**
 * Cube Bikes — scraping HTML avec cheerio
 * Site : https://www.cube.eu/en/
 * Cube a un site bien structuré avec des URLs de catalogue paginées.
 */
const cheerio        = require('cheerio');
const { http, sleep } = require('../utils/http');
const { saveBike }   = require('../utils/save');
const { log, stats } = require('../utils/logger');

const BRAND = 'Cube';
const BASE  = 'https://www.cube.eu';

const CATEGORIES = [
  { path: '/en/road-bikes/',          category: 'road'   },
  { path: '/en/mountain-bikes/',      category: 'mtb'    },
  { path: '/en/e-bikes/',             category: 'ebike'  },
  { path: '/en/touring-trekking/',    category: 'urban'  },
  { path: '/en/cyclocross-gravel/',   category: 'gravel' },
  { path: '/en/city-urban/',          category: 'urban'  },
];

async function scrapeCube() {
  let inserted = 0, updated = 0, skipped = 0, errors = 0;

  for (const { path, category } of CATEGORIES) {
    log(BRAND, `→ ${path}`);
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const url = `${BASE}${path}?p=${page}`;
      try {
        const { data: html } = await http.get(url, {
          headers: { Referer: BASE },
        });
        const $ = cheerio.load(html);

        // Cube utilise .productListItem ou .product-tile
        const cards = $('.productListItem, .product-tile, .bike-card, [class*="ProductCard"]');
        if (cards.length === 0) { hasMore = false; break; }

        log(BRAND, `  page ${page} → ${cards.length} produits`);

        for (let i = 0; i < cards.length; i++) {
          const $el = $(cards[i]);

          const titleEl   = $el.find('h2, h3, .product-name, .productName, [class*="title"]').first();
          const name      = titleEl.text().trim();
          if (!name) continue;

          const href      = $el.find('a').first().attr('href') || '';
          const imgEl     = $el.find('img').first();
          const imgSrc    = imgEl.attr('src') || imgEl.attr('data-src') || imgEl.attr('data-lazy') || null;

          // Cube inscrit souvent l'année dans le titre ou dans un span .year
          const yearText  = $el.find('.year, .modelYear, [class*="year"]').text().trim();
          const year      = parseInt(yearText) || extractYear(name) || new Date().getFullYear();

          // Coloris Cube — ils ont souvent plusieurs swatches
          const colorSwatches = $el.find('.colorSwatch, .color-option, [data-color]');
          if (colorSwatches.length > 0) {
            const colors = [];
            colorSwatches.each((_, sw) => {
              const color = $(sw).attr('data-color') || $(sw).attr('title') || $(sw).attr('alt') || null;
              if (color) colors.push(color);
            });
            for (const color of colors.length ? colors : [null]) {
              const r = await saveBike({
                brand: BRAND, model: name, year, color, category,
                image_url:  imgSrc  ? toAbsolute(imgSrc)  : null,
                source_url: href    ? toAbsolute(href)     : null,
                source:     'cube',
              });
              if (r === 'inserted') inserted++;
              else if (r === 'updated') updated++;
              else skipped++;
            }
          } else {
            const r = await saveBike({
              brand: BRAND, model: name, year, category,
              image_url:  imgSrc  ? toAbsolute(imgSrc)  : null,
              source_url: href    ? toAbsolute(href)     : null,
              source:     'cube',
            });
            if (r === 'inserted') inserted++;
            else if (r === 'updated') updated++;
            else skipped++;
          }
          await sleep(100);
        }

        // Vérifier s'il y a une page suivante
        const nextBtn = $('a.next, [rel="next"], .pagination .next, button[aria-label="Next"]');
        hasMore = nextBtn.length > 0 && !nextBtn.hasClass('disabled');
        page++;
        await sleep(800);
      } catch (err) {
        log(BRAND, `✗ ${url}: ${err.message}`);
        errors++;
        hasMore = false;
      }
    }
  }

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

module.exports = scrapeCube;
