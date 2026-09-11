# NPGS black-hole background

This renderer is adapted from [baopinshui/NPGS](https://github.com/baopinshui/NPGS),
specifically [`BlackHole_common.glsl`](https://github.com/baopinshui/NPGS/blob/91305ca1661f18b60d6d33ed4616e4cd5b977b9f/NPGS/Sources/Engine/Shaders/BlackHole_common.glsl)
at commit `91305ca1661f18b60d6d33ed4616e4cd5b977b9f`.
The upstream work is by baopinshui and the NPGS contributors.

The adapted renderer and its shader files are distributed under the
GNU General Public License, version 3; a complete copy is in [LICENSE](LICENSE).
The readable JavaScript and GLSL served by the website are the corresponding
source of this component. They are also available in this website's GitHub repository.

## Adaptation made on 2026-09-11

- `assets/shaders/npgs-kerr.glsl` retains NPGS's Kerr-Schild geometry, analytic
  Hamiltonian derivatives, static-observer tetrad, RK4 integrator, and null
  Hamiltonian correction. The unused observer modes were removed.
- The browser scene fixes a static camera outside an uncharged rotating black
  hole: dimensionless spin 0.86, mass parameter 0.5, spin axis +y. Spatial
  distances are in Schwarzschild radii; the disk starts at the prograde ISCO
  (1.28671550559) and ends at radius 9. Coordinate order is (x,y,z,t), with
  metric signature (+++-), as in NPGS.
- `npgs-trace.frag` caches two equatorial disk intersections, their photon
  frequency ratios and travel times, escaping sky directions, and the jet's
  integrated emissivity. Rays use NPGS's adaptive RK4 step prescription with
  tighter steps near the disk. The integration is limited to 420 steps and
  ends at radius 90 or just outside the event horizon.
- `npgs-emission.glsl` retains the disk noise combination, radial profile and
  blackbody RGB functions. A small periodic 3D texture replaces repeated noise
  lattice hashes. The animated surface model uses the original thin-disk
  temperature profile, spiral inflow, local orbital advection, and frequency
  shifts, with an artistic visible-temperature scale and bounded intensity.
- The original volumetric disk is reduced to two thin-disk images. NPGS's
  widening jet sheath and normalized 0.8c velocity prescription are retained;
  the revised sheath turns on smoothly at heights 4–6 and is more collimated.
  Its brighter emission has two rotating helical filaments, advected knots,
  and fine turbulence. Circular phase moments along the cached rays retain
  the emission-time delay; Doppler beaming is baked into the jet weight.
  Full time-dependent volume dynamics, polarization, charge,
  heat haze, movable observers and maximal spacetime extensions are omitted.
- Cubemap sky assets are replaced by procedural stars sampled along the
  escaping rays. WebGL 2 replaces the desktop Vulkan interfaces. A small HDR
  bloom pass and finite tone mapper replace desktop history/TAA compositing.
- The stationary geodesics are computed once in small batches. Animation is
  capped at 30 fps, with bounded pixel counts and GPU-time-based downscaling
  when timer queries are available. Hidden tabs pause and reduced-motion
  preferences produce a still frame. WebGL failure displays a frame rendered
  with these same shaders.

This is a performance-oriented web adaptation. It does not reproduce every
mode or the full volumetric accuracy of the desktop NPGS renderer.
