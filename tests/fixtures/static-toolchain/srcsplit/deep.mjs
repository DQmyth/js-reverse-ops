// only lazy-a uses this: it stays in lazy-a's chunk
export function deep(n) { return Array.from({ length: n }, (_, i) => i * i).join('+'); }
