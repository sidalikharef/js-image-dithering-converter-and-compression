/**
 * Geometry transforms are expressed as a canonical pair:
 *   {rotation: 0|90|180|270, mirrored: boolean}
 *
 * The transform is applied as a horizontal mirror (when mirrored) followed by a
 * clockwise rotation. Any sequence of rotate/flip operations can be reduced to
 * this canonical form, which keeps history, presets and session data compact.
 */
export const DEFAULT_GEOMETRY = Object.freeze({rotation: 0, mirrored: false});

export const GEOMETRY_OPERATIONS = Object.freeze([
  'rotate-cw', 'rotate-ccw', 'rotate-180', 'flip-h', 'flip-v', 'reset'
]);

const ROTATIONS = new Set([0, 90, 180, 270]);

function validateImage(image) {
  const {data, width, height} = image ?? {};
  const count = width * height;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
    || !Number.isSafeInteger(count) || !data || data.length !== count * 4) {
    throw new RangeError('Invalid RGBA image buffer.');
  }
}

export function validateGeometry(geometry = DEFAULT_GEOMETRY) {
  if (!geometry || typeof geometry !== 'object' || Array.isArray(geometry)) {
    throw new TypeError('Geometry must be an object.');
  }
  const rotation = geometry.rotation ?? 0;
  if (!ROTATIONS.has(rotation)) {
    throw new RangeError('Geometry rotation must be 0, 90, 180, or 270 degrees.');
  }
  const mirrored = geometry.mirrored ?? false;
  if (typeof mirrored !== 'boolean') {
    throw new TypeError('Geometry mirrored must be a boolean.');
  }
  return {rotation, mirrored};
}

export function isIdentityGeometry(geometry = DEFAULT_GEOMETRY) {
  const value = validateGeometry(geometry);
  return value.rotation === 0 && !value.mirrored;
}

/**
 * Compose an operation after the current transform.
 * `flip-v` is equivalent to a horizontal mirror followed by a 180° rotation.
 */
export function applyGeometryOperation(geometry, operation) {
  const current = validateGeometry(geometry);
  const rotation = current.rotation;
  const mirrored = current.mirrored;
  switch (operation) {
    case 'rotate-cw':
      return {rotation: (rotation + 90) % 360, mirrored};
    case 'rotate-ccw':
      return {rotation: (rotation + 270) % 360, mirrored};
    case 'rotate-180':
      return {rotation: (rotation + 180) % 360, mirrored};
    case 'flip-h':
      return {rotation: (360 - rotation) % 360, mirrored: !mirrored};
    case 'flip-v':
      return {rotation: (180 - rotation + 360) % 360, mirrored: !mirrored};
    case 'reset':
      return {...DEFAULT_GEOMETRY};
    default:
      throw new RangeError(`Unknown geometry operation: ${operation}`);
  }
}

export function transformedDimensions(width, height, geometry = DEFAULT_GEOMETRY) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new RangeError('Image dimensions must be positive integers.');
  }
  const value = validateGeometry(geometry);
  return value.rotation === 90 || value.rotation === 270
    ? {width: height, height: width}
    : {width, height};
}

export function geometryLabel(geometry = DEFAULT_GEOMETRY) {
  const value = validateGeometry(geometry);
  if (value.rotation === 0 && !value.mirrored) return 'Original orientation';
  const parts = [];
  if (value.rotation) parts.push(`${value.rotation}° clockwise`);
  if (value.mirrored) parts.push('mirrored');
  return parts.join(' · ');
}

function copyImage(image) {
  return {
    data: new Uint8ClampedArray(image.data),
    width: image.width,
    height: image.height
  };
}

function flipHorizontal(image) {
  const {data, width, height} = image;
  const output = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const source = (row + x) * 4;
      const target = (row + (width - 1 - x)) * 4;
      output[target] = data[source];
      output[target + 1] = data[source + 1];
      output[target + 2] = data[source + 2];
      output[target + 3] = data[source + 3];
    }
  }
  return {data: output, width, height};
}

function rotate(image, rotation) {
  const {data, width, height} = image;
  if (rotation === 0) return copyImage(image);
  const outputWidth = rotation === 180 ? width : height;
  const outputHeight = rotation === 180 ? height : width;
  const output = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const source = (y * width + x) * 4;
      let targetX;
      let targetY;
      if (rotation === 90) {
        targetX = height - 1 - y;
        targetY = x;
      } else if (rotation === 180) {
        targetX = width - 1 - x;
        targetY = height - 1 - y;
      } else {
        targetX = y;
        targetY = width - 1 - x;
      }
      const target = (targetY * outputWidth + targetX) * 4;
      output[target] = data[source];
      output[target + 1] = data[source + 1];
      output[target + 2] = data[source + 2];
      output[target + 3] = data[source + 3];
    }
  }
  return {data: output, width: outputWidth, height: outputHeight};
}

/**
 * Apply a canonical geometry to a fresh RGBA buffer. The source buffer is never
 * mutated, and the operation is deterministic for identical inputs.
 */
export function transformImage(image, geometry = DEFAULT_GEOMETRY) {
  validateImage(image);
  const value = validateGeometry(geometry);
  const mirrored = value.mirrored ? flipHorizontal(image) : copyImage(image);
  return rotate(mirrored, value.rotation);
}
