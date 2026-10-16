import sharp from "sharp";

export const FULL_MAX_PX = 1600;
export const THUMB_MAX_PX = 400;
const MAX_INPUT_PIXELS = 40_000_000; // ~6300 x 6300; refuses decompression bombs

export interface ProcessedImage {
  full: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
  /** Dominant colour (#rrggbb), shown while the image loads. */
  color: string;
}

export class UnreadableImageError extends Error {}

/**
 * Turns an uploaded photo into what we store and serve: a WebP at most
 * 1600 px on its longest side and a 400 px thumbnail. Applies the EXIF
 * orientation, then drops all metadata (sharp writes none unless asked), so
 * EXIF and GPS location never reach other people. Animated images keep their
 * first frame.
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  let base: sharp.Sharp;
  try {
    base = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, animated: false, failOn: "error" }).rotate();
    await base.clone().metadata();
  } catch {
    throw new UnreadableImageError("That file isn't an image we can read.");
  }
  try {
    const full = await base
      .clone()
      .resize(FULL_MAX_PX, FULL_MAX_PX, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    const thumb = await sharp(full.data)
      .resize(THUMB_MAX_PX, THUMB_MAX_PX, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 76 })
      .toBuffer();
    const { dominant } = await sharp(thumb).stats();
    const hex = (n: number) => n.toString(16).padStart(2, "0");
    return {
      full: full.data,
      thumb,
      width: full.info.width,
      height: full.info.height,
      color: `#${hex(dominant.r)}${hex(dominant.g)}${hex(dominant.b)}`,
    };
  } catch {
    throw new UnreadableImageError("That file isn't an image we can read.");
  }
}
