/**
 * Giant Bicycles — scraping HTML avec cheerio
 * Site : https://www.giant-bicycles.com/en/
 * Giant utilise un site PHP/HTML classique bien structuré.
 */
const cheerio        = require('cheerio');
const { http, sleep } = require('../utils/http');
const { saveBike }   = require('../utils/save');
const { log, stats } = require('../utils/logger');

const BRAND = 'Giant';
const BASE  = 'https://www.giant-bicycles.com';

const CATEGORIES = [
  { path: '/en/road-bikes',         category: 'road'   },
  { path: '/en/mountain-bikes',     category: 'mtb'    },
  { path: '/en/e-bikes',            category: 'ebike'  },
  { path: '/en/trekking-bikes',     category: 'urban'  },
  { path: '/en/cyclocross-bikes',   category: 'gravel' },
  { path: '/en/city-and-commuter-bikes', category: 'urban' },
];

async function scrapeGiant() {
  let inserted = 0, updated = 0, skipped = 0, errors = 0;

  for (const { path, category } of CATEGORIES) {
    log(BRAND, `→ ${path}`);
    try {
      const { data: html } = await http.get(`${BASE}${path}`);
      const $              = cheerio.load(html);

      // Giant liste les modèles dans des cards .product-item ou .bike-list-item
      const cards = $('.product-card, .product-item, .bike-item, [class*="bike-card"]');
      log(BRAND, `  ${cards.length} cards trouvées`);

      cards.each((_, el) => {
        const $el     = $(el);
        const name    = $el.find('h3, h2, .product-title, .product-name').first().text().trim();
        const href    = $el.find('a').first().attr('href') || '';
        const imgSrc  = $el.find('img').first().attr('src') || $el.find('img').first().attr('data-src') || null;
        const yearStr = $el.find('.model-year, [class*="year"]').text().trim();
        const year    = parseInt(yearStr) || extractYear(name) || new Date().getFullYear();

        if (!name) return;

        saveBike({
          brand: BRAND, model: name, year, category,
          image_url:  imgSrc ? toAbsolute(imgSrc) : null,
          source_url: href   ? toAbsolute(href)   : null,
          source:     'giant',
        }).then((r) => {
          if (r === 'inserted') inserted++;
          else if (r === 'updated') updated++;
          else skipped++;
        });
      });

      // Certaines pages Giant ont une pagination
      const nextPage = $('a.next, a[rel="next"], .pagination__next').first().attr('href');
      if (nextPage) {
        await sleep(800);
        await scrapePage(toAbsolute(nextPage), category, $, inserted, updated, skipped, errors);
      }

      await sleep(1000);
    } catch (err) {
      log(BRAND, `✗ ${path}: ${err.message}`);
      errors++;
    }
  }

  // Attendre que les promesses async des .each soient résolues
  await sleep(2000);
  stats(BRAND, inserted, updated, skipped, errors);
  return { inserted, updated, skipped, errors };
}

async function scrapePage(url, category, $parent, inserted, updated, skipped, errors) {
  try {
    const { data: html } = await http.get(url);
    const $              = cheerio.load(html);
    const cards          = $('.product-card, .product-item, .bike-item');

    cards.each((_, el) => {
      const $el    = $(el);
      const name   = $el.find('h3, h2, .product-title').first().text().trim();
      const href   = $el.find('a').first().attr('href') || '';
      const imgSrc = $el.find('img').first().attr('src') || null;
      const year   = parseInt($el.find('.model-year').text()) || extractYear(name) || new Date().getFullYear();
      if (!name) return;
      saveBike({ brand: 'Giant', model: name, year, category, image_url: imgSrc ? toAbsolute(imgSrc) : null, source_url: href ? toAbsolute(href) : null, source: 'giant' })
        .then((r) => { if (r === 'inserted') inserted++; });
    });
  } catch { /* ignore */ }
}

function toAbsolute(url) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${BASE}${url.startsWith('/') ? '' : '/'}${url}`;
}

function extractYear(str) {
  const m = str?.match(/20(1[5-9]|2[0-9])/);
  return m ? parseInt(m[0]) : null;
}

module.exports = scrapeGiant;
