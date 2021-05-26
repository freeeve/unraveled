import { Node } from './unraveled';
import { Bufr } from 'bufr';
/* istanbul ignore function */
export default class Utils {
  private static toObject(node: Node) {
    let obj: any = {};
    if (node.children) {
      obj.children = {};
      node.children.forEach((value: Node, key: string) => {
        obj.children[Buffer.from(key, 'base64').toString()] = this.toObject(value);
      });
    }
    if (node.data) {
      obj.data = node.data.toString();
    }
    return obj;
  }

  public static toJson(node: Node) {
    return JSON.stringify(Utils.toObject(node));
  }

  public static debugHeader(data: Bufr, trie: Bufr, offset: number) {
    const header: any = { offset };
    header.entryCount = trie.readUInt16LE(offset, false);
    if (header.entryCount < 0) {
      header.entryCount *= -1;
    }
    offset += 2;
    header.keys = [];
    let entryIdx = 0;
    while (entryIdx < header.entryCount) {
      const key: any = {};
      key.value = trie.subBuffer(offset, offset + 1).toString();
      offset += 1;
      key.nextRecordOffset = trie.readUInt32LE(offset, false);
      // this.debugHeader(buffer, key.nextRecordOffset);
      offset += 4; // skip offset to next record
      entryIdx += 1;
      header.keys.push(key);
    }
    let dataOffset = trie.readInt32LE(offset);
    if (dataOffset !== -1) {
      let dataLength = data.readUInt32LE(dataOffset);
      dataOffset += 4;
      header.data = data.subBuffer(dataOffset, dataOffset + dataLength);
    }
    console.log(JSON.stringify(header));
  }
}
