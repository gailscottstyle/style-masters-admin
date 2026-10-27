import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
export async function uploadImage(data, { demo, directory, env }) {
  if (typeof data !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(data)) throw new Error('Choose a PNG, JPEG, or WebP image.');
  const bytes = Buffer.from(data.split(',')[1], 'base64');
  if (bytes.length > 3 * 1024 * 1024) throw new Error('This image is too large. Please choose one smaller than 3 MB.');
  if (demo) {
    const ext = data.startsWith('data:image/png') ? 'png' : data.startsWith('data:image/webp') ? 'webp' : 'jpg';
    const id = `${randomUUID()}.${ext}`;
    await mkdir(join(directory, 'uploads'), { recursive: true });
    await writeFile(join(directory, 'uploads', id), bytes, { mode: 0o600 });
    return { imageUrl: `/uploads/${id}`, publicId: id };
  }
  const { CLOUDINARY_CLOUD_NAME: cloud, CLOUDINARY_API_KEY: key, CLOUDINARY_API_SECRET: secret } = env;
  if (!cloud || !key || !secret) throw new Error('Cloudinary is not configured yet.');
  const timestamp = Math.floor(Date.now() / 1000), folder = 'style-masters';
  const signature = createHash('sha1').update(`folder=${folder}&timestamp=${timestamp}${secret}`).digest('hex');
  const body = new FormData();
  Object.entries({ file: data, folder, timestamp, api_key: key, signature }).forEach(([k, v]) => body.append(k, v));
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/image/upload`, { method: 'POST', body });
  const result = await response.json();
  if (!response.ok) throw new Error('Photo upload failed. Please try again.');
  return { imageUrl: result.secure_url, publicId: result.public_id };
}
