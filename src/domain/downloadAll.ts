import JSZip from 'jszip';
import type { SponsorGroup } from '../types/models';

function safeName(value: string, fallback: string) {
  const name = value.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').trim();
  return !name || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) ? fallback : name;
}

function uniqueName(base: string, extension: string, used: Set<string>) {
  let name = `${base}.${extension}`, index = 2;
  while (used.has(name.toLocaleLowerCase())) name = `${base} (${index++}).${extension}`;
  used.add(name.toLocaleLowerCase());
  return name;
}

async function imageData(logo: string): Promise<{ bytes: Uint8Array; extension: string }> {
  const data = /^data:image\/(png|jpeg|webp);base64,([\s\S]+)$/i.exec(logo);
  if (data) {
    const decoded = atob(data[2]);
    return { bytes: Uint8Array.from(decoded, char => char.charCodeAt(0)), extension: data[1].toLowerCase() === 'jpeg' ? 'jpg' : data[1].toLowerCase() };
  }
  const response = await fetch(logo);
  if (!response.ok) throw new Error(`Image request failed (${response.status})`);
  const type = response.headers.get('content-type')?.split(';')[0].toLowerCase();
  const extension = type === 'image/png' ? 'png' : type === 'image/jpeg' ? 'jpg' : type === 'image/webp' ? 'webp' : type === 'image/svg+xml' ? 'svg' : type === 'image/gif' ? 'gif' : '';
  if (!extension) throw new Error('Unsupported image format');
  return { bytes: new Uint8Array(await response.arrayBuffer()), extension };
}

export async function createDownloadAllZip(exports: { number: string; json: string }[], groups: SponsorGroup[]): Promise<Blob> {
  const zip = new JSZip();
  const insights = zip.folder('insights')!, sponsors = zip.folder('sponsors')!;
  const matchNames = new Set<string>(), sponsorNames = new Set<string>(), sponsorIds = new Set<string>();
  for (const item of exports) {
    const base = `${safeName(item.number || 'match', 'match')}_sponsor_annotations`;
    insights.file(uniqueName(base, 'json', matchNames), item.json);
  }
  for (const sponsor of groups.flatMap(group => group.sponsors)) {
    if (!sponsor.logo || sponsorIds.has(sponsor.id)) continue;
    sponsorIds.add(sponsor.id);
    try {
      const image = await imageData(sponsor.logo);
      sponsors.file(uniqueName(safeName(sponsor.name, 'sponsor'), image.extension, sponsorNames), image.bytes);
    } catch (error) {
      throw new Error(`Could not include image for ${sponsor.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return zip.generateAsync({ type: 'blob' });
}
