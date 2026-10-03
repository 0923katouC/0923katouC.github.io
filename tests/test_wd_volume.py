"""Physical conservation and binary-contract tests for SPH volume packing."""

import gzip
import json
import math
import tempfile
import unittest
from pathlib import Path

import numpy as np

from scripts import build_wd_volume as volume


def particle(position, h=0.2, mass=2.0, energy=0.03, velocity=(0.1, -0.2, 0.3)):
    return [*position, h, mass, 1.0, energy, *velocity]


class KernelConservationTests(unittest.TestCase):
    def test_heat_removes_calibrated_cold_polytrope_without_changing_dynamics(self):
        source = np.array([particle((1.0, 0.0, 2.0)), particle((1.2, 0.0, 2.1))])
        gamma, k0 = 5.0 / 3.0, 0.004
        source[:, 5] = [0.002, 0.003]
        cold = k0 * source[:, 5] ** (gamma - 1.0) / (gamma - 1.0)
        source[:, 6] = cold + np.array([-1e-8, 2e-7])
        heated, metadata = volume.entropy_excess(source, {"gamma": gamma, "K0": k0})
        np.testing.assert_allclose(heated[:, 6], [0.0, 2e-7], rtol=1e-12, atol=1e-18)
        np.testing.assert_array_equal(heated[:, :6], source[:, :6])
        np.testing.assert_array_equal(heated[:, 7:], source[:, 7:])
        self.assertEqual(metadata["clippedParticleCount"], 1)

    def test_cubic_kernel_is_normalized_and_has_compact_support(self):
        q = np.linspace(0.0, 2.0, 20001)
        radial_integrand = 4.0 * math.pi * q * q * volume.cubic_kernel(q)
        integral = np.trapezoid(radial_integrand, q)
        self.assertAlmostEqual(float(integral), 1.0, places=10)
        np.testing.assert_array_equal(volume.cubic_kernel(np.array([2.0, 2.1, 4.0])), 0.0)

    def test_single_particle_mass_momentum_energy_and_symmetry(self):
        source = np.array([particle((3.0, -1.0, 2.0))])
        field, metadata = volume.splat_particles(source, (40, 40, 40))
        cell_volume = metadata["voxelVolume"]
        np.testing.assert_allclose(field.sum(axis=0) * cell_volume,
                                   [2.0, 0.2, -0.4, 0.6, 0.06], rtol=2e-12, atol=1e-13)
        self.assertLess(abs(metadata["diagnostics"]["uncorrectedRelativeMassError"]), 2e-5)
        cube = field[:, 0].reshape(40, 40, 40)
        np.testing.assert_allclose(cube, cube[::-1, :, :], rtol=1e-12, atol=1e-12)
        np.testing.assert_allclose(cube, cube[:, :, ::-1], rtol=1e-12, atol=1e-12)

    def test_uniform_translation_preserves_sampled_density_and_momentum(self):
        source = np.array([particle((-0.7, 0.1, 0.3), mass=1.0),
                           particle((0.3, -0.2, 0.7), mass=3.0, velocity=(-0.2, 0.4, 0.1))])
        shifted = source.copy()
        displacement = np.array([20.0, -8.0, 3.0])
        shifted[:, :3] += displacement
        original, metadata = volume.splat_particles(source, (36, 24, 36))
        translated, shifted_metadata = volume.splat_particles(shifted, (36, 24, 36))
        np.testing.assert_allclose(translated, original, rtol=2e-11, atol=2e-12)
        np.testing.assert_allclose(np.array(shifted_metadata["min"]) - metadata["min"], displacement)

    def test_rigid_y_rotation_preserves_radius_mass_and_rotates_momentum(self):
        source = np.array([particle((9.0, 0.0, -3.0), mass=1.0),
                           particle((9.2, 0.1, -2.9), mass=3.0, velocity=(-0.2, 0.4, 0.1))])
        rotated, info = volume.rotate_snapshot(source, np.array([9.0, 0.0, -3.0]), target_x=2.2)
        matrix = np.asarray(info["matrix"])
        np.testing.assert_allclose(np.linalg.norm(rotated[:, :3], axis=1), np.linalg.norm(source[:, :3], axis=1))
        np.testing.assert_allclose(rotated[:, 3:7], source[:, 3:7])
        self.assertAlmostEqual(info["corePosition"][0], 2.2)
        self.assertGreater(info["corePosition"][2], 0.0)
        expected_momentum = matrix @ np.sum(source[:, 4, None] * source[:, 7:10], axis=0)
        field, metadata = volume.splat_particles(rotated, (40, 24, 40))
        np.testing.assert_allclose(field[:, 1:4].sum(axis=0) * metadata["voxelVolume"],
                                   expected_momentum, rtol=2e-12, atol=2e-12)

    def test_small_particle_survives_resolution_smoothing_without_losing_mass(self):
        source = np.array([particle((-5.0, 0.0, 0.0), h=0.001, mass=1.0),
                           particle((5.0, 0.0, 0.0), h=0.001, mass=1.0)])
        field, metadata = volume.splat_particles(source, (48, 12, 12))
        self.assertEqual(metadata["smoothing"]["broadenedParticleCount"], 2)
        self.assertLess(abs(metadata["diagnostics"]["uncorrectedRelativeMassError"]), 0.03)
        self.assertAlmostEqual(float(field[:, 0].sum() * metadata["voxelVolume"]), 2.0, places=11)


class SparseContractTests(unittest.TestCase):
    def test_sparse_roundtrip_preserves_conserved_quantities_and_index_order(self):
        source = np.array([particle((0.0, 0.0, 0.0), mass=0.5),
                           particle((0.1, 0.2, 0.0), mass=0.8, energy=0.07, velocity=(-0.1, 0.2, 0.4))])
        field, metadata = volume.splat_particles(source, (32, 24, 28))
        packed, info = volume.sparse_records(field, metadata)
        records = np.frombuffer(packed, dtype=volume.RECORD_DTYPE)
        self.assertEqual(len(packed), len(records) * 24)
        self.assertTrue(np.all(np.diff(records["index"].astype(np.int64)) > 0))
        restored = np.zeros_like(field)
        restored[records["index"]] = records["values"] * info["densityScale"]
        restored[:, 4] *= info["energyScale"]
        np.testing.assert_allclose(restored.sum(axis=0) * info["voxelVolume"],
                                   field.sum(axis=0) * info["voxelVolume"], rtol=3e-7, atol=1e-9)
        nx, ny, nz = info["dimensions"]
        index = int(records["index"][len(records) // 2])
        x, y, z = index % nx, (index // nx) % ny, index // (nx * ny)
        self.assertLess(z, nz)
        self.assertEqual(index, x + nx * (y + ny * z))

    def test_full_pack_uses_solver_labels_and_records_provenance(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = np.array([particle((9.0, 0.0, -3.0), mass=0.6),
                               particle((9.2, 0.0, -3.1), mass=0.4),
                               particle((10.0, 0.0, -4.0), mass=0.1)], dtype="<f4")
            (root / "frame.f32").write_bytes(source.tobytes())
            metadata = {"version": 1, "binary": "frame.f32", "count": 3, "columns": volume.COLUMNS,
                        "coreIndices": [0, 1], "time": 4.0, "units": {"length": "Rs"},
                        "provenance": {"fixture": "synthetic test only"},
                        "kernel": {"name": "cubic-spline", "support": 2},
                        "thermodynamics": {"gamma": 5.0 / 3.0, "K0": 0.01},
                        "core": {"position": [9.0, 0.0, -3.0], "velocity": [0.1, -0.2, 0.3], "mass": 1.0}}
            snapshot = root / "frame.json"
            snapshot.write_text(json.dumps(metadata))
            result = volume.build_volumes(snapshot, root / "packed", core_resolution=24,
                                          flow_caps=(24, 16, 24), compression="gzip")
            self.assertEqual(result["core"]["particleCount"], 2)
            self.assertEqual(result["grids"]["flow"]["particleCount"], 1)
            self.assertEqual(result["source"]["provenance"], metadata["provenance"])
            self.assertEqual(len(result["source"]["sourceHashes"]["binarySha256"]), 64)
            for grid in result["grids"].values():
                raw = gzip.decompress((root / "packed" / grid["file"]).read_bytes())
                self.assertEqual(len(raw), grid["uncompressedBytes"])
                self.assertLess(abs(grid["diagnostics"]["encodedRelativeMassError"]), 1e-6)
            self.assertTrue((root / "packed" / "wd-volume.json").exists())

    def test_unverified_kernel_and_wrong_binary_count_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            snapshot = root / "frame.json"
            base = {"columns": volume.COLUMNS, "kernel": {"name": "quintic", "support": 3}}
            snapshot.write_text(json.dumps(base))
            with self.assertRaisesRegex(ValueError, "verified Phantom"):
                volume.load_snapshot(snapshot)
            base.update({"kernel": {"name": "cubic-spline", "support": 2}, "count": 1, "binary": "frame.f32"})
            (root / "frame.f32").write_bytes(b"bad")
            snapshot.write_text(json.dumps(base))
            with self.assertRaisesRegex(ValueError, "binary size"):
                volume.load_snapshot(snapshot)


if __name__ == "__main__":
    unittest.main()
