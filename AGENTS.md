# Academic black-hole rendering

- The user-approved visual rollback baseline is the immutable Git tag `1.0BH`,
  pointing to `53b98b28dd5852e6c997614d1dd0bf770d857808` (accepted 2026-10-03).
- GitHub release: https://github.com/0923katouC/0923katouC.github.io/releases/tag/1.0BH
- Keep that tag and its release screenshots fixed. Later improvements must not
  overwrite the baseline. If the user asks to undo a poor black-hole visual
  change without naming another version, use `1.0BH` as the reference.
- A black-hole rollback should restore renderer/shaders, fallback images,
  academic background CSS, renderer-specific tests and matching resource
  versions. Retain the baseline documentation and preserve
  unrelated academic text, publication updates and other website changes.
- Appearance changes require regenerated fallback images matching the first
  rendered frame, plus desktop/mobile visual checks. Preserve the established
  camera/framing unless the user requests a composition change.
- Keep motion on shared birth coordinates and test long animation times;
  previous regressions included opposite apparent material rotation,
  endlessly winding textures, coarse eye-shaped clumps and fallback jumps.
