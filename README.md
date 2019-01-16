# Unraveled
[![Travis](https://api.travis-ci.com/freeeve/unraveled.svg?branch=master)](https://travis-ci.com/freeeve/unraveled)
[![Coveralls](https://img.shields.io/coveralls/freeeve/unraveled.svg)](https://coveralls.io/github/freeeve/unraveled)

After searching through what seemed like countless trie implementations for javascript,
I decided to write my own, as I suppose each of those implementation's creators did.

This is a trie map where the basic API is simple, similar to a map:

```typescript 
import {Trie} from 'unraveled';

const trie = new Trie();
trie.put('hello', 'world');
const data = trie.get('hello');
console.out(data); // 'hello'
```

