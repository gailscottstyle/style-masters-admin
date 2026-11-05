import {createHash,randomUUID} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
const esc=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
export const monthLabel=month=>new Date(month+'-02T12:00:00Z').toLocaleDateString('en-US',{month:'long',year:'numeric',timeZone:'UTC'});
export function videoUrl(value){if(!value)return '';try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password)throw Error();return u.href;}catch{fail('Enter a complete https:// link to the video recording.');}}
export function pdfUploadSettings(env){
 const {CLOUDINARY_CLOUD_NAME:cloud,CLOUDINARY_API_KEY:key,CLOUDINARY_API_SECRET:secret}=env;
 if(!cloud||!key||!secret)fail('PDF uploads are not configured.',503);
 const params={allowed_formats:'pdf',asset_folder:'style-masters',overwrite:'false',public_id:`style-masters/monthly/${randomUUID()}.pdf`,timestamp:Math.floor(Date.now()/1000)};
 const signature=createHash('sha1').update(Object.keys(params).sort().map(k=>`${k}=${params[k]}`).join('&')+secret).digest('hex');
 return {endpoint:`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/raw/upload`,fields:{...params,api_key:key,signature},maxBytes:10*1024*1024};
}
function validPdf(url,env,demo){
 if(demo&&/^\/uploads\/[\w-]+\.pdf$/.test(url))return true;
 try{const u=new URL(url);return u.protocol==='https:'&&u.hostname==='res.cloudinary.com'&&!u.search&&!u.hash&&u.pathname.startsWith(`/${env.CLOUDINARY_CLOUD_NAME}/raw/upload/`)&&/\/style-masters\/monthly\/[\w-]+\.pdf$/.test(u.pathname);}catch{return false;}
}
export function createMonthlyContent({store,env,directory}){
 let cached=null,until=0;
 const list=async()=>{if(!cached||Date.now()>until){cached=await store.list('MonthlyContent');until=Date.now()+60000;}return cached;};
 const invalidate=()=>{cached=null;until=0;};
 async function admin(method,body,demo){
  if(method==='GET')return {months:await store.list('MonthlyContent')};
  if(method!=='POST')fail('Method not allowed.',405);
  if(body.action==='upload-settings')return demo?{demo:true,maxBytes:3*1024*1024}:pdfUploadSettings(env);
  if(body.action==='demo-upload'&&demo){
   const data=String(body.data||'');if(!/^data:application\/pdf;base64,[A-Za-z0-9+/=]+$/.test(data))fail('Choose a PDF file.');
   const bytes=Buffer.from(data.split(',')[1],'base64');if(bytes.length>3*1024*1024||bytes.subarray(0,5).toString()!=='%PDF-')fail('Choose a PDF smaller than 3 MB for local preview.');
   const name=`${randomUUID()}.pdf`;await mkdir(join(directory,'uploads'),{recursive:true});await writeFile(join(directory,'uploads',name),bytes,{mode:0o600});return {pdfUrl:'/uploads/'+name};
  }
  if(body.action!=='save')fail('Unknown action.');
  const rows=await store.list('MonthlyContent'),existing=body.id&&rows.find(r=>r.id===body.id);
  if(body.id&&!existing)fail('Month not found.',404);
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(body.month||''))fail('Choose a valid month.');
  if(rows.some(r=>r.month===body.month&&r.id!==body.id))fail('This month already exists. Open it to make changes.');
  const title=String(body.title||'').trim(),description=String(body.description||'').trim();
  if(title.length>160||description.length>4000)fail('Please shorten the title or welcome message.');
  const video=videoUrl(String(body.videoUrl||'').trim()),pdf=String(body.pdfUrl||'');
  if(pdf&&!validPdf(pdf,env,demo))fail('Upload the PDF using this form.');
  if(!['draft','published'].includes(body.status))fail('Choose Draft or Published.');
  if(body.status==='published'&&(!pdf||!video))fail('Add both the PDF and video recording before publishing.');
  if(pdf&&!demo&&(pdf!==existing?.pdfUrl||body.status==='published')){
   const response=await fetch(pdf,{method:'HEAD',redirect:'error',signal:AbortSignal.timeout(15000)});
   if(!response.ok)fail('The PDF is not accessible yet. Check PDF delivery in Cloudinary, then try again.');
  }
  const id=existing?.id||randomUUID();
  const row={...existing,id,slug:existing?.slug||`${body.month}-${id}`,month:body.month,title:title||monthLabel(body.month),description,videoUrl:video,pdfUrl:pdf,pdfName:String(body.pdfName||'Monthly PDF').slice(0,200),status:body.status,createdAt:existing?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
  await store.put('MonthlyContent',row);invalidate();const {_recordId,...clean}=row;return {month:clean};
 }
 async function publicPage(slug){
  if(!/^20\d{2}-\d{2}-[a-f0-9-]{36}$/.test(slug))return new Response('This month is not available.',{status:404});
  const row=(await list()).find(r=>r.slug===slug&&r.status==='published');
  if(!row)return new Response('This month is not available yet. Please check the link in your email.',{status:404});
  return new Response(renderMonth(row),{headers:{'Content-Type':'text/html; charset=utf-8','X-Robots-Tag':'noindex, nofollow','Cache-Control':'public, max-age=0, s-maxage=60'}});
 }
 return {admin,publicPage};
}
export function renderMonth(row){return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(row.title)} · Style Masters</title><link rel="stylesheet" href="/assets/monthly-content.css"></head><body class="monthly-public"><header class="monthly-brand">Style Masters <span>MEMBER HUB</span></header><main class="monthly-wrap"><p class="monthly-kicker">${esc(monthLabel(row.month))}</p><h1>${esc(row.title)}</h1><p class="monthly-intro">${esc(row.description||'Your monthly inspiration, resources, and recording—all in one place.').replace(/\n/g,'<br>')}</p><div class="monthly-resources"><section class="monthly-panel"><span class="monthly-number">01 / YOUR RESOURCE</span><h2>This month’s PDF</h2><p>Open the guide to read it or save a copy for later.</p><a class="monthly-button" href="${esc(row.pdfUrl)}" target="_blank" rel="noopener">Open PDF <span aria-hidden="true">↗</span></a></section><section class="monthly-panel"><span class="monthly-number">02 / YOUR RECORDING</span><h2>Watch the recording</h2><p>Settle in and watch whenever it suits you.</p><a class="monthly-button" href="${esc(row.videoUrl)}" target="_blank" rel="noopener">Watch recording <span aria-hidden="true">↗</span></a></section></div><p class="monthly-footnote">Keep this link to return to this month’s content anytime.</p></main></body></html>`;}
