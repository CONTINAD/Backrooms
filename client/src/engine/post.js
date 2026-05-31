// Post-processing stack: bloom (the lights glow) + a custom grain/vignette/CA pass.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const GrainVignetteCA = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.05 },
    uVignette: { value: 1.05 },
    uAberration: { value: 0.0012 },
    uSanity: { value: 1.0 },     // 0..1, lower = more distortion
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */`
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uTime,uGrain,uVignette,uAberration,uSanity;
    float rand(vec2 c){ return fract(sin(dot(c,vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec2 uv=vUv;
      float lowSan = 1.0 - uSanity;
      // breathing warp when sanity is low
      uv += vec2(sin(uv.y*30.0+uTime*2.0), cos(uv.x*30.0+uTime*1.5)) * 0.0015 * lowSan;
      float ca = uAberration + lowSan*0.004;
      vec2 d = (uv-0.5);
      float r = texture2D(tDiffuse, uv - d*ca).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv + d*ca).b;
      vec3 col = vec3(r,g,b);
      // film grain
      float grain = (rand(uv*vec2(uTime*0.5+1.0, uTime*0.37+1.0))-0.5);
      col += grain * (uGrain + lowSan*0.03);
      // vignette
      float vig = smoothstep(0.9, 0.2, length(d)*uVignette);
      col *= mix(0.35, 1.0, vig);
      // sickly desaturation pull at low sanity
      float lum = dot(col, vec3(0.299,0.587,0.114));
      col = mix(col, vec3(lum)*vec3(1.05,1.0,0.85), lowSan*0.4);
      gl_FragColor = vec4(col,1.0);
    }
  `,
};

export class Post {
  constructor(renderer, scene, camera) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    const size = renderer.getSize(new THREE.Vector2());
    this.bloom = new UnrealBloomPass(size, 0.22, 0.45, 1.0);
    this.composer.addPass(this.bloom);
    this.fx = new ShaderPass(GrainVignetteCA);
    this.composer.addPass(this.fx);
    this.composer.addPass(new OutputPass());
  }
  setSize(w, h) { this.composer.setSize(w, h); }
  render(dt, sanity01) {
    this.fx.uniforms.uTime.value += dt;
    this.fx.uniforms.uSanity.value += (sanity01 - this.fx.uniforms.uSanity.value) * Math.min(1, dt * 2);
    this.bloom.strength = 0.2 + (1 - sanity01) * 0.3;
    this.composer.render();
  }
}
