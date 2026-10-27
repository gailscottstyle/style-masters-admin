import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const files = [...(await readdir('templates')).map(n => `templates/${n}`), ...(await readdir('public/assets')).filter(n => n.endsWith('.js')).map(n => `public/assets/${n}`)];
const contents = new Map(await Promise.all(files.map(async f => [f, await readFile(f,'utf8')])));
const urls = new Set([...contents.values()].flatMap(text => [...text.matchAll(/https:\/\/cdn\.shopify\.com\/[^\s'"<>`]+/g)].map(m => m[0])));
const manifest=[];
for(const url of urls) {
 const name=`reference-${createHash('sha256').update(url).digest('hex').slice(0,12)}.png`;
 const response=await fetch(url); if(!response.ok) throw Error(`Could not copy ${new URL(url).pathname}`);
 if(!response.headers.get('content-type')?.startsWith('image/')) throw Error('Not an image');
 await writeFile(`public/assets/${name}`,Buffer.from(await response.arrayBuffer()));
 for(const [file,text] of contents) contents.set(file,text.split(url).join(`/assets/${name}`));
 manifest.push({source:url,local:`/assets/${name}`});
}
for(const [file,text] of contents) await writeFile(file,text);
await writeFile('docs/asset-provenance.json',JSON.stringify(manifest,null,2));
console.log(`Copied ${manifest.length} static studio/reference graphics.`);
