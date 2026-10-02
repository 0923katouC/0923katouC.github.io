# NPGS black-hole background

This renderer is adapted from [baopinshui/NPGS](https://github.com/baopinshui/NPGS),
specifically [`BlackHole_common.glsl`](https://github.com/baopinshui/NPGS/blob/91305ca1661f18b60d6d33ed4616e4cd5b977b9f/NPGS/Sources/Engine/Shaders/BlackHole_common.glsl)
at commit `91305ca1661f18b60d6d33ed4616e4cd5b977b9f`.
The upstream work is by baopinshui and the NPGS contributors.

The adapted renderer and its shader files are distributed under the
GNU General Public License, version 3; a complete copy is in [LICENSE](LICENSE).
The readable JavaScript and GLSL served by the website are the corresponding
source of this component. They are also available in this website's GitHub repository.

## Browser adaptation (updated 2026-10-02)

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
- The original volumetric disk is reduced to two thin-disk images. The jet
  follows the same curved null rays, with a local static-observer tetrad giving
  an actual 0.8c outflow along the common +y/-y spin axis. A soft spine and
  hollow sheath turn on at heights 1–1.8; prescribed heating near height 2.6
  emphasizes the strongly lensed launch region. Bolometric emissivity uses
  `g^4 j dl_emit`, with `dl_emit = (-p.u) |d_lambda|`. Linear harmonic moments
  retain emission-time delay without applying nonlinear shading to averaged
  positions. Disk crossings split volume integration using the same intrinsic
  opacity as the displayed disk. Foreground jet emission can appear within the
  apparent shadow; distant jets are naturally almost straight.
  Full time-dependent volume dynamics, polarization, charge,
  heat haze, movable observers and maximal spacetime extensions are omitted.
- Cubemap sky assets are replaced by procedural stars sampled along the
  escaping rays. WebGL 2 replaces the desktop Vulkan interfaces. A small HDR
  bloom pass and finite tone mapper replace desktop history/TAA compositing.
- The stationary photon geodesics are computed once in small, GPU-timed batches.
  Two passes store six transfer textures while respecting WebGL 2's minimum of
  four simultaneous render targets. An invertible nonuniform ray grid puts
  more rays around the shadow and photon ring. Animation is capped at 30 fps;
  GPU timing and sustained low draw-rate windows can lower output resolution.
  Hidden tabs pause and reduced-motion preferences produce a still frame.
  WebGL failure displays a frame rendered with these same shaders.

This is a performance-oriented web adaptation. It does not reproduce every
mode or the full volumetric accuracy of the desktop NPGS renderer.

## Framing update on 2026-10-02

The screen-plane roll is 18 degrees; the camera remains at 10 degrees above
the disk. Disk, jets and lensed sky use the same rotated rays. The closer jet
onset keeps the visible sheath connected to the poles without shifting it off
the spin axis. Desktop framing uses a view span of 20 (previously 34), while
portrait framing uses 40 (previously 48), shifted left to include the donor
core. The scene fills the page and extends behind the content. Both fallback images are rendered from
the same shaders at the initial animation time.

## White-dwarf tidal-debris model

`assets/js/tidal-stream.js` evolves 64 initially comoving, massive test particles
with analytical Cartesian Kerr-Schild Hamiltonian derivatives and RK4. Matter
uses `g(u,u) = -1`, not the photon null correction. The scale is a 10,000 solar
mass black hole and a 0.6 solar mass WD with radius 0.30 Rs, giving a Newtonian
tidal-radius estimate of 7.663 Rs. The initial central orbit has E=0.968 and
L_y=1.8. All particles are sampled at the same coordinate time, t=425 Rs/c;
the returning leading debris reaches approximately 4.25 Rs and overlaps the
accretion disk. Rotation about the spin axis only changes the viewing azimuth.

`npgs-tidal.frag` ray traces the prescribed stretched core and three-dimensional
debris tubes along the same numerical Kerr null paths. Both passes stop at the
same opaque core surface and process disk crossings in observer-to-source
order. Stream flow is a linear, retarded-time emissivity modulation on this
fixed snapshot. Surface redshift, emitter-frame limb darkening and volume
transfer are evaluated before tone mapping. Visible temperatures, tube widths,
core shape and brightness are prescribed illustration parameters; the color
of the stream's averaged temperature is also an approximation.

This is **not** GR hydrodynamics, a solved evolving spacetime, a stellar
self-gravity calculation, or a prediction that a self-bound core survives.
The stationary Kerr metric is exact; photon and ballistic-particle trajectories
are numerically integrated. Gas pressure, shocks, self-gravity, disk formation,
magnetic launching and the star's changing shape are not evolved. The existing
disk and its feeding stream represent an illustrative late-time configuration.

Physical context: [Maguire et al., WD tidal-disruption review](https://arxiv.org/abs/2004.00146)
and [Cheng & Evans, relativistic tidal encounters](https://arxiv.org/abs/1303.4129).

Run `node tests/test_tidal_stream.js` for independent massive normalization,
Killing-invariant conservation, step-halving convergence, stream continuity,
packing and bounds checks. At step 0.25, the snapshot's maximum mass-shell
error is about 1.4e-8; invariant-error convergence ratios are about 15.4.

## Quality and measurement

| Preset | Transfer grid (six RGBA16F maps) | Output pixel cap |
| --- | --- | --- |
| Desktop | 1152², about 61 MiB | 2,100,000 |
| Desktop with four or fewer logical CPUs | 832², about 32 MiB | 1,100,000 |
| Narrow/coarse-pointer device or save-data | 512², 12 MiB | 230,000 |

The map covers 36 Rs with additional central refinement; output resolution
also respects DPR and adaptive scaling. A still-mode desktop keeps desktop
detail. Canvas `data-*` diagnostics expose the actual map/output sizes,
trace wall time (excluding hidden intervals), 120-draw sample duration/rate,
CPU submission time and asynchronous GPU time when available. GPU time does
not include CSS compositing and is not a cross-device benchmark. Static
fallback frames remain visible during the initial batched ray tracing.
