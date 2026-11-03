const EXTENSIONS = Object.freeze({png:'png', jpeg:'jpg', webp:'webp', avif:'avif'});

export function safeOutputFilename(input, format, usedNames = new Set()) {
  const extension = EXTENSIONS[format];
  if (!extension) throw new RangeError(`Unsupported export format: ${format}`);
  const raw = String(input ?? 'image').split(/[\\/]/).pop() || 'image';
  const stem = raw.replace(/\.[^.]*$/, '').normalize('NFC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"|?*]/g, '_')
    .replace(/^\.+|\.+$/g, '')
    .trim().slice(0,160) || 'image';
  let name = `${stem}.${extension}`;
  let suffix = 2;
  while (usedNames.has(name.toLocaleLowerCase())) name = `${stem} (${suffix++}).${extension}`;
  usedNames.add(name.toLocaleLowerCase());
  return name;
}
