# Unraveled
[![Travis](https://api.travis-ci.com/freeeve/unraveled.svg?branch=master)](https://travis-ci.com/freeeve/unraveled)
[![Coveralls](https://img.shields.io/coveralls/freeeve/unraveled.svg)](https://coveralls.io/github/freeeve/unraveled)

After searching through what seemed like countless trie implementations for javascript,
I decided to write my own, as I suppose each of those implementation's creators did.

The goals of this library are to sacrifice a bit of performance (compared to built-in hash),
to keep memory usage at a minimum.

This is a trie map where the basic API is simple, similar to a map:

```typescript 
import {Trie} from 'unraveled';

const trie = new Trie();
trie.insert('hello', 'world');
const data = trie.search(word);
```

## Usage
One use case.
```typescript 
import {Trie} from 'unraveled';

const words = [{
  word: 'rubens',
  def: 'pt`being red; red, reddish, ruddy~(growing) red, reddening, blushing'
},{
  word: 'ruber',
  def: 'a`red (colour); ruddy'
},{
  word: 'rubicon',
  def: 'n`a limit that when exceeded, or an action that when taken, cannot be reversed.'
},{
  word: 'rubicundus',
  def: 'a`red, ruddy, rubicund.'
}];
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
```

## Benchmarks
The trie takes somewhat less space, on the order of 30%, depending on data. 
The test data was 41MB in encoded trie vs 67MB in hash.

I'm planning to implement some compression in the future, which should improve this.
Also, currently, the trie is built in memory and then dumped to a buffer,
instead of being built directly in a buffer. I'm hoping that it will be possible
to do it directly in the buffer, to avoid the initial memory load. 

It's a fair bit slower than the hash, currently:   
insert: ~20x slower tha hash (including encoding); avg 6.154μs for trie vs 0.538μs for hash  
search: ~43x slower than hash; avg 6.024μs for trie vs 0.138μs for hash  

```
[trie] done inserting 1000000 word test, totTime:6154ms, avg:6.154μs
[trie] done encoding 1000000 word test, totTime:5499ms, avg:5.4990000000000006μs
[trie] encoded trie memory consumption: 41MB
[trie] done search/confirm 1000000 word test, totTime:6024ms, avg:6.024μs

[hash] done inserting 1000000 word test, totTime:538ms, avg:0.5379999999999999μs
[hash] memory consumption: 67.39299774169922MB
[hash] done search/confirm 1000000 word test, totTime:138ms, avg:0.13799999999999998μs
```

