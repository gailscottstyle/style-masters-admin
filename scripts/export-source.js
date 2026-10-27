import { mkdir, writeFile } from 'node:fs/promises';
import { SOURCE_BASE, MEMBER_TABLES, REFERENCE_TABLES, prepareMigration } from '../src/migration.js';
const token=process.env.SOURCE_AIRTABLE_TOKEN;
if(!token) throw new Error('Set SOURCE_AIRTABLE_TOKEN securely in the environment.');
const snapshot={baseId:SOURCE_BASE,exportedAt:new Date().toISOString(),tables:{}};
for(const table of [...MEMBER_TABLES,...REFERENCE_TABLES]) {
 const rows=[];let offset;
 do {
  const response=await fetch(`https://api.airtable.com/v0/${SOURCE_BASE}/${encodeURIComponent(table)}${offset?'?offset='+encodeURIComponent(offset):''}`,{headers:{Authorization:`Bearer ${token}`}});
  const data=await response.json();if(!response.ok) throw Error(`Read failed for ${table}: ${response.status}. No partial migration will be applied.`);
  rows.push(...data.records);offset=data.offset;await new Promise(r=>setTimeout(r,220));
 }while(offset);
 snapshot.tables[table]=rows;
}
const plan=prepareMigration(snapshot);
await mkdir('migration-private',{recursive:true,mode:0o700});
await writeFile('migration-private/source-snapshot.json',JSON.stringify(snapshot,null,2),{mode:0o600});
await writeFile('migration-private/migration-plan.json',JSON.stringify(plan,null,2),{mode:0o600});
console.log(JSON.stringify({counts:plan.counts,warnings:plan.warnings},null,2));
