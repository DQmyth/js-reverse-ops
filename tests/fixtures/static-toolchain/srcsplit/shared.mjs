// used by both lazy modules: webpack puts a module like this in a chunk of its own
export const SHARED_SALT = 'FIXTURE_SPLIT_SALT_91c2';
export function stamp(tag) { return `[${tag}] ${new Date(0).toISOString()}`; }
