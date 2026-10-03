# NPGS black-hole background

This renderer is adapted from [baopinshui/NPGS](https://github.com/baopinshui/NPGS),
specifically [`BlackHole_common.glsl`](https://github.com/baopinshui/NPGS/blob/91305ca1661f18b60d6d33ed4616e4cd5b977b9f/NPGS/Sources/Engine/Shaders/BlackHole_common.glsl)
at commit `91305ca1661f18b60d6d33ed4616e4cd5b977b9f`.
The upstream work is by baopinshui and the NPGS contributors.

The adapted renderer and its shader files are distributed under the
GNU General Public License, version 3; a complete copy is in [LICENSE](LICENSE).
The readable JavaScript and GLSL served by the website are the corresponding
source of this component. They are also available in this website's GitHub repository.

## Active scene: black hole and accretion disk

The scene contains only the Kerr black hole, two thin-disk images and escaped
background-star rays. Jet and WD emission, occlusion, volume loading and the
second trace pass have been removed from the renderer. The earlier SPH data and
preprocessing scripts remain archived research records, not page dependencies.

The camera/framing is restored to commit `9d33820`: distance 28 Rs, 10 degrees
above the disk, 18-degree roll, desktop center (0.58,0.52) / view span 20,
portrait center (0.52,0.61) / view span 36. The model uses mass parameter 0.5,
physical spin a=0.43 (dimensionless spin 0.86), disk inner radius 1.2867155 Rs
and outer radius 9 Rs. Coordinate order is (x,y,z,t), signature (+++-), spin +y.

`npgs-kerr.glsl` retains NPGS's metric, local observer tetrad, analytic
Hamiltonian derivatives and adaptive RK4 null-ray integration. Three RGBA16F
maps store two disk intersections and escaped sky directions. An invertible
nonuniform image-plane grid improves sampling near the shadow and photon ring.
It changes sample density, not the camera or the ray geometry.

Emission structures follow a single backward characteristic: dr/dt = -0.02
and dtheta/dt = Omega_K(r) in the renderer's Cartesian Kerr-Schild azimuth.
Composite Simpson quadrature integrates the angle along the radial path;
the spiral and all noise/filament coordinates are evaluated at that common
birth point. This fixes the competing angular velocities caused by applying
radial drift and differential rotation to different texture coordinates.
The small inward speed is an illustrative emission-pattern speed; Doppler
shifts still use circular Keplerian emitters, not a solved accreting fluid.

Two populations live for 48 emission-time units with complementary sin²
windows. Birth and death have zero weight and slope, bounding shear without
resetting the visible disk. Time includes each ray's negative travel time.
Angle derivatives use the continuous tangent rather than the atan branch
cut. The finite lifetime is motivated by transient structures in
[Schnittman, Krolik & Hawley (2006)](https://arxiv.org/abs/astro-ph/0606615);
the lifetime and texture here are illustrative, not fits to that simulation.
Warm temperature mapping, pixel-footprint filtering and bounded bloom finish
this surface-emission visualization; it is not a hydrodynamic simulation.

Texture coordinates now follow the upstream
[polar-strip cloud approach](https://github.com/baopinshui/NPGS/blob/91305ca1661f18b60d6d33ed4616e4cd5b977b9f/NPGS/Sources/Engine/Shaders/BlackHole_common.glsl#L1693):
the radial and azimuthal axes have independent scales. The former circular
noise embedding and noise-displaced sine bands produced large eye-shaped
patches; they have been removed. Three noise octaves produce thin radial
detail and long orbital filaments, with pixel-footprint filtering and a
smooth angular seam. These are web-specific texture settings, evaluated at
the same bounded-age birth coordinates, not a change to Kerr ray tracing.
The user confirmed `BlackHole_common.glsl` above as the source to follow
for their Shadertoy `W3BBzK` reference. This adaptation retains the existing
Kerr ray maps and thin-disk geometry rather than importing the upstream
volume, thick-disk and jet scene.

To check the advection after edits, serve the repository and open
`/tests/black-hole-dynamics.html`. Its button compiles the actual GLSL helper,
checks GPU results against independently integrated RK4 particle trajectories,
and checks the continuity of the actual renewal windows across their resets.

Desktop ray maps are 1536 by 1536, with at most 2.1M output pixels. Economy
desktops use 832 by 832 / 1.1M pixels. Narrow/coarse-pointer/save-data devices
use 512 by 512 / 230k pixels. Animation targets 30 fps and can downscale under
sustained GPU or frame-cadence pressure. Hidden pages pause; reduced motion
produces a still. Canvas data attributes report the actual tier, dimensions,
trace duration and 120-draw timing windows.

Both fallback images are rendered from this same disk-only shader path.
Their t=14 frames use height-scaled atlases (4800x1200 desktop, 984x1200
portrait), positioned with the same CSS anchor that the renderer reads.
Keep `background-size: auto 100%`: `cover` changes the apparent black-hole
size on other aspect ratios. CSS owns the inclusive 0.82 portrait breakpoint;
its top-origin Y anchor is inverted for WebGL. The first frame stays frozen
through the canvas fade, then animation begins. Re-export both atlases when
changing the camera, framing, shader appearance or initial time.
There is no external model/data download: only the five local shader files
listed in the renderer are fetched. Unsupported WebGL or failed compilation
uses the matching static image while keeping the academic page usable.
