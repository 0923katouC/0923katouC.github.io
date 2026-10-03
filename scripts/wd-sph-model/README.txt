REPRODUCING THE WHITE-DWARF PARTIAL-STRIPPING VISUALIZATION DATA

This package contains configuration and conversion code, not a scientific
claim of converged white-dwarf accretion, disk formation, or jet launching.
It does not contain executables, full Phantom source, or large native dumps.

MODEL AND SOURCES

Official Phantom commit: ed34a9c2aec4a5687c14acebd684b4e8abeb7245
Repository: https://github.com/danieljprice/phantom
Official setup guide: https://phantomsph.readthedocs.io/en/master/examples/star.html
Paper motivating the partial encounter: Mahapatra et al., arXiv:2410.12727
https://arxiv.org/abs/2410.12727
This is a parameter-inspired experiment, not the authors' simulation data.

BH mass 10,000 solar masses; target WD mass 0.5 solar masses; initial nominal
WD radius 0.0141 solar radii. The WD is an n=1.5 polytrope evolved with a
gamma=5/3 ideal-gas law, an approximation to a low-mass degenerate WD.
The external spacetime is fixed Kerr with dimensionless spin 0.86. Phantom
solves GR hydrodynamics with approximate Newtonian stellar self-gravity.
Pressure, PdV work, shock viscosity and shock conductivity are active.
This is not full evolving-spacetime numerical relativity or GRMHD.

The equatorial, prograde orbit has BL turning points rp=25 rg, ra=475 rg,
with rg=GM_BH/c^2. Its eccentricity parameter is (ra-rp)/(ra+rp)=0.9.
The initial position/velocity was solved from the exact Kerr radial
potential with E=0.9980046044893287 and Lz=7.116042346069622 (M=1).
It starts at approximately 5 tidal radii. See orbit-provenance.json.
For the chosen mass/radius, beta is approximately 0.72, not exactly 0.7.
Small physical-constant convention differences exist between Phantom's
solar constants and the values recorded in the orbit-generation calculation.

IMPORTANT SETUP DETAIL

The supplied upstream eccentric-orbit initializer is Newtonian and sets
spin to zero. These cases therefore use provide_params=T and explicit
Kerr initial Cartesian-like BL positions and coordinate velocities.
The runtime wd.in explicitly sets a=0.86 after stellar relaxation.
Phantom's setup output may print a default pericentre from unused beta
parameters in this manual mode. That printed value is not this orbit.
The manual Cartesian state and the runtime metric determine the orbit.

FILES

cases/n4096 and cases/n16384 contain the actual wd.setup parameters.
executed.in is the input block captured in the completed run's stdout.
wd.in contains the same physical runtime settings with only the log and
initial-dump paths normalized for running inside each case directory.
completed.in is Phantom's automatically rewritten final restart input.
Do not use completed.in to start a new run.
relaxation-final.txt contains the last recorded relaxation diagnostics.
verification.json records resolution comparison and isolated-star control.
export_ks.py needs Python 3 and NumPy; tested with NumPy 2.3.5.
analysis_wdexport.f90 is a small read-only Phantom output adapter.

BUILD AND RUN

The following commands assume the working directory is this package and
gfortran, make, git and Python/NumPy are installed. Use the compiler name
on PATH; no original user's filesystem paths are required.

git clone https://github.com/danieljprice/phantom.git phantom-src
git -C phantom-src checkout ed34a9c2aec4a5687c14acebd684b4e8abeb7245
make -C phantom-src SYSTEM=gfortran SETUP=grtde
make -C phantom-src SYSTEM=gfortran SETUP=grtde setup

Build sequentially. A parallel make from a clean tree encountered Fortran
module dependency races in the original environment.

For the 16,384-particle case:

mkdir -p runs/n16384
cp cases/n16384/wd.setup runs/n16384/wd.setup
(cd runs/n16384 && OMP_NUM_THREADS=4 ../../phantom-src/bin/phantomsetup wd --maxp=40000 > setup.log 2>&1)
cp cases/n16384/wd.in runs/n16384/wd.in
(cd runs/n16384 && OMP_NUM_THREADS=4 ../../phantom-src/bin/phantom wd.in --maxp=40000 > run.stdout 2>&1)

Repeat with n4096 and --maxp=20000 for the coarse comparison.
Separate case directories are required because relaxation snapshots are
reused by Phantom when present. Do not mix different particle counts in
one directory. --maxp avoids unnecessarily large default allocations.

The recorded encounter runtime was 53.62 seconds for 16,384 particles and
8.75 seconds for 4,096 particles, excluding compilation and relaxation.
These are observations from one machine, not promised timings.
The 10-minute wall limit in wd.in is a checkpoint limit; on a slower
machine Phantom's rewritten restart input can be run again to reach tmax.

EXPORT

cp analysis_wdexport.f90 phantom-src/src/utils/analysis_wdexport.f90
make -C phantom-src SYSTEM=gfortran SETUP=grtde ANALYSIS=analysis_wdexport.f90 analysis
(cd runs/n16384 && OMP_NUM_THREADS=2 ../../phantom-src/bin/phantomanalysis wd_00000 wd_00100 > export.log 2>&1)
python3 export_ks.py runs/n16384/wd_00100.raw --output exports

For 4,096 particles the final dump is wd_00050 (dtmax=20 instead of 10).
The initial wd_00000.raw must be exported too: it supplies the actual
initial entropy baseline. Phantom renames the starting .tmp dump when
the simulation begins, so the completed initial file has no .tmp suffix.

An optional isolated-star control uses exactly the same initial 4,096
particles and bulk velocity with the central mass switched off:

mkdir -p runs/control4096
cp runs/n4096/wd_00000 runs/control4096/isolated_00000
cp cases/control4096/isolated.in runs/control4096/isolated.in
(cd runs/control4096 && OMP_NUM_THREADS=4 ../../phantom-src/bin/phantom isolated.in --maxp=20000 > run.stdout 2>&1)

Its recorded R90 changed by -0.60% over the same duration, compared with
the much larger deformation in the tidal encounter. This control is a
finite-resolution equilibrium check, not a proof of all numerical accuracy.

NATIVE AND RENDERER DATA

The adapter writes little-endian float64 streams. Four header values are
t_BL, particle_count, equal_particle_mass and BH spin. Each particle has
13 values: x,y,z,h,vx,vy,vz,u,rho_conserved,rho_rest,ut,P,W_i.
W_i is half the particle mass times its self-gravitational potential.
It is not the specific potential and does not include the BH potential.
Native units have G=M_BH=c=1, with spin along +z. Native coordinates are
Cartesian-like Boyer-Lindquist coordinates, NOT Kerr-Schild coordinates.

The Python converter transforms positions and velocities from BL to
ingoing Kerr-Schild, then applies the proper spatial rotation
(x,y,z)->(x,z,-y). Length and time units change from rg to Rs=2rg.
It verifies g(u,u)=-1 in the renderer's Kerr metric independently.
Particle data are then packed as little-endian Float32 rows:
x,y,z,h,m,rho,u,vx,vy,vz, with velocities dx/dt_KS in units c.
rho is REST density. Depositing SPH m/h^3 reconstructs conserved density,
which differs slightly from rest density in a relativistic flow.
The kernel is M4 cubic spline, support radius 2h, normalization 1/(pi h^3).

coreIndices are found by iterative Newtonian comoving unbinding, using
relative kinetic energy, internal energy and self-gravity. Potential
contributions from removed particles are subtracted with cubic-spline
softening. This is an approximate diagnostic, not an invariant GR test.

The initial gamma-law entropy K0 is measured from the actual t=0 dump.
The heat proxy is max(u - K0*rho_rest^(gamma-1)/(gamma-1), 0).
It includes numerical dissipation and is NOT a radiative temperature.
The heat amplitude is not quantitatively converged between these runs.

WHAT THE PRIMARY SNAPSHOT DOES AND DOES NOT SHOW

At t_BL=1000 rg/c (about 49.26 s after the initial setup), the 16,384-particle
core retains 81.4697% of the WD mass. The 4,096-particle result is 81.7627%.
The core mass-center distance is 31.5414 Rs. Its three-dimensional radius
enclosing 90% of the bound particles is 0.735251 Rs, versus 0.729619 Rs
in the coarse run. This increased extent is present in the simulated
tidally deformed particle distribution: no stellar radius multiplier
was applied. R90 is NOT a spherical stellar radius or a photosphere.
A surface extracted from density is a rendering isosurface unless an
opacity model and optical-depth calculation independently define it.

This is one equal-BL-time fluid snapshot mapped into KS coordinates.
For this frame, mapped KS times span 499.563455516 to 499.692705624 Rs/c
after subtracting an arbitrary constant. The spread is 0.129250108 Rs/c,
about 0.01273 s. Treating the entire field as frozen is a fast-light
radiative approximation, not an equal-KS-time dynamic fluid solution.

No accretion disk, stream circularization, magnetic field or jet was
simulated here. Any inner flow in the website is a separate prescribed
pre-existing component, not gas demonstrably accreted from these tails.
Any jet remains a semi-analytic emission model, not a GRMHD prediction.
No synthetic stream connecting this donor to an inner disk is warranted.

These low-resolution runs support an illustrative physical morphology;
they are not publication-level convergence or an observational forecast.
