import { makeOrbit } from './model.mjs';

self.onmessage = ({ data }) => {
  const orbit = makeOrbit(data.e, data.q);
  self.postMessage(orbit, [orbit.rows.buffer]);
};
