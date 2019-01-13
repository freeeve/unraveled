import Trie from "../src/unraveled"

/**
 * Dummy test
 */
describe("Trie", () => {
  it("should be able to insert into the trie", () => {
    const data = Buffer.from('world');
    const word = 'hello';
    const trie = new Trie();
    trie.insert(word, data);
  });
  it("should be able to insert into/search the trie", () => {
    const data = Buffer.from('world');
    const word = 'hello';
    const trie = new Trie();
    trie.insert(word, data);
    const actual = trie.search(word);
    expect(actual).toEqual(data);
  });
});
