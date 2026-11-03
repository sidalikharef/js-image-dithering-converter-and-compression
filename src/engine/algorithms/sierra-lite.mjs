import {diffuseError} from '../utilities/error-diffusion.mjs';
import {ERROR_DIFFUSION_KERNELS} from '../utilities/kernels.mjs';

export const sierraLite = (image, settings) => diffuseError(image, settings, ERROR_DIFFUSION_KERNELS['sierra-lite']);
