export const ERROR_DIFFUSION_KERNELS = Object.freeze({
  'floyd-steinberg': Object.freeze({
    denominator: 16,
    offsets: Object.freeze([[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]])
  }),
  atkinson: Object.freeze({
    denominator: 8,
    offsets: Object.freeze([[1, 0, 1], [2, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1], [0, 2, 1]])
  }),
  'jarvis-judice-ninke': Object.freeze({
    denominator: 48,
    offsets: Object.freeze([
      [1, 0, 7], [2, 0, 5],
      [-2, 1, 3], [-1, 1, 5], [0, 1, 7], [1, 1, 5], [2, 1, 3],
      [-2, 2, 1], [-1, 2, 3], [0, 2, 5], [1, 2, 3], [2, 2, 1]
    ])
  }),
  stucki: Object.freeze({
    denominator: 42,
    offsets: Object.freeze([
      [1, 0, 8], [2, 0, 4],
      [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2],
      [-2, 2, 1], [-1, 2, 2], [0, 2, 4], [1, 2, 2], [2, 2, 1]
    ])
  }),
  burkes: Object.freeze({
    denominator: 32,
    offsets: Object.freeze([
      [1, 0, 8], [2, 0, 4],
      [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2]
    ])
  }),
  sierra: Object.freeze({
    denominator: 32,
    offsets: Object.freeze([
      [1, 0, 5], [2, 0, 3],
      [-2, 1, 2], [-1, 1, 4], [0, 1, 5], [1, 1, 4], [2, 1, 2],
      [-1, 2, 2], [0, 2, 3], [1, 2, 2]
    ])
  }),
  'sierra-lite': Object.freeze({
    denominator: 4,
    offsets: Object.freeze([[1, 0, 2], [-1, 1, 1], [0, 1, 1]])
  })
});
