// Default is a schema preview; --apply explicitly creates missing destination tables.
import { DESTINATION_BASE } from '../src/store.js';
const tableNames=['Customers','Photos','SavedImages','Reports','ReferenceData','SourceArchive','CustomPalettes'];
const schemas=tableNames.map(name=>({name,fields:[{name:'Key',type:'singleLineText'},{name:'Data',type:'multilineText'},...(name==='Customers'?[{name:'Name',type:'singleLineText'},{name:'Email',type:'email'},{name:'MembershipStatus',type:'singleSelect',options:{choices:[{name:'None'},{name:'Active'},{name:'Inactive'}]}},{name:'IsClient',type:'checkbox',options:{icon:'check',color:'greenBright'}},{name:'ColorType',type:'singleLineText'}]:[])]}));
if(!process.argv.includes('--apply')) {console.log(JSON.stringify({baseId:DESTINATION_BASE,tables:schemas},null,2));process.exit(0);}
const token=process.env.AIRTABLE_TOKEN;if(!token) throw Error('Configure the destination token securely first.');
const endpoint=`https://api.airtable.com/v0/meta/bases/${DESTINATION_BASE}/tables`;
const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
const existing=await fetch(endpoint,{headers});if(!existing.ok)throw Error(`Cannot inspect destination schema: ${existing.status}`);
const {tables}=await existing.json();
for(const schema of schemas) {
 const found=tables.find(t=>t.name===schema.name);
 if(found){for(const field of schema.fields)if(!found.fields.some(f=>f.name===field.name&&f.type===field.type))throw Error(`Existing ${schema.name} has an incompatible schema. Review it before importing.`);continue;}
 const response=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify(schema)});
 if(!response.ok)throw Error(`Could not create ${schema.name}: ${response.status}`);
 console.log(`Created ${schema.name}`);await new Promise(r=>setTimeout(r,220));
}
