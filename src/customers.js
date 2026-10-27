import { randomUUID } from 'node:crypto';
export function customerInput(input, existing) {
  const result = existing ? { ...existing } : {
    id: `sm_${randomUUID()}`, createdAt: new Date().toISOString(), membershipStatus: 'None', isClient: true,
    analysisStatus: 'New', originalPhotoUrl: '', adjustedPhotoUrl: '', activePhotoUrl: '', photos: []
  };
  for (const key of ['firstName', 'lastName', 'email', 'paletteCode', 'paletteName', 'notes']) {
    if (key in input) {
      if (typeof input[key] !== 'string' || input[key].length > (key === 'notes' ? 20000 : 500)) throw new Error(`Invalid ${key}`);
      result[key] = input[key].trim();
    }
  }
  if (!result.firstName || !result.lastName) throw new Error('First and last name are required.');
  if (result.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) throw new Error('Enter a valid email address.');
  if ('membershipStatus' in input) {
    if (!['None', 'Active', 'Inactive'].includes(input.membershipStatus)) throw new Error('Choose Active, Inactive, or Not a member.');
    result.membershipStatus = input.membershipStatus;
  }
  if ('isClient' in input) { if (typeof input.isClient !== 'boolean') throw new Error('Invalid client classification.'); result.isClient = input.isClient; }
  result.clientRecordId = result.id; result.updatedAt = new Date().toISOString();
  return result;
}
export function customerView(row) { const { _recordId, sourceData, ...rest } = row; return { ...rest, clientRecordId: row.id, primaryPhotoUrl: row.activePhotoUrl || row.adjustedPhotoUrl || row.originalPhotoUrl || '' }; }
