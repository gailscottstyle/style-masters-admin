import { readFile } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { customPalettes } from './custom-palettes.js';
import { expandRecords } from './compact-records.js';
import { Store } from './store.js';
import { customerInput, customerView } from './customers.js';
import { passwordMatches, readSession, sessionToken, signSession } from './auth.js';
import { uploadImage } from './media.js';

const json = (body, status = 200) => Response.json(body, { status });
const redirect = (location, headers = {}) => new Response(null, { status: 303, headers: { Location: location, ...headers } });
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const pages = { '/': 'dashboard', '/palettes': 'palettes', '/pages/ycs-color-palettes': 'ycs-palettes', '/pages/my-custom-palettes': 'custom-palettes', '/pages/member-palette': 'palette-viewer', '/pages/palette': 'palette-viewer', '/pages/member-color': 'color-viewer', '/clients': 'my-clients', '/pages/my-clients': 'my-clients', '/pages/photo-prep': 'photo-prep', '/pages/color-analysis-tool': 'color-analysis-tool', '/pages/signature-color-analysis': 'signature-color-analysis' };
const writeRoutes = new Set(['create-consultant-client','update-consultant-client','delete-consultant-client','save-photo','save-photo-transform','set-active-photo','save-draped-image','save-saved-draped-image','save-color-analysis-report','upload-report-logo','remove-background']);

export function createApp({ env = process.env, directory = resolve('.local'), dist = resolve('dist'), store = new Store({ directory, token: env.DEMO_MODE === 'true' && !env.VERCEL && env.NODE_ENV !== 'production' ? '' : env.AIRTABLE_TOKEN, baseId: env.AIRTABLE_BASE_ID }) } = {}) {
  const demo = env.DEMO_MODE === 'true' && !env.VERCEL && env.NODE_ENV !== 'production';
  const email = env.ADMIN_EMAIL || 'gailscottstyle@gmail.com';
  const secret = env.SESSION_SECRET;
  const attempts = new Map();
  async function customer(id) {
    const row = id && await store.get('Customers', id);
    if (!row || row.archived) throw Object.assign(new Error('Customer not found.'), { status: 404 });
    return row;
  }
  async function file(path) {
    try { return new Response(await readFile(path), { headers: { 'Content-Type': MIME[extname(path)] || 'application/octet-stream' } }); }
    catch (e) { if (e.code === 'ENOENT') return new Response('Not found', { status: 404 }); throw e; }
  }
  function loginPage(error = '') {
    return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in · Style Masters</title><link rel="stylesheet" href="/assets/standalone.css"></head><body><main class="sm-login"><h1>Style Masters</h1><p>Sign in to your admin dashboard.</p>${error ? `<p class="sm-error" role="alert">${escape(error)}</p>` : ''}<form action="/login" method="post"><label>Email<input type="email" name="email" autocomplete="username" required value="${escape(email)}"></label><label>Password<input type="password" name="password" autocomplete="current-password" required></label><button>Sign in</button></form></main></body></html>`, { headers: { 'Content-Type': 'text/html' } });
  }
  async function dispatch(request) {
    const url = new URL(request.url), path = url.pathname, q = url.searchParams;
    // The demo is deliberately unavailable from non-loopback hosts and production deployments.
    const localDemo = demo && ['127.0.0.1','localhost','[::1]'].includes(url.hostname);
    const modifying = !['GET','HEAD'].includes(request.method);
    if (modifying) {
      if (request.headers.get('origin') !== url.origin) return json({ error: 'Request origin rejected.' }, 403);
      if (Number(request.headers.get('content-length') || 0) > 4_300_000) return json({ error: 'Upload too large.' }, 413);
    }
    if (path.startsWith('/assets/')) {
      const relative = path.slice(8);
      if (!/^[a-zA-Z0-9_.-]+$/.test(relative)) return new Response('Not found', { status: 404 });
      return file(join(dist, 'assets', relative));
    }
    if (!localDemo && (!secret || secret.length < 32 || !env.ADMIN_PASSWORD_HASH || !env.AIRTABLE_TOKEN)) {
      return new Response('Style Masters setup is not complete. Configure administrator login, session secret, and Airtable credentials before deployment.', { status: 503 });
    }
    if (path === '/login') {
      if (localDemo) return redirect('/');
      if (request.method === 'GET') return loginPage();
      if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
      const ip = request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for') || 'local';
      const now=Date.now();for(const [key,value] of attempts)if(value.until<now)attempts.delete(key);
      const attempt=attempts.get(ip) || {count:0,until:now+15*60*1000};
      if(attempt.count>=8 || attempts.size>10000)return json({error:'Too many sign-in attempts. Try again in 15 minutes.'},429);
      attempt.count++;attempts.set(ip,attempt);
      const form = await request.formData();
      // scrypt makes each verification expensive; production must also enable Vercel login rate limiting.
      const matches = passwordMatches(String(form.get('password') || ''), env.ADMIN_PASSWORD_HASH);
      if (String(form.get('email') || '').trim().toLowerCase() !== email.toLowerCase() || !matches) return loginPage('Email or password is incorrect.');
      attempts.delete(ip);
      return redirect('/', { 'Set-Cookie': `sm_session=${signSession(email, secret)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${url.protocol === 'https:' ? '; Secure' : ''}` });
    }
    const session = localDemo ? { email } : readSession(sessionToken(request), secret, email);
    if (!session) return path.startsWith('/api/') || path.startsWith('/apps/') ? json({ error: 'Sign in required.' }, 401) : redirect('/login');
    if (path === '/logout' && request.method === 'POST') return redirect('/login', { 'Set-Cookie': 'sm_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' });
    if (pages[path]) return file(join(dist, 'pages', `${pages[path]}.html`));
    if (path.startsWith('/uploads/') && localDemo && /^[\w.-]+$/.test(path.slice(9))) return file(join(directory, 'uploads', path.slice(9)));
    if (path === '/api/session') return json({ email, demo: localDemo, backgroundRemoval: !!env.REMOVE_BG_API_KEY });
    const route = path.replace('/api/', '');
    if (writeRoutes.has(route) && request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
    const body = modifying && path !== '/logout' ? await request.json() : {};
    const id = body.clientRecordId || q.get('clientRecordId');
    const upload = data => uploadImage(data, { demo: localDemo, directory, env });

    if (route === 'get-consultant-clients') return json({ clients: (await store.list('Customers')).filter(r => !r.archived).map(customerView) });
    if (route === 'create-consultant-client') {
      const row = customerInput(body); await store.put('Customers', row); return json({ success: true, ...customerView(row) }, 201);
    }
    if (route === 'update-consultant-client') {
      const row = customerInput(body, await customer(id)); await store.put('Customers', row); return json({ success: true, ...customerView(row) });
    }
    if (route === 'delete-consultant-client') {
      const row = await customer(id); await store.put('Customers', { ...row, archived: true, updatedAt: new Date().toISOString() });
      return json({ success: true });
    }
    if (route === 'get-upload-usage') return json({ scope: 'unlimited', limit: null, remaining: null, used: 0 });
    if (route === 'get-photo') {
      if (!id) return json({ activePhotoUrl: null });
      const row = await customer(id); return json({ ...customerView(row), photoUrl: row.activePhotoUrl || row.originalPhotoUrl, photoTransform: row.photoTransform || null, lipMask: row.lipMask || row.photoTransform?.lipMask || null });
    }
    if (route === 'get-customer-photos') { await customer(id); return json({ photos: (await store.list('Photos')).filter(p => p.clientRecordId === id && !p.archived) }); }
    if (route === 'save-photo') {
      const row = await customer(id); const media = await upload(body.imageBase64); const adjusted = body.saveType === 'adjusted';
      const photo = { id: `ph_${randomUUID()}`, clientRecordId: id, kind: adjusted ? 'adjusted' : 'original', originalPhotoUrl: adjusted ? row.originalPhotoUrl : media.imageUrl, adjustedPhotoUrl: adjusted ? media.imageUrl : '', ...media, createdAt: new Date().toISOString() };
      await store.put('Photos', photo);
      const changes = adjusted ? { adjustedPhotoUrl: media.imageUrl } : { originalPhotoUrl: media.imageUrl, adjustedPhotoUrl: '', photoTransform: null, lipMask: null };
      await store.put('Customers', { ...row, ...changes, activePhotoUrl: media.imageUrl, activePhotoId: photo.id, updatedAt: photo.createdAt });
      return json({ success: true, imageUrl: media.imageUrl, ...customerView(row), saveType: body.saveType });
    }
    if (route === 'set-active-photo') {
      const row = await customer(id);
      if(body.photoType === 'original' && row.originalPhotoUrl) {
        const original = (await store.list('Photos')).find(p => p.clientRecordId === id && p.imageUrl === row.originalPhotoUrl);
        await store.put('Customers',{...row,activePhotoUrl:row.originalPhotoUrl,activePhotoId:original?.id || row.activePhotoId,photoTransform:original?.photoTransform || null,lipMask:original?.lipMask || null});
        return json({success:true,activePhotoUrl:row.originalPhotoUrl});
      }
      const photo = await store.get('Photos', body.photoId);
      if (!photo || photo.clientRecordId !== id || photo.archived) return json({ error: 'Photo not found.' }, 404);
      await store.put('Customers', { ...row, activePhotoId: photo.id, activePhotoUrl: photo.imageUrl, originalPhotoUrl: photo.originalPhotoUrl || photo.imageUrl, adjustedPhotoUrl: photo.adjustedPhotoUrl || '', photoTransform: photo.photoTransform || null, lipMask: photo.lipMask || null, updatedAt: new Date().toISOString() });
      return json({ success: true });
    }
    if (route === 'save-photo-transform') {
      const row = await customer(id);
      if (!body.photoTransform || !['x','y','scale'].every(k => Number.isFinite(body.photoTransform[k]))) return json({ error: 'Invalid photo position.' }, 400);
      const transform = { ...row.photoTransform, ...body.photoTransform, ...(body.analysisState || {}) };
      if (body.lipMask) transform.lipMask = body.lipMask;
      await store.put('Customers', { ...row, photoTransform: transform, lipMask: body.lipMask || row.lipMask, updatedAt: new Date().toISOString() });
      if (row.activePhotoId) {
        const photo = await store.get('Photos', row.activePhotoId);
        if (photo) await store.put('Photos', { ...photo, photoTransform: transform, lipMask: body.lipMask || photo.lipMask });
      }
      return json({ success: true, photoTransform: transform });
    }
    if (route === 'get-saved-draped-images') { await customer(id); return json({ images: (await store.list('SavedImages')).filter(r => r.clientRecordId === id && !r.archived) }); }
    if (['save-draped-image','save-saved-draped-image'].includes(route)) {
      await customer(id); const media = await upload(body.imageBase64);
      const image = { id: `di_${randomUUID()}`, clientRecordId: id, ...media, createdAt: new Date().toISOString() };
      for (const key of ['panel','paletteCode','drapeColorName','drapeColorHex','lipColorName','lipColorHex','fileName','label','sourceTool','notes']) image[key] = String(body[key] || '').slice(0,500);
      await store.put('SavedImages', image); return json({ success: true, ...image, image });
    }
    if (route === 'get-color-analysis-report') { await customer(id); const report = await store.get('Reports', `${id}:${q.get('reportType') || 'signature_first_section'}`); return json({ report: report || null }); }
    if (route === 'save-color-analysis-report') {
      await customer(id); const report = { id: `${id}:${body.reportType || 'signature_first_section'}`, clientRecordId: id, draft: body.draft, updatedAt: new Date().toISOString() };
      await store.put('Reports', report); return json({ success: true, report });
    }
    if (route === 'get-report-palette-template') {
      const record = expandRecords(await store.list('ReferenceData')).find(r => r.id === `Report Palette Templates:${q.get('paletteCode')}`);
      const f = record?.fields; return json({ template: f ? { paletteCode: f['Palette Code'], colorFanImageUrl: f['Color Fan Image URL'], colorWheelImageUrl: f['Color Wheel Image URL'], copy: { intro: f['Intro Copy'], howItWorks: f['How It Works Copy'], colorWheel: f['Color Wheel Copy'], depth: f['Default Depth'], undertone: f['Default Undertone'], chroma: f['Default Chroma'], paletteType: f['Palette Type Copy'] } } : null });
    }
    if (route === 'upload-report-logo') { const media = await upload(body.imageBase64); return json({ success: true, ...media, logoUrl: media.imageUrl }); }
    if (route === 'remove-background') {
      if (!env.REMOVE_BG_API_KEY) return json({ error: 'Automatic background removal is not configured.' }, 503);
      if (typeof body.imageBase64 !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/.test(body.imageBase64)) return json({error:'Invalid image.'},400);
      const form = new FormData(); form.append('image_file_b64', body.imageBase64.split(',')[1]); form.append('size','auto');
      const result = await fetch('https://api.remove.bg/v1.0/removebg',{method:'POST',headers:{'X-Api-Key':env.REMOVE_BG_API_KEY},body:form});
      if (!result.ok) return json({error:'Background removal failed. Uncheck automatic removal to upload the original.'},502);
      return json({image:'data:image/png;base64,'+Buffer.from(await result.arrayBuffer()).toString('base64')});
    }
    if (route === 'proxy-image') {
      const target = new URL(q.get('url'));
      if (target.protocol !== 'https:' || target.hostname !== 'res.cloudinary.com') return json({ error: 'Unsupported image host.' }, 400);
      const upstream = await fetch(target, { redirect: 'error' });
      if (!upstream.ok || !upstream.headers.get('content-type')?.startsWith('image/')) return json({ error: 'Could not load image.' }, 400);
      return new Response(upstream.body, { headers: { 'Content-Type': upstream.headers.get('content-type') } });
    }
    if (path === '/apps/palette-data') {
      const action=q.get('action');
      if (action === 'getFavorites' || action === 'toggleFavorite') {
        const code=String(body.paletteCode || q.get('palette') || '');
        if(!code || code.length>100)return json({error:'Choose a palette.'},400);
        const id='favorites:'+code, row=await store.get('CustomPalettes',id) || {id,kind:'favorites',hexes:[]};
        if(action==='getFavorites')return json({favorites:row.hexes});
        if(request.method!=='POST')return json({error:'Method not allowed.'},405);
        const hex=String(body.hex || '').toUpperCase();if(!/^#[0-9A-F]{6}$/.test(hex))return json({error:'Invalid color.'},400);
        const isFavorite=!row.hexes.includes(hex);row.hexes=isFavorite?[...row.hexes,hex]:row.hexes.filter(h=>h!==hex);
        await store.put('CustomPalettes',row);return json({success:true,isFavorite});
      }
      if ((q.get('palette') || '').startsWith('CUSTOM_')) {
        const result=await customPalettes(store,'GET',new URLSearchParams({action:'palette',paletteId:q.get('palette').slice(7)}),{});
        return json({colors:result.palette.colors.map((j,index)=>({name:j.color.name,hex:j.color.hexCode,category:j.color.category,sortOrder:index}))});
      }

      if (q.get('action') === 'deleteSavedDrapedImages' && request.method === 'POST') {
        await customer(body.clientRecordId);
        for (const imageId of body.imageIds || []) {
          const image = await store.get('SavedImages', imageId);
          if (image?.clientRecordId !== body.clientRecordId) return json({ error: 'Image not found.' }, 404);
          await store.put('SavedImages', { ...image, archived: true });
        }
        return json({ success: true });
      }
      const lip = q.get('action') === 'getSignatureLipColors', palette = (q.get('palette') || '').toUpperCase();
      const colors = expandRecords(await store.list('ReferenceData')).filter(r => r.table === (lip ? 'PaletteLipColors' : 'Colors')).filter(r => {
        const f = r.fields; return String(lip ? f.PaletteCode : (palette.startsWith('ADMIN_') ? f.AdminPaletteCodes : f.PaletteCodes_Final_Manual || f.PaletteCodes) || '').toUpperCase().split(/[,;\s]+/).includes(palette);
      }).map(r => ({ name: r.fields.ColorName, hex: r.fields.DisplayHex || r.fields.Hex, category: r.fields.Category || r.fields.CategoryNames || '', categories: r.fields.CategoryNames || r.fields.Category || '', chroma: r.fields.Chroma || '', temperature: r.fields.Temperature || '', depth: r.fields.Depth || '', isNeutral: !!r.fields.IsNeutral, neutralDepth: r.fields.NeutralDepth || '', neutralFamily: r.fields.NeutralFamily || '', isBest: String(r.fields.BestPaletteCodes || '').split(/[,;\s]+/).includes(palette), sortOrder: r.fields.SortOrder || 0 })).sort((a,b) => a.sortOrder-b.sortOrder);
      return json(lip ? { lipColors: colors } : { colors });
    }
    if (route === 'custom-palettes') return json(await customPalettes(store, request.method, q, body));
    return json({ error: 'Not found.' }, 404);
  }
  return async request => {
    let response;
    try { response = await dispatch(request); }
    catch (error) { console.error(error.message); response = json({ error: error.status ? error.message : 'Unable to complete this request. Check the application configuration and try again.' }, error.status || 400); }
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('Referrer-Policy', 'same-origin');
    return response;
  };
}
