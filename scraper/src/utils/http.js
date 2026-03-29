const axios = require('axios');

const http = axios.create({
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
  },
});

/** Pause entre les requêtes pour ne pas surcharger les serveurs */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = { http, sleep };
