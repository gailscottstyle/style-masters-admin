import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const DESTINATION_BASE = 'appVxYHy91v9JAh3Z';
export class Store {
  constructor({ directory = '.local', token = '', baseId = DESTINATION_BASE } = {}) {
    if (baseId !== DESTINATION_BASE) throw new Error('This application only writes to the Style Masters base.');
    this.directory = directory; this.token = token; this.baseId = baseId; this.queue = Promise.resolve();
  }
  async airtable(table, suffix = '', options = {}) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await fetch(`https://api.airtable.com/v0/${this.baseId}/${encodeURIComponent(table)}${suffix}`, {
        ...options, headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' }
      });
      if (response.status === 429 && attempt < 3) { await new Promise(r => setTimeout(r, 30000)); continue; }
      const data = await response.json();
      if (!response.ok) throw new Error(`Airtable ${table}: ${data.error?.message || response.status}`);
      return data;
    }
  }
  async localRead(table) {
    try { return JSON.parse(await readFile(join(this.directory, `${table}.json`), 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  }
  async list(table) {
    if (!this.token) return this.localRead(table);
    const rows = []; let offset;
    do {
      const data = await this.airtable(table, offset ? `?offset=${encodeURIComponent(offset)}` : '');
      rows.push(...data.records.map(r => ({ ...JSON.parse(r.fields.Data || '{}'), ...(table === 'Customers' ? {membershipStatus: r.fields.MembershipStatus || 'None', isClient: !!r.fields.IsClient} : {}), _recordId: r.id })));
      offset = data.offset;
    } while (offset);
    return rows;
  }
  async get(table, id) { return (await this.list(table)).find(r => r.id === id); }
  fields(table, value) {
    const fields = { Key: value.id, Data: JSON.stringify(value) };
    if (table === 'Customers') Object.assign(fields, {
      Name: `${value.firstName || ''} ${value.lastName || ''}`.trim(), Email: value.email || '',
      MembershipStatus: value.membershipStatus || 'None', IsClient: !!value.isClient,
      ColorType: value.paletteName || value.paletteCode || ''
    });
    return fields;
  }
  async put(table, value) {
    const { _recordId, ...clean } = value;
    if (this.token) {
      const existing = _recordId ? { _recordId } : await this.get(table, clean.id);
      await this.airtable(table, existing ? `/${existing._recordId}` : '', {
        method: existing ? 'PATCH' : 'POST', body: JSON.stringify({ fields: this.fields(table, clean) })
      });
      return clean;
    }
    const operation = this.queue.then(async () => {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const rows = await this.localRead(table); const index = rows.findIndex(r => r.id === clean.id);
      if (index < 0) rows.push(clean); else rows[index] = clean;
      const path = join(this.directory, `${table}.json`), temp = `${path}.${randomUUID()}.tmp`;
      await writeFile(temp, JSON.stringify(rows, null, 2), { mode: 0o600 }); await rename(temp, path);
      return clean;
    });
    this.queue = operation.catch(() => {}); return operation;
  }
}
