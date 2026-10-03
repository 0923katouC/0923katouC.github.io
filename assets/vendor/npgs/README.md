# NPGS black-hole background

This renderer is adapted from [baopinshui/NPGS](https://github.com/baopinshui/NPGS),
specifically [`BlackHole_common.glsl`](https://github.com/baopinshui/NPGS/blob/91305ca1661f18b60d6d33ed4616e4cd5b977b9f/NPGS/Sources/Engine/Shaders/BlackHole_common.glsl)
at commit `91305ca1661f18b60d6d33ed4616e4cd5b977b9f`.
The upstream work is by baopinshui and the NPGS contributors.

The adapted renderer and its shader files are distributed under the
GNU General Public License, version 3; a complete copy is in [LICENSE](LICENSE).
The readable JavaScript and GLSL served by the website are the corresponding
source of this component. They are also available in this website's GitHub repository.

## Material model: a computed partial disruption

The WD and its tails now come from a real, offline **Phantom GRSPH** calculation,
not the former radial test-particle line. Phantom was built from commit
`ed34a9c2aec4a5687c14acebd684b4e8abeb7245` with `SETUP=grtde`, a fixed Kerr
metric, pressure, approximate Newtonian stellar self-gravity and shock heating.

The setup follows the regime of [Mahapatra et al., partial WD disruptions](https://arxiv.org/html/2410.12727v2):
BH mass 10,000 solar masses, initial WD mass 0.5 solar masses and radius
0.0141 solar radii, pericentre 25 rg and apocentre 475 rg (e=0.9).
Our spin is a*=0.86. The exact chosen radius gives beta=0.7213.
An n=1.5 initial polytrope and evolved gamma=5/3 gas approximate the WD;
this is not a full degenerate EOS, nuclear network, or evolving Einstein metric.
Exact Kerr E,L were solved for the orbit rather than using the setup's
Newtonian orbital initializer.

The displayed snapshot is at native t=1000 rg/c (about 49.26 seconds after
initialization). The core has moved out to 31.54 Rs. Its two tails have NOT
already circularized into the inner disc. The inner disc is a separate,
pre-existing prescribed flow; the figure does not claim this encounter has
created that disc or its jet. This distinction is essential: fallback,
stream self-intersection and circularization are different processes.
See [Rossi, Servin & Kesden on circularization](https://doi.org/10.1103/PhysRevD.104.103019).

### Numerical checks and reproducibility

- 16,384 particles: relaxed Ekin/|W|=9.99e-8, virial ratio about 0.9964.
- Iteratively self-bound core fraction: 81.47%; a 4,096-particle comparison
  gives 81.76%. This is a resolution sensitivity check, not paper-grade convergence.
- An isolated-star control evolved for the same duration changes R90 by -0.60%.
- The deformed core's R90=0.735 Rs is measured from the simulated particles;
  it is not an arbitrarily enlarged stellar radius or a spherical photosphere.
- BL-to-Kerr-Schild four-velocity normalization residual is below 9e-16.
- Heating is less well converged and is used only as an entropy-excess display proxy.

Run configurations, exporter, coordinate conversion, source commit and detailed
checks are in [scripts/wd-sph-model](../../../scripts/wd-sph-model/README.txt).
The original particle snapshot and metadata are in
[assets/data/wd-sph/raw](../../data/wd-sph/raw/).
`python scripts/build_wd_volume.py SNAPSHOT.json OUTPUT` reconstructs the grids;
it needs NumPy. `python -B -m unittest discover -s tests -v` checks conservative
SPH deposition, velocity/momentum rotation, heat subtraction, encoding and the
publication synchronizer.

## Rendering the computed fluid

The SPH cubic-spline kernels reconstruct density and density-weighted velocity
on a 64-cubed core grid and a 128-by-28-by-104 tail grid. Sparse gzip assets total
about 2.85 MiB. Coordinate kernel mass density is distinguished from relativistic
rest density. Discrete kernel normalization preserves mass and momentum;
FP16 density conversion changes mass by less than 0.0004% in these grids.
Cold-polytrope internal energy is subtracted before constructing the heat proxy.

The dense core is rendered at an isodensity boundary of 2% of its peak coordinate
kernel density. This is an unresolved **grey photosphere proxy**, not an opacity
calculation. Its shape, local velocities and deformation come from the SPH
snapshot. Limb darkening and modest irradiation/entropy modulation provide a
readable surface without adding planet-like terrain. Tails use an optically thin
emissive-skin approximation with density-squared emissivity. Their bulk opacity,
scattering and radiation feedback are not solved. Temperatures, normalization
and the warm/cool display palette are illustrative, not a predicted spectrum.

All core intersections, tail emission, disc images and jet emission use the
same numerical Kerr null geodesics. The photon momentum starts in the finite
observer's local orthonormal tetrad, with adaptive RK4 integration. The trace
step is continuously limited near the reconstructed fluid. Both passes stop at
the same core surface and split volume integration at foreground disc crossings.
A dense-core surface never erases emission already collected in front of it.

The stored fluid slice is simultaneous in Boyer-Lindquist time. Mapping it to
Kerr-Schild coordinates produces a KS-time spread of 0.12925 Rs/c (0.01273 s).
We use the standard frozen-fluid / fast-light approximation. Browser animation
advects the separate disc emission and modulates the prescribed jet; it does
not pretend the fixed hydro grid is a time-evolving disruption movie.

## Disc and jet radiation models

The inner disc retains two lensed surface images. Kerr orbital angular velocity
sets its texture advection; slow radial drift uses alpha=0.1 and H/R=0.08.
Higher-order images receive no arbitrary brightness bonus. This is a thin-flow
visualization, not the thick, radiating outflow of a newly formed TDE disc.

The jet is a **semi-analytic optically thin funnel**, not a GRMHD simulation.
It has finite-base parabolic expansion, a broad soft sheath and weak spine;
velocity follows the expanding streamlines in the local tetrad. Prescribed
mass-flux and field scalings are n~1/(gamma*v*W^2), Bp~W^-2 and Bphi~W^-1.
The plasma-frame perpendicular field is computed covariantly. A power-law
population with p=2.4 gives spectral index 0.7 and transfer proportional to
`g^3.7 j_normalized dl_emit` in the selected band. Low-amplitude harmonic moments
retain emission-time delay. There is no post-process bend or offset of the jet.

Method references: [ipole](https://arxiv.org/abs/1712.03057),
[RAPTOR I](https://arxiv.org/abs/1801.10452),
[BHOSS](https://arxiv.org/abs/1907.09196).
Funnel geometry is motivated by [Nakamura et al.](https://arxiv.org/abs/1810.09963),
not fitted to that M87 calculation. Magnetic flux and accretion state are
additional assumptions; spin alone does not guarantee a jet.

## Observer and quality

The whole SPH field, including velocities, is rotated around the Kerr symmetry
axis. The observer is at R=48 Rs, 10 degrees above the disc, while the donor is
on the near side at R=31.54 Rs. Its apparent size therefore increases through
perspective and its actual simulated deformation, without rescaling particle
positions or the stellar mass. A 55-degree camera roll frames core and tails.

Two trace passes retain six RGBA16F maps while respecting WebGL 2's minimum of
four simultaneous render targets. The ray grid covers 52 Rs with extra central
sampling. Desktop uses 1152 by 1152 maps and at most 2.1M
output pixels; four-or-fewer logical CPU devices use 832 by 832 and 1.1M pixels.
Narrow/coarse-pointer or save-data devices use 512 by 512 and 230k pixels.
Animation targets 30 fps with sustained-load downscaling. Hidden tabs pause;
reduced-motion produces a still frame. The first trace is batched over frames,
and unsupported hardware or data-loading failure displays the matching fallback.
Canvas data attributes expose actual resolution, trace timing and 120-draw
performance samples. These are measurements of the current device, not universal
integrated-GPU performance guarantees.
