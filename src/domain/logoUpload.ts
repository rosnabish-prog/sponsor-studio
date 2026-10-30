/** Keep the user's PNG exactly as uploaded; there is no canvas, crop or re-encoding. */
export const MAX_ORIGINAL_PNG_BYTES = 300 * 1024;
export const MAX_CATALOG_BYTES = 500_000;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export async function readOriginalPng(file: File): Promise<string> {
  if (file.size > MAX_ORIGINAL_PNG_BYTES) {
    throw new Error('PNG logo must be 300 KB or smaller while logos are stored in the sponsor catalog.');
  }
  const signature = new Uint8Array(await file.slice(0, PNG_SIGNATURE.length).arrayBuffer());
  if (signature.length !== PNG_SIGNATURE.length || !PNG_SIGNATURE.every((byte, index) => signature[index] === byte)) {
    throw new Error('Please upload a valid PNG image. JPG, WebP and SVG are not supported here.');
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Unable to read PNG logo.'));
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (!dataUrl.startsWith('data:image/png;base64,')) return reject(new Error('Unable to read PNG without conversion.'));
      resolve(dataUrl);
    };
    reader.readAsDataURL(file);
  });
}
