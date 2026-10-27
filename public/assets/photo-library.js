// Show every migrated/uploaded source photo without changing the original studio workflow.
(async () => {
 const params = new URLSearchParams(location.search), id = params.get('clientRecordId');
 if (!id || !document.querySelector('.ycs-photo-prep-app')) return;
 const response = await fetch(`/api/get-customer-photos?clientRecordId=${encodeURIComponent(id)}`);
 if (!response.ok) return;
 const {photos} = await response.json(); if (!photos.length) return;
 const section=document.createElement('section'); section.className='sm-photo-library';
 const title=document.createElement('h2'); title.textContent='Saved Customer Photos'; section.append(title);
 const gallery=document.createElement('div'); gallery.className='sm-gallery'; section.append(gallery);
 for(const photo of photos) {
  const button=document.createElement('button'); button.type='button'; button.title='Use this photo';
  const image=document.createElement('img'); image.src=photo.imageUrl; image.alt=`${photo.kind || 'Saved'} customer photo`; button.append(image);
  button.addEventListener('click',async()=>{
   button.disabled=true;
   try { const r=await fetch('/api/set-active-photo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientRecordId:id,photoId:photo.id})}); if(!r.ok) throw Error('Could not select photo.'); location.reload(); }
   catch(error){alert(error.message);button.disabled=false;}
  }); gallery.append(button);
 }
 document.querySelector('.ycs-photo-prep-app').append(section);
})();
