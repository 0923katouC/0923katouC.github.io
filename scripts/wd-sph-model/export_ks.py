"""Convert actual Phantom GRSPH dumps to renderer inputs, with provenance.

Input: analysis_wdexport native little-endian float64 stream, 4 header values
(t, count, equal particle mass, spin), then rows x,y,z,h,vx,vy,vz,u,rho*,rho,ut,P,W_i.
W_i is ONE HALF of particle mass times the self-gravitational potential.
Output is a static BL-time fluid snapshot mapped to Kerr-Schild coordinates.
The mapped points have differing KS times; this is explicitly a frozen-fluid
radiative snapshot, not a retarded-time movie or a steady hydrodynamic solution.
"""
from pathlib import Path
import argparse, json, math
import numpy as np


def phi_pair(distance, h):
    """Cubic-spline softened Newtonian potential per unit source mass."""
    q = distance / h
    with np.errstate(divide='ignore', invalid='ignore'):
        result = -1 / distance
        inner = (2 / 3 * q*q - .3*q**4 + .1*q**5 - 1.4) / h
        middle = (4 / 3*q*q - q**3 + .3*q**4 - q**5/30 - 1.6 + 1/(15*q)) / h
    return np.where(q < 1, inner, np.where(q < 2, middle, result))


def bound_core(q, mass):
    """Iteratively unbind against SPH self-potential; no BH potential here.

    This is a Newtonian comoving diagnostic at the weakly relativistic donor,
    consistent with the approximate Newtonian self-gravity in the GRSPH run.
    Potential of removed particles is subtracted with the compiled cubic
    softening. It is NOT a full relativistic invariant binding-energy test.
    """
    phi = 2 * q[:, 12] / mass
    bound = np.ones(len(q), dtype=bool)
    peak = int(q[:, 9].argmax())
    velocity = q[peak, 4:7].copy()
    history = []
    for iteration in range(40):
        kinetic = .5 * np.sum((q[:, 4:7] - velocity)**2, axis=1)
        newly_removed = np.flatnonzero(bound & (kinetic + q[:, 7] + phi >= 0))
        bound[newly_removed] = False
        history.append(int(bound.sum()))
        if not bound.any():
            break
        new_velocity = q[bound, 4:7].mean(axis=0)
        if not len(newly_removed) and np.max(abs(new_velocity - velocity)) < 1e-12:
            break
        velocity = new_velocity
        active = np.flatnonzero(bound)
        for first in range(0, len(newly_removed), 64):
            indices = newly_removed[first:first+64]
            distance = np.linalg.norm(q[active, None, :3] - q[None, indices, :3], axis=2)
            potential = .5 * (phi_pair(distance, q[active, None, 3]) + phi_pair(distance, q[None, indices, 3]))
            phi[active] -= mass * potential.sum(axis=1)
    return bound, history


def convert(raw, destination):
    flat = np.fromfile(raw, '<f8')
    time, count, mass, spin = flat[:4]
    q = flat[4:].reshape(int(count), 13)
    x, y, z = q[:, :3].T
    vx, vy, vz = q[:, 4:7].T
    a2 = spin**2
    b = x*x + y*y + z*z - a2
    r = np.sqrt(.5 * (b + np.sqrt(b*b + 4*a2*z*z)))
    sigma = r*r + a2*z*z/(r*r)
    delta = r*r - 2*r + a2
    drdt = (r*(x*vx + y*vy) + (r*r+a2)*z*vz/r) / sigma
    rplus, rminus = 1+math.sqrt(1-a2), 1-math.sqrt(1-a2)
    radial_phi = spin/(rplus-rminus) * np.log((r-rplus)/(r-rminus)) + np.arctan(spin/r)
    dphi_dt = 2*spin*r/(delta*(r*r+a2))*drdt
    c, s = np.cos(radial_phi), np.sin(radial_phi)
    kx, ky = c*x-s*y, s*x+c*y
    time_factor = 1+2*r/delta*drdt
    kvx = (c*vx-s*vy-dphi_dt*ky)/time_factor
    kvy = (s*vx+c*vy+dphi_dt*kx)/time_factor
    kvz = vz/time_factor
    positions = np.column_stack((kx, z, -ky))/2
    velocities = np.column_stack((kvx, kvz, -kvy))
    ut = q[:, 10]*time_factor

    # Independently verify the transformed four-velocity in the renderer's
    # (+++-), spin+y Kerr-Schild metric, Rs=1, M=.5, a=.43.
    ar, rr = spin/2, r/2
    den = rr*rr+ar*ar
    l = np.column_stack(((rr*positions[:,0]-ar*positions[:,2])/den,
                         positions[:,1]/rr,
                         (rr*positions[:,2]+ar*positions[:,0])/den))
    f = rr**3/(rr**4+ar*ar*positions[:,1]**2)
    space_u = velocities*ut[:,None]
    norm = (space_u**2).sum(axis=1)-ut*ut+f*((l*space_u).sum(axis=1)+ut)**2
    error = float(np.max(abs(norm+1)))
    if not np.isfinite(error) or error > 1e-7:
        raise ValueError(f'BL→KS four-velocity normalization failed: {error}')

    bound, history = bound_core(q, mass)
    peak = int(q[:,9].argmax())
    weights = np.full(int(count), mass/2)
    core_position = positions[bound].mean(axis=0)
    core_velocity = velocities[bound].mean(axis=0)
    core_radii = np.linalg.norm(positions[bound]-core_position, axis=1)
    row = np.column_stack((positions, q[:,3]/2, weights, q[:,9]*4, q[:,7], velocities)).astype('<f4')
    gamma = 5/3
    initial_raw = raw.parent/'wd_00000.raw'
    initial = np.fromfile(initial_raw, '<f8')[4:].reshape(int(count),13)
    initial_K = (gamma-1)*initial[:,7]/initial[:,9]**(gamma-1)
    K0 = float(np.median(initial_K)/4**(gamma-1))
    u_excess = np.maximum(q[:,7]-K0*(4*q[:,9])**(gamma-1)/(gamma-1),0)
    frame_id = f'{raw.parent.name}-t{round(time):04d}'
    binary = destination / (frame_id+'.f32')
    destination.mkdir(parents=True, exist_ok=True)
    row.tofile(binary)
    def time_shift(rvalue):
        return (2*rplus*np.log(rvalue-rplus)-2*rminus*np.log(rvalue-rminus))/(rplus-rminus)
    # Constant sets the starting CM to approximately t_KS=0.
    time_ks = (time+time_shift(r)-time_shift(90.158032285))/2
    metadata = {
        'version': 1, 'binary': binary.name, 'count': int(count),
        'columns': ['x','y','z','h','m','rho','u','vx','vy','vz'],
        'dtype': '<f4', 'stride': 10,
        'kernel': {'name':'cubic-spline','support':2,'normalization':'1/(pi*h^3)'},
        'thermodynamics': {'gamma':gamma,'K0':K0,
            'K0Definition':'median (gamma-1)u/rho_rest^(gamma-1) from the actual initial dump, converted to exported density units',
            'heatDefinition':'max(u-K0*rho_rest^(gamma-1)/(gamma-1),0)',
            'heatInterpretation':'entropy-excess proxy; includes numerical dissipation and is not a radiative temperature',
            'initialEntropyRelativeP01P99':(np.percentile(initial_K,[1,99])/np.median(initial_K)).tolist(),
            'uExcessPercentiles':{str(p):float(np.percentile(u_excess,p)) for p in [0,50,95,99,100]}},
        'time': float(time_ks.mean()), 'timeNativeBL': float(time),
        'timeKSRange': [float(time_ks.min()),float(time_ks.max())],
        'units': {'distance':'Rs=2GM_BH/c^2','time':'Rs/c','velocity':'c',
                  'mass':'c^2 Rs/G (BH mass=0.5)','density':'mass unit/Rs^3',
                  'internalEnergy':'c^2','coordinates':'ingoing Cartesian Kerr-Schild, spin+y'},
        'coreIndices': np.flatnonzero(bound).tolist(),
        'core': {'position':core_position.tolist(),'velocity':core_velocity.tolist(),
                 'densityPeakPosition':positions[peak].tolist(),
                 'mass':float(weights[bound].sum()),'massFraction':float(bound.mean()),
                 'radius90':float(np.percentile(core_radii,90)),
                 'radius99':float(np.percentile(core_radii,99)),
                 'unbindingCounts':history},
        'bounds': {'min':np.min(positions-2*q[:,3,None]/2,axis=0).tolist(),
                   'max':np.max(positions+2*q[:,3,None]/2,axis=0).tolist()},
        'diagnostics': {'maxTransformedFourVelocityNormError':error,
                        'totalMass':float(weights.sum()),'maxRestDensity':float(np.max(row[:,5])),
                        'allParticlesFinite':bool(np.isfinite(row).all())},
        'provenance': {'solver':'Phantom 2026.0.1',
            'commit':'ed34a9c2aec4a5687c14acebd684b4e8abeb7245',
            'source':'https://github.com/danieljprice/phantom',
            'nativeDump':str(raw.with_suffix('')), 'bhMsun':1e4,'wdTargetMsun':.5,
            'spinDimensionless':spin,'pericenterRg':25,'apocenterRg':475,
            'eos':'n=1.5 initial polytrope, gamma=5/3 evolved ideal-gas approximation',
            'physics':'fixed Kerr GRSPH, approximate Newtonian self-gravity, pressure, shock heating',
            'scope':'illustrative low-resolution fluid run; no magnetic field, radiation feedback or nuclear network',
            'timeSlice':'equal Boyer-Lindquist time mapped to KS; frozen-fluid radiative snapshot, not an equal-KS-time evolution',
            'coreFinder':'iterative Newtonian comoving kinetic+internal+self-potential unbinding with cubic softened potential; approximate diagnostic',
            'density':'rho is rest density; SPH m/h^3 reconstructs conserved density, not exactly rho',
        }
    }
    (destination/(frame_id+'.json')).write_text(json.dumps(metadata,indent=2))
    print(frame_id, 'core fraction',bound.mean(),'r core',np.linalg.norm(core_position),
          'core R90',metadata['core']['radius90'],'norm error',error,flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('raw',nargs='+',type=Path)
    parser.add_argument('--output',type=Path,default=Path('exports'))
    args=parser.parse_args()
    for raw in args.raw:
        convert(raw,args.output)
