import {validateImageData} from '../engine/validation.mjs';
import {processImage} from '../engine/registry.mjs';
import {processColorImage} from '../engine/color/color-diffusion.mjs';
import {DEFAULT_ADJUSTMENTS, validateAdjustments, adjustImage} from '../engine/color/color-adjustments.mjs';
import {hexToRGB} from '../engine/color/color-space.mjs';
import {DEFAULT_GEOMETRY, validateGeometry, isIdentityGeometry, transformImage} from './transforms.mjs';
import {isNeutralAdjustments} from './adjustments.mjs';

function backgroundRGB(background) {
  if (typeof background === 'string') return hexToRGB(background);
  if (Array.isArray(background) || background instanceof Uint8Array || background instanceof Uint8ClampedArray) {
    return Array.from(background).slice(0, 3);
  }
  throw new TypeError('Background must be a hexadecimal string or an RGB array.');
}

/**
 * Deterministic, non-destructive processing pipeline:
 *
 *   decoded source
 *     -> geometry transform
 *     -> tonal/color adjustments
 *     -> palette quantization and dithering
 *     -> output buffer
 *
 * The decoded source is never modified. The same configuration and source
 * always produce the same output buffer.
 */
export function processEditorImage(image, {
  geometry = DEFAULT_GEOMETRY,
  adjustments = DEFAULT_ADJUSTMENTS,
  mode = 'monochrome',
  algorithm = 'floyd-steinberg',
  options = {},
  palette,
  paletteMethod = 'rgb',
  alphaMode = 'preserve',
  background = '#FFFFFF'
} = {}) {
  validateImageData(image);
  const geometryValue = validateGeometry(geometry);
  const adjustmentValue = validateAdjustments(adjustments);

  const transformed = isIdentityGeometry(geometryValue)
    ? image
    : transformImage(image, geometryValue);

  const backgroundValue = backgroundRGB(background);
  const adjusted = isNeutralAdjustments(adjustmentValue)
    ? transformed
    : adjustImage(transformed, adjustmentValue, {
        alphaMode: mode === 'color' ? alphaMode : 'preserve',
        background: backgroundValue
      });

  if (mode === 'color') {
    return processColorImage(adjusted, {
      ...options,
      palette: palette ?? options.palette,
      method: paletteMethod ?? options.method,
      algorithm,
      alphaMode,
      background: backgroundValue,
      adjustments: DEFAULT_ADJUSTMENTS
    });
  }
  if (mode === 'monochrome') {
    return processImage(adjusted, algorithm, options);
  }
  throw new RangeError(`Unknown processing mode: ${mode}`);
}
