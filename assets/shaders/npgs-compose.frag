/* SPDX-License-Identifier: GPL-3.0-only
 * Bounded HDR bloom and display tone mapping for the NPGS web port.
 */
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uScene;
uniform vec2 uTexel;
vec3 highlight(vec2 offset) {
    vec3 color = texture(uScene, vUv + offset * uTexel).rgb;
    return max(color - 0.65, vec3(0.0));
}
void main() {
    vec3 color = texture(uScene, vUv).rgb;
    vec3 glow = highlight(vec2(2.0,2.0)) + highlight(vec2(-2.0,2.0))
              + highlight(vec2(2.0,-2.0)) + highlight(vec2(-2.0,-2.0));
    glow += 0.5 * (highlight(vec2(7.0,0.0)) + highlight(vec2(-7.0,0.0))
                + highlight(vec2(0.0,7.0)) + highlight(vec2(0.0,-7.0)));
    color += glow * 0.075;
    // Finite filmic mapping also handles zero/very bright input safely.
    color = clamp((color * (2.51 * color + 0.03)) /
                   (color * (2.43 * color + 0.59) + 0.14), 0.0, 1.0);
    color = pow(color, vec3(1.0 / 2.2));
    float vignette = 1.0 - 0.18 * dot(vUv - 0.5, vUv - 0.5);
    fragColor = vec4(color * vignette, 1.0);
}
