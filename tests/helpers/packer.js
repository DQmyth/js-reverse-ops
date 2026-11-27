'use strict';
// Classic P.A.C.K.E.R (base 62), reimplemented from the public algorithm — used only to BUILD
// fixtures. The shell it writes is the one thousands of sites carry:
//   eval(function(p,a,c,k,e,d){…}('<payload>',62,n,'<words>'.split('|'),0,{}))
// and tests/fixtures/static-toolchain/packer-62.js is `pack(src/lib.js)`. It is a
// reimplementation, not a capture from a real site: that is how the fixture README states it.
// The unpacker text below is the canonical one, so anything that unpacks real payloads unpacks
// this one — and a word whose token would collide with a word of the source is given an index of
// its own, exactly as the original does.
// Usage: node tests/helpers/packer.js <source.js> <out.js>
const fs = require('fs');

const BASE = 62;
const tokenOf = (n) => (n < BASE ? '' : tokenOf(Math.floor(n / BASE))) + (((n %= BASE) > 35) ? String.fromCharCode(n + 29) : n.toString(36));
const LITERAL = "'(?:[^'\\\\\\n]|\\\\.)*'";

function pack(source) {
  const words = [];
  const seen = new Map();
  const occursInSource = (word) => new RegExp(`(?:^|[^\\w$])${word}(?:[^\\w$]|$)`).test(source);
  // a token that already occurs in the source would be overwritten on unpack: such an index is
  // made to map to itself and the next index is used instead
  const packed = source.replace(/\w+/g, (word) => {
    if (seen.has(word)) return seen.get(word);
    let index = words.length;
    let token = tokenOf(index);
    while (words.includes(token) || (token !== word && occursInSource(token))) { words.push(token); index += 1; token = tokenOf(index); }
    words.push(word);
    seen.set(word, token);
    return token;
  });
  const escape = (text) => text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  const UNPACKER = "eval(function(p,a,c,k,e,d){e=function(c){return(c<a?'':e(parseInt(c/a)))+((c=c%a)>35?"
    + "String.fromCharCode(c+29):c.toString(36))};if(!''.replace(/^/,String)){while(c--)d[e(c)]=k[c]||e(c);"
    + "k=[function(e){return d[e]}];e=function(){return'\\\\w+'};c=1};while(c--)if(k[c])p=p.replace(new "
    + "RegExp('\\\\b'+e(c)+'\\\\b','g'),k[c]);return p}('";
  return `${UNPACKER}${escape(packed)}',${BASE},${words.length},'${words.join('|')}'.split('|'),0,{}))\n`;
}

module.exports = { pack, LITERAL };

if (require.main === module) {
  const [source, out] = process.argv.slice(2);
  if (!source || !out) {
    console.error('Usage: packer.js <source.js> <out.js>');
    process.exit(2);
  }
  const text = pack(fs.readFileSync(source, 'utf8'));
  fs.writeFileSync(out, text);
  console.log(`${fs.statSync(source).size} B -> ${Buffer.byteLength(text)} B`);
}
