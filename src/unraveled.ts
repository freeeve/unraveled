const pako = require('pako')

interface Node {
  children?: Map<string, Node>
  data?: Buffer
}

export default class Trie {
  private allocSize = 1024 * 512
  private buffer: Buffer = Buffer.alloc(this.allocSize)
  public trieRoot: Node = { children: new Map<string, Node>() }
  private maxKeySize = 255
  private keySizeBytes = 1
  private maxEntryCount = 256 * 256
  private entryCountBytes = 2
  public encoded = false
  public allocationTime = 0

  public getBufferSize() {
    return this.buffer.length
  }

  public insert(word: string, data: string) {
    this.encoded = false
    this.insertBuffer(word, Buffer.from(data))
  }

  public insertBuffer(word: string, data: Buffer) {
    // console.log('insert', word, data);
    const wordBuff = Buffer.from(word)
    if (wordBuff.length > this.maxKeySize) {
      throw new Error(`key size too large (>${this.maxKeySize} bytes)`)
    }
    this.trieInsert(wordBuff, data, this.trieRoot)
    // this.insertHelper(wordBuff, data);
  }

  private toObject(node: Node) {
    let obj: any = {}
    if (node.children) {
      obj.children = {}
      node.children.forEach((value: Node, key: string) => {
        obj.children[Buffer.from(key, 'base64').toString()] = this.toObject(value)
      })
    }
    if (node.data) {
      obj.data = node.data.toString()
    }
    return obj
  }

  public toJson(node?: Node) {
    return JSON.stringify(this.toObject(node ? node : this.trieRoot))
  }

  private trieInsert(wordBuff: Buffer, data: Buffer, node: Node) {
    // console.log('trieInsert', wordBuff.toString());
    // console.log('full trie', this.toJson());
    // console.log('subtrie', this.toJson(node));
    if (wordBuff.length > 0) {
      // console.log('trieInsert wordBuff.length', wordBuff.length);
      if (!node.children) {
        // console.log('trieInsert starting new children map');
        node.children = new Map<string, Node>()
      }
      let child = node.children.get(wordBuff.slice(0, 1).toString('base64'))
      if (!child) {
        // console.log(`trieInsert child not found, creating new child ${wordBuff.slice(0, 1).toString()}`);
        child = { children: new Map<string, Node>() }
        node.children.set(wordBuff.slice(0, 1).toString('base64'), child)
      }
      // console.log('trieInsert recursing');
      this.trieInsert(wordBuff.slice(1), data, child)
    } else {
      // got to our data node
      node.data = data
    }
  }

  private ensureSize(size: number, offset: number) {
    while (this.buffer.length < offset + size) {
      this.resizeBuffer()
    }
  }

  private writeByte(byte: number, offset: number): number {
    this.ensureSize(1, offset)
    this.buffer.writeUInt8(byte, offset, false)
    return 1
  }

  private writeShort(short: number, offset: number): number {
    this.ensureSize(2, offset)
    this.buffer.writeUInt16LE(short, offset, false)
    return 2
  }

  private writeInt(i: number, offset: number): number {
    this.ensureSize(4, offset)
    this.buffer.writeInt32LE(i, offset, false)
    return 4
  }

  private writeBuffer(buffer: Buffer, offset: number): number {
    this.ensureSize(buffer.length, offset)
    buffer.copy(this.buffer, offset)
    return buffer.length
  }

  encodeCount = 0

  public encode(compress: boolean = false) {
    this.encodeHelper(this.trieRoot, 0, compress)
    this.encoded = true
    this.trieRoot = {}
  }

  private encodeHelper(node: Node, offset: number, compress: boolean = false): number {
    const startOffset = offset
    const thisEncode = this.encodeCount
    this.encodeCount += 1
    // console.log('encode start', thisEncode, offset);
    // this.debugHeader(offset);
    let recordSize = 0
    // write header
    let entryCount = node.children ? node.children.size : 0
    entryCount += node.data ? 1 : 0
    offset += this.writeShort(entryCount, offset)
    if (node.children) {
      let keySizeTotal = 0
      node.children.forEach((value: Node, key: string) => {
        const bufferKey = Buffer.from(key, 'base64')
        keySizeTotal += 1
        keySizeTotal += bufferKey.length
        keySizeTotal += 4
      })
      let dataLength = 0
      if (node.data) {
        let dataOffset = offset + keySizeTotal
        dataLength = node.data.length + 5
        // write size 0 for empty key (data)
        dataOffset += this.writeByte(0, dataOffset)
        // console.log('encode writing data at offset', offset);
        // write data length size
        dataOffset += this.writeInt(node.data.length, dataOffset)
        // write data
        this.writeBuffer(node.data, dataOffset)
      }
      let headerSize = 2 + keySizeTotal + dataLength

      recordSize += headerSize
      let childOffset = 0
      node.children.forEach((value: Node, key: string) => {
        const bufferKey = Buffer.from(key, 'base64')
        offset += this.writeByte(bufferKey.length, offset)
        offset += this.writeBuffer(bufferKey, offset)
        let thisChildOffset = startOffset + headerSize + childOffset
        const thisChildOffsetOffset = offset
        // console.log(`encode ${thisEncode} writing offset`, thisChildOffset);
        offset += this.writeInt(thisChildOffset, offset)
        let childSize = this.encodeHelper(value, thisChildOffset, compress)
        if (compress && childSize > 1024 * 16 && childSize < 1024 * 32) {
          const compressed = pako.deflateRaw(
            this.buffer.slice(thisChildOffset, thisChildOffset + childSize)
          )
          const compressedBuffer = Buffer.from(compressed)
          // write compressed size at beginning (so we know how much to read)
          this.writeInt(compressedBuffer.length, thisChildOffset)
          // write compressed buffer
          this.writeBuffer(compressedBuffer, thisChildOffset + 4)
          // console.log(`compressing! ratio: ${compressedBuffer.length / childSize}`);
          childSize = compressedBuffer.length + 4
          // console.log('writing child at ', thisChildOffset, childSize);
          thisChildOffset *= -1
          this.writeInt(thisChildOffset, thisChildOffsetOffset)
        }
        childOffset += childSize
        recordSize += childSize
      })
    }
    // this.debugHeader(this.buffer, startOffset);
    // console.log(`encode ${thisEncode} done size: ${recordSize}, start:${startOffset} end:${startOffset + recordSize}`);
    return recordSize
  }

  public search(word: string): string | undefined {
    const result = this.searchBuffer(word)
    if (!result) {
      return undefined
    }
    return result.toString()
  }

  public searchBuffer(word: string): Buffer | undefined {
    if (!this.encoded) {
      this.encode()
    }
    // console.log('searchBuffer start', word);
    const result = this.searchHelper(Buffer.from(word), this.buffer, 0)
    // console.log('searchBuffer result', word, result);
    return result
  }

  private prefixMatch(bufa: Buffer, bufb: Buffer): number {
    let matchCount = 0
    let i = 0
    while (bufa[i] === bufb[i] && i < bufa.length && i < bufb.length) {
      matchCount += 1
      i += 1
    }
    return matchCount
  }

  private debugHeader(buffer: Buffer, offset: number) {
    const header: any = { offset }
    header.entryCount = buffer.readInt16LE(offset, false)
    if (header.entryCount < 0) {
      header.entryCount *= -1
    }
    offset += 2
    header.keys = []
    let entryIdx = 0
    do {
      const key: any = {}
      key.length = buffer.readUInt8(offset, false)
      offset += 1
      if (key.length === 0) {
        header.dataLength = buffer.readInt32LE(offset, false)
        offset += 4
        if (header.dataLength < 300) {
          header.data = Buffer.from(buffer.slice(offset, offset + header.dataLength)).toString()
        } else {
          header.data = 'busted'
        }
        break
      }
      key.value = buffer.slice(offset, offset + key.length).toString()
      offset += key.length
      key.nextRecordOffset = buffer.readInt32LE(offset, false)
      this.debugHeader(buffer, key.nextRecordOffset)
      offset += 4 // skip offset to next record
      entryIdx += 1
      header.keys.push(key)
    } while (entryIdx < header.entryCount)
    console.log(JSON.stringify(header))
  }

  private getDataEntry(searchBuff: Buffer, offset: number): Buffer | undefined {
    const startOffset = offset
    let entryCount = searchBuff.readInt16LE(offset, false)
    offset += 2
    // console.log('getDataEntry entryCount', entryCount);
    if (entryCount === 0) {
      return undefined
    }
    let entryIdx = 0
    let curKeyLength = 0
    do {
      curKeyLength = searchBuff.readUInt8(offset, false)
      offset += 1
      offset += curKeyLength
      offset += 4 // skip offset to next record
      entryIdx += 1
      // console.log('getDataEntry in loop', curKeyLength, entryIdx, offset);
    } while (curKeyLength !== 0 && entryIdx < entryCount)
    // exhausted search and no data
    if (curKeyLength > 0) {
      return undefined
    }
    // backtrack to offset (skipped in loop above)
    offset -= 4
    let dataLength = searchBuff.readInt32LE(offset, false)
    offset += 4
    // console.log('returning buffer', offset, offset + dataLength);
    return searchBuff.slice(offset, offset + dataLength)
  }

  private searchEntries(
    wordBuff: Buffer,
    searchBuff: Buffer,
    offset: number
  ): undefined | { matchCount: number; nextRecordOffset: number } {
    const entryCount = searchBuff.readInt16LE(offset, false)
    offset += 2
    // console.log('searchEntries entryCount', entryCount);
    let matchCount = 0
    let entryIdx = 0
    do {
      let curKeyLength = searchBuff.readUInt8(offset, false)
      offset += 1
      let curKey = searchBuff.slice(offset, offset + curKeyLength)
      offset += curKeyLength
      offset += 4 // skip offset to next record
      matchCount = this.prefixMatch(wordBuff, curKey)
      entryIdx += 1
    } while (matchCount === 0 && entryIdx < entryCount)
    if (matchCount === 0) {
      return undefined
    }
    // backtrack to offset (skipped in loop above)
    offset -= 4
    const nextRecordOffset = searchBuff.readInt32LE(offset, false)
    return { matchCount, nextRecordOffset }
  }

  private searchHelper(wordBuff: Buffer, searchBuff: Buffer, offset: number): Buffer | undefined {
    // console.log('searchHelper start', wordBuff.toString(), offset);
    if (offset < 0) {
      offset *= -1
      const initOffset = offset
      const childSize = searchBuff.readInt32LE(offset)
      // console.log('childSize', childSize, offset);
      offset += 4
      console.log('reading child at', offset, offset + childSize)
      const compressed = Buffer.from(searchBuff.slice(offset, offset + childSize))
      offset = 0
      const uncompressed = pako.inflateRaw(compressed)
      searchBuff = Buffer.from(uncompressed)
      console.log('initial offset', initOffset)
      this.debugHeader(searchBuff, offset)
    }
    if (wordBuff.length === 0) {
      // console.log('searchHelper length 0, get data');
      return this.getDataEntry(searchBuff, offset)
    }
    const entrySearchResult = this.searchEntries(wordBuff, searchBuff, offset)
    if (!entrySearchResult) {
      // console.log('searchHelper no searchResult');
      return undefined
    } else {
      const { matchCount, nextRecordOffset } = entrySearchResult
      // console.log('searchHelper recursing', matchCount, nextRecordOffset);
      return this.searchHelper(wordBuff.slice(matchCount), searchBuff, nextRecordOffset)
    }
  }

  private resizeBuffer() {
    const startTime = new Date().getTime()
    // console.log('allocating new buffer', this.buffer.length + this.allocSize);
    const newBuffer = Buffer.alloc(this.buffer.length + this.allocSize)
    this.buffer.copy(newBuffer)
    this.buffer = newBuffer
    const endTime = new Date().getTime()
    this.allocationTime += endTime - startTime
  }
}
