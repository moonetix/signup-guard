// What src/data.js imports from node:fs, node:url and node:path. In a browser the
// data arrives through createData(), so loadData() has nothing to read.

export function readFileSync() {
  throw new Error('loadData() reads files and is not available in a browser. Build the data with createData().');
}

export const fileURLToPath = (url) => String(url);

export const join = (...parts) => parts.join('/');
