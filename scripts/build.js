import { Liquid } from 'liquidjs';
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
const engine = new Liquid();
engine.registerFilter('asset_url', value => `/assets/${value}`);
engine.registerFilter('script_tag', value => `<script defer src="${value}"></script>`);
engine.registerFilter('json', JSON.stringify);
await mkdir('dist/pages', { recursive: true });
await cp('public/assets', 'dist/assets', { recursive: true });
// Render only the professional workflow; these are presentation flags, never authorization.
// All data and pages are independently guarded by src/app.js sessions.
const context = { customer: { id: 'style-masters', tags: ['TRADE'], first_name: 'Gail', email: '' }, routes: { account_url: '/clients', account_login_url: '/login' }, content_for_header: '"pageurl":"/pages/photo-prep?mode=trade&workflow=color-analysis"' };
for (const name of ['my-clients', 'photo-prep', 'color-analysis-tool', 'signature-color-analysis']) {
  const template = await readFile(`templates/${name}.liquid`, 'utf8');
  const content = await engine.parseAndRender(template, context);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Style Masters Admin Dashboard</title><link rel="stylesheet" href="/assets/standalone.css"><script src="/assets/session.js" defer></script></head><body><header class="sm-header"><a class="sm-brand" href="/clients">Style Masters</a><form action="/logout" method="post"><button>Sign out</button></form></header><div class="sm-demo" data-demo-banner hidden>Local preview · Sample customers only · Changes are saved on this computer</div>${content}<script defer src="/assets/photo-library.js"></script></body></html>`;
  if (html.includes('https://ycs-palette-app.vercel.app')) throw new Error('Original backend reference survived extraction');
  await writeFile(`dist/pages/${name}.html`, html);
}
console.log('Built Clients & Members, Photo Prep, Structured Analysis, and Lip & Draping Studio.');
