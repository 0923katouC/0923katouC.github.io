#!/usr/bin/env python3
"""Pack an exported Phantom SPH snapshot into sparse browser volume grids.

Input is JSON describing little-endian float32 rows in Cartesian Kerr-Schild
coordinates with spin along +y and lengths in Schwarzschild radii. Core labels
must come from the physical solver/exporter; this tool does not infer a sphere.
The reconstructed density is coordinate kernel mass density, not the separately
exported relativistic rest density. It is suitable for the documented density
isosurface/emission proxy, not a resolved white-dwarf atmosphere.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import math
import sys
from pathlib import Path
from typing import Any

import numpy as np


COLUMNS = ["x", "y", "z", "h", "m", "rho", "u", "vx", "vy", "vz"]
KERNEL_SUPPORT = 2.0
RECORD_DTYPE = np.dtype([("index", "<u4"), ("values", "<f4", (5,))])


def cubic_kernel(q: np.ndarray) -> np.ndarray:
    """Three-dimensional cubic-spline shape, including its 1/pi factor.

    W(r,h) = cubic_kernel(r/h) / h**3; compact support is exactly 2h.
    This is Phantom's cubic-spline compile-time kernel, not a Gaussian fit.
    """
    q = np.asarray(q, dtype=np.float64)
    return np.where(
        q < 1.0,
        1.0 - 1.5 * q * q + 0.75 * q * q * q,
        np.where(q < 2.0, 0.25 * (2.0 - q) ** 3, 0.0),
    ) / math.pi


def load_snapshot(metadata_path: Path) -> tuple[dict[str, Any], np.ndarray, np.ndarray]:
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    if metadata.get("columns") != COLUMNS:
        raise ValueError(f"Snapshot columns must be {COLUMNS!r}")
    kernel = metadata.get("kernel", {})
    if kernel.get("name") != "cubic-spline" or kernel.get("support") != KERNEL_SUPPORT:
        raise ValueError("Only the verified Phantom cubic-spline kernel with support 2h is supported")
    count = int(metadata["count"])
    if count <= 0:
        raise ValueError("Snapshot must contain particles")
    binary_path = metadata_path.parent / metadata["binary"]
    binary = binary_path.read_bytes()
    if len(binary) != count * len(COLUMNS) * 4:
        raise ValueError("Particle binary size does not match count and 10 float32 columns")
    particles = np.frombuffer(binary, dtype="<f4").reshape(count, len(COLUMNS)).astype(np.float64)
    if not np.isfinite(particles).all():
        raise ValueError("Snapshot contains non-finite particle values")
    if np.any(particles[:, 3:5] <= 0.0) or np.any(particles[:, 5:7] < 0.0):
        raise ValueError("Particle smoothing length/mass must be positive; density/energy nonnegative")
    labels = np.asarray(metadata.get("coreIndices", []))
    if labels.ndim != 1 or len(labels) == 0 or not np.issubdtype(labels.dtype, np.integer):
        raise ValueError("coreIndices must be a nonempty array of solver-assigned integer particle indices")
    labels = labels.astype(np.int64)
    if np.any(labels < 0) or np.any(labels >= count) or len(np.unique(labels)) != len(labels):
        raise ValueError("coreIndices contains duplicate or out-of-range particle indices")
    core_position = np.asarray(metadata.get("core", {}).get("position"), dtype=np.float64)
    if core_position.shape != (3,) or not np.isfinite(core_position).all():
        raise ValueError("Solver-exported core.position must contain three finite coordinates")
    core_velocity = np.asarray(metadata.get("core", {}).get("velocity"), dtype=np.float64)
    if core_velocity.shape != (3,) or not np.isfinite(core_velocity).all():
        raise ValueError("Solver-exported core.velocity must contain three finite coordinate velocities")
    metadata["sourceHashes"] = {
        "metadataSha256": hashlib.sha256(metadata_path.read_bytes()).hexdigest(),
        "binarySha256": hashlib.sha256(binary).hexdigest(),
    }
    return metadata, particles, labels


def entropy_excess(
    particles: np.ndarray, thermodynamics: dict[str, Any]
) -> tuple[np.ndarray, dict[str, Any]]:
    """Replace u with a cold-polytrope-subtracted specific heating proxy.

    K0 must be calibrated from the initial snapshot in the exported density
    units. No claim is made that this low-resolution excess is a converged
    shock temperature or that degenerate internal energy becomes radiation.
    """
    gamma = float(thermodynamics["gamma"])
    k0 = float(thermodynamics["K0"])
    if not np.isfinite(gamma) or gamma <= 1.0 or not np.isfinite(k0) or k0 <= 0.0:
        raise ValueError("Thermodynamics must provide finite gamma > 1 and positive K0 in export units")
    converted = np.asarray(particles, dtype=np.float64).copy()
    cold_u = k0 * np.power(converted[:, 5], gamma - 1.0) / (gamma - 1.0)
    total_u = converted[:, 6].copy()
    converted[:, 6] = np.maximum(total_u - cold_u, 0.0)
    return converted, {
        "name": "entropy-excess proxy",
        "formula": "max(u - K0*rho_rest**(gamma-1)/(gamma-1), 0)",
        "gamma": gamma,
        "K0": k0,
        "specificUnits": "c^2",
        "interpretation": "irreversible-heating proxy above the calibrated initial cold polytrope; not observed radiation temperature or a converged shock diagnostic",
        "originalSpecificInternalEnergyRange": [float(np.min(total_u)), float(np.max(total_u))],
        "specificExcessRange": [float(np.min(converted[:, 6])), float(np.max(converted[:, 6]))],
        "clippedParticleCount": int(np.count_nonzero(total_u < cold_u)),
        "massWeightedExcess": float(np.sum(converted[:, 4] * converted[:, 6])),
    }


def rotate_snapshot(
    particles: np.ndarray, core_position: np.ndarray, target_x: float = 2.2
) -> tuple[np.ndarray, dict[str, Any]]:
    """Rotate all source positions/coordinate velocities, preserving Kerr's axis.

    Azimuth is atan2(z,x); the target is on the observer-facing +z side. No
    radial translation or particle/star scaling is performed.
    """
    core_position = np.asarray(core_position, dtype=np.float64)
    radius = float(np.hypot(core_position[0], core_position[2]))
    if not np.isfinite(target_x) or radius <= abs(target_x):
        raise ValueError("Requested core x must lie strictly inside its existing cylindrical radius")
    target_z = math.sqrt(radius * radius - target_x * target_x)
    angle = math.atan2(target_z, target_x) - math.atan2(core_position[2], core_position[0])
    cosine, sine = math.cos(angle), math.sin(angle)
    matrix = np.array([[cosine, 0.0, -sine], [0.0, 1.0, 0.0], [sine, 0.0, cosine]])
    rotated = np.asarray(particles, dtype=np.float64).copy()
    rotated[:, :3] = rotated[:, :3] @ matrix.T
    rotated[:, 7:10] = rotated[:, 7:10] @ matrix.T
    return rotated, {
        "axis": [0, 1, 0],
        "angleRadians": angle,
        "matrix": matrix.tolist(),
        "corePositionBefore": core_position.tolist(),
        "corePosition": (matrix @ core_position).tolist(),
        "physicalLengthScale": 1.0,
    }


def fit_flow_dimensions(particles: np.ndarray, caps: tuple[int, int, int]) -> tuple[int, int, int]:
    """Fit the flow's proportions without exceeding the requested x/y/z caps."""
    if not len(particles):
        return (8, 8, 8)
    support = KERNEL_SUPPORT * particles[:, 3, None]
    span = np.max(particles[:, :3] + support, axis=0) - np.min(particles[:, :3] - support, axis=0)
    spacing = float(np.max(span / np.asarray(caps)))
    dimensions = np.maximum(8, np.ceil(span / spacing / 4.0).astype(int) * 4)
    return tuple(int(value) for value in np.minimum(dimensions, caps))


def grid_geometry(
    particles: np.ndarray, dimensions: tuple[int, int, int], smoothing_voxels: float
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Pad every particle by its entire effective support, including broadening."""
    if len(dimensions) != 3 or any(n < 8 for n in dimensions):
        raise ValueError("Grid dimensions must each be at least 8")
    if not 0.5 <= smoothing_voxels <= 2.0:
        raise ValueError("Resolution smoothing must be between 0.5 and 2 voxel widths")
    position, original_h = particles[:, :3], particles[:, 3]
    effective_h = original_h.copy()
    # Effective h depends on voxel size; the padded grid size depends on h.
    # Solve that small fixed point so even edge particles retain full support.
    for _ in range(80):
        support = KERNEL_SUPPORT * effective_h[:, None]
        lo = np.min(position - support, axis=0)
        hi = np.max(position + support, axis=0)
        spacing = (hi - lo) / np.asarray(dimensions)
        updated_h = np.maximum(original_h, smoothing_voxels * float(np.max(spacing)))
        if np.max(np.abs(updated_h - effective_h)) <= 1e-11 * max(1.0, float(np.max(updated_h))):
            effective_h = updated_h
            break
        effective_h = updated_h
    else:
        raise ValueError("Padded grid/smoothing-length calculation failed to converge")
    support = KERNEL_SUPPORT * effective_h[:, None]
    lo = np.min(position - support, axis=0)
    hi = np.max(position + support, axis=0)
    spacing = (hi - lo) / np.asarray(dimensions)
    return lo, hi, spacing, effective_h


def splat_particles(
    particles: np.ndarray,
    dimensions: tuple[int, int, int],
    smoothing_voxels: float = 1.0,
) -> tuple[np.ndarray, dict[str, Any]]:
    """Deposit [rho, rho*vx, rho*vy, rho*vz, rho*u] at voxel centers.

    Each sampled kernel is normalized by its discrete volume integral. This
    conservative quadrature correction preserves particle mass and momentum;
    the uncorrected integral is also reported so undersampling is not hidden.
    Linear voxel index is x + nx*(y + ny*z), as in WebGL 3D texture upload.
    """
    particles = np.asarray(particles, dtype=np.float64)
    if particles.ndim != 2 or particles.shape[1] != len(COLUMNS) or not len(particles):
        raise ValueError("Splatting requires a nonempty (N,10) particle array")
    if not np.isfinite(particles).all() or np.any(particles[:, 3:5] <= 0.0):
        raise ValueError("Splatting requires finite particles with positive h and mass")
    dimensions = tuple(int(n) for n in dimensions)
    lo, hi, spacing, effective_h = grid_geometry(particles, dimensions, smoothing_voxels)
    voxel_volume = float(np.prod(spacing))
    field = np.zeros((math.prod(dimensions), 5), dtype=np.float64)
    nx, ny, _ = dimensions
    raw_mass = 0.0
    raw_normalization_min, raw_normalization_max = math.inf, 0.0
    for particle, h in zip(particles, effective_h):
        position, mass = particle[:3], float(particle[4])
        lower = np.maximum(0, np.ceil((position - 2.0 * h - lo) / spacing - 0.5).astype(int))
        upper = np.minimum(np.asarray(dimensions) - 1,
                           np.floor((position + 2.0 * h - lo) / spacing - 0.5).astype(int))
        axes = [np.arange(lower[k], upper[k] + 1) for k in range(3)]
        offsets = [(lo[k] + (axes[k] + 0.5) * spacing[k] - position[k]) / h for k in range(3)]
        q = np.sqrt(offsets[0][None, None, :] ** 2 + offsets[1][None, :, None] ** 2 +
                    offsets[2][:, None, None] ** 2)
        weights = cubic_kernel(q) / (h * h * h)
        integral = float(weights.sum() * voxel_volume)
        if not np.isfinite(integral) or integral <= 0.0:
            raise ValueError("A particle kernel has no finite sampled support; increase resolution smoothing")
        raw_normalization_min = min(raw_normalization_min, integral)
        raw_normalization_max = max(raw_normalization_max, integral)
        raw_mass += mass * integral
        indices = (axes[0][None, None, :] + nx *
                   (axes[1][None, :, None] + ny * axes[2][:, None, None])).ravel()
        density = (mass / integral * weights).ravel()
        values = np.array([1.0, *particle[7:10], particle[6]])
        field[indices] += density[:, None] * values[None, :]
    input_mass = float(np.sum(particles[:, 4]))
    deposited_mass = float(np.sum(field[:, 0]) * voxel_volume)
    input_momentum = np.sum(particles[:, 4, None] * particles[:, 7:10], axis=0)
    deposited_momentum = np.sum(field[:, 1:4], axis=0) * voxel_volume
    input_internal_energy = float(np.sum(particles[:, 4] * particles[:, 6]))
    return field, {
        "dimensions": list(dimensions),
        "min": lo.tolist(),
        "max": hi.tolist(),
        "voxelSize": spacing.tolist(),
        "voxelVolume": voxel_volume,
        "particleCount": len(particles),
        "smoothing": {
            "minimumVoxelWidths": smoothing_voxels,
            "originalHRange": [float(np.min(particles[:, 3])), float(np.max(particles[:, 3]))],
            "effectiveHRange": [float(np.min(effective_h)), float(np.max(effective_h))],
            "broadenedParticleCount": int(np.count_nonzero(effective_h > particles[:, 3] * (1.0 + 1e-10))),
            "discreteKernelNormalization": True,
            "uncorrectedKernelIntegralRange": [raw_normalization_min, raw_normalization_max],
        },
        "diagnostics": {
            "inputMass": input_mass,
            "uncorrectedQuadratureMass": raw_mass,
            "uncorrectedRelativeMassError": (raw_mass - input_mass) / input_mass,
            "depositedMass": deposited_mass,
            "depositedRelativeMassError": (deposited_mass - input_mass) / input_mass,
            "inputCoordinateMomentum": input_momentum.tolist(),
            "depositedCoordinateMomentum": deposited_momentum.tolist(),
            "inputInternalEnergy": input_internal_energy,
            "depositedInternalEnergy": float(np.sum(field[:, 4]) * voxel_volume),
        },
    }


def sparse_records(
    field: np.ndarray, metadata: dict[str, Any], threshold: float = 1e-7
) -> tuple[bytes, dict[str, Any]]:
    """Encode little-endian uint32 index + five premultiplied float32 values."""
    if not 0.0 <= threshold < 1.0:
        raise ValueError("Sparse threshold must be in [0,1)")
    metadata = json.loads(json.dumps(metadata))
    density_scale = float(np.max(field[:, 0]))
    positive = field[:, 0] > 0.0
    if density_scale <= 0.0 or not np.isfinite(field).all():
        raise ValueError("Volume must contain finite positive density")
    energy = field[positive, 4] / field[positive, 0]
    energy_scale = max(float(np.max(energy)), 1e-30)
    kept = np.flatnonzero(field[:, 0] > density_scale * threshold)
    records = np.empty(len(kept), dtype=RECORD_DTYPE)
    records["index"] = kept
    normalized = field[kept] / density_scale
    normalized[:, 4] /= energy_scale
    records["values"] = normalized
    if not np.isfinite(records["values"]).all():
        raise ValueError("Normalized sparse values overflow float32")
    # Include float32 encoding and sparse omission in the final mass diagnostic.
    decoded_mass = float(np.sum(records["values"][:, 0], dtype=np.float64) *
                         density_scale * metadata["voxelVolume"])
    texture_mass = float(np.sum(records["values"][:, 0].astype(np.float16), dtype=np.float64) *
                         density_scale * metadata["voxelVolume"])
    input_mass = metadata["diagnostics"]["inputMass"]
    metadata.update({
        "densityScale": density_scale,
        "energyScale": energy_scale,
        "recordCount": len(records),
        "recordStride": RECORD_DTYPE.itemsize,
        "recordFormat": "little-endian uint32 index, float32[5]",
        "channels": ["rho/densityScale", "rho*vx/densityScale", "rho*vy/densityScale",
                     "rho*vz/densityScale", "rho*u/(densityScale*energyScale)"],
        "indexOrder": "x + nx*(y + ny*z)",
        "sparseRelativeDensityThreshold": threshold,
    })
    metadata["diagnostics"].update({
        "encodedMass": decoded_mass,
        "encodedRelativeMassError": (decoded_mass - input_mass) / input_mass,
        "halfFloatTextureMass": texture_mass,
        "halfFloatTextureRelativeMassError": (texture_mass - input_mass) / input_mass,
        "omittedMass": float(np.sum(field[:, 0]) * metadata["voxelVolume"] -
                             np.sum(field[kept, 0]) * metadata["voxelVolume"]),
    })
    return records.tobytes(), metadata


def build_volumes(
    snapshot_path: Path,
    output_directory: Path,
    *,
    target_core_x: float = 2.2,
    core_resolution: int = 64,
    flow_caps: tuple[int, int, int] = (128, 32, 128),
    smoothing_voxels: float = 1.0,
    sparse_threshold: float = 1e-7,
    compression: str = "gzip",
    prefix: str = "wd-volume",
) -> dict[str, Any]:
    source, particles, core_indices = load_snapshot(snapshot_path)
    if "thermodynamics" not in source:
        raise ValueError("Snapshot needs calibrated thermodynamics.gamma and thermodynamics.K0 for the heat proxy")
    particles, heat = entropy_excess(particles, source["thermodynamics"])
    particles, rotation = rotate_snapshot(particles, source["core"]["position"], target_core_x)
    core_mask = np.zeros(len(particles), dtype=bool)
    core_mask[core_indices] = True
    rotation_matrix = np.asarray(rotation["matrix"])
    rotated_core = dict(source["core"])
    for name in ("position", "velocity", "densityPeakPosition"):
        if name in rotated_core:
            rotated_core[name] = (rotation_matrix @ np.asarray(rotated_core[name])).tolist()
    output = {
        "version": 1,
        "format": "phantom-sph-sparse-volume-v1",
        "source": {key: source[key] for key in
                   ("binary", "count", "time", "timeNativeBL", "timeKSRange", "units", "provenance",
                    "kernel", "thermodynamics", "diagnostics", "sourceHashes") if key in source},
        "rotation": rotation,
        "core": {**rotated_core,
                 "particleCount": len(core_indices), "photosphereDensityFraction": 0.02},
        "densityDefinition": "coordinate kernel mass density reconstructed from particle masses; not exported rest density",
        "surfaceModel": "Core density boundary at 0.02 of peak coordinate kernel density is a grey photosphere proxy; unbound tails use an optically thin emissive-skin approximation. Neither is a calibrated atmosphere or opacity solution.",
        "smoothingModel": "Phantom cubic spline with h_eff=max(h,minimumVoxelWidths*largestVoxelWidth); full 2h_eff support and conservative discrete quadrature normalization",
        "velocityDefinition": "mass-density-weighted coordinate velocity dx/dt; convert and normalize in the local spacetime metric before radiative transfer",
        "energyDefinition": "mass-density-weighted specific entropy-excess proxy, with calibrated cold polytropic internal energy subtracted",
        "heat": heat,
        "grids": {},
    }
    pending_files: dict[str, bytes] = {}
    for name, mask, dimensions in (
        ("core", core_mask, (core_resolution,) * 3),
        ("flow", ~core_mask, fit_flow_dimensions(particles[~core_mask], flow_caps)),
    ):
        if not np.any(mask):
            output["grids"][name] = {"empty": True, "particleCount": 0, "recordCount": 0}
            continue
        field, grid = splat_particles(particles[mask], dimensions, smoothing_voxels)
        raw, grid = sparse_records(field, grid, sparse_threshold)
        error = abs(grid["diagnostics"]["uncorrectedRelativeMassError"])
        if error > 0.03 or abs(grid["diagnostics"]["encodedRelativeMassError"]) > 0.03 or \
                abs(grid["diagnostics"]["halfFloatTextureRelativeMassError"]) > 0.03:
            raise ValueError(f"{name} volume mass error exceeds 3%; increase resolution smoothing or grid resolution")
        if compression == "gzip":
            stored = gzip.compress(raw, compresslevel=9, mtime=0)
            filename = f"{prefix}-{name}.bin.gz"
        elif compression == "none":
            stored = raw
            filename = f"{prefix}-{name}.bin"
        else:
            raise ValueError("Compression must be gzip or none")
        grid.update({"file": filename, "compression": compression, "storedBytes": len(stored),
                     "photosphereDensityFraction": 0.02 if name == "core" else None,
                     "uncompressedBytes": len(raw), "sha256": hashlib.sha256(stored).hexdigest()})
        output["grids"][name] = grid
        pending_files[filename] = stored
    output["totalStoredBytes"] = sum(len(value) for value in pending_files.values())
    output["totalUncompressedBytes"] = sum(grid.get("uncompressedBytes", 0) for grid in output["grids"].values())
    # Finish all validation before producing a user-consumable metadata file.
    output_directory.mkdir(parents=True, exist_ok=True)
    for filename, content in pending_files.items():
        (output_directory / filename).write_bytes(content)
    (output_directory / f"{prefix}.json").write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path, help="Metadata JSON from the actual Phantom export")
    parser.add_argument("output", type=Path, help="Directory for sparse grids and metadata")
    parser.add_argument("--target-core-x", type=float, default=2.2)
    parser.add_argument("--core-resolution", type=int, default=64)
    parser.add_argument("--flow-caps", type=int, nargs=3, default=(128, 32, 128), metavar=("NX", "NY", "NZ"))
    parser.add_argument("--smoothing-voxels", type=float, default=1.0)
    parser.add_argument("--sparse-threshold", type=float, default=1e-7)
    parser.add_argument("--compression", choices=("gzip", "none"), default="gzip")
    parser.add_argument("--prefix", default="wd-volume")
    args = parser.parse_args()
    result = build_volumes(args.snapshot, args.output, target_core_x=args.target_core_x,
                           core_resolution=args.core_resolution, flow_caps=tuple(args.flow_caps),
                           smoothing_voxels=args.smoothing_voxels, sparse_threshold=args.sparse_threshold,
                           compression=args.compression, prefix=args.prefix)
    print(json.dumps({"storedBytes": result["totalStoredBytes"],
                      "uncompressedBytes": result["totalUncompressedBytes"],
                      "grids": {name: grid.get("diagnostics", {}) for name, grid in result["grids"].items()}}, indent=2))
    if result["totalStoredBytes"] > 3 * 1024 * 1024:
        print("Volume assets exceed 3 MiB; review measured size before choosing coarser grid caps.", file=sys.stderr)


if __name__ == "__main__":
    main()
