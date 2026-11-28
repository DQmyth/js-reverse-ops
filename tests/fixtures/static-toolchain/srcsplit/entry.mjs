import { route } from './lib.mjs';
import { sign } from './signer.mjs';
export function boot() { return { endpoint: route('items'), signature: sign('entry') }; }
console.log(JSON.stringify(boot()));
const lazyA = () => import(/* webpackChunkName: "lazy-a" */ './lazy-a.mjs');
const lazyB = () => import(/* webpackChunkName: "lazy-b" */ './lazy-b.mjs');
Promise.all([lazyA().then((m) => m.runA('alpha')), lazyB().then((m) => m.runB('beta'))])
  .then(([a, b]) => console.log(JSON.stringify([a, b])));
