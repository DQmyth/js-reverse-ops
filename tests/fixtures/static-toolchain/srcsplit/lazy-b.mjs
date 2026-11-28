import { stamp } from './shared.mjs';
// lib.mjs is used by the entry too, so it stays in the main chunk
import { header } from './lib.mjs';
export function runB(name) { return { tag: stamp('b'), auth: header(name) }; }
