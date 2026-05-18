#!/usr/bin/env node

const fetch = require('node-fetch');
const cheerio = require('cheerio');

const baseUrl = (process.env.STATIC_SMOKE_BASE_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');

function absoluteUrl(path) {
  return new URL(path, baseUrl).toString();
}

function isExpectedMime(assetPath, contentType) {
  if (assetPath.endsWith('.js')) return contentType.includes('javascript');
  if (assetPath.endsWith('.css')) return contentType.includes('text/css');
  if (assetPath.endsWith('.svg')) return contentType.includes('image/svg+xml');
  if (assetPath.endsWith('.png')) return contentType.includes('image/png');
  if (assetPath.endsWith('.webp')) return contentType.includes('image/webp');
  return true;
}

async function fetchRequired(path) {
  const response = await fetch(absoluteUrl(path), {
    headers: {
      Origin: baseUrl
    }
  });

  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }

  if (!isExpectedMime(path, contentType)) {
    throw new Error(`${path} returned unexpected content-type ${contentType}`);
  }

  return { path, contentType };
}

async function main() {
  const indexResponse = await fetchRequired('/');
  if (!indexResponse.contentType.includes('text/html')) {
    throw new Error(`/ returned unexpected content-type ${indexResponse.contentType}`);
  }

  const htmlResponse = await fetch(absoluteUrl('/'), { headers: { Origin: baseUrl } });
  const html = await htmlResponse.text();
  const $ = cheerio.load(html);
  const assets = new Set(['/app-shell.css', '/app-bootstrap.js']);

  $('script[src], link[rel="stylesheet"][href]').each((_, element) => {
    const src = $(element).attr('src') || $(element).attr('href');
    if (src && src.startsWith('/')) {
      assets.add(src);
    }
  });

  const checked = [];
  for (const asset of assets) {
    checked.push(await fetchRequired(asset));
  }

  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    checked: checked.map(item => item.path)
  }, null, 2));
}

main().catch((error) => {
  console.error(`Static asset smoke failed: ${error.message}`);
  process.exit(1);
});
