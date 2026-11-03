const palette = (id, name, category, description, colors, source = 'original') => Object.freeze({
  id, name, category, description, colors:Object.freeze(colors), colorCount:colors.length,
  source, editable:false, builtIn:true
});

const grayscale = count => Array.from({length:count}, (_, index) => {
  const value = Math.round(index * 255 / (count - 1)).toString(16).padStart(2,'0');
  return `#${value}${value}${value}`.toUpperCase();
});
const rgb332 = Array.from({length:256}, (_, value) => {
  const r = ((value >> 5) & 7) * 255 / 7;
  const g = ((value >> 2) & 7) * 255 / 7;
  const b = (value & 3) * 255 / 3;
  return `#${[r,g,b].map(channel => Math.round(channel).toString(16).padStart(2,'0')).join('')}`.toUpperCase();
});
const webSafe = [];
for (const r of [0,51,102,153,204,255]) for (const g of [0,51,102,153,204,255]) for (const b of [0,51,102,153,204,255]) {
  webSafe.push(`#${[r,g,b].map(channel => channel.toString(16).padStart(2,'0')).join('')}`.toUpperCase());
}

export const BUILT_IN_PALETTES = Object.freeze([
  palette('black-white','Black and White','Classic','Two neutral endpoints.', ['#000000','#FFFFFF']),
  palette('grayscale-4','Grayscale 4','Classic','Four evenly spaced neutral tones.', grayscale(4)),
  palette('grayscale-8','Grayscale 8','Classic','Eight evenly spaced neutral tones.', grayscale(8)),
  palette('grayscale-16','Grayscale 16','Classic','Sixteen evenly spaced neutral tones.', grayscale(16)),
  palette('game-boy-classic','Game Boy Classic','Retro Computing','Original DMG-inspired four-tone green palette.', ['#0F380F','#306230','#8BAC0F','#9BBC0F'], 'hardware-inspired'),
  palette('game-boy-pocket','Game Boy Pocket','Retro Computing','Neutral four-tone palette inspired by the Pocket LCD.', ['#000000','#555555','#AAAAAA','#FFFFFF'], 'hardware-inspired'),
  palette('cga','CGA Palette','Retro Computing','Classic 16-entry CGA RGBI color set, assembled across display modes.', ['#000000','#0000AA','#00AA00','#00AAAA','#AA0000','#AA00AA','#AA5500','#AAAAAA','#555555','#5555FF','#55FF55','#55FFFF','#FF5555','#FF55FF','#FFFF55','#FFFFFF'], 'historical-variant'),
  palette('commodore-64','Commodore 64','Retro Computing','Classic 16-color C64 palette; RGB values follow the common Pepto palette variant.', ['#000000','#FFFFFF','#813338','#75CEC8','#8E3C97','#56AC4D','#2E2C9B','#EDF171','#8E5029','#553800','#C46C71','#4A4A4A','#7B7B7B','#A9FF9F','#706DEB','#B2B2B2'], 'historical-variant'),
  palette('pico-8','PICO-8','Retro Computing','The standard 16-color PICO-8 palette.', ['#000000','#1D2B53','#7E2553','#008751','#AB5236','#5F574F','#C2C3C7','#FFF1E8','#FF004D','#FFA300','#FFEC27','#00E436','#29ADFF','#83769C','#FF77A8','#FFCCAA'], 'documented-standard'),
  palette('warm-sepia','Warm Sepia','Artistic','Original brown-to-ivory tonal palette.', ['#24140E','#573421','#96613D','#C39469','#E7D1AE']),
  palette('cool-duotone','Cool Duotone','Artistic','Original midnight-blue and ice palette.', ['#101A2D','#2F5572','#79AFC0','#E4F0EC']),
  palette('cyberpunk-neon','Cyberpunk Neon','Artistic','Original neon cyan, violet and rose palette.', ['#100B2E','#3D1A78','#00E5FF','#F72585','#F8F7FF']),
  palette('sunset','Sunset','Artistic','Original dusk gradient colors.', ['#32113A','#793C62','#D45B55','#F69E52','#F9D78A']),
  palette('forest','Forest','Artistic','Original woodland greens and earth tones.', ['#15291B','#315B36','#6D8B45','#B4AA67','#E2D9AE']),
  palette('ocean','Ocean','Artistic','Original deep-sea blue and aqua tones.', ['#102B3F','#155B72','#258F9C','#62C6B7','#D3EBDD']),
  palette('pastel','Pastel','Artistic','Original soft pastel colors.', ['#5B5368','#8C718F','#C49BA8','#E8BFAF','#F4E2C8','#A8C6B2']),
  palette('high-contrast','High Contrast','Artistic','Original high-contrast ink and signal colors.', ['#090909','#F8F8F2','#E63946','#277DA1','#F4A261']),
  palette('rgb332','RGB332','Technical','Full 3:3:2-bit RGB cube (256 colors).', rgb332, 'technical-standard'),
  palette('web-safe','Web-safe','Technical','The 216-color browser-safe RGB cube.', webSafe, 'technical-standard')
]);

export const PALETTE_CATEGORIES = Object.freeze(['Classic','Retro Computing','Artistic','Technical','Custom']);
