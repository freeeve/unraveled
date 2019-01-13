export default class Trie {
  private buffer: Buffer = Buffer.alloc(1024 * 64);
  private map: any = {};

  public insert(word: string, data: Buffer) {
    this.map[word] = Buffer.from(data);
  }

  public search(word: string): Buffer {
    return this.map[word];
  }
}
