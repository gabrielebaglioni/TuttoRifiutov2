/** Giallo + grana (skyline hero + anello menu circolare). */
export const GRAIN_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

export const GRAIN_FRAGMENT_SHADER = `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
  #else
    precision mediump float;
  #endif

  uniform float iTime;
  uniform vec3 iResolution;
  varying vec2 vUv;

  float hash21(vec2 p) {
    p = fract(p*vec2(123.34, 456.21));
    p += dot(p, p+45.32);
    return fract(p.x*p.y);
  }

  void main() {
    vec3 color = vec3(1.0);

    const float scrollWrap = 1500.0;
    float scroll = mod(floor(iTime * 5.0), scrollWrap);
    vec2 grainUv = vUv * iResolution.xy * 0.9 + vec2(scroll);
    float g1 = hash21(grainUv);
    float g2 = hash21(grainUv * 0.4 + 13.0);
    float specks = step(0.965, g1) * 0.45 + step(0.97, g2) * 0.25;
    color = clamp(color - specks, 0.0, 1.0);

    float haze = (hash21(floor(vUv * iResolution.xy * 0.5)) - 0.5) * 0.04;
    color = clamp(color - haze, 0.0, 1.0);

    const vec3 bgColor = vec3(1.0, 1.0, 0.0);
    color = mix(bgColor, vec3(0.0), 1.0 - color.r);

    gl_FragColor = vec4(color, 1.0);
  }
`;
