/**
 * Canyon — API JSON interne
 * Canyon expose une API REST non-documentée que leur frontend appelle.
 * On récupère le catalogue par catégorie avec les paramètres de pagination.
 *
 * NOTE : Ces endpoints sont internes et peuvent changer.
 * Inspecter https://www.canyon.com/ > DevTools > Network > XHR si besoin de mettre à jour.
 */
const { http, sleep } = require('../utils/http');
const { saveBike }    = require('../utils/save');
const { log, stats }  = require('../utils/logger');

const BRAND = 'Canyon';
const BASE  = 'https://www.canyon.com';

// Catégories Canyon et leur slug dans l'URL
const CATEGORIES = [
  { slug: 'road-bikes',        category: 'road'    },
  { slug: 'mountain-bikes',    category: 'mtb'     },
  { slug: 'gravel-bikes',      category: 'gravel'  },
  { slug: 'triathlon-tt-bikes', category: 'tt'     },
  { slug: 'e-bikes',           category: 'ebike'   },
  { slug: 'urban-bikes',       category: 'urban'   },
];

const YEARS = [2022, 2023, 2024, 2025];
const LOCALE = 'en-gb'; // locale qui retourne des prix EUR

async function scrapeCanyon() {
  let inserted = 0, updated = 0, skipped = 0, errors = 0;

  for (const { slug, category } of CATEGORIES) {
    log(BRAND, `→ ${slug}`);
    try {
      // L'API Canyon retourne les produits d'une catégorie sous forme JSON
      // Endpoint découvert en analysant le trafic réseau du site
      const { data } = await http.get(
        `${BASE}/api/products/${LOCALE}/${slug}`,
        {
          params: { page: 1, pageSize: 100 },
          headers: {
            'Accept': 'application/json',
            'Referer': `${BASE}/en-gb/${slug}/`,
          },
        }
      );

      // Structure typique : data.products[] ou data.items[]
      const products = data.products || data.items || data.result?.products || [];

      for (const product of products) {
        // Selon la version de l'API, les champs peuvent varier
        const name       = product.name || product.title || '';
        const year       = extractYear(name) || product.modelYear || new Date().getFullYear();
        const imageUrl   = product.images?.[0]?.url || product.primaryImage || null;
        const sourceUrl  = product.url ? `${BASE}${product.url}` : null;

        // Canyon liste souvent les coloris comme variantes
        const variants = product.variants || product.colorVariants || [{ color: null }];

        for (const variant of variants) {
          const color    = variant.color?.name || variant.colorName || null;
          const colorCode = variant.color?.hex || variant.colorHex || null;
          const variantImg = variant.images?.[0]?.url || imageUrl;

          const specs = buildSpecs(product);

          const result = await saveBike({
            brand:     BRAND,
            model:     cleanModel(name),
            year,
            color,
            color_code: colorCode,
            category,
            specs,
            image_url:  variantImg,
            source_url: sourceUrl,
            source:     'canyon_api',
          });
          if (result === 'inserted') inserted++;
          else if (result === 'updated') updated++;
          else skipped++;
        }
      }

      log(BRAND, `  ${products.length} produits trouvés dans ${slug}`);
      await sleep(1000);
    } catch (err) {
      // Fallback : essayer de scraper la page HTML si l'API échoue
      log(BRAND, `✗ API ${slug}: ${err.message} — tentative scraping HTML`);
      const r = await scrapeCanonCategoryHtml(slug, category);
      inserted += r.inserted; updated += r.updated; errors += r.errors;
    }
  }

  stats(BRAND, inserted, updated, skipped, errors);
  return { inserted, updated, skipped, errors };
}

/** Fallback HTML scraping si l'API interne ne répond pas */
async function scrapeCanonCategoryHtml(slug, category) {
  const cheerio = require('cheerio');
  let inserted = 0, updated = 0, errors = 0;
  try {
    const { data: html } = await http.get(`${BASE}/en-gb/${slug}/`, {
      headers: { Accept: 'text/html' },
    });
    const $     = cheerio.load(html);
    // Canyon utilise des attributs data- sur les cards produits
    const cards = $('[data-product-name], .productCard, .ProductCard');

    cards.each((_, el) => {
      const name     = $(el).attr('data-product-name') || $(el).find('.productCard__title, h3').first().text().trim();
      const imgEl    = $(el).find('img').first();
      const imageUrl = imgEl.attr('src') || imgEl.attr('data-src') || null;
      const href     = $(el).find('a').first().attr('href') || null;
      const year     = extractYear(name) || new Date().getFullYear();

      if (name) {
        saveBike({
          brand: 'Canyon', model: cleanModel(name), year, category,
          image_url: imageUrl, source_url: href ? `${BASE}${href}` : null, source: 'canyon_html',
        }).then((r) => { if (r === 'inserted') inserted++; else if (r === 'updated') updated++; });
      }
    });
    await sleep(500);
  } catch (err) {
    log('Canyon', `✗ HTML fallback ${slug}: ${err.message}`);
    errors++;
  }
  return { inserted, updated, errors };
}

function extractYear(str) {
  const m = str?.match(/20(1[5-9]|2[0-9])/);
  return m ? parseInt(m[0]) : null;
}

function cleanModel(name) {
  return name.replace(/canyon\s*/i, '').replace(/\s+/g, ' ').trim();
}

function buildSpecs(product) {
  const s = {};
  if (product.frameMaterial) s.frame = product.frameMaterial;
  if (product.weight)        s.weight = product.weight;
  if (product.groupset)      s.groupset = product.groupset;
  if (product.wheelSize)     s.wheel_size = product.wheelSize;
  if (product.price?.amount) s.price = `${product.price.amount} ${product.price.currency || 'EUR'}`;
  return Object.keys(s).length ? s : null;
}

module.exports = scrapeCanyon;
