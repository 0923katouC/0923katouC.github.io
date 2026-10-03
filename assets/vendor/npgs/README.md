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

The NPGS spiral/inflow coordinates and strong layered disk texture are restored.
Differential orbital motion, retarded emission time, warm temperature mapping
and bounded bloom provide the visual animation. Fine sinusoidal bands are
attenuated by their pixel footprint to reduce moire. This surface-emission
animation is an illustrative web adaptation, not a hydrodynamic simulation.

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
