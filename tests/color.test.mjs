import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hexToRGB, rgbToHex, rgbToLinearRGB, linearRGBToRGB, srgbToLinear, linearToSrgb,
  rgbToLab, labToRGB, colorDistance, preparePalette, quantizeColor, quantizeImage,
  processColorImage, BUILT_IN_PALETTES, getPalette, listPalettes, validatePaletteColors,
  parsePaletteJSON, serializePaletteJSON, createCustomPalette, updateCustomPalette,
  savePalettes, loadPalettes, parseStoredPalettes, CUSTOM_PALETTE_STORAGE_KEY,
  medianCut, kMeans, extractPalette, adjustColor, adjustImage, DEFAULT_ADJUSTMENTS,
  COLOR_PRESETS
} from '../src/engine/index.mjs';
import {ALGORITHMS, processImage} from '../src/engine/registry.mjs';
import {createHistory} from '../src/engine/history.mjs';

function image(width,height,pixelAt) {
  const data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)data.set(pixelAt(x,y), (y*width+x)*4);
  return {data,width,height};
}

const gradient=image(24,16,(x,y)=>[Math.round(x/23*255),Math.round(y/15*255),Math.round((x+y)/38*255),255]);
const twoTone=image(16,8,(x)=>x<8?[20,50,220,255]:[240,180,30,255]);
const palette=['#000000','#FFFFFF','#FF0000','#00FF00','#0000FF'];

test('sRGB hex and channel conversions validate inputs and round-trip representative colors',()=>{
  assert.deepEqual(hexToRGB('#abc'),[170,187,204]);
  assert.deepEqual(hexToRGB('336699'),[51,102,153]);
  assert.equal(rgbToHex([171,205,239]),'#ABCDEF');
  assert.ok(Math.abs(srgbToLinear(10)-10/255/12.92)<1e-12);
  assert.ok(Math.abs(linearToSrgb(srgbToLinear(180))-180)<=1);
  for(const color of [[0,0,0],[255,255,255],[12,128,247]]) {
    assert.ok(linearRGBToRGB(rgbToLinearRGB(color)).every((value,index)=>Math.abs(value-color[index])<=1));
  }
  assert.throws(()=>hexToRGB('#xyz'),/hexadecimal/);
  assert.throws(()=>rgbToHex([256,0,0]),/between 0 and 255/);
});

test('CIELAB uses D65/2-degree reference white and converts known colors',()=>{
  const white=rgbToLab([255,255,255]);
  assert.ok(Math.abs(white[0]-100)<1e-3);
  assert.ok(Math.abs(white[1])<1e-3&&Math.abs(white[2])<1e-3);
  const red=rgbToLab([255,0,0]);
  assert.ok(Math.abs(red[0]-53.24)<.1);
  assert.ok(Math.abs(red[1]-80.09)<.2);
  assert.ok(Math.abs(red[2]-67.20)<.2);
  assert.ok(labToRGB(red).every((value,index)=>Math.abs(value-[255,0,0][index])<=1));
});

test('distance measures are explicit and use RGB, linear-light RGB, and Lab ΔE76',()=>{
  assert.ok(Math.abs(colorDistance([0,0,0],[255,255,255],'rgb')-Math.sqrt(195075))<1e-9);
  assert.ok(Math.abs(colorDistance([0,0,0],[255,255,255],'linear-rgb')-Math.sqrt(3))<1e-12);
  assert.ok(Math.abs(colorDistance([0,0,0],[255,255,255],'lab76')-100)<1e-3);
  assert.throws(()=>preparePalette([[0,0,0]],'perceptual'),/Unknown color-distance/);
});

test('palette quantization returns only exact palette entries and preserves alpha by default',()=>{
  const result=quantizeColor([245,10,5],palette);
  assert.ok(palette.includes(rgbToHex(result)));
  const source=image(3,1,(x)=>[[245,10,5,255],[0,255,0,90],[80,80,80,0]][x]);
  const output=quantizeImage(source,palette);
  for(let i=0;i<output.data.length;i+=4) {
    if(output.data[i+3])assert.ok(palette.includes(rgbToHex([...output.data.slice(i,i+3)])));
  }
  assert.equal(output.data[7],90);
  assert.deepEqual([...output.data.slice(8,12)],[0,0,0,0]);
  const opaque=quantizeImage(source,palette,{alphaMode:'opaque'});
  assert.equal(opaque.data[11],255);
  assert.throws(()=>quantizeImage(source,['#000000']),/Palette/);
});

test('all nine algorithms process color fixtures deterministically into palette colors',()=>{
  for(const {id} of ALGORITHMS) {
    const original=gradient.data.slice();
    const options={palette,algorithm:id,method:'lab76',seed:42,randomness:.7,orderedStrength:.8,serpentine:true};
    const first=processColorImage(gradient,options);
    const second=processColorImage(gradient,options);
    assert.deepEqual(first.data,second.data,id);
    assert.equal(first.width,gradient.width);
    assert.equal(first.height,gradient.height);
    assert.deepEqual(gradient.data,original,`${id} mutated its input`);
    for(let offset=0;offset<first.data.length;offset+=4) {
      const alpha=first.data[offset+3];
      assert.ok(alpha===0||alpha===255);
      if(alpha)assert.ok(palette.includes(rgbToHex([...first.data.slice(offset,offset+3)])),`${id} emitted a non-palette color`);
    }
  }
});

test('color Bayer strength zero equals plain palette quantization and ordered strength makes a pattern',()=>{
  const solid=image(8,8,()=>[128,128,128,255]);
  const plain=processColorImage(solid,{palette:['#000000','#FFFFFF'],algorithm:'bayer',orderedStrength:0});
  const quantized=quantizeImage(solid,['#000000','#FFFFFF']);
  assert.deepEqual(plain.data,quantized.data);
  const ordered=processColorImage(solid,{palette:['#000000','#FFFFFF'],algorithm:'bayer',matrixSize:4,orderedStrength:1});
  assert.equal(new Set(Array.from({length:64},(_,i)=>rgbToHex([...ordered.data.slice(i*4,i*4+3)]))).size,2);
});

test('seeded color randomness reproduces a pattern, varies by seed, and has a zero-strength baseline',()=>{
  const solid=image(48,24,()=>[128,128,128,255]);
  const settings={palette:['#000000','#FFFFFF'],algorithm:'random',randomness:1,seed:123};
  const one=processColorImage(solid,settings),repeat=processColorImage(solid,settings);
  const other=processColorImage(solid,{...settings,seed:124});
  assert.deepEqual(one.data,repeat.data);
  assert.notDeepEqual(one.data,other.data);
  assert.deepEqual(processColorImage(solid,{...settings,randomness:0}).data,quantizeImage(solid,settings.palette).data);
});

test('color serpentine diffusion mirrors row traversal and respects transparent boundaries',()=>{
  const transparency=image(7,4,(x,y)=>x===3?[255,0,255,0]:[x*32,y*48,128,255]);
  const options={palette,algorithm:'floyd-steinberg',strength:1};
  const straight=processColorImage(transparency,options);
  const serpentine=processColorImage(transparency,{...options,serpentine:true});
  assert.notDeepEqual(serpentine.data,straight.data);
  for(let y=0;y<4;y++)assert.equal(serpentine.data[(y*7+3)*4+3],0);
  assert.throws(()=>processColorImage(transparency,{...options,serpentine:'yes'}),/boolean/);
});

test('transparent RGB never contaminates neighbors and composite/opaque modes are explicit',()=>{
  const transparent=image(3,1,(x)=>x===1?[255,0,0,0]:[120,120,120,255]);
  const kept=processColorImage(transparent,{palette:['#000000','#FFFFFF'],algorithm:'floyd-steinberg'});
  assert.deepEqual([...kept.data.slice(4,8)],[0,0,0,0]);
  const opaque=processColorImage(transparent,{palette:['#000000','#FFFFFF'],alphaMode:'opaque'});
  assert.equal(opaque.data[7],255);
  const composite=processColorImage(transparent,{palette:['#000000','#FFFFFF'],alphaMode:'composite',background:'#000000'});
  assert.equal(composite.data[7],255);
  const hiddenA=image(2,1,(x)=>x===0?[255,0,0,0]:[100,100,100,255]);
  const hiddenB=image(2,1,(x)=>x===0?[0,255,255,0]:[100,100,100,255]);
  const opaqueA=processColorImage(hiddenA,{palette:['#000000','#FFFFFF'],alphaMode:'opaque',background:'#FFFFFF'});
  const opaqueB=processColorImage(hiddenB,{palette:['#000000','#FFFFFF'],alphaMode:'opaque',background:'#FFFFFF'});
  assert.deepEqual(opaqueA.data,opaqueB.data);
});

test('built-in palettes have valid unique colors and categories',()=>{
  assert.ok(BUILT_IN_PALETTES.length>=18);
  for(const item of BUILT_IN_PALETTES) {
    assert.equal(item.colorCount,item.colors.length);
    assert.ok(item.id&&item.name&&item.category&&item.description);
    assert.equal(item.builtIn,true);
    assert.equal(validatePaletteColors(item.colors).length,item.colors.length);
  }
  assert.equal(getPalette('game-boy-classic').colors.length,4);
  assert.equal(getPalette('pico-8').colors.length,16);
  assert.equal(listPalettes('Artistic').length,8);
  assert.equal(getPalette('web-safe').colors.length,216);
  assert.equal(getPalette('rgb332').colors.length,256);
});

test('custom palette validation enforces size, hex, uniqueness, names, and JSON schema',()=>{
  assert.throws(()=>validatePaletteColors(['#000000','#000000']),/duplicates/);
  assert.throws(()=>validatePaletteColors(['#GGGGGG','#FFFFFF']),/hexadecimal/);
  assert.throws(()=>validatePaletteColors(['#000000']),/2–256/);
  assert.throws(()=>validatePaletteColors(Array.from({length:257},(_,i)=>`#${i.toString(16).padStart(6,'0')}`)),/2–256/);
  const json=serializePaletteJSON({name:'Test',colors:['#000000','#FFFFFF']});
  assert.deepEqual(parsePaletteJSON(json),{schemaVersion:1,name:'Test',colors:['#000000','#FFFFFF']});
  assert.throws(()=>parsePaletteJSON('{"schemaVersion":2}'),/schemaVersion/);
  assert.throws(()=>parsePaletteJSON('{'),/valid JSON/);
  assert.throws(()=>parsePaletteJSON('x'.repeat(65*1024)),/64 KiB/);
  const custom=createCustomPalette('Night', ['#000000','#FFFFFF']);
  assert.equal(updateCustomPalette(custom,{name:'Night Shift'}).name,'Night Shift');
});

test('palette persistence serializes validated local entries and tolerates corrupted storage',()=>{
  const values=new Map();
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  const palette=createCustomPalette('Local',['#000000','#B6F36B']);
  assert.equal(savePalettes([palette],storage),true);
  assert.equal(values.has(CUSTOM_PALETTE_STORAGE_KEY),true);
  assert.equal(loadPalettes(storage)[0].name,'Local');
  assert.deepEqual(parseStoredPalettes('{broken'),[]);
  assert.equal(savePalettes([], {setItem(){throw Object.assign(new Error('quota'),{name:'QuotaExceededError'});}}),false);
});

test('Median Cut and deterministic K-Means handle gradients, limited colors, and transparent images',()=>{
  assert.ok(medianCut(gradient,8).length<=8);
  assert.deepEqual(new Set(medianCut(twoTone,8)),new Set(['#1432DC','#F0B41E']));
  assert.deepEqual(medianCut(image(3,1,()=>[45,60,90,255]),8),['#2D3C5A']);
  const first=kMeans(gradient,8,{seed:12}),repeat=kMeans(gradient,8,{seed:12});
  assert.deepEqual(first,repeat);
  assert.ok(first.length<=8);
  assert.deepEqual(new Set(kMeans(twoTone,16)),new Set(['#1432DC','#F0B41E']));
  const transparent=image(2,1,()=>[0,0,0,0]);
  assert.throws(()=>medianCut(transparent,4),/non-transparent/);
  const result=extractPalette(gradient,{method:'k-means',colorCount:4,seed:9});
  assert.equal(result.method,'k-means');
  assert.equal(result.colors.length,4);
  assert.ok(result.durationMs>=0);
  assert.throws(()=>medianCut(gradient,1),/between 2 and 256/);
});

test('all adjustments preserve neutral RGB and independently alter source pixels',()=>{
  const source=[90,140,210];
  assert.deepEqual(adjustColor(source,DEFAULT_ADJUSTMENTS),source);
  const variants=[
    {brightness:.2},{contrast:1.8},{saturation:0},{gamma:1.8},{exposure:1},
    {hue:90},{temperature:.8},{tint:.8}
  ];
  for(const settings of variants)assert.notDeepEqual(adjustColor(source,settings),source,JSON.stringify(settings));
  const rgba=image(1,1,()=>[90,140,210,120]);
  assert.deepEqual([...adjustImage(rgba,DEFAULT_ADJUSTMENTS).data],[90,140,210,120]);
  assert.equal(adjustImage(rgba,{brightness:.2},{alphaMode:'opaque'}).data[3],255);
  assert.throws(()=>adjustColor(source,{gamma:0}),/gamma/);
});

test('color presets are backed by real registered palettes and preserve legacy monochrome mode',()=>{
  assert.equal(processImage(gradient,'floyd-steinberg').width,gradient.width);
  assert.equal(COLOR_PRESETS.length,8);
  for(const preset of COLOR_PRESETS) {
    assert.equal(preset.settings.mode,'color');
    if(preset.settings.paletteId!=='adaptive')assert.ok(BUILT_IN_PALETTES.some(item=>item.id===preset.settings.paletteId));
  }
  const config={mode:'color',paletteId:'pico-8',paletteColors:getPalette('pico-8').colors};
  const history=createHistory(config);
  history.push({...config,paletteId:'game-boy-classic',paletteColors:getPalette('game-boy-classic').colors});
  assert.deepEqual(history.undo(),config);
  assert.deepEqual(history.redo().paletteColors,getPalette('game-boy-classic').colors);
});
