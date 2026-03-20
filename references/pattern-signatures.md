# Pattern Signatures

Use these heuristics to narrow the target quickly.

## Bundler Clues

- webpack: `__webpack_require__`, `__webpack_modules__`, chunk arrays
- parcel: `parcelRequire`
- browserify: object map with numeric modules and wrapper function
- vite/rollup: ESM wrappers, import maps, lightweight bootstrap

## Obfuscation Clues

- string array + rotation: large array, numeric index helper, decode wrapper
- control-flow flattening: `while(true)` plus stateful `switch`
- proxy wrappers: tiny helper functions returning binary ops or forwarded calls
- unicode or hex escapes: high density of `\x` or `\u` encoded strings
- VMP-like dispatch: opcode arrays, dispatch loop, register-like state object

## Crypto and Signature Clues

- Web Crypto: `crypto.subtle`, `TextEncoder`, `digest`, `importKey`
- CryptoJS: `CryptoJS.MD5`, `AES.encrypt`, `enc.Utf8.parse`
- custom hash/signature: sorted params, timestamp concatenation, secret salt, byte loops, bitwise mixes
- anti-bot seeds: storage reads, canvas or UA fingerprints, timezone and locale access, navigator property probes

## High-Value Search Terms

`sign`, `signature`, `encrypt`, `digest`, `token`, `nonce`, `secret`, `salt`, `payload`, `timestamp`, `headers`, `authorization`, `hmac`, `md5`, `sha`, `aes`, `rsa`, `crc`, `subtle`
