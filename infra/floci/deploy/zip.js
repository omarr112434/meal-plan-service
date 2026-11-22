// Small ZIP writer for the Lambda package, built on Node's own zlib,
// so the deployment needs no zip program on the PC.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function listFiles(dir, root = dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(full, root));
    else if (entry.isFile()) files.push({ full, name: path.relative(root, full).split(path.sep).join('/') });
  }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

// Writes every file under `dir` into `outFile`. Returns the number of files.
function zipDirectory(dir, outFile) {
  const files = listFiles(dir);
  const parts = [];
  const central = [];
  let offset = 0;
  const DOS_DATE = 0x21; // 1 Jan 1980: fixed, so the same code gives the same zip

  for (const file of files) {
    const data = fs.readFileSync(file.full);
    const packed = zlib.deflateRawSync(data);
    const crc = zlib.crc32(data);
    const name = Buffer.from(file.name, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // names are UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    parts.push(local, name, packed);

    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0); // central directory header
    header.writeUInt16LE(0x031e, 4); // made by: Unix
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(8, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt16LE(DOS_DATE, 14);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(packed.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt32LE((0o100644 * 65536) >>> 0, 38); // rw-r--r-- file
    header.writeUInt32LE(offset, 42);
    central.push(header, name);

    offset += local.length + name.length + packed.length;
  }

  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);

  fs.writeFileSync(outFile, Buffer.concat([...parts, directory, end]));
  return files.length;
}

module.exports = { zipDirectory };
