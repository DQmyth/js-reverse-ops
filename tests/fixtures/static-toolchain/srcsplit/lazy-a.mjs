import { stamp, SHARED_SALT } from './shared.mjs';
import { deep } from './deep.mjs';
// signer.mjs is used by the entry too, so it stays in the main chunk: a chunk that needs the main bundle
import { sign } from './signer.mjs';
export function runA(name) { return { tag: stamp('a'), sig: sign(name + SHARED_SALT), deep: deep(4) }; }
