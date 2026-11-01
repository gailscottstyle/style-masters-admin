// Shared source-photo manager for Photo Prep and the client detail gallery.
(() => {
 const escape = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function api(path, body) {
  const r=await fetch('/api/'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:undefined);
  const data=await r.json();if(!r.ok)throw Error(data.error || 'Unable to load photos.');return data;
 }
 async function mount(section) {
  if(section.dataset.loaded)return;section.dataset.loaded='true';
  const id=section.dataset.clientRecordId;
  section.innerHTML='<p role="status">Loading client photos…</p>';
  try {
   const [{photos},client]=await Promise.all([api('get-customer-photos?clientRecordId='+encodeURIComponent(id)),api('get-photo?clientRecordId='+encodeURIComponent(id))]);
   const prep=document.querySelector('#ycs-prep-file-input');
   const uploadUrl='/pages/photo-prep?mode=trade&workflow=color-analysis&clientRecordId='+encodeURIComponent(id);
   section.innerHTML=`<div class="sm-photo-library__head"><div><h3>Client Photos</h3><p>Choose the active photo used throughout this client's professional tools.</p></div>${prep?'<button type="button" data-upload-another>Upload Another Photo</button>':`<a href="${uploadUrl}">Upload Another Photo</a>`}</div><div class="sm-photo-grid">${photos.map(photo=>{
    const active=client.activePhotoId?client.activePhotoId===photo.id:client.activePhotoUrl===photo.imageUrl;
    return `<article class="sm-photo-card${active?' is-active':''}"><a href="${escape(photo.imageUrl)}" target="_blank" rel="noopener"><img src="${escape(photo.imageUrl)}" alt="${escape(photo.kind || 'Saved')} client photo"></a><div><strong>${active?'Active photo':'Saved photo'}</strong><p>${escape(photo.kind==='adjusted'?'Adjusted photo':'Original photo')}</p><button type="button" data-select-photo="${escape(photo.id)}" ${active?'disabled':''}>${active?'Active Photo':'Use This Photo'}</button><button type="button" class="sm-photo-delete" data-delete-photo="${escape(photo.id)}">Delete Photo</button></div></article>`;
   }).join('')}</div>${photos.length?'':'<p>No client photos yet. Upload a photo to get started.</p>'}<p role="status" data-photo-status></p>`;
   section.onclick=async event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-upload-another')){prep.click();return;}
    const photoId=button.dataset.selectPhoto || button.dataset.deletePhoto;if(!photoId)return;
    const deleting=!!button.dataset.deletePhoto;
    if(deleting&&!confirm('Delete this client photo from the library? Saved draped photos will remain.'))return;
    button.disabled=true;
    try {await api(deleting?'delete-customer-photo':'set-active-photo',{clientRecordId:id,photoId});location.reload();}
    catch(error){section.querySelector('[data-photo-status]').textContent=error.message;button.disabled=false;}
   };
  }catch(error){section.innerHTML='<p role="alert">'+escape(error.message)+'</p>';}
 }
 const id=new URLSearchParams(location.search).get('clientRecordId');
 const workspace=document.querySelector('#ycs-photo-prep-workspace');
 if(id&&workspace){const section=document.createElement('section');section.className='sm-photo-library';section.dataset.smSourceGallery='';section.dataset.clientRecordId=id;workspace.prepend(section);}
 const scan=()=>document.querySelectorAll('[data-sm-source-gallery]:not([data-loaded])').forEach(mount);
 document.addEventListener('sm:photos-updated',()=>{document.querySelectorAll('[data-sm-source-gallery]').forEach(section=>delete section.dataset.loaded);scan();});
 new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});scan();
})();
