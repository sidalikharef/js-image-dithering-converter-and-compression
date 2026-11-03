const encoder = new TextEncoder();
const CRC_TABLE = new Uint32Array(256);
for (let index=0; index<256; index++) {
  let value=index;
  for (let bit=0; bit<8; bit++) value = value & 1 ? 0xEDB88320 ^ (value >>> 1) : value >>> 1;
  CRC_TABLE[index]=value >>> 0;
}

function crc32(bytes) {
  let crc=0xFFFFFFFF;
  for (const byte of bytes) crc=CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function write16(view,offset,value) { view.setUint16(offset,value,true); }
function write32(view,offset,value) { view.setUint32(offset,value,true); }

export async function createStoredZip(entries, {signal, maxBytes = 512 * 1024 * 1024, onProgress = () => {}} = {}) {
  if (!Array.isArray(entries) || entries.length > 65_535) throw new RangeError('ZIP supports at most 65,535 entries.');
  const localParts=[];
  const centralParts=[];
  let offset=0;
  let processed=0;
  const seen=new Set();

  for (const entry of entries) {
    if (signal?.aborted) throw new DOMException('ZIP creation cancelled.','AbortError');
    const name=String(entry.name ?? '');
    if (!name || name.includes('/') || name.includes('\\') || name === '.' || name === '..') {
      throw new TypeError('ZIP entry names must be safe leaf filenames.');
    }
    const encodedName=encoder.encode(name);
    if (encodedName.length > 65_535) throw new RangeError('ZIP filename is too long.');
    if (seen.has(name.toLocaleLowerCase())) throw new TypeError(`Duplicate ZIP entry name: ${name}`);
    seen.add(name.toLocaleLowerCase());
    if (!(entry.data instanceof Blob) && !(entry.data instanceof Uint8Array)) {
      throw new TypeError('ZIP entry data must be a Blob or Uint8Array.');
    }
    const byteLength=entry.data.size??entry.data.byteLength;
    if(processed+byteLength>maxBytes||processed+byteLength>0xFFFFFFFF) {
      throw new RangeError('ZIP archive exceeds the safe 32-bit size limit.');
    }
    const data=entry.data instanceof Blob?new Uint8Array(await entry.data.arrayBuffer()):entry.data;
    processed+=byteLength;
    const crc=crc32(data);
    const local=new Uint8Array(30+encodedName.length);
    const localView=new DataView(local.buffer);
    write32(localView,0,0x04034B50);write16(localView,4,20);write16(localView,6,0x0800);
    write16(localView,8,0);write16(localView,10,0);write16(localView,12,0);
    write32(localView,14,crc);write32(localView,18,byteLength);write32(localView,22,byteLength);
    write16(localView,26,encodedName.length);write16(localView,28,0);local.set(encodedName,30);
    localParts.push(local,entry.data);

    const central=new Uint8Array(46+encodedName.length);
    const centralView=new DataView(central.buffer);
    write32(centralView,0,0x02014B50);write16(centralView,4,20);write16(centralView,6,20);
    write16(centralView,8,0x0800);write16(centralView,10,0);write16(centralView,12,0);write16(centralView,14,0);
    write32(centralView,16,crc);write32(centralView,20,byteLength);write32(centralView,24,byteLength);
    write16(centralView,28,encodedName.length);write16(centralView,30,0);write16(centralView,32,0);
    write16(centralView,34,0);write16(centralView,36,0);write32(centralView,38,0);write32(centralView,42,offset);
    central.set(encodedName,46);centralParts.push(central);
    offset+=local.byteLength+byteLength;
    if (offset > 0xFFFFFFFF) throw new RangeError('ZIP archive exceeds the safe 32-bit size limit.');
    onProgress({completed:seen.size,total:entries.length});
  }

  const centralSize=centralParts.reduce((total,part)=>total+part.byteLength,0);
  if (offset+centralSize+22 > maxBytes || offset+centralSize+22 > 0xFFFFFFFF) {
    throw new RangeError('ZIP archive exceeds the safe size limit.');
  }
  const end=new Uint8Array(22);
  const endView=new DataView(end.buffer);
  write32(endView,0,0x06054B50);write16(endView,4,0);write16(endView,6,0);
  write16(endView,8,entries.length);write16(endView,10,entries.length);
  write32(endView,12,centralSize);write32(endView,16,offset);write16(endView,20,0);
  return new Blob([...localParts,...centralParts,end],{type:'application/zip'});
}
