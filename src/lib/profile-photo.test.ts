import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_PROFILE_PHOTO_INPUT_BYTES, PHOTO_INPUT_ACCEPT, preprocessProfilePhoto } from './profile-photo';

function png(width: number, height: number): File {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([73, 72, 68, 82], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return new File([bytes], 'foto.png', { type: 'image/png' });
}

function jpeg(width: number, height: number): File {
  // SOI, APP0 and a progressive SOF segment, without pixel payload (decoder is mocked).
  const bytes = new Uint8Array([255, 216, 255, 224, 0, 4, 0, 0, 255, 194, 0, 11, 8,
    height >>> 8, height & 255, width >>> 8, width & 255, 1, 1, 0x11, 0, 255, 217]);
  return new File([bytes], 'foto.jpg', { type: 'image/jpeg' });
}

function webp(width: number, height: number, kind: 'VP8X' | 'VP8L' | 'VP8 '): File {
  const length = kind === 'VP8L' ? 5 : 10;
  const bytes = new Uint8Array(20 + length + length % 2);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('RIFF'));
  view.setUint32(4, bytes.length - 8, true);
  bytes.set(new TextEncoder().encode('WEBP' + kind), 8);
  view.setUint32(16, length, true);
  if (kind === 'VP8X') {
    for (let i = 0; i < 3; i++) { bytes[24 + i] = (width - 1) >>> (8 * i); bytes[27 + i] = (height - 1) >>> (8 * i); }
  } else if (kind === 'VP8L') {
    bytes[20] = 0x2f;
    view.setUint32(21, ((height - 1) << 14) | (width - 1), true);
  } else {
    bytes.set([157, 1, 42], 23);
    view.setUint16(26, width, true);
    view.setUint16(28, height, true);
  }
  return new File([bytes], 'foto.webp', { type: 'image/webp' });
}

function mockCanvas(width = 1600, height = 900, outputSizes = [10_000], type = 'image/webp') {
  const bitmap = { width, height, close: vi.fn() };
  const decode = vi.fn().mockResolvedValue(bitmap);
  const drawImage = vi.fn();
  const context = { drawImage, imageSmoothingEnabled: false, imageSmoothingQuality: 'low' };
  let count = 0;
  const toBlob = vi.fn((callback: BlobCallback) => {
    callback(new Blob([new Uint8Array(outputSizes[Math.min(count++, outputSizes.length - 1)])], { type }));
  });
  const canvas = { width: 0, height: 0, getContext: vi.fn(() => context), toBlob };
  vi.stubGlobal('createImageBitmap', decode);
  vi.stubGlobal('document', { createElement: vi.fn(() => canvas) });
  return { decode, bitmap, drawImage, canvas, toBlob };
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('foto pequena de perfil', () => {
  it('aceita somente os três tipos de foto e rejeita arquivos vazios ou acima de 10 MB', async () => {
    expect(PHOTO_INPUT_ACCEPT).toBe('image/jpeg,image/png,image/webp');
    const { decode } = mockCanvas();
    for (const type of ['image/svg+xml', 'image/gif', 'application/octet-stream']) {
      await expect(preprocessProfilePhoto(new File(['fake'], 'foto', { type }))).rejects.toThrow(/JPG, PNG ou WebP/);
    }
    await expect(preprocessProfilePhoto(new File([], 'vazio.png', { type: 'image/png' }))).rejects.toThrow(/válida/);
    await expect(preprocessProfilePhoto(new File([new Uint8Array(MAX_PROFILE_PHOTO_INPUT_BYTES + 1)], 'grande.png', { type: 'image/png' }))).rejects.toThrow(/10 MB/);
    expect(decode).not.toHaveBeenCalled();
  });

  it('rejeita conteúdo falso e PNG enviado com tipo JPEG antes de decodificar', async () => {
    const { decode } = mockCanvas();
    await expect(preprocessProfilePhoto(new File(['<svg></svg>'], 'foto.png', { type: 'image/png' }))).rejects.toThrow(/válida/);
    await expect(preprocessProfilePhoto(new File([png(100, 100)], 'foto.jpg', { type: 'image/jpeg' }))).rejects.toThrow(/válida/);
    expect(decode).not.toHaveBeenCalled();
  });

  it.each([png(20_001, 1), png(8000, 6000), jpeg(20_001, 1), webp(8000, 6000, 'VP8X'), webp(8000, 6000, 'VP8L'), webp(8000, 6000, 'VP8 ')])('barra dimensões excessivas antes de alocar a imagem %#', async file => {
    const { decode } = mockCanvas();
    await expect(preprocessProfilePhoto(file)).rejects.toThrow(/dimensões muito grandes/);
    expect(decode).not.toHaveBeenCalled();
  });

  it('verifica dimensões dos frames WebP além do tamanho declarado do canvas', async () => {
    const header = new Uint8Array(await webp(1, 1, 'VP8X').arrayBuffer());
    const bytes = new Uint8Array(header.length + 24);
    bytes.set(header);
    const view = new DataView(bytes.buffer);
    view.setUint32(4, bytes.length - 8, true);
    bytes.set(new TextEncoder().encode('ANMF'), header.length);
    view.setUint32(header.length + 4, 16, true);
    // A tiny declared canvas cannot conceal a 48-megapixel animation frame.
    for (let i = 0; i < 3; i++) { bytes[header.length + 14 + i] = 7999 >>> (8 * i); bytes[header.length + 17 + i] = 5999 >>> (8 * i); }
    const { decode } = mockCanvas();
    await expect(preprocessProfilePhoto(new File([bytes], 'animacao.webp', { type: 'image/webp' }))).rejects.toThrow(/dimensões muito grandes/);
    expect(decode).not.toHaveBeenCalled();
  });

  it.each([png(1600, 900), jpeg(1600, 900), webp(1600, 900, 'VP8X'), webp(1600, 900, 'VP8L'), webp(1600, 900, 'VP8 ')])('gera recorte central quadrado e fecha os recursos %#', async file => {
    const { decode, bitmap, drawImage, canvas, toBlob } = mockCanvas();
    const blob = await preprocessProfilePhoto(file);
    expect(decode).toHaveBeenCalledWith(file, { imageOrientation: 'from-image' });
    expect(drawImage).toHaveBeenCalledWith(bitmap, 350, 0, 900, 900, 0, 0, 512, 512);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.85);
    expect(blob.type).toBe('image/webp');
    expect(blob.size).toBe(10_000);
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });

  it('não amplia fotos pequenas e considera dimensões orientadas do decoder', async () => {
    const { bitmap, drawImage } = mockCanvas(120, 80);
    await preprocessProfilePhoto(jpeg(80, 120));
    expect(drawImage).toHaveBeenCalledWith(bitmap, 20, 0, 80, 80, 0, 0, 80, 80);
  });

  it('também valida as dimensões decodificadas e fecha o bitmap se forem excessivas', async () => {
    const { bitmap, drawImage } = mockCanvas(8000, 6000);
    await expect(preprocessProfilePhoto(png(10, 10))).rejects.toThrow(/dimensões muito grandes/);
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(drawImage).not.toHaveBeenCalled();
  });

  it('reduz qualidade e tamanho com limite finito quando a primeira saída é muito pesada', async () => {
    const { drawImage, toBlob, bitmap } = mockCanvas(1600, 900, [400_000, 400_000, 400_000, 200_000]);
    const blob = await preprocessProfilePhoto(png(1600, 900));
    expect(blob.size).toBe(200_000);
    expect(drawImage).toHaveBeenNthCalledWith(2, bitmap, 350, 0, 900, 900, 0, 0, 384, 384);
    expect(toBlob).toHaveBeenCalledTimes(4);
  });

  it('libera bitmap e canvas mesmo se o navegador não codificar WebP', async () => {
    const { bitmap, canvas } = mockCanvas(1600, 900, [1000], 'image/png');
    await expect(preprocessProfilePhoto(png(1600, 900))).rejects.toThrow(/navegador/);
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(canvas.width).toBe(0);
  });

  it('encerra tentativas e libera recursos se nenhuma compressão couber no limite', async () => {
    const { bitmap, canvas, toBlob } = mockCanvas(1600, 900, [400_000]);
    await expect(preprocessProfilePhoto(png(1600, 900))).rejects.toThrow(/reduzir/);
    expect(toBlob).toHaveBeenCalledTimes(9);
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(canvas.width).toBe(0);
  });

  it('libera URL temporária no caminho sem createImageBitmap', async () => {
    const { drawImage } = mockCanvas(1600, 900);
    vi.stubGlobal('createImageBitmap', undefined);
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:foto-local');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    class FakeImage {
      naturalWidth = 1600;
      naturalHeight = 900;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      sources: string[] = [];
      set src(value: string) { this.sources.push(value); if (value) queueMicrotask(() => this.onload?.()); }
    }
    const image = new FakeImage();
    vi.stubGlobal('Image', class { constructor() { return image; } });
    await preprocessProfilePhoto(png(1600, 900));
    expect(create).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:foto-local');
    expect(image.sources).toEqual(['blob:foto-local', '']);
    expect(image.onload).toBeNull();
    expect(drawImage).toHaveBeenCalledWith(image, 350, 0, 900, 900, 0, 0, 512, 512);
  });

  it('libera URL e handlers se a imagem de fallback não carregar', async () => {
    mockCanvas();
    vi.stubGlobal('createImageBitmap', undefined);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:foto-corrompida');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    class BadImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(value: string) { if (value) queueMicrotask(() => this.onerror?.()); }
    }
    const image = new BadImage();
    vi.stubGlobal('Image', class { constructor() { return image; } });
    await expect(preprocessProfilePhoto(png(100, 100))).rejects.toThrow(/válida/);
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:foto-corrompida');
    expect(image.onload).toBeNull();
    expect(image.onerror).toBeNull();
  });
});
