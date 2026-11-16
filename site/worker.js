import { load, reset, score } from './engine.js';

const calls = {
  load: () => load(),
  score: ({ input, options }) => score(input, options),
  reset: () => reset(),
};

self.addEventListener('message', async (event) => {
  const { id, call, payload } = event.data;
  try {
    self.postMessage({ id, value: await calls[call](payload) });
  } catch (err) {
    self.postMessage({ id, error: err.message });
  }
});
