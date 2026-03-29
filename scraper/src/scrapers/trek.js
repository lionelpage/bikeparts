/**
 * Trek — scraping avec Puppeteer
 * Site : https://www.trekbikes.com/
 *
 * Trek utilise un site Next.js / React avec rendu côté client.
 * Le HTML brut ne contient pas les produits → Puppeteer obligatoire.
 *
 * Stratégie :
 * 1. Naviguer vers chaque page de catégorie
 * 2. Attendre que les cards produits soient rendues
 * 3. Extraire nom, année, couleur, image, URL
 */
const puppeteer      = require('puppeteer-core');
const { saveBike }   = require('../utils/save');
const { sleep }      = require('../utils/http');
const { log, stats } = require('../utils/logger');

const BRAND = 'Trek';
const BASE  = 'https://www.trekbikes.com';

const CATEGORIES = [
  { path: '/us/en_US/bikes/road-bikes/c/B225/',        category: 'road'   },
  { path: '/us/en_US/bikes/mountain-bikes/c/B500/',    category: 'mtb'    },
  { path: '/us/en_US/bikes/gravel-bikes/c/B240/',      category: 'gravel' },
  { path: '/us/en_US/bikes/electric-bikes/c/B600/',    category: 'ebike'  },
  { path: '/us/en_US/bikes/hybrid-bikes/c/B240/',      category: 'urban'  },
];

async function launchBrowser() {
  return puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1280,800',
    ],
  });
}

async function scrapeTrek() {
  let inserted = 0, updated = 0, skipped = 0, errors = 0;
  let browser;

  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1280, height: 800 });

    for (const { path, category } of CATEGORIES) {
      log(BRAND, `→ ${path}`);
      try {
        await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2', timeout: 30000 });

        // Attendre que les cards soient rendues
        await page.waitForSelector(
          '[data-qa="product-card"], .product-card, .ProductCard, [class*="productTile"]',
          { timeout: 15000 }
        ).catch(() => log(BRAND, '  ⚠ selector non trouvé, extraction quand même'));

        // Scroller pour déclencher le lazy-load
        await autoScroll(page);

        // Extraire les données
        const products = await page.evaluate(() => {
          const cards = document.querySelectorAll(
            '[data-qa="product-card"], .product-card, .ProductCard, [class*="productTile"], [class*="ProductTile"]'
          );
          return Array.from(cards).map((card) => {
            const titleEl   = card.querySelector('h3, h2, [data-qa="product-name"], [class*="title"], [class*="name"]');
            const imgEl     = card.querySelector('img');
            const linkEl    = card.querySelector('a');
            const yearEl    = card.querySelector('[data-qa="year"], [class*="year"], [class*="Year"]');

            return {
              name:    titleEl?.textContent?.trim() || '',
              imgSrc:  imgEl?.src || imgEl?.dataset?.src || null,
              href:    linkEl?.href || null,
              yearStr: yearEl?.textContent?.trim() || '',
            };
          });
        });

        log(BRAND, `  ${products.length} produits extraits`);

        for (const p of products) {
          if (!p.name) continue;
          const year = parseInt(p.yearStr) || extractYear(p.name) || new Date().getFullYear();
          const r    = await saveBike({
            brand: BRAND, model: p.name, year, category,
            image_url: p.imgSrc, source_url: p.href, source: 'trek',
          });
          if (r === 'inserted') inserted++;
          else if (r === 'updated') updated++;
          else skipped++;
        }

        await sleep(2000);
      } catch (err) {
        log(BRAND, `✗ ${path}: ${err.message}`);
        errors++;
      }
    }
  } catch (err) {
    log(BRAND, `✗ Puppeteer launch: ${err.message}`);
    errors++;
  } finally {
    if (browser) await browser.close();
  }

  stats(BRAND, inserted, updated, skipped, errors);
  return { inserted, updated, skipped, errors };
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance  = 400;
      const timer     = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= document.body.scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 150);
    });
  });
  await sleep(500);
}

function extractYear(str) {
  const m = str?.match(/20(1[5-9]|2[0-9])/);
  return m ? parseInt(m[0]) : null;
}

module.exports = scrapeTrek;
