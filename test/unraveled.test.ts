import Trie from '../src/unraveled';

const sizeof = require('object-sizeof');

describe('Trie', () => {
  it('should be able to insert', () => {
    const data = Buffer.from('world');
    const word = 'hello';
    const trie = new Trie();
    trie.insertBuffer(word, data);
  });

  it('should be able to specify allocSize', () => {
    const data = Buffer.from('world');
    const word = 'hello';
    const trie = new Trie({ allocSizeKb: 256 });
    trie.insertBuffer(word, data);
    const actual = trie.searchBuffer(word);
    expect(actual).toEqual(data);
  });

  it('should be able to insert/search', () => {
    const data = Buffer.from('world');
    const word = 'hello';
    const trie = new Trie();
    trie.insertBuffer(word, data);
    const actual = trie.searchBuffer(word);
    expect(actual).toEqual(data);
  });

  it("should return undefined if something doesn't exist", () => {
    const word = 'hello';
    const trie = new Trie();
    const actual = trie.searchBuffer(word);
    expect(actual).toBeUndefined();
  });

  it('should be able to insert/search an empty string', () => {
    const data = Buffer.from('world');
    const word = '';
    const trie = new Trie();
    trie.insertBuffer(word, data);
    const actual = trie.searchBuffer(word);
    expect(actual).toEqual(data);
  });

  it('should be able to insert/search a superset string', () => {
    const data = Buffer.from('world');
    const word = 'hello';
    const trie = new Trie();
    trie.insertBuffer(word, data);
    const actual = trie.searchBuffer(word + word);
    expect(actual).toBeUndefined();
  });

  it('should be able to handle plain strings as well', () => {
    const data = 'world';
    const word = 'hello';
    const trie = new Trie();
    trie.insert(word, data);
    const actual = trie.search(word);
    expect(actual).toEqual(data);
  });

  it('should be able to insert key of 255 bytes', () => {
    const data = Buffer.from('world');
    const word = '0123456789'.repeat(25) + '01234';
    const trie = new Trie();
    trie.insertBuffer(word, data);
    const actual = trie.searchBuffer(word);
    expect(actual).toEqual(data);
  });

  it('should be able to handle a simple example', () => {
    const words = [
      {
        word: 'rubens',
        def: 'pt`being red; red, reddish, ruddy~(growing) red, reddening, blushing'
      },
      {
        word: 'ruber',
        def: 'a`red (colour); ruddy'
      },
      {
        word: 'rubicon',
        def: 'n`a limit that when exceeded, or an action that when taken, cannot be reversed.'
      },
      {
        word: 'rubicundus',
        def: 'a`red, ruddy, rubicund.'
      }
    ];
    const trie = new Trie();
    words.forEach(word => {
      trie.insert(word.word, word.def);
    });
    const actual = trie.search('rube');
    expect(actual).toBeUndefined();
    words.forEach(word => {
      const actual = trie.search(word.word);
      expect(actual).toEqual(word.def);
    });
  });

  it('should be able to handle a fair bit of data', () => {
    try {
      /* failure case...
      const wordCount = 100000;
      const words = Array.from(Array(wordCount).keys()).map(x => '' + x);
      const trie = new Trie({allocSizeKb: 4, cacheSizeKb: 8, 12});
      */
      const wordCount = 100000;
      const words = Array.from(Array(wordCount).keys()).map(x => '' + x);
      const trie = new Trie({ allocSizeKb: 8, cacheSizeKb: 4096 });
      let startTime = new Date().getTime();
      words.forEach(word => {
        const data = word.repeat(5);
        trie.insert(word, data);
      });
      const insertTime = new Date().getTime() - startTime;
      console.log(
        `[trie] done inserting ${wordCount} word test, totTime:${insertTime}ms, avg:${(insertTime /
          wordCount) *
          1000}μs`
      );
      startTime = new Date().getTime();
      trie.encode();
      const endcodeTime = new Date().getTime() - startTime;
      console.log(
        `[trie] done encoding ${wordCount} word test, totTime:${endcodeTime}ms, avg:${(endcodeTime /
          wordCount) *
          1000}μs`
      );
      console.log(
        `[trie] encoded trie memory consumption: ${Math.round(
          trie.getBufferMemoryUsage() / 1024
        )}KB`
      );
      trie.compact();
      console.log(
        `[trie] encoded trie memory after compact: ${Math.round(
          trie.getBufferMemoryUsage() / 1024
        )}KB`
      );
      startTime = new Date().getTime();
      let searchTime;
      words.forEach((word, idx) => {
        const i = getRandomInt(0, wordCount - 1);
        const actual = trie.search(words[i]);
        const data = words[i].repeat(5);
        expect(actual).toEqual(data);
        if ((idx + 1) % 10000 === 0) {
          searchTime = new Date().getTime() - startTime;
          console.log(
            `[trie] progress search/confirm ${idx +
              1} word test, totTime:${searchTime}ms, avg:${(searchTime / (idx + 1)) * 1000}μs`
          );
          console.log(
            `[trie] current trie memory while searching: ${Math.round(
              trie.getBufferMemoryUsage() / 1024
            )}KB`
          );
        }
      });
      searchTime = new Date().getTime() - startTime;
      console.log(
        `[trie] done search/confirm ${wordCount} word test, totTime:${searchTime}ms, avg:${(searchTime /
          wordCount) *
          1000}μs`
      );
    } catch (e) {
      console.log(e);
      throw new Error(e);
    }
  });

  it('js hashtable comparison', () => {
    const wordCount = 100000;
    const words = Array.from(Array(wordCount).keys()).map(x => '' + x);
    const hash: any = {};
    let startTime = new Date().getTime();
    words.forEach(word => {
      const data = word.repeat(5);
      hash[word] = data;
    });
    const insertTime = new Date().getTime() - startTime;
    console.log(
      `[hash] done inserting ${wordCount} word test, totTime:${insertTime}ms, avg:${(insertTime /
        wordCount) *
        1000}μs`
    );
    console.log(`[hash] memory consumption: ${sizeof(hash) / 1024}KB`);
    startTime = new Date().getTime();
    words.forEach((word, idx) => {
      const i = getRandomInt(0, wordCount - 1);
      const actual = hash[words[i]];
      const data = words[i].repeat(5);
      expect(actual).toEqual(data);
      if ((idx + 1) % 10000 === 0) {
        searchTime = new Date().getTime() - startTime;
        console.log(
          `[hash] progress search/confirm ${idx +
            1} word test, totTime:${searchTime}ms, avg:${(searchTime / (idx + 1)) * 1000}μs`
        );
      }
    });
    let searchTime = new Date().getTime() - startTime;
    console.log(
      `[hash] done search/confirm ${wordCount} word test, totTime:${searchTime}ms, avg:${(searchTime /
        wordCount) *
        1000}μs`
    );
  });

  function getRandomInt(min: number, max: number): number {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
});
