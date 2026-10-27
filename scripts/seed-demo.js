import { Store } from '../src/store.js';
import { customerInput } from '../src/customers.js';
if (process.env.VERCEL || process.env.NODE_ENV === 'production') throw new Error('Sample data is local-only.');
const store = new Store();
for (const [id, firstName, lastName, membershipStatus, isClient, paletteCode, paletteName] of [
 ['demo-avery','Avery','Morgan','Active',true,'CWM','Clear Warm Medium'],
 ['demo-jordan','Jordan','Taylor','Inactive',false,'SCL','Soft Cool Light'],
 ['demo-casey','Casey','Reed','None',true,'DO','Deep Olive'],
 ['demo-robin','Robin','Brooks','Active',false,'CCD','Clear Cool Deep']
]) {
 if (await store.get('Customers',id)) continue;
 const row = customerInput({firstName,lastName,membershipStatus,isClient,paletteCode,paletteName,email:`${firstName.toLowerCase()}@example.com`,notes:'Sample customer for local preview. No real member data.'});
 row.id=id; row.clientRecordId=id; await store.put('Customers',row);
}
// Only for exercising the studio before licensed/reference colors are migrated.
const colors=[['Coral','#d97465','warm'],['Rose','#b35f80','cool'],['Teal','#327878','cool'],['Olive','#7b8051','warm'],['Cream','#e5d6b6','neutral'],['Navy','#263b57','neutral']];
for (const palette of ['CCL','CCM','CCD','CWL','CWM','CWD','SCL','SCM','SCD','SWL','SWM','SWD','LO','MO','DO']) {
 for (const [i,[name,hex,category]] of colors.entries()) {
  await store.put('ReferenceData',{id:`demo-${palette}-${i}`,table:'Colors',fields:{ColorName:`Sample ${name}`,Hex:hex,PaletteCodes_Final_Manual:palette,CategoryNames:category,SortOrder:i}});
  if(i<2) await store.put('ReferenceData',{id:`demo-lip-${palette}-${i}`,table:'PaletteLipColors',fields:{ColorName:`Sample ${name}`,Hex:hex,PaletteCode:palette,SortOrder:i}});
 }
}
console.log('Local sample directory ready; no external services were accessed.');
