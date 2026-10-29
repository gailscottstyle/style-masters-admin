// This tool requires an explicit --apply; it never writes to the source base.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Store, DESTINATION_BASE } from '../src/store.js';
const plan=JSON.parse(await readFile('migration-private/migration-plan.json','utf8'));
const apply=process.argv.includes('--apply');
const limitArg=process.argv.find(value=>value.startsWith('--limit='));
if(limitArg){
 const limit=Number(limitArg.split('=')[1]);if(!Number.isSafeInteger(limit)||limit<1)throw Error('Invalid pilot limit.');
 plan.tables.Customers=plan.tables.Customers.slice(0,limit);const ids=new Set(plan.tables.Customers.map(row=>row.id));
 for(const table of ['Photos','SavedImages','Reports','SourceArchive'])plan.tables[table]=plan.tables[table].filter(row=>ids.has(row.clientRecordId));
 plan.counts=Object.fromEntries(Object.entries(plan.tables).map(([table,rows])=>[table,rows.length]));
}
const allowedHost=host=>host==='res.cloudinary.com'||host==='cdn.shopify.com'||host.endsWith('.airtableusercontent.com');
function imageUrls(value, urls=new Set()) {
 if(typeof value==='string') {
  for(const match of value.matchAll(/https:\/\/[^\s"'<>\\]+/g)) {try {const url=new URL(match[0]);if(allowedHost(url.hostname))urls.add(url.href);}catch{}}
 } else if(value&&typeof value==='object') for(const item of Object.values(value))imageUrls(item,urls);
 return urls;
}
const urls=imageUrls(plan.tables);
console.log(JSON.stringify({destination:DESTINATION_BASE,counts:plan.counts,mediaFiles:urls.size,mode:apply?'APPLY':'PREVIEW'},null,2));
if(!apply) process.exit(0);
const env=process.env;
for(const key of ['AIRTABLE_TOKEN','CLOUDINARY_CLOUD_NAME','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET'])if(!env[key])throw Error(`Missing ${key}; configure it securely before importing.`);
if(plan.tables.Customers.some(row=>row.id.startsWith('demo-')))throw Error('Sample data cannot be imported.');
const store=new Store({token:env.AIRTABLE_TOKEN,baseId:DESTINATION_BASE});
let manifest;
try {manifest=JSON.parse(await readFile('migration-private/import-manifest.json','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;manifest={destination:DESTINATION_BASE,cloud:env.CLOUDINARY_CLOUD_NAME,urls:{},records:{}};}
if(manifest.destination!==DESTINATION_BASE||manifest.cloud!==env.CLOUDINARY_CLOUD_NAME)throw Error('Migration destination changed; review the manifest first.');
const persist=async()=>{await writeFile('migration-private/import-manifest.tmp',JSON.stringify(manifest,null,2),{mode:0o600});await rename('migration-private/import-manifest.tmp','migration-private/import-manifest.json');};
// Fetch all tables before copying media to detect missing schema and conflicting rows early.
const existing={};for(const table of Object.keys(plan.tables)){existing[table]=await store.list(table);await new Promise(r=>setTimeout(r,230));}
function hash(value){return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
for(const [table,rows] of Object.entries(plan.tables))for(const row of rows) {
 const found=existing[table].find(r=>r.id===row.id);if(!found)continue;
 const {_recordId,...data}=found;
 if(!manifest.records[`${table}:${row.id}`]||manifest.records[`${table}:${row.id}`].hash!==hash(data))throw Error(`Existing or edited destination record ${table}:${row.id}; resolve before rerunning.`);
}
for(const url of urls) {
 if(manifest.urls[url])continue;
 const response=await fetch(url,{redirect:'error'});if(!response.ok||!response.headers.get('content-type')?.startsWith('image/'))throw Error(`A source image is unavailable (${response.status}). Refresh the export and retry.`);
 const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>25*1024*1024)throw Error('Source image exceeds the migration size limit.');
 const publicId=`style-masters/migrated/${hash(url).slice(0,40)}`,timestamp=Math.floor(Date.now()/1000);
 const signature=createHash('sha1').update(`asset_folder=style-masters&overwrite=false&public_id=${publicId}&timestamp=${timestamp}${env.CLOUDINARY_API_SECRET}`).digest('hex');
 const body=new FormData();body.append('file',new Blob([bytes],{type:response.headers.get('content-type')}),'image');
 for(const [key,value]of Object.entries({asset_folder:'style-masters',overwrite:'false',public_id:publicId,timestamp,api_key:env.CLOUDINARY_API_KEY,signature}))body.append(key,value);
 const uploaded=await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME)}/image/upload`,{method:'POST',body});
 const data=await uploaded.json();if(!uploaded.ok||!data.secure_url)throw Error('Destination Cloudinary upload failed.');
 const verify=await fetch(data.secure_url,{method:'HEAD'});if(!verify.ok)throw Error('Copied image could not be verified.');
 manifest.urls[url]={url:data.secure_url,publicId:data.public_id,sourceSha256:createHash('sha256').update(bytes).digest('hex')};await persist();
}
function replaceUrls(value) {
 if(typeof value==='string'){for(const [from,to]of Object.entries(manifest.urls))value=value.split(from).join(to.url);return value;}
 if(Array.isArray(value))return value.map(replaceUrls);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,replaceUrls(v)]));
 return value;
}
for(const [table,rows]of Object.entries(plan.tables))for(const original of rows) {
 const row=replaceUrls(original);if(original.imageUrl&&manifest.urls[original.imageUrl])row.cloudinaryPublicId=manifest.urls[original.imageUrl].publicId;const key=`${table}:${row.id}`;
 if(JSON.stringify(row).length>95000)throw Error(`Record ${key} is too large for Airtable Data; split the archived payload before importing.`);
 const found=existing[table].find(r=>r.id===row.id);
 if(found&&manifest.records[key]?.hash===hash(row))continue;
 await store.put(table,{...row,...(found?{_recordId:found._recordId}:{})});
 manifest.records[key]={hash:hash(row)};await persist();await new Promise(r=>setTimeout(r,450));
}
const verified={};for(const [table,rows]of Object.entries(plan.tables)){
 const imported=await store.list(table);for(const row of rows){const found=imported.find(r=>r.id===row.id);if(!found)throw Error(`Missing imported record ${table}:${row.id}`);const {_recordId,...data}=found;const expected=replaceUrls(row);if(row.imageUrl&&manifest.urls[row.imageUrl])expected.cloudinaryPublicId=manifest.urls[row.imageUrl].publicId;if(hash(data)!==hash(expected))throw Error(`Imported record mismatch ${table}:${row.id}`);}
 verified[table]=rows.length;await new Promise(r=>setTimeout(r,230));
}
manifest.verifiedAt=new Date().toISOString();await persist();console.log(JSON.stringify({verified,mediaFiles:Object.keys(manifest.urls).length},null,2));
