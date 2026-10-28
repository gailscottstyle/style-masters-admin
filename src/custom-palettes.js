import { randomUUID } from 'node:crypto';
const fail = (message, status=400) => { throw Object.assign(new Error(message), {status}); };
const nameOf = value => { const name=String(value || '').trim(); if (!name || name.length>160) fail('Enter a name of 1–160 characters.'); return name; };
const colorInput = body => {
 const hexCode=String(body.hexCode || '').toUpperCase();
 if (!/^#[\dA-F]{6}$/.test(hexCode)) fail('Enter a six-digit hex color.');
 return {name:nameOf(body.name),hexCode,category:String(body.category || 'Custom').trim().slice(0,100)};
};
export async function customPalettes(store, method, query, body) {
 if (!['GET','POST'].includes(method)) fail('Method not allowed.',405);
 const rows=(await store.list('CustomPalettes')).filter(r=>!r.archived);
 const colors=rows.filter(r=>r.kind==='color'), palettes=rows.filter(r=>r.kind==='palette');
 const present = p => ({...p,colors:(p.colors || []).map((join,index)=>({...join,displayOrder:index,color:colors.find(c=>c.id===join.color.id)})).filter(j=>j.color),colorCount:(p.colors || []).filter(j=>colors.some(c=>c.id===j.color.id)).length});
 const getPalette = id => palettes.find(p=>p.id===id) || fail('Palette not found.',404);
 const getColor = id => colors.find(c=>c.id===id) || fail('Color not found.',404);
 const save = async row => { await store.put('CustomPalettes',row);return row; };
 const savePalette = async p => {p.updatedAt=new Date().toISOString();await save(p);return {success:true,palette:present(p)};};
 const freshPalette = name => { const id=randomUUID();return {id,paletteId:id,kind:'palette',name:nameOf(name),colors:[]}; };
 const add = (p,ids) => {const joins=new Map((p.colors || []).map(j=>[j.color.id,j]));for(const id of ids)joins.set(id,{color:getColor(id)});p.colors=[...joins.values()];};
 if(method==='GET') return query.get('action')==='palette' ? {palette:present(getPalette(query.get('paletteId')))} : {colors,palettes:palettes.map(present)};
 switch(body.action) {
  case 'createColor': {const id=randomUUID(),color={id,colorId:id,kind:'color',...colorInput(body)};await save(color);return {success:true,color};}
  case 'updateColor': {const color=getColor(body.colorId);Object.assign(color,colorInput(body));await save(color);return {success:true,color};}
  case 'deleteColor': {const color=getColor(body.colorId);await save({...color,archived:true});return {success:true};}
  case 'createPalette': return savePalette(freshPalette(body.name));
  case 'renamePalette': case 'updatePalette': {const p=getPalette(body.paletteId);p.name=nameOf(body.name);return savePalette(p);}
  case 'deletePalette': {await save({...getPalette(body.paletteId),archived:true});return {success:true};}
  case 'addColorsToPalette': {const p=getPalette(body.paletteId);if(!Array.isArray(body.colorIds))fail('Choose colors.');body.colorIds.forEach(getColor);add(p,body.colorIds);return savePalette(p);}
  case 'removeColorFromPalette': {const p=getPalette(body.paletteId);p.colors=p.colors.filter(j=>j.color.id!==body.colorId);return savePalette(p);}
  case 'reorderPaletteColors': {const p=getPalette(body.paletteId),ids=body.colorIds;if(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.length!==p.colors.length||p.colors.some(j=>!ids.includes(j.color.id)))fail('Choose every palette color exactly once.');p.colors=ids.map(id=>p.colors.find(j=>j.color.id===id));return savePalette(p);}
  case 'setColorPalettes': {getColor(body.colorId);if(!Array.isArray(body.paletteIds))fail('Choose palettes.');body.paletteIds.forEach(getPalette);for(const p of palettes){p.colors=p.colors.filter(j=>j.color.id!==body.colorId);if(body.paletteIds.includes(p.id))add(p,[body.colorId]);await save(p);}return {success:true};}
  case 'importPaletteCsv': case 'appendPaletteCsv': {
   if(!Array.isArray(body.colors)||!body.colors.length||body.colors.length>1000)fail('Import between 1 and 1,000 colors.');
   const inputs=body.colors.map(colorInput); // Validate every row before writing anything.
   const p=body.action==='appendPaletteCsv'?getPalette(body.paletteId):freshPalette(body.name);
   let addedCount=0,skippedCount=0;
   for(const input of inputs){let c=colors.find(c=>c.name===input.name&&c.hexCode===input.hexCode&&c.category===input.category);
    if(!c){const id=randomUUID();c={id,colorId:id,kind:'color',...input};await save(c);colors.push(c);}
    if(p.colors.some(j=>j.color.id===c.id)){skippedCount++;continue;} add(p,[c.id]);addedCount++;
   }
   return {...await savePalette(p),addedCount,skippedCount};
  }
  default: fail('Unsupported palette operation.');
 }
}
