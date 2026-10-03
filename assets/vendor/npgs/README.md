# NPGS black-hole background

This renderer is adapted from [baopinshui/NPGS](https://github.com/baopinshui/NPGS),
specifically [BlackHole_common.glsl](https://github.com/baopinshui/NPGS/blob/91305ca1661f18b60d6d33ed4616e4cd5b977b9f/NPGS/Sources/Engine/Shaders/BlackHole_common.glsl)
at commit `91305ca1661f18b60d6d33ed4616e4cd5b977b9f`.
The upstream work is by baopinshui and the NPGS contributors.

The adapted renderer and its shader files are distributed under the
GNU General Public License, version 3; a complete copy is in [LICENSE](LICENSE).
The readable JavaScript and GLSL served by the website are the corresponding
source of this component, also available in this website's GitHub repository.

## Stable rollback baseline

The immutable, user-approved rollback baseline is
[1.0BH](https://github.com/0923katouC/0923katouC.github.io/releases/tag/1.0BH),
commit `53b98b28dd5852e6c997614d1dd0bf770d857808`, accepted on 2026-10-03.
That release preserves the accepted thin-disk version and its screenshots.
Use it if a later black-hole visual change needs reverting and the user has
not selected another baseline. Keep unrelated website content and the
baseline documentation; do not move this tag when improving the renderer.

## Finite-height disk and cloud rendering

The active scene contains the Kerr black hole, a finite-height emitting
accretion volume, and background stars. It does not load the archived jet,
white-dwarf or SPH model assets. The user explicitly requested a visibly
thicker disk and three-dimensional clouds after approving `1.0BH`.

The accepted camera is retained: distance 28 Rs, elevation 10 degrees,
18-degree roll, desktop center (0.58,0.52) / view span 20, portrait center
(0.52,0.61) / view span 36. The mass parameter is 0.5, physical spin a=0.43
(dimensionless spin 0.86), inner radius 1.2867155 Rs, outer radius 9 Rs.
Coordinates are (x,y,z,t), signature (+++-), spin +y, in ingoing Kerr-Schild.
The disk half-height is H(r)=0.45+0.075*max(r-3,0) Rs. The cache includes
1.05H; animated density tapers smoothly inside that conservative bound.

`npgs-kerr.glsl` retains the metric, observer tetrad, analytic Hamiltonian
derivatives and adaptive RK4 null-ray integration. A transform-feedback
vertex pass traces each ray twice: the first walk measures emitting intervals;
the second places quadrature nodes on the same numerical trajectory.
The first two occupied passages each own a fixed half of the available slots,
even when the other passage is absent. Front-biased bin edges L*(j/n)^2
resolve the visible layers more finely; stored weights are actual unequal
bin widths. Higher passages are explicitly marked truncated in the cache.
This is a bounded web rendering approximation, not unlimited path sampling.

Each cache node stores position, retarded time, frequency shift, comoving
photon path length, passage ID and validity. The path weight is
(-p_mu u^mu)*abs(delta_lambda); the emitter velocity is normalized in the
local Kerr metric. Off-equatorial circular emitters are a prescribed,
pressure-supported kinematic model, not off-equatorial free-fall geodesics.
Records are half-float pairs packed into a flat RGBA32UI atlas. The GPU uploads
the transform-feedback buffer directly; production does not read it to CPU.

Every animation frame integrates the cached samples in observer-to-source
order. Three-dimensional cloud density sets emissivity and optical depth;
alpha=1-exp(-tau) attenuates all light behind each sample. Specific radiance
uses g^3 transport with an illustrative warm colour/temperature mapping.
The complete ray radiance is projected to the viewport only after this
integration. Interpolating completed radiance avoids mixing unrelated volume
nodes and preserves front/back occlusion at ray-grid boundaries.

## Moving texture and fine density

The user confirmed the upstream file above as the code to follow for their
Shadertoy `W3BBzK` reference. Cloud texture uses its separate radial, vertical
and azimuthal noise axes, with a smooth angular seam. The former circular
noise embedding and noise-displaced sine bands that created eye-shaped
patches remain removed. Height-dependent density, optical depth and the
inner-cloud envelope are now evaluated through the actual sampled volume.

Emission patterns follow one backward characteristic: dr/dt=-0.02 and
dtheta/dt=Omega_K(r). Composite Simpson quadrature integrates angle along
the radial path. Noise coordinates share that birth point; relative height
is carried through the gently flared disk. This is a prescribed moving
emission field, not a hydrodynamic or GRMHD simulation.

Two populations have a 48-emission-time-unit lifetime and complementary sin²
windows. Their zero-weight, zero-slope renewal prevents infinite winding or
visible resets. Finite-lived structures are motivated by
[Schnittman, Krolik & Hawley (2006)](https://arxiv.org/abs/astro-ph/0606615),
but these visual texture parameters are not fitted to that simulation.

A separate signed density-grain field follows the same flow. Integer lattice
slices avoid extra averaging between noise planes. Spatial footprint and
motion per 30 Hz frame suppress unresolved grain; only centered detail gets
crossfade averaging compensation. `GRAIN_FREQUENCY`,
`GRAIN_EMISSION_CONTRAST`, and `GRAIN_DENSITY_CONTRAST` control its scale and
contrast in `npgs-render.frag`. Mobile/coarse-pointer/save-data clients use
35% grain detail. The small inner-cloud emission boost remains co-moving.

## Performance and verification

Desktop: 960² rays, 12 volume nodes, at most 1.5M output pixels. Economy:
640² rays, 8 nodes, 700k pixels. Mobile/coarse-pointer/save-data: 384² rays,
6 nodes, 230k pixels. Hardware limits can reduce these settings. The per-frame
passes are ray radiance, viewport projection, then bloom/tone mapping.
Animation targets 30 fps. Under sustained load both the radiance pass and
viewport output downscale without retracing the fixed geometry. Hidden pages
pause and reduced motion freezes a frame. Canvas data attributes expose quality, cache sizes and measured timings.

Serve the repository and open `/tests/black-hole-dynamics.html` for actual
GPU characteristic, renewal and grain-filter checks. Open
`/tests/black-hole-volume.html?nodes=12` (also 8 or 6) for actual Kerr cache
checks: capture/escape, node ordering, finite off-plane positions, positive
frequency shifts, volume support and retained path-weight sums. These are
invariant/regression checks, not a precision validation against a full fluid
simulation.

Fallbacks use this same rendering path at t=14: height-scaled atlases
4800x1200 desktop and 984x1200 portrait. CSS owns their shared anchor and the
inclusive 0.82 portrait breakpoint. Keep `background-size: auto 100%`;
`cover` changes apparent size on other aspect ratios. The first live frame
stays frozen through the canvas fade before motion starts. Re-export both
atlases after changing the camera, geometry, material or starting time.
Six local shader files are fetched; there is no external model/data download.
Unsupported WebGL or failed rendering leaves the matching static image visible.
