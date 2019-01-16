import { Node } from './unraveled';
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

  public static debugHeader(buffer: Buffer, offset: number) {
    const header: any = { offset };
    header.entryCount = buffer.readInt16LE(offset, false);
    if (header.entryCount < 0) {
      header.entryCount *= -1;
    }
    offset += 2;
    header.keys = [];
    let entryIdx = 0;
    do {
      const key: any = {};
      key.length = buffer.readUInt8(offset, false);
      offset += 1;
      if (key.length === 0) {
        header.dataLength = buffer.readInt32LE(offset, false);
        offset += 4;
        if (header.dataLength < 300) {
          header.data = Buffer.from(buffer.slice(offset, offset + header.dataLength)).toString();
        } else {
          header.data = 'busted';
        }
        break;
      }
      key.value = buffer.slice(offset, offset + key.length).toString();
      offset += key.length;
      key.nextRecordOffset = buffer.readInt32LE(offset, false);
      this.debugHeader(buffer, key.nextRecordOffset);
      offset += 4; // skip offset to next record
      entryIdx += 1;
      header.keys.push(key);
    } while (entryIdx < header.entryCount);
    console.log(JSON.stringify(header));
  }
}
