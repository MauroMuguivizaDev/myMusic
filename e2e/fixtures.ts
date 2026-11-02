export function audioFixture(frequency = 440) {
  const rate = 8000,
    count = rate * 15;
  const wav = Buffer.alloc(44 + count * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(count * 2, 40);
  for (let index = 0; index < count; index++)
    wav.writeInt16LE(
      Math.round(Math.sin((index * frequency * 2 * Math.PI) / rate) * 1200),
      44 + index * 2,
    );
  return wav;
}

import { deflateSync } from 'node:zlib';

export const fixtureCover = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');

function pngChunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type);
  const body = Buffer.concat([name, data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const header = Buffer.alloc(4); header.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([header, body, checksum]);
}

export const highResolutionCover = (() => {
  const size = 512;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4);
  header[8] = 8; header[9] = 6;
  const pixels = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const row = y * (1 + size * 4);
    pixels[row] = 0;
    for (let x = 0; x < size; x++) {
      const offset = row + 1 + x * 4;
      pixels[offset] = 42; pixels[offset + 1] = 96; pixels[offset + 2] = 150; pixels[offset + 3] = 255;
    }
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(pixels)), pngChunk('IEND', Buffer.alloc(0))]);
})();
const tagValues = { title: 'Título incorporado', artist: 'Artista incorporado', album: 'Álbum incorporado', genre: 'Jazz', year: '2024' };
function id3Fixture() {
  const frame = (id: string, data: Buffer) => {
    const header = Buffer.alloc(10); header.write(id); header.writeUInt32BE(data.length, 4);
    return Buffer.concat([header, data]);
  };
  const tags = [['TIT2',tagValues.title],['TPE1',tagValues.artist],['TALB',tagValues.album],['TCON',tagValues.genre],['TYER',tagValues.year]];
  const body = Buffer.concat([
    ...tags.map(([id,value]) => frame(id, Buffer.concat([Buffer.from([1,255,254]),Buffer.from(value,'utf16le')]))),
    frame('APIC',Buffer.concat([Buffer.from([0]),Buffer.from('image/png\0'),Buffer.from([3,0]),fixtureCover])),
  ]);
  const header = Buffer.from([73,68,51,3,0,0,0,0,0,0]);
  for (let i=0;i<4;i++) header[9-i] = (body.length >> (7*i)) & 127;
  return Buffer.concat([header,body]);
}

export function taggedAudioFixture(format: 'mp3' | 'm4a' | 'flac' | 'wav') {
  if (format === 'mp3') {
    const frame = Buffer.alloc(417); Buffer.from([255,251,144,0]).copy(frame);
    return Buffer.concat([id3Fixture(), ...Array.from({length:20}, () => frame)]);
  }
  if (format === 'wav') {
    const wav = audioFixture();
    const tag = id3Fixture(); const header = Buffer.alloc(8); header.write('id3 '); header.writeUInt32LE(tag.length,4);
    const result = Buffer.concat([wav,header,tag,tag.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
    result.writeUInt32LE(result.length-8,4);
    return result;
  }
  if (format === 'flac') {
    const block = (kind: number, data: Buffer) => { const head = Buffer.alloc(4); head[0]=kind; head.writeUIntBE(data.length,1,3); return Buffer.concat([head,data]); };
    const integer = (value: number) => { const bytes = Buffer.alloc(4); bytes.writeUInt32LE(value); return bytes; };
    const info = Buffer.alloc(34); info.writeUInt16BE(4096,0); info.writeUInt16BE(4096,2);
    info.writeBigUInt64BE((44100n << 44n) | (1n << 41n) | (15n << 36n) | 44100n,10);
    const comments = ['TITLE='+tagValues.title,'ARTIST='+tagValues.artist,'ALBUM='+tagValues.album,'GENRE='+tagValues.genre,'DATE='+tagValues.year].map(value => Buffer.from(value));
    const vorbis = Buffer.concat([integer(0),integer(comments.length),...comments.flatMap(value => [integer(value.length),value])]);
    const mime = Buffer.from('image/png'); const picture = Buffer.alloc(4+4+mime.length+4+20+fixtureCover.length);
    let offset=0; const write = (value: number) => { picture.writeUInt32BE(value,offset); offset+=4; };
    write(3); write(mime.length); mime.copy(picture,offset); offset+=mime.length;
    write(0); write(1); write(1); write(24); write(0); write(fixtureCover.length); fixtureCover.copy(picture,offset);
    return Buffer.concat([Buffer.from('fLaC'),block(0,info),block(4,vorbis),block(128+6,picture)]);
  }
  const atom = (name: string, data: Buffer) => { const header=Buffer.alloc(8); header.writeUInt32BE(data.length+8); header.write(name,4,'latin1'); return Buffer.concat([header,data]); };
  const dataAtom = (value: Buffer, kind=1) => { const header=Buffer.alloc(8); header.writeUInt32BE(kind); return atom('data',Buffer.concat([header,value])); };
  const tags = [['©nam',tagValues.title],['©ART',tagValues.artist],['©alb',tagValues.album],['©gen',tagValues.genre],['©day',tagValues.year]];
  const ilst=atom('ilst',Buffer.concat([...tags.map(([key,value]) => atom(key,dataAtom(Buffer.from(value)))),atom('covr',dataAtom(fixtureCover,14))]));
  const mvhd=Buffer.alloc(100); mvhd.writeUInt32BE(44100,12); mvhd.writeUInt32BE(44100,16);
  const tkhd=Buffer.alloc(84); tkhd.writeUInt32BE(1,12); tkhd.writeUInt32BE(44100,20);
  const mdhd=Buffer.alloc(24); mdhd.writeUInt32BE(44100,12); mdhd.writeUInt32BE(44100,16);
  const hdlr=Buffer.alloc(24); hdlr.write('soun',8);
  const sample=Buffer.alloc(28); sample.writeUInt16BE(1,6); sample.writeUInt16BE(2,16); sample.writeUInt16BE(16,18); sample.writeUInt32BE(44100*65536,24);
  const stsd=Buffer.alloc(8); stsd.writeUInt32BE(1,4);
  const stts=Buffer.alloc(16); stts.writeUInt32BE(1,4); stts.writeUInt32BE(1,8); stts.writeUInt32BE(44100,12);
  const stbl=atom('stbl',Buffer.concat([atom('stsd',Buffer.concat([stsd,atom('mp4a',sample)])),atom('stts',stts)]));
  const trak=atom('trak',Buffer.concat([atom('tkhd',tkhd),atom('mdia',Buffer.concat([atom('mdhd',mdhd),atom('hdlr',hdlr),atom('minf',stbl)]))]));
  return Buffer.concat([atom('ftyp',Buffer.from('M4A \0\0\0\0M4A isom','latin1')),atom('moov',Buffer.concat([atom('mvhd',mvhd),trak,atom('udta',atom('meta',Buffer.concat([Buffer.alloc(4),ilst])))]))]);
}


