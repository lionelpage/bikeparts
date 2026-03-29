/**
 * Specialized — scraping avec Puppeteer
 * Site : https://www.specialized.com/
 *
 * Specialized utilise un front React avec chargement dynamique.
 * Les données produits sont dans le JS bundle ou dans des appels API internes.
 *
 * Stratégie : intercepter les appels réseau JSON lors de la navigation,
 * ou extraire le __NEXT_DATA__ / __NUXT__ si présent.
 */
const puppeteer      = require('puppeteer-core');
const { saveBike }   = require('../utils/save');
const { sleep }      = require('../utils/http');
const { log, stats } = require('../utils/logger');

const BRAND = 'Specialized';
const BASE  = 'https://www.specialized.com';

const CATEGORIES = [
  { path: '/us/en/bikes/road',     category: 'road'   },
  { path: '/us/en/bikes/mountain', category: 'mtb'    },
  { path: '/us/en/bikes/gravel',   category: 'gravel' },
  { path: '/us/en/bikes/electric', category: 'ebike'  },
  { path: '/us/en/bikes/urban',    category: 'urban'  },
];

async function launchBrowser() {
  return require('puppeteer-core').launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
}

async function scrapeSpecialized() {
  let inserted = 0, updated = 0, skipped = 0, errors = 0;
  let browser;

  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
    );

    // Intercepter les réponses JSON pour capturer les données produit
    const capturedProducts = [];
    page.on('response', async (response) => {
      const url = response.url();
      if (!url.includes('/api/') && !url.includes('/graphql')) return;
      try {
        const ct = response.headers()['content-type'] || '';
        if (!ct.includes('json')) return;
        const json = await response.json().catch(() => null);
        if (!json) return;
        // Specialized utilise souvent une structure { products: [...] } ou { data: { products: [...] } }
        const items = json.products || json.data?.products || json.items || json.data?.items || [];
        if (Array.isArray(items) && items.length > 0) {
          capturedProducts.push(...items);
        }
      } catch { /* ignore */ }
    });

    for (const { path, category } of CATEGORIES) {
      log(BRAND, `→ ${path}`);
      capturedProducts.length = 0; // reset

      try {
        await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2', timeout: 35000 });

        // Attendre les cards produits
        await page.waitForSelector(
          '[data-testid="product-card"], .product-card, [class*="ProductCard"], [class*="product-item"]',
          { timeout: 15000 }
        ).catch(() => {});

        await autoScroll(page);
        await sleep(1000);

        let products = [];

        // ── Méthode 1 : données interceptées via API ─────────
        if (capturedProducts.length > 0) {
          log(BRAND, `  ${capturedProducts.length} produits via API interceptée`);
          products = capturedProducts.map((p) => ({
            name:    p.name || p.title || '',
            imgSrc:  p.images?.[0]?.url || p.primaryImage?.url || null,
            href:    p.url || p.slug ? `${BASE}${p.slug}` : null,
            year:    p.modelYear || p.year || null,
            color:   p.color || null,
            specs:   buildSpecs(p),
          }));
        }

        // ── Méthode 2 : __NEXT_DATA__ ────────────────────────
        if (products.length === 0) {
          const nextData = await page.evaluate(() => {
            const el = document.getElementById('__NEXT_DATA__');
            if (!el) return null;
            try { return JSON.parse(el.textContent); } catch { return null; }
          });
          if (nextData) {
            const pageProducts = findProducts(nextData);
            log(BRAND, `  ${pageProducts.length} produits via __NEXT_DATA__`);
            products = pageProducts;
          }
        }

        // ── Méthode 3 : scraping HTML ────────────────────────
        if (products.length === 0) {
          products = await page.evaluate(() => {
            const cards = document.querySelectorAll(
              '[data-testid="product-card"], .product-card, [class*="ProductCard"]'
            );
            return Array.from(cards).map((card) => ({
              name:   card.querySelector('h2, h3, [class*="name"], [class*="title"]')?.textContent?.trim() || '',
              imgSrc: card.querySelector('img')?.src || null,
              href:   card.querySelector('a')?.href   || null,
              year:   null,
              color:  null,
            }));
          });
          log(BRAND, `  ${products.length} produits via HTML`);
        }

        for (const p of products) {
          if (!p.name) continue;
          const year = p.year || extractYear(p.name) || new Date().getFullYear();
          const r    = await saveBike({
            brand: BRAND, model: cleanModel(p.name), year,
            color:      p.color   || null,
            category,
            specs:      p.specs   || null,
            image_url:  p.imgSrc  || null,
            source_url: p.href    || null,
            source:     'specialized',
          });
          if (r === 'inserted') inserted++;
          else if (r === 'updated') updated++;
          else skipped++;
        }

        await sleep(2500);
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

/** Cherche récursivement des tableaux de produits dans un objet JSON */
function findProducts(obj, depth = 0) {
  if (depth > 6 || !obj || typeof obj !== 'object') return [];
  if (Array.isArray(obj)) {
    if (obj.length > 0 && obj[0]?.name && (obj[0]?.images || obj[0]?.slug)) return obj;
    for (const item of obj) {
      const r = findProducts(item, depth + 1);
      if (r.length > 0) return r;
    }
  } else {
    for (const key of Object.keys(obj)) {
      const r = findProducts(obj[key], depth + 1);
      if (r.length > 0) return r;
    }
  }
  return [];
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let h = 0;
      const t = setInterval(() => {
        window.scrollBy(0, 500);
        h += 500;
        if (h >= document.body.scrollHeight) { clearInterval(t); resolve(); }
      }, 200);
    });
  });
  await sleep(500);
}

function buildSpecs(p) {
  const s = {};
  if (p.frameMaterial) s.frame = p.frameMaterial;
  if (p.weight)        s.weight = p.weight;
  if (p.wheelSize)     s.wheel_size = p.wheelSize;
  return Object.keys(s).length ? s : null;
}

function extractYear(str) {
  const m = str?.match(/20(1[5-9]|2[0-9])/);
  return m ? parseInt(m[0]) : null;
}

function cleanModel(name) {
  return name.replace(/specialized\s*/i, '').replace(/\s+/g, ' ').trim();
}

module.exports = scrapeSpecialized;
