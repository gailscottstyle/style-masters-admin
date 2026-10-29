// Group read-only reference data and historical originals without dropping fields.
export const expandRecords = rows => rows.flatMap(row => row.packedVersion === 1 ? row.items : [row]);
export function compactRecords(rows, table, maxBytes = 70000) {
  const groups = new Map();
  for (const row of expandRecords(rows)) {
    const key = table === 'SourceArchive' ? row.clientRecordId : row.table;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const result = [];
  for (const [key, items] of groups) {
    let chunk;
    const start = () => ({id: `packed:${table}:${key}:${result.length}`, packedVersion: 1, ...(table === 'SourceArchive' ? {clientRecordId: key} : {}), items: []});
    chunk = start();
    for (const item of items) {
      if (Buffer.byteLength(JSON.stringify({...chunk, items: [...chunk.items, item]})) > maxBytes && chunk.items.length) {
        result.push(chunk); chunk = start();
      }
      chunk.items.push(item);
      if (Buffer.byteLength(JSON.stringify(chunk)) > maxBytes) throw Error('An individual archive record exceeds the packing limit.');
    }
    if (chunk.items.length) result.push(chunk);
  }
  return result;
}
