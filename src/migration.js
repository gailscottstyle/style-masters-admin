import { colorType } from './palettes.js';
// Pure transformation. No requests, credentials, or writes to either account.
const parse = value => { if (typeof value === 'object' && value) return value; try { return JSON.parse(value || 'null'); } catch { return null; } };
const string = value => String(value ?? '').trim();
export const SOURCE_BASE = 'appKUu4QwquxPfjet';
export const MEMBER_TABLES = ['CustomerDirectory','CustomerPhotos','PersonalStudioPhotos','MemberDrapingHistory','ColorAnalysisResults','SavedDrapedImages','PhotoQualityEvaluations','PhotoQualityReviews'];
export const REFERENCE_TABLES = ['Colors','Categories','Palettes','PaletteLipColors','Report Palette Templates','Report Choice Copy','Report Assets'];
export function prepareMigration(snapshot) {
  if (snapshot.baseId !== SOURCE_BASE) throw new Error('Unexpected source base.');
  const result = { Customers: [], Photos: [], SavedImages: [], Reports: [], ReferenceData: [], SourceArchive: [] }, warnings=[];
  const mapping = new Map();
  for (const record of snapshot.tables.CustomerDirectory || []) {
    const f=record.fields, legacyId=string(f.CustomerId);
    if (!legacyId || mapping.has(legacyId)) throw new Error(`Missing or duplicate CustomerId in directory record ${record.id}. Resolve before importing.`);
    const id=`sm_${record.id}`; mapping.set(legacyId,id);
    const membershipStatus=/^active$/i.test(f.MembershipStatus) ? 'Active' : /^inactive$/i.test(f.MembershipStatus) ? 'Inactive' : 'None';
    if (membershipStatus==='None') warnings.push({recordId:record.id,reason:'No active/inactive membership designation; retained as None.'});
    result.Customers.push({id,clientRecordId:id,legacyCustomerId:legacyId,sourceRecordId:record.id,firstName:f.FirstName || '',lastName:f.LastName || '',email:f.Email || '',...colorType(f.ColorType),membershipStatus,isClient:false,permissionToUse:!!f.PermissionToUse,notes:f.Notes || '',createdAt:f.FirstSeenAt || record.createdTime,updatedAt:snapshot.exportedAt,sourceData:f,originalPhotoUrl:f.PhotoUrl || '',activePhotoUrl:f.PhotoUrl || ''});
  }
  const evaluations = new Map((snapshot.tables.PhotoQualityEvaluations || []).filter(r=>mapping.has(string(r.fields.CustomerId))).map(r=>[string(r.fields.EvaluationId),mapping.get(string(r.fields.CustomerId))]));
  for (const table of MEMBER_TABLES) {
    for (const record of snapshot.tables[table] || []) {
      const f=record.fields, owner=mapping.get(string(f.CustomerId)) || (table==='PhotoQualityReviews' ? evaluations.get(string(f.EvaluationId)) : undefined);
      if (!owner) continue;
      result.SourceArchive.push({id:`${table}:${record.id}`,table,clientRecordId:owner || '',sourceRecord:record});
      if (['CustomerPhotos','PersonalStudioPhotos'].includes(table)) {
        const urls=[['original',f.OriginalPhotoUrl || f.PhotoUrl],['adjusted',f.AdjustedPhotoUrl],['active',f.ActivePhotoUrl]].filter(([,url])=>url);
        const seen=new Set();
        for(const [kind,imageUrl] of urls) {
          if(seen.has(imageUrl)) continue; seen.add(imageUrl);
          result.Photos.push({id:`ph_${record.id}_${kind}`,clientRecordId:owner,kind,imageUrl,originalPhotoUrl:f.OriginalPhotoUrl || f.PhotoUrl || '',adjustedPhotoUrl:f.AdjustedPhotoUrl || '',photoTransform:parse(f.PhotoTransform),lipMask:parse(f.LipMaskJson),createdAt:f.CreatedAt || record.createdTime,updatedAt:f.UpdatedAt || record.createdTime,archived:!!f.IsArchived,sourceTable:table,sourceRecordId:record.id});
        }
      }
      if (table==='SavedDrapedImages') result.SavedImages.push({id:`di_${record.id}`,clientRecordId:owner,imageUrl:f['Image URL'] || '',cloudinaryPublicId:f['Cloudinary Public ID'] || '',paletteCode:f['Palette Code'] || '',panel:f.Panel || '',drapeColorName:f['Drape Color Name'] || '',drapeColorHex:f['Drape Color Hex'] || '',lipColorName:f['Lip Color Name'] || '',lipColorHex:f['Lip Color Hex'] || '',fileName:f['File Name'] || '',createdAt:f['Created At'] || record.createdTime,notes:f.Notes || '',sourceRecordId:record.id});
    }
  }
  for(const row of result.Customers) {
    const photos=result.Photos.filter(p=>p.clientRecordId===row.id && !p.archived).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
    const photo=photos.find(p=>p.imageUrl===row.activePhotoUrl) || photos.find(p=>p.kind==='active') || photos.find(p=>p.kind==='adjusted') || photos[0];
    if(photo) Object.assign(row,{activePhotoId:photo.id,activePhotoUrl:photo.imageUrl,originalPhotoUrl:photo.originalPhotoUrl || photo.imageUrl,adjustedPhotoUrl:photo.adjustedPhotoUrl,photoTransform:photo.photoTransform,lipMask:photo.lipMask});
    if(row.activePhotoUrl && !photos.length) result.Photos.push({id:`ph_directory_${row.sourceRecordId}`,clientRecordId:row.id,kind:'original',imageUrl:row.activePhotoUrl,sourceTable:'CustomerDirectory',sourceRecordId:row.sourceRecordId});
  }
  for(const table of REFERENCE_TABLES) for(const record of snapshot.tables[table] || []) {
    const key=table==='Report Palette Templates' ? record.fields['Palette Code'] : record.id;
    result.ReferenceData.push({id:`${table}:${key}`,table,fields:record.fields,sourceRecordId:record.id});
  }
  return {baseId:SOURCE_BASE,exportedAt:snapshot.exportedAt,mapping:Object.fromEntries(mapping),tables:result,warnings,counts:Object.fromEntries(Object.entries(result).map(([k,v])=>[k,v.length]))};
}
