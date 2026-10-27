// Same-origin session cookies are sent with all inherited studio requests.
const originalFetch = window.fetch.bind(window);
window.fetch = async (input, options) => {
  const response = await originalFetch(input, options);
  if (response.status === 401 && new URL(typeof input === 'string' ? input : input.url, location.href).origin === location.origin) location.assign('/login');
  return response;
};
fetch('/api/session').then(r => r.json()).then(data => {
  if(data.backgroundRemoval){const checkbox=document.querySelector('[data-sm-remove-background]');if(checkbox){checkbox.disabled=false;checkbox.checked=true;document.querySelector('[data-sm-remove-background-note]').textContent='';}}
  if (data.demo) document.querySelector('[data-demo-banner]').hidden = false;
});

// Keep the selected customer when moving between inherited studio screens.
document.addEventListener('DOMContentLoaded', () => {
 const id=new URLSearchParams(location.search).get('clientRecordId');
 if(!id)return;
 for(const link of document.querySelectorAll('nav a')) {
  const url=new URL(link.href,location.origin);
  if(['/pages/photo-prep','/pages/color-analysis-tool','/pages/signature-color-analysis'].includes(url.pathname)) {
   url.searchParams.set('clientRecordId',id);url.searchParams.set('mode','trade');
   if(url.pathname==='/pages/photo-prep')url.searchParams.set('workflow','color-analysis');
   link.href=url.pathname+url.search;
  }
  if(link.id==='ycs-signature-manage-client-nav-link') {
   link.hidden=false;link.href='/clients?clientRecordId='+encodeURIComponent(id)+'&edit=1';
  }
 }
});
