import { Bufr } from 'bufr';
import Utils from './utils';

export interface Node {
  children: Map<string, Node>;
  data?: Buffer;
}

export interface TrieOptions {
  allocSizeKb?: number;
  cacheSizeKb?: number;
}

interface SearchEntriesResult {
  matchCount: number;
  nextRecordOffset: number;
}

export default class Trie {
  private readonly allocSize = 1024 * 16;
  private readonly cacheSize = 1024 * 1024;
  private buffer: Bufr;
  public trieRoot: Node = { children: new Map<string, Node>() };
  public encoded = false;
  private noassert = true;

  constructor(options?: TrieOptions) {
    if (options) {
      if (options.allocSizeKb) {
        this.allocSize = options.allocSizeKb * 1024;
      }
      if (options.cacheSizeKb) {
        this.cacheSize = options.cacheSizeKb * 1024;
      } else {
        this.cacheSize = this.allocSize * 16;
      }
    }
    this.buffer = new Bufr({
      allocSizeKb: this.allocSize / 1024,
      cacheSizeKb: this.cacheSize / 1024
    });
  }

  public compact() {
    return this.buffer.compressAll();
  }

  public getBufferMemoryUsage(): number {
    return this.buffer.totalSize;
  }

  public insert(word: string, data: string) {
    this.encoded = false;
    this.insertBuffer(word, Buffer.from(data));
  }

  public insertBuffer(word: string, data: Buffer) {
    const wordBuff = Buffer.from(word);
    this.trieInsert(wordBuff, data, this.trieRoot);
  }

  private trieInsert(wordBuff: Buffer, data: Buffer, node: Node) {
    if (wordBuff.length > 0) {
      let child = node.children.get(wordBuff.slice(0, 1).toString('base64'));
      if (!child) {
        child = { children: new Map<string, Node>() };
        node.children.set(wordBuff.slice(0, 1).toString('base64'), child);
      }
      this.trieInsert(wordBuff.slice(1), data, child);
    } else {
      node.data = data;
    }
  }

  private ensureSize(size: number, offset: number) {
    /*
    while (this.buffer.length < offset + size) {
      this.resizeBuffer();
    }
    */
  }

  private writeByte(byte: number, offset: number): number {
    this.ensureSize(1, offset);
    this.buffer.writeUInt8(byte, offset, this.noassert);
    return 1;
  }

  private writeShort(short: number, offset: number): number {
    this.ensureSize(2, offset);
    this.buffer.writeUInt16LE(short, offset, this.noassert);
    return 2;
  }

  private writeInt(i: number, offset: number): number {
    this.ensureSize(4, offset);
    this.buffer.writeInt32LE(i, offset, this.noassert);
    return 4;
  }

  private writeBuffer(buffer: Buffer, offset: number): number {
    this.ensureSize(buffer.length, offset);
    // buffer.copy(this.buffer, offset);
    this.buffer.writeBuffer(buffer, offset);
    return buffer.length;
  }

  public encode() {
    if (this.trieRoot) {
      this.encodeHelper(this.trieRoot, 0);
      this.encoded = true;
      this.trieRoot = { children: new Map<string, Node>() };
    }
  }

  private encodeHelper(node: Node, offset: number): number {
    const startOffset = offset;
    let recordSize = 0;
    let entryCount = node.children ? node.children.size : 0;
    entryCount += node.data ? 1 : 0;
    // write entry count
    offset += this.writeShort(entryCount, offset);
    let keySizeTotal = 0;
    node.children.forEach((value: Node, key: string) => {
      const bufferKey = Buffer.from(key, 'base64');
      keySizeTotal += 1;
      keySizeTotal += bufferKey.length;
      keySizeTotal += 4;
    });
    let dataLength = 0;
    if (node.data) {
      let dataOffset = offset + keySizeTotal;
      dataLength = node.data.length + 5;
      // write size 0 for empty key (data)
      dataOffset += this.writeByte(0, dataOffset);
      // write data length size
      dataOffset += this.writeInt(node.data.length, dataOffset);
      // write data
      this.writeBuffer(node.data, dataOffset);
    }
    let headerSize = 2 + keySizeTotal + dataLength;

    recordSize += headerSize;
    let childOffset = 0;
    node.children.forEach((value: Node, key: string) => {
      const bufferKey = Buffer.from(key, 'base64');
      // write key length
      offset += this.writeByte(bufferKey.length, offset);
      // write key
      offset += this.writeBuffer(bufferKey, offset);
      let thisChildOffset = startOffset + headerSize + childOffset;
      // write offset for child
      offset += this.writeInt(thisChildOffset, offset);
      // recurse!
      let childSize = this.encodeHelper(value, thisChildOffset);
      childOffset += childSize;
      recordSize += childSize;
    });
    return recordSize;
  }

  public search(word: string): string | undefined {
    const result = this.searchBuffer(word);
    if (!result) {
      return undefined;
    }
    return result.toString();
  }

  public searchBuffer(word: string): Buffer | undefined {
    if (!this.encoded) {
      this.encode();
    }
    return this.searchHelper(Buffer.from(word), this.buffer, 0);
  }

  private prefixMatch(bufa: Buffer, bufb: Buffer): number {
    let matchCount = 0;
    let i = 0;
    while (bufa[i] === bufb[i] && i < bufa.length && i < bufb.length) {
      matchCount += 1;
      i += 1;
    }
    return matchCount;
  }

  private getDataEntry(searchBuff: Bufr, offset: number): Buffer | undefined {
    let entryCount = searchBuff.readInt16LE(offset, this.noassert);
    offset += 2;
    if (entryCount === 0) {
      return undefined;
    }
    let entryIdx = 0;
    let curKeyLength = 0;
    do {
      curKeyLength = searchBuff.readUInt8(offset, this.noassert);
      offset += 1;
      offset += curKeyLength;
      offset += 4; // skip offset to next record
      entryIdx += 1;
    } while (curKeyLength !== 0 && entryIdx < entryCount);
    // exhausted search and no data
    if (curKeyLength > 0) {
      return undefined;
    }
    // backtrack to offset (skipped in loop above)
    offset -= 4;
    let dataLength = searchBuff.readInt32LE(offset, this.noassert);
    offset += 4;
    // return searchBuff.slice(offset, offset + dataLength);
    return searchBuff.subBuffer(offset, offset + dataLength);
  }

  private searchEntries(wordBuff: Buffer, searchBuff: Bufr, offset: number): SearchEntriesResult {
    const entryCount = searchBuff.readInt16LE(offset, this.noassert);
    offset += 2;
    let matchCount = 0;
    let entryIdx = 0;
    do {
      let curKeyLength = searchBuff.readUInt8(offset, this.noassert);
      offset += 1;
      // let curKey = searchBuff.slice(offset, offset + curKeyLength);
      let curKey = searchBuff.subBuffer(offset, offset + curKeyLength);
      offset += curKeyLength;
      // skip offset to next record
      offset += 4;
      matchCount = this.prefixMatch(wordBuff, curKey);
      entryIdx += 1;
    } while (matchCount === 0 && entryIdx < entryCount);
    if (matchCount === 0) {
      return { matchCount: -1, nextRecordOffset: -1 };
    }
    // backtrack to offset (skipped in loop above)
    offset -= 4;
    const nextRecordOffset = searchBuff.readInt32LE(offset, this.noassert);
    return { matchCount, nextRecordOffset };
  }

  private searchHelper(wordBuff: Buffer, searchBuff: Bufr, offset: number): Buffer | undefined {
    // Utils.debugHeader(searchBuff.toBuffer(), offset);
    if (wordBuff.length === 0) {
      return this.getDataEntry(searchBuff, offset);
    }
    const { matchCount, nextRecordOffset } = this.searchEntries(wordBuff, searchBuff, offset);
    if (matchCount === -1) {
      return undefined;
    } else {
      return this.searchHelper(wordBuff.slice(matchCount), searchBuff, nextRecordOffset);
    }
  }

  private resizeBuffer() {
    /*
    const newBuffer = Buffer.alloc(this.buffer.length + this.allocSize);
    this.buffer.copy(newBuffer);
    this.buffer = newBuffer;
    */
  }
}
