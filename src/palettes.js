export const PALETTES={CCL:'Clear Cool Light',CCM:'Clear Cool Medium',CCD:'Clear Cool Deep',CWL:'Clear Warm Light',CWM:'Clear Warm Medium',CWD:'Clear Warm Deep',SCL:'Soft Cool Light',SCM:'Soft Cool Medium',SCD:'Soft Cool Deep',SWL:'Soft Warm Light',SWM:'Soft Warm Medium',SWD:'Soft Warm Deep',CWLG:'Clear Warm Light for Gray Hair',CWMG:'Clear Warm Medium for Gray Hair',CWDG:'Clear Warm Deep for Gray Hair',SWLG:'Soft Warm Light for Gray Hair',SWMG:'Soft Warm Medium for Gray Hair',SWDG:'Soft Warm Deep for Gray Hair',LO:'Light Olive',MO:'Medium Olive',DO:'Deep Olive'};
export function colorType(value){
 const raw=String(value||'').trim();if(!raw)return {paletteCode:'',paletteName:''};
 const upper=raw.toUpperCase();if(PALETTES[upper])return {paletteCode:upper,paletteName:PALETTES[upper]};
 const normalized=raw.replace(/bright/ig,'Clear').toLowerCase();
 const entry=Object.entries(PALETTES).find(([,name])=>name.toLowerCase()===normalized);
 return entry?{paletteCode:entry[0],paletteName:entry[1]}:{paletteCode:upper,paletteName:raw};
}
