# Orbit Atlas — Newtonian central potential

This is a planar test-particle experiment in a fixed point-mass potential.
There is no self-gravity, drag, radiation reaction or relativistic precession.
The source lies at the focus, not at the center of each ellipse.

## Definitions and units

Choose a reference length \(r_0\) and write \(\mu=GM\).
The plotted dimensionless units are

\[
[r]=r_0,\quad [t]=\sqrt{r_0^3/\mu},\quad
[E]=\mu/r_0,\quad [L]=\sqrt{\mu r_0}.
\]

Thus \(\mu=1\) in the code. \(E=v^2/2-1/r\) is **specific**
mechanical energy and \(L=|\mathbf r\times\mathbf v|\) is the magnitude
of **specific** angular momentum. \(v_r=dr/dt\). They are not total
energy or total angular momentum. The E–L panel is a space of integrals
of motion, not the full phase space. The radial panel is \((r,v_r)\);
with unit test-particle mass it also represents the reduced canonical
\((r,p_r)\) plane at a fixed L.

The interface uses \(0.25\le L\le2.5\) and \(-1.5\le E\le1\).
The collision problem at L=0 is intentionally outside this experiment.

## Allowed region and orbit geometry

\[
\tfrac12v_r^2+V_{\rm eff}(r)=E,\quad
V_{\rm eff}(r)=\frac{L^2}{2r^2}-\frac1r,\quad
r_c=L^2,\quad E_c=-\frac1{2L^2}.
\]

No physical orbit exists for \(E<E_c\). Equality gives a stable circle.
Above that boundary: E<0 gives an ellipse, E=0 a parabola, E>0 a hyperbola.

\[
e=\sqrt{1+2EL^2},\quad p=L^2,\quad r(\theta)=\frac p{1+e\cos\theta},
\quad r_p=\frac p{1+e}.
\]

For E<0, \(a=-1/(2E)\), \(r_a=a(1+e)\) and \(T=2\pi a^{3/2}\).
For E>=0 the apoapsis and period do not exist; infinity is shown for
apoapsis and a dash for period. Periapsis is oriented along +x, motion is
counterclockwise and t=0 is periapsis for every orbit.

## Time evolution

The path is sampled in true anomaly for drawing only. The particle is **not**
advanced uniformly in anomaly. It solves the universal Kepler equation
from periapsis. Let \(\alpha=-2E,\ z=\alpha\chi^2\). Then

\[
t=r_p\chi+(1-\alpha r_p)\chi^3 S(z),\qquad
x=r_p-\chi^2C(z),\qquad y=L\chi[1-zS(z)].
\]

\[
v_x=\frac{\chi[zS(z)-1]}r,\qquad
v_y=\frac L{r_p}\left[1-\frac{\chi^2 C(z)}r\right].
\]

Here \(C(z)=\sum_{k=0}^\infty(-z)^k/(2k+2)!\) and
\(S(z)=\sum_{k=0}^\infty(-z)^k/(2k+3)!\) are Stumpff functions.
The implementation uses their trigonometric/hyperbolic forms away from zero
and an 11-term series for |z|<0.1. Since dt/dchi=r>0, bracketing and 64
bisection steps robustly invert the time equation. No time-stepping
integration accumulates energy drift. Roundoff-sized e² at the circular
boundary is snapped to zero.

## Display conventions

Bound orbits fitting inside R=max(12,3rp) show the full ellipse.
Open and very wide orbits show their segment inside that radius. Their
animation pauses at the outbound boundary; restarting starts at the
inbound boundary. This is a viewing window, not a force cutoff or an
artificially closed orbit. The physical orbit is still defined outside it.
The effective-potential plot clips a very deep well below its displayed
vertical range and labels this explicitly.

The current orbit is solid copper; up to five retained paths use distinct
colors and dashed strokes. They share a single spatial scale and physical
time, with synchronized periapsis passage at t=0. Closed retained orbits
use their own periods; retained segments outside their time window are
hidden. Adjusting E or L resets t to zero. Time scrubbing pauses playback.
Reduced-motion preferences start the experiment paused, and animation
work stops in a hidden tab.

## Validation

Run the dependency-free model tests:

    node --test tests/orbits.test.mjs

Tests cover allowed/forbidden regions, circular minima, energy and
angular-momentum conservation throughout the UI domain, independent uniform
circular motion, Kepler's third law, independent Barker-equation solutions,
continuity at E=±1e-12, inverse-square acceleration, and window endpoints.

The orbits-browser.mjs script checks the actual page in Chromium at desktop,
mobile and 320px widths: CSP, numerical inputs, four conic presets, invalid
states, pinning/removal, same-energy families, keyboard/pointer selection,
playback/scrubbing and the directory link. GitHub Actions uploads screenshots.
