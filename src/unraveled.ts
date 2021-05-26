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
  private data: Bufr;
  private trie: Bufr;
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
    /*
    this.data = new Bufr({
      allocSizeKb: 4,
      cacheSizeKb: 64,
      compression: 'snappy'
    });
    this.trie = new Bufr({
      allocSizeKb: 2,
      cacheSizeKb: 128,
      compression: 'snappy'
    });
    */

    this.data = new Bufr({
      allocSizeKb: 64,
      cacheSizeKb: 4096,
      compression: 'snappy'
    });
    this.trie = new Bufr({
      allocSizeKb: 8,
      cacheSizeKb: 4096 * 4,
      compression: 'snappy'
    });
  }

  public compact() {
    this.data.compressAll();
    this.trie.compressAll();
  }

  public getBufferMemoryUsage(): number {
    // console.log(`data size: ${this.data.totalSize}, trie size: ${this.trie.totalSize}`)
    return this.data.totalSize + this.trie.totalSize;
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
    // write entry count
    offset += this.trie.writeUInt16LE(entryCount, offset);
    let keySizeTotal = entryCount * 5;
    let headerSize = 2 + keySizeTotal + 4;

    recordSize += headerSize;
    let childOffset = 0;
    node.children.forEach((value: Node, key: string) => {
      const bufferKey = Buffer.from(key, 'base64');
      // write key
      offset += this.trie.writeBuffer(bufferKey, offset);
      let thisChildOffset = startOffset + headerSize + childOffset;
      // write offset for child
      offset += this.trie.writeUInt32LE(thisChildOffset, offset);
      // recurse!
      let childSize = this.encodeHelper(value, thisChildOffset);
      childOffset += childSize;
      recordSize += childSize;
    });

    if (node.data) {
      // write data offset
      offset += this.trie.writeInt32LE(this.data.length, offset);
      // write data length
      this.data.writeUInt32LE(node.data.length, this.data.length);
      // write data
      this.data.writeBuffer(node.data, this.data.length);
    } else {
      // write -1 offset when data doesn't exist
      offset += this.trie.writeInt32LE(-1, offset);
    }
    // Utils.debugHeader(this.data, this.trie, startOffset);
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
    return this.searchHelper(Buffer.from(word), 0);
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

  private getDataEntry(offset: number): Buffer | undefined {
    let entryCount = this.trie.readUInt16LE(offset, this.noassert);
    offset += 2;
    offset += entryCount * 5;
    let dataOffset = this.trie.readInt32LE(offset, this.noassert);
    if (dataOffset === -1) {
      return undefined;
    }
    let dataLength = this.data.readUInt32LE(dataOffset, this.noassert);
    dataOffset += 4;
    return this.data.subBuffer(dataOffset, dataOffset + dataLength);
  }

  private searchEntries(wordBuff: Buffer, offset: number): SearchEntriesResult {
    const entryCount = this.trie.readUInt16LE(offset, this.noassert);
    offset += 2;
    let matchCount = 0;
    let entryIdx = 0;
    while (entryIdx < entryCount) {
      // let curKey = searchBuff.slice(offset, offset + curKeyLength);
      let curKey = this.trie.subBuffer(offset, offset + 1);
      offset += 1;
      // skip offset to next record
      offset += 4;
      matchCount = this.prefixMatch(wordBuff, curKey);
      if (matchCount > 0) {
        break;
      }
      entryIdx += 1;
    }
    if (matchCount === 0) {
      return { matchCount: -1, nextRecordOffset: -1 };
    }
    // backtrack to offset (skipped in loop above)
    offset -= 4;
    const nextRecordOffset = this.trie.readUInt32LE(offset, this.noassert);
    return { matchCount, nextRecordOffset };
  }

  private searchHelper(wordBuff: Buffer, offset: number): Buffer | undefined {
    // Utils.debugHeader(this.data, this.trie, offset);
    if (wordBuff.length === 0) {
      return this.getDataEntry(offset);
    }
    const { matchCount, nextRecordOffset } = this.searchEntries(wordBuff, offset);
    if (matchCount === -1) {
      return undefined;
    } else {
      return this.searchHelper(wordBuff.slice(matchCount), nextRecordOffset);
    }
  }
}
