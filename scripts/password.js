import { passwordHash } from '../src/auth.js';
import { randomBytes } from 'node:crypto';
if (!process.stdin.isTTY) throw new Error('Run this in an interactive terminal.');
process.stdout.write('New administrator password (hidden; at least 14 characters): ');
process.stdin.setRawMode(true); process.stdin.resume(); let password='';
process.stdin.on('data', chunk => {
 for (const character of chunk.toString()) {
  if (character === '\u0003') process.exit(1);
  if (character === '\r' || character === '\n') {
   process.stdin.setRawMode(false); process.stdin.pause();
   if (password.length<14) { console.error('\nUse at least 14 characters.'); process.exit(1); }
   console.log(`\nADMIN_PASSWORD_HASH=${passwordHash(password)}\nSESSION_SECRET=${randomBytes(48).toString('base64url')}`); process.exit(0);
  }
  if (character === '\u007f') password=password.slice(0,-1); else password+=character;
 }
});
