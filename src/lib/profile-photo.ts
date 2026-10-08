export const PHOTO_INPUT_ACCEPT = 'image/jpeg,image/png,image/webp';
export const MAX_PROFILE_PHOTO_INPUT_BYTES = 10 * 1024 * 1024;

const MAX_PHOTO_PIXELS = 40_000_000;
const MAX_PHOTO_SIDE = 20_000;
const MAX_OUTPUT_BYTES = 300 * 1024;
const INVALID_PHOTO = 'Não foi possível ler a foto. Escolha uma imagem JPG, PNG ou WebP válida.';

type Dimensions = { width: number; height: number };
type DecodedPhoto = Dimensions & { image: CanvasImageSource; release: () => void };

function checkDimensions({ width, height }: Dimensions): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error(INVALID_PHOTO);
  }
  if (width > MAX_PHOTO_SIDE || height > MAX_PHOTO_SIDE || width * height > MAX_PHOTO_PIXELS) {
    throw new Error('A foto tem dimensões muito grandes. Escolha uma imagem de até 40 megapixels e 20.000 pixels por lado.');
  }
}

function matches(bytes: Uint8Array, offset: number, values: readonly number[]): boolean {
  return values.every((value, index) => bytes[offset + index] === value);
}

function readDimensions(bytes: Uint8Array, type: string): Dimensions {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (type === 'image/png' && bytes.length >= 33
    && matches(bytes, 0, [137, 80, 78, 71, 13, 10, 26, 10])
    && view.getUint32(8) === 13 && matches(bytes, 12, [73, 72, 68, 82])) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (type === 'image/jpeg' && matches(bytes, 0, [255, 216])) {
    let offset = 2;
    while (offset + 3 < bytes.length && bytes[offset] === 255) {
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      // SOI, TEM and restart markers do not carry a segment length.
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (length < 8) break;
        return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) };
      }
      offset += length;
    }
  }
  if (type === 'image/webp' && bytes.length >= 20
    && matches(bytes, 0, [82, 73, 70, 70]) && matches(bytes, 8, [87, 69, 66, 80])) {
    const end = view.getUint32(4, true) + 8;
    if (end > bytes.length || end < 20) throw new Error(INVALID_PHOTO);
    let dimensions: Dimensions | undefined;
    let offset = 12;
    const uint24 = (at: number) => bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16);
    while (offset + 8 <= end) {
      const length = view.getUint32(offset + 4, true);
      const data = offset + 8;
      if (data + length > end) throw new Error(INVALID_PHOTO);
      let current: Dimensions | undefined;
      if (matches(bytes, offset, [86, 80, 56, 88]) && length >= 10) {
        current = { width: uint24(data + 4) + 1, height: uint24(data + 7) + 1 };
      } else if (matches(bytes, offset, [65, 78, 77, 70]) && length >= 16) {
        current = { width: uint24(data + 6) + 1, height: uint24(data + 9) + 1 };
      } else if (matches(bytes, offset, [86, 80, 56, 32]) && length >= 10
        && matches(bytes, data + 3, [157, 1, 42])) {
        current = { width: view.getUint16(data + 6, true) & 0x3fff, height: view.getUint16(data + 8, true) & 0x3fff };
      } else if (matches(bytes, offset, [86, 80, 56, 76]) && length >= 5 && bytes[data] === 0x2f) {
        const packed = view.getUint32(data + 1, true);
        current = { width: (packed & 0x3fff) + 1, height: ((packed >>> 14) & 0x3fff) + 1 };
      }
      if (current) {
        // Check both the extended canvas and the actual frame before decoding.
        checkDimensions(current);
        dimensions ??= current;
      }
      offset = data + length + (length % 2);
    }
    if (dimensions) return dimensions;
  }
  throw new Error(INVALID_PHOTO);
}

async function decodePhoto(file: File): Promise<DecodedPhoto> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { image: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(INVALID_PHOTO));
      image.src = url;
    });
    return { image, width: image.naturalWidth, height: image.naturalHeight, release: () => { image.src = ''; } };
  } catch (error) {
    image.src = '';
    throw error;
  } finally {
    image.onload = null;
    image.onerror = null;
    URL.revokeObjectURL(url);
  }
}

function encodeWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob || blob.type !== 'image/webp') {
        reject(new Error('Este navegador não conseguiu preparar a foto. Tente novamente em um navegador atualizado.'));
      } else resolve(blob);
    }, 'image/webp', quality);
  });
}

/** Removes metadata, applies EXIF orientation and keeps only a small centered photo. */
export async function preprocessProfilePhoto(file: File): Promise<Blob> {
  if (!PHOTO_INPUT_ACCEPT.split(',').includes(file.type)) {
    throw new Error('Escolha uma foto em JPG, PNG ou WebP.');
  }
  if (!file.size) throw new Error(INVALID_PHOTO);
  if (file.size > MAX_PROFILE_PHOTO_INPUT_BYTES) {
    throw new Error('A foto deve ter no máximo 10 MB.');
  }
  let bytes: Uint8Array;
  try { bytes = new Uint8Array(await file.arrayBuffer()); }
  catch { throw new Error(INVALID_PHOTO); }
  const dimensions = readDimensions(bytes, file.type);
  checkDimensions(dimensions);
  let decoded: DecodedPhoto;
  try { decoded = await decodePhoto(file); }
  catch { throw new Error(INVALID_PHOTO); }
  let canvas: HTMLCanvasElement | undefined;
  try {
    checkDimensions(decoded);
    canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível preparar a foto neste navegador.');
    const crop = Math.min(decoded.width, decoded.height);
    const initialSize = Math.min(512, crop);
    // Each retry is bounded; smaller inputs are never enlarged.
    for (const target of [...new Set([initialSize, Math.min(initialSize, 384), Math.min(initialSize, 256)])]) {
      canvas.width = target;
      canvas.height = target;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(decoded.image, (decoded.width - crop) / 2, (decoded.height - crop) / 2,
        crop, crop, 0, 0, target, target);
      for (const quality of [0.85, 0.7, 0.55]) {
        const blob = await encodeWebp(canvas, quality);
        if (blob.size > 0 && blob.size <= MAX_OUTPUT_BYTES) return blob;
      }
    }
    throw new Error('Não foi possível reduzir esta foto. Escolha outra imagem e tente novamente.');
  } finally {
    decoded.release();
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
