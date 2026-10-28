import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApp } from '../src/app.js';
import { Store } from '../src/store.js';
import { passwordHash, readSession, signSession } from '../src/auth.js';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWZ8AAAAASUVORK5CYII=';
async function fixture(t, env={DEMO_MODE:'true'}) {
 const directory=await mkdtemp(join(tmpdir(),'sm-test-')); t.after(()=>rm(directory,{recursive:true,force:true}));
 const store=new Store({directory}); const app=createApp({env,directory,store,dist:resolve('dist')});
 const request=(path,body,headers={})=> app(new Request(`http://localhost${path}`,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json',Origin:'http://localhost'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})}));
 return {store,app,request};
}
test('customer classifications are independent and persist through updates',async t=>{
 const {request}=await fixture(t);
 const created=await request('/api/create-consultant-client',{firstName:'Alex',lastName:'Sample',isClient:true,membershipStatus:'Inactive',paletteCode:'CWL'});
 assert.equal(created.status,201); const row=await created.json();
 await request('/api/update-consultant-client',{clientRecordId:row.id,membershipStatus:'Active'});
 let data=await (await request('/api/get-consultant-clients')).json(); assert.equal(data.clients[0].membershipStatus,'Active');assert.equal(data.clients[0].isClient,true);assert.equal(data.clients[0].paletteCode,'CWL');
 await request('/api/update-consultant-client',{clientRecordId:row.id,isClient:false,membershipStatus:'None'});
 data=await (await request('/api/get-consultant-clients')).json();assert.equal(data.clients[0].isClient,false);assert.equal(data.clients[0].membershipStatus,'None');
 assert.equal((await request('/api/update-consultant-client',{clientRecordId:row.id,membershipStatus:'VIP'})).status,400);
});
test('unauthenticated APIs cannot be unlocked by browser flags',async t=>{
 const {request}=await fixture(t,{AIRTABLE_TOKEN:'configured',ADMIN_PASSWORD_HASH:passwordHash('test-password'),SESSION_SECRET:'x'.repeat(40)});
 assert.equal((await request('/api/get-consultant-clients?isAdmin=true&consultantId=style-masters')).status,401);
 assert.equal((await request('/api/create-consultant-client',{firstName:'X',lastName:'Y',isAdmin:true})).status,401);
});
test('demo is disabled in production, on Vercel, and non-loopback hosts',async t=>{
 for(const env of [{DEMO_MODE:'true',NODE_ENV:'production'},{DEMO_MODE:'true',VERCEL:'1'}]) {
  const {request}=await fixture(t,env);assert.equal((await request('/api/get-consultant-clients')).status,503);
 }
 const {app}=await fixture(t); assert.equal((await app(new Request('https://example.com/api/get-consultant-clients'))).status,503);
});
test('sessions reject tampering, expiration, and another account',()=>{
 const secret='x'.repeat(40), token=signSession('gail@example.com',secret,1000);
 assert.ok(readSession(token,secret,'gail@example.com',2000));assert.equal(readSession(token+'x',secret,'gail@example.com',2000),null);
 assert.equal(readSession(token,secret,'other@example.com',2000),null);assert.equal(readSession(token,secret,'gail@example.com',30_000_000),null);
});
test('cross-origin writes and incorrect methods are rejected',async t=>{
 const {request}=await fixture(t);
 assert.equal((await request('/api/create-consultant-client',{firstName:'Alex',lastName:'Sample'},{Origin:'https://evil.example'})).status,403);
 assert.equal((await request('/api/delete-consultant-client')).status,405);
});
test('uploads, adjustments, photo selection and transforms stay with their customer',async t=>{
 const {request}=await fixture(t); const make=async name=>(await (await request('/api/create-consultant-client',{firstName:name,lastName:'Sample'})).json()).id;
 const id=await make('One'), other=await make('Two');
 for(const saveType of ['original','adjusted']) assert.equal((await request('/api/save-photo',{clientRecordId:id,imageBase64:png,saveType})).status,200);
 const photos=(await (await request(`/api/get-customer-photos?clientRecordId=${id}`)).json()).photos;assert.equal(photos.length,2);assert.equal(photos[1].originalPhotoUrl,photos[0].imageUrl);
 assert.equal((await request('/api/set-active-photo',{clientRecordId:other,photoId:photos[0].id})).status,404);
 await request('/api/set-active-photo',{clientRecordId:id,photoId:photos[0].id});
 await request('/api/save-photo-transform',{clientRecordId:id,photoTransform:{x:1,y:2,scale:1.2},analysisState:{analysisDepthDecision:'Medium'},lipMask:{shapes:[]}});
 const loaded=await (await request(`/api/get-photo?clientRecordId=${id}`)).json();assert.equal(loaded.activePhotoUrl,photos[0].imageUrl);assert.equal(loaded.photoTransform.analysisDepthDecision,'Medium');
});
test('saved studio images and report drafts persist independently',async t=>{
 const {request}=await fixture(t);const row=await (await request('/api/create-consultant-client',{firstName:'Report',lastName:'Sample'})).json();
 await request('/api/save-draped-image',{clientRecordId:row.id,imageBase64:png,paletteCode:'CWM',drapeColorName:'Coral'});
 assert.equal((await (await request(`/api/get-saved-draped-images?clientRecordId=${row.id}`)).json()).images.length,1);
 await request('/api/save-color-analysis-report',{clientRecordId:row.id,draft:{notes:'My report'}});
 assert.equal((await (await request(`/api/get-color-analysis-report?clientRecordId=${row.id}`)).json()).report.draft.notes,'My report');
});
test('deleting a customer archives data and excludes them from active list',async t=>{
 const {request,store}=await fixture(t);const row=await (await request('/api/create-consultant-client',{firstName:'Archive',lastName:'Sample'})).json();
 await request('/api/delete-consultant-client',{clientRecordId:row.id});assert.equal((await store.get('Customers',row.id)).archived,true);
 assert.equal((await (await request('/api/get-consultant-clients')).json()).clients.length,0);
});
test('destination store cannot be pointed at the original YCS base',()=>{assert.throws(()=>new Store({baseId:'appKUu4QwquxPfjet'}),/only writes/);});
test('all extracted screens build without the original backend or logo',async t=>{
 const {request}=await fixture(t);
 for(const path of ['/clients','/pages/photo-prep','/pages/color-analysis-tool','/pages/signature-color-analysis']) {
  const response=await request(path);assert.equal(response.status,200);const html=await response.text();assert.ok(!html.includes('ycs-palette-app.vercel.app'));assert.ok(!html.includes('YourColorStyle_Logo'));assert.ok(!html.includes('{%'));assert.ok(!html.includes('cdn.shopify.com'));assert.ok(!html.includes('https://yourcolorstyle.com/products/'));
 }
});
test('owner login issues a cookie that authorizes data access and logout expires it',async t=>{
 const email='gailscottstyle@gmail.com',password='sample-only-password-123';
 const {app}=await fixture(t,{ADMIN_EMAIL:email,ADMIN_PASSWORD_HASH:passwordHash(password),SESSION_SECRET:'s'.repeat(40),AIRTABLE_TOKEN:'configured'});
 const login=await app(new Request('http://localhost/login',{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email,password})}));
 assert.equal(login.status,303);const cookie=login.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);
 const response=await app(new Request('http://localhost/api/get-consultant-clients',{headers:{Cookie:cookie.split(';')[0]}}));assert.equal(response.status,200);
 const logout=await app(new Request('http://localhost/logout',{method:'POST',headers:{Origin:'http://localhost',Cookie:cookie.split(';')[0]}}));assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
});
test('dashboard contains exactly the two requested cards and palette routes render',async t=>{
 const {request}=await fixture(t);const html=await (await request('/')).text();
 assert.equal((html.match(/<article /g)||[]).length,2);assert.match(html,/Clients &amp; Members/);assert.match(html,/Color Palettes/);
 for(const path of ['/palettes','/pages/ycs-color-palettes','/pages/my-custom-palettes','/pages/member-palette','/pages/member-color']){
  const res=await request(path);assert.equal(res.status,200);const text=await res.text();assert.ok(!text.includes('{%'));assert.ok(!text.includes('ycs-palette-app.vercel.app'));assert.ok(!text.includes('cdn.shopify.com'));assert.ok(!text.includes('YourColorStyle_Logo'));
 }
});
test('custom palette CSV, edits, ordering, assignments, archival and favorites persist',async t=>{
 const {request,store}=await fixture(t);
 const mutate=async body=>{const res=await request('/api/custom-palettes',body);assert.equal(res.status,200);return res.json();};
 const red={name:'Sample Red',hexCode:'#AA1122',category:'Reds'},blue={name:'Sample Blue',hexCode:'#1122AA',category:'Blues'};
 let {palette}=await mutate({action:'importPaletteCsv',name:'Test Palette',colors:[red,blue,red]});assert.equal(palette.colorCount,2);
 const paletteId=palette.id,redId=palette.colors[0].color.id,blueId=palette.colors[1].color.id;
 const appended=await mutate({action:'appendPaletteCsv',paletteId,colors:[red,{name:'Sample Green',hexCode:'#11AA22'}]});assert.equal(appended.addedCount,1);assert.equal(appended.skippedCount,1);
 await mutate({action:'updateColor',colorId:redId,name:'Updated Red',hexCode:'#BB1122',category:'Reds'});
 palette=(await (await request('/api/custom-palettes?action=palette&paletteId='+paletteId)).json()).palette;assert.equal(palette.colors[0].color.name,'Updated Red');
 const ids=palette.colors.map(j=>j.color.id).reverse();await mutate({action:'reorderPaletteColors',paletteId,colorIds:ids});
 await mutate({action:'removeColorFromPalette',paletteId,colorId:blueId});
 palette=(await mutate({action:'renamePalette',paletteId,name:'Renamed'})).palette;assert.equal(palette.name,'Renamed');assert.equal(palette.colorCount,2);
 const other=(await mutate({action:'createPalette',name:'Other'})).palette;await mutate({action:'setColorPalettes',colorId:redId,paletteIds:[other.id]});
 palette=(await (await request('/api/custom-palettes?action=palette&paletteId='+other.id)).json()).palette;assert.equal(palette.colors[0].color.hexCode,'#BB1122');
 const favoritePath='/apps/palette-data?action=toggleFavorite';await request(favoritePath,{paletteCode:'CUSTOM_'+other.id,hex:'#BB1122'});
 assert.deepEqual((await (await request('/apps/palette-data?action=getFavorites&palette=CUSTOM_'+other.id)).json()).favorites,['#BB1122']);
 assert.deepEqual((await (await request('/apps/palette-data?action=getFavorites&palette=CWL')).json()).favorites,[]);
 assert.equal((await request('/api/custom-palettes',{action:'appendPaletteCsv',paletteId,colors:[red,{name:'bad',hexCode:'oops'}]})).status,400);
 await mutate({action:'deleteColor',colorId:redId});await mutate({action:'deletePalette',paletteId:other.id});
 const listed=await (await request('/api/custom-palettes')).json();assert.ok(!listed.colors.some(c=>c.id===redId));assert.ok(!listed.palettes.some(p=>p.id===other.id));assert.equal((await store.get('CustomPalettes',other.id)).archived,true);
});
