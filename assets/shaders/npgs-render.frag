/* SPDX-License-Identifier: GPL-3.0-only
 * Finite-height cloud emission along cached, numerically integrated Kerr rays.
 * Ordered proper-length volume samples, with front-to-back absorption.
 */
in vec2 vUv;
out vec4 fragColor;
uniform highp usampler2D uRayCache;
uniform vec2 uMapSize;
uniform vec2 uRadianceResolution;
uniform int uCacheWidth;
uniform int uNodeCount;
uniform int uJetNodeCount;
uniform int uPacketTexels;
uniform float uTime;
uniform float uGrainDetail;

float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

vec3 starLayer(vec2 uv, float scale, float seed) {
    vec2 cell = floor(uv * scale);
    vec2 local = fract(uv * scale);
    float random = hash21(cell + seed);
    vec2 center = 0.2 + 0.6 * vec2(hash21(cell + seed + 5.4), hash21(cell + seed + 13.8));
    float pixelWidth = max(length(fwidth(uv * scale)), 0.02);
    float distanceToStar = length(local - center) / pixelWidth;
    float size = mix(0.36, 0.82, pow(random, 7.0));
    float point = exp(-distanceToStar * distanceToStar / (size * size));
    float glow = 0.06 * exp(-distanceToStar * distanceToStar / (8.0 * size * size));
    float brightness = step(0.969, random) * (0.12 + 0.9 * pow(random, 16.0));
    brightness *= min(1.0, 0.016 / (pixelWidth * pixelWidth));
    vec3 tint = mix(vec3(0.58, 0.73, 1.0), vec3(1.0, 0.77, 0.47), hash21(cell + 27.0));
    return tint * brightness * (point + glow);
}

vec3 background(vec3 direction) {
    vec3 d = normalize(direction);
    // Cube projection: procedural stars follow the *escaped* lensed ray.
    vec3 a = abs(d);
    vec2 uv;
    float face;
    if (a.z >= a.x && a.z >= a.y) { uv = d.xy / a.z; face = sign(d.z); }
    else if (a.x >= a.y) { uv = d.zy / a.x; face = 3.0 * sign(d.x); }
    else { uv = d.xz / a.y; face = 5.0 * sign(d.y); }
    float cloud = 0.5 + 0.5 * PerlinNoise(d * 3.0 + vec3(8.0, 2.0, 5.0));
    float dust = 0.5 + 0.5 * PerlinNoise(d * 9.0 + 11.0);
    vec3 night = vec3(0.0022, 0.0042, 0.0090);
    night += vec3(0.004, 0.005, 0.011) * cloud * cloud;
    night += vec3(0.004, 0.002, 0.005) * cloud * dust;
    return night + starLayer(uv, 55.0, 41.0 * face)
                 + starLayer(uv, 135.0, 83.0 * face) * 0.35;
}

struct RayNode { vec4 positionTime; vec4 transfer; };
uvec4 readPacket(ivec2 ray,int packet) {
    int slot=(ray.y*int(uMapSize.x)+ray.x)*uPacketTexels+packet;
    return texelFetch(uRayCache,ivec2(slot%uCacheWidth,slot/uCacheWidth),0);
}
uvec4 readFourWords(ivec2 ray,int word) {
    int shift=word%4;
    uvec4 a=readPacket(ray,word/4);
    if(shift==0) return a;
    uvec4 b=readPacket(ray,word/4+1);
    if(shift==1) return uvec4(a.yzw,b.x);
    if(shift==2) return uvec4(a.zw,b.xy);
    return uvec4(a.w,b.xyz);
}
RayNode readNode(ivec2 ray,int index) {
    int word=3*index,shift=word%4;
    uvec4 a=readPacket(ray,word/4);
    uvec3 encoded;
    if(shift==0) encoded=a.xyz;
    else if(shift==1) encoded=a.yzw;
    else {
        uvec4 b=readPacket(ray,word/4+1);
        encoded=shift==2 ? uvec3(a.zw,b.x) : uvec3(a.w,b.xy);
    }
    RayNode node;
    node.positionTime=vec4(unpackHalf2x16(encoded.x),unpackHalf2x16(encoded.y));
    vec2 transport=unpackHalf2x16(encoded.z);
    node.transfer=vec4(transport,0.0,transport.y>0.0 ? 1.0 : 0.0);
    return node;
}
RayNode readSky(ivec2 ray) {
    uvec4 encoded=readFourWords(ray,3*(uNodeCount+uJetNodeCount));
    RayNode sky;
    // positionTime=(direction,statusFlags); transfer=(Ld,Lj,nDisk,nJet).
    sky.positionTime=vec4(unpackHalf2x16(encoded.x),unpackHalf2x16(encoded.y));
    sky.transfer=vec4(unpackHalf2x16(encoded.z),unpackHalf2x16(encoded.w));
    return sky;
}
float volumeRadius(vec3 p) {
    float b=dot(p,p)-PHYSICAL_A*PHYSICAL_A;
    return sqrt(max(0.0,0.5*(b+sqrt(b*b+4.0*PHYSICAL_A*PHYSICAL_A*p.y*p.y))));
}

// Emission features have a finite lifetime, as turbulent structures do.
// Backtrace every texture coordinate through ONE velocity field: prograde
// Keplerian rotation plus a small inward drift. This is a kinematic surface
// model, not an evolution of the fluid stress-energy tensor.
const float FEATURE_LIFETIME = 48.0;
const float INFLOW_SPEED = 0.02;
float diskOmega(float r) {
    float root = sqrt(0.5 * r);
    return root / (r*r + PHYSICAL_A*root);
}
vec2 birthSpiral(float r) {
    float u = sqrt(r);
    float eps = PHYSICAL_A * 0.70710678 / (r*u);
    float spiral = -16.9705627 / u * (1.0 - 0.25*eps + 0.142857*eps*eps);
    float slope = 8.48528135 / (r*u) * (1.0 - eps + eps*eps);
    return vec2(spiral,slope);
}
vec2 diskBirthCoordinates(float r, float theta, float age) {
    float stepR = INFLOW_SPEED*age*0.25;
    float birthR = r + 4.0*stepR;
    // Composite Simpson quadrature of integral_r^birthR Omega(s) ds / v.
    float orbit = age/12.0 * (diskOmega(r) + 4.0*diskOmega(r+stepR)
                  + 2.0*diskOmega(r+2.0*stepR) + 4.0*diskOmega(r+3.0*stepR)
                  + diskOmega(birthR));
    return vec2(birthR,theta-orbit);
}
// Anisotropic polar noise: fine radial structure, long azimuthal filaments.
// Based on NPGS's separate radial/azimuthal coordinates, without circular
// noise embedding or noise-displaced sine contours that produced eye shapes.
float polarDiskNoise(vec3 point, vec3 dx, vec3 dy, vec3 seed) {
    float accumulation = 1.0;
    for (int i=0;i<3;++i) {
        float frequency = pow(3.0,float(i)+2.0);
        float footprint = max(length(dx),length(dy))*frequency;
        float weight = (1.0-smoothstep(0.2,0.8,footprint)) * (i==2 ? 0.45 : 1.0);
        float value = PerlinNoise(point*frequency+seed+vec3(0.0,seed.y,0.0));
        accumulation *= 1.0 + 0.1*value*weight;
    }
    return log(1.0+pow(accumulation,28.0));
}
// A separate, zero-mean density field supplies resolvable material grains.
// It shares the cloud's birth coordinates: no screen-space or per-frame noise.
const vec2 GRAIN_FREQUENCY = vec2(10.0,8.0);
const float GRAIN_EMISSION_CONTRAST = 0.65;
const float GRAIN_DENSITY_CONTRAST = 0.38;
float densityGrain(vec2 birth, vec2 dr, vec2 dphi, float phaseRate, vec3 seed) {
    vec2 dx = GRAIN_FREQUENCY*vec2(dr.x,dphi.x);
    vec2 dy = GRAIN_FREQUENCY*vec2(dr.y,dphi.y);
    float spatial = max(length(dx),length(dy));
    // Limit motion per 30 Hz frame as well as the spatial pixel footprint.
    float temporal = length(GRAIN_FREQUENCY*vec2(INFLOW_SPEED,phaseRate))*3.6/30.0;
    float filterWeight = 1.0-smoothstep(0.25,0.95,max(spatial,temporal));
    if (filterWeight <= 0.0 || uGrainDetail <= 0.0) return 0.0;
    vec2 q = GRAIN_FREQUENCY*birth + seed.xz + vec2(7.1,19.3);
    // Integer Y samples one lattice plane instead of averaging two planes.
    float grain = PerlinNoise(vec3(q.x,floor(seed.y),q.y));
    return grain*filterWeight*uGrainDetail;
}
vec2 diskFeature(float r, float theta, float height, float time, float offset,
                  vec2 dr, vec2 dtheta, vec2 dy, vec2 dt) {
    float cycle = floor((time + offset) / FEATURE_LIFETIME);
    float age = mod(time + offset, FEATURE_LIFETIME);
    vec2 birth = diskBirthCoordinates(r,theta,age);
    float birthR = birth.x;
    float omega = diskOmega(r);
    float birthOmega = diskOmega(birthR);
    vec2 spiral = birthSpiral(birthR);
    float phase = birth.y - spiral.x;
    // The layer is invisible (with zero slope) when this seed is replaced.
    float seed = mod(cycle,4096.0) + 17.0*offset;
    vec3 seedOffset = vec3(hash21(vec2(seed,1.0)), hash21(vec2(seed,2.0)),
                           hash21(vec2(seed,3.0))) * 32.0;
    vec2 dBirthR = dr + INFLOW_SPEED*dt;
    vec2 dPhase = dtheta - (birthOmega-omega)/INFLOW_SPEED*dr
                  - birthOmega*dt - spiral.y*dBirthR;
    float phi = atan(sin(phase),cos(phase));
    // Material follows a fixed relative height in the gently flared disk.
    float relativeHeight=height/volumeHalfHeight(r);
    vec2 dRelativeHeight=(dy-relativeHeight*0.075*step(3.0,r)*dr)/volumeHalfHeight(r);
    float birthHeight=relativeHeight*volumeHalfHeight(birthR);
    vec2 dBirthHeight=volumeHalfHeight(birthR)*dRelativeHeight
                      +relativeHeight*0.075*step(3.0,birthR)*dBirthR;
    vec3 point = vec3(0.18*birthR,0.14*birthHeight,0.055*phi);
    vec3 dx = vec3(0.18*dBirthR.x,0.14*dBirthHeight.x,0.055*dPhase.x);
    vec3 ddy = vec3(0.18*dBirthR.y,0.14*dBirthHeight.y,0.055*dPhase.y);
    float noise = polarDiskNoise(point,dx,ddy,seedOffset);
    float phaseRate = -birthOmega-spiral.y*INFLOW_SPEED;
    float grain = densityGrain(vec2(birthR,phi),dBirthR,dPhase,phaseRate,seedOffset);
    // Match opposite sides of the atan branch cut with a C1-continuous blend.
    // Noise gradients use the unwrapped angle, never the wrapped phi jump.
    float seam = 0.35;
    if (phi < -kPi+seam) {
        float wrapped = polarDiskNoise(point+vec3(0.0,0.0,0.055*2.0*kPi),dx,ddy,seedOffset);
        float wrappedGrain = densityGrain(vec2(birthR,phi+2.0*kPi),dBirthR,dPhase,phaseRate,seedOffset);
        float blend = smoothstep(-kPi,-kPi+seam,phi);
        noise = mix(wrapped,noise,blend);
        grain = mix(wrappedGrain,grain,blend);
    }
    return vec2(clamp(0.30+noise,0.30,1.80),grain);
}
vec2 diskTexture(vec4 hit, float r, float height) {
    float time = uTime*3.6 + hit.z; // Backward ray integration gives t_emit < t_obs.
    float theta = atan(hit.x,hit.y); // +y spin: tangent (z,0,-x), as in p_phi.
    vec2 dr = vec2(dFdx(r),dFdy(r));
    vec2 tangent = vec2(hit.y,-hit.x)/max(dot(hit.xy,hit.xy),1e-6);
    vec2 dtheta = vec2(dot(tangent,dFdx(hit.xy)),dot(tangent,dFdy(hit.xy)));
    vec2 dt = vec2(dFdx(time),dFdy(time));
    vec2 dy = vec2(dFdx(height),dFdy(height));
    float age = mod(time,FEATURE_LIFETIME);
    float weight = pow(sin(kPi*age/FEATURE_LIFETIME),2.0);
    vec2 a = diskFeature(r,theta,height,time,0.0,dr,dtheta,dy,dt);
    vec2 b = diskFeature(r,theta,height,time,FEATURE_LIFETIME*0.5,dr,dtheta,dy,dt);
    // Complementary smooth windows prevent a visible reset or blank interval.
    vec2 material = weight*a + (1.0-weight)*b;
    // Preserve the variance of centered fine detail during population mixing.
    // The positive cloud brightness keeps the original 1.0BH interpolation.
    material.y /= sqrt(weight*weight + (1.0-weight)*(1.0-weight));
    return material;
}

vec4 volumeEmission(RayNode node) {
    float shift=node.transfer.x, lengthInEmitterFrame=node.transfer.y;
    vec3 pos=node.positionTime.xyz;
    float actualRadius=volumeRadius(pos);
    bool valid=node.transfer.w>0.5 && shift>0.0 && lengthInEmitterFrame>0.0
               && actualRadius>DISK_INNER && actualRadius<DISK_OUTER;
    if(dot(pos.xz,pos.xz)<1e-6) pos=vec3(DISK_INNER+0.05,0.0,0.0);
    float r=clamp(actualRadius,DISK_INNER+0.001,DISK_OUTER-0.001);
    // Evaluate derivatives before the validity branch: neighboring fragments
    // must evaluate the SAME ordered node, even when one ray has no material.
    vec2 material=diskTexture(vec4(pos.x,pos.z,node.positionTime.w,shift),r,pos.y);
    if(!valid) return vec4(0.0);
    float radial=(r-DISK_INNER)/(DISK_OUTER-DISK_INNER);
    float envelope=Shape(radial,0.9,1.5);
    float halfHeight=volumeHalfHeight(r);
    // Noise changes the cloud's real vertical density, inside the traced bound.
    float cloudHeight=halfHeight*(0.82+0.14*clamp(material.x,0.3,1.6));
    float vertical=pow(max(0.0,1.0-pow(pos.y/cloudHeight,2.0)),1.5);
    float density=envelope*vertical*max(0.25,0.55+0.45*material.x+GRAIN_DENSITY_CONTRAST*material.y);
    float opticalDepth=2.1*density*lengthInEmitterFrame/halfHeight;
    float alpha=1.0-exp(-min(opticalDepth,30.0));
    float tempProfile=pow(pow(DISK_INNER/r,3.0)*max(0.0,1.0-sqrt(DISK_INNER/r))/0.05665278,0.25);
    float temperature=max(900.0,5800.0*tempProfile*pow(shift,0.65));
    float source=(0.18+1.55*pow(tempProfile,1.4))*(0.35+0.65*envelope);
    source *= material.x*(1.0+GRAIN_EMISSION_CONTRAST*material.y);
    float innerCloud=max(0.0,1.0-5.0*radial*radial);
    source *= 1.0+0.08*innerCloud*max(material.y,0.0);
    // g^3 transports specific radiance; colours are an illustrative palette.
    vec3 emission=KelvinToRgb(temperature)*source*min(pow(shift,3.0),3.0)*1.30;
    return vec4(emission*alpha,alpha);
}

// NPGS-inspired, optically thin spine/sheath emission. The outflow clock
// follows the same normalized emitter velocity used by the GR ray cache.
const float JET_EMISSION_GAIN = 0.45;
vec3 jetEmission(RayNode node) {
    vec3 pos=node.positionTime.xyz;
    float height=abs(pos.y);
    bool valid=node.transfer.w>0.5 && node.transfer.x>0.0
               && height>JET_START && height<JET_LENGTH;
    if(!valid) pos=vec3(0.15,JET_START,0.0);
    if(dot(pos.xz,pos.xz)<1e-8) pos.x=0.0001;
    float emissionTime=uTime*3.6+node.positionTime.w;
    vec3 material=jetMaterialCoordinates(pos,emissionTime);
    float eta=material.x,theta=material.y,launchTime=material.z;
    vec2 tangent=vec2(pos.z,-pos.x)/max(dot(pos.xz,pos.xz),1e-8);
    vec2 dtheta=vec2(dot(tangent,dFdx(pos.xz)),dot(tangent,dFdy(pos.xz)));
    vec2 dlaunch=vec2(dFdx(launchTime),dFdy(launchTime));
    float helixPhase=2.0*theta-0.35*launchTime;
    vec2 phaseGradient=2.0*dtheta-0.35*dlaunch;
    float footprint=abs(phaseGradient.x)+abs(phaseGradient.y);
    float helix=cos(helixPhase)*exp(-0.25*footprint*footprint);
    float knots=PerlinNoise(vec3(0.18*launchTime,7.0,11.0));
    float noiseFootprint=0.18*(abs(dlaunch.x)+abs(dlaunch.y));
    knots*=1.0-smoothstep(0.3,0.9,noiseFootprint);
    vec3 finePoint=vec3(1.8*pos.x/jetRadius(abs(pos.y)),1.8*pos.z/jetRadius(abs(pos.y)),0.75*launchTime);
    float fineFootprint=max(length(dFdx(finePoint)),length(dFdy(finePoint)));
    float fine=PerlinNoise(finePoint+vec3(7.3,2.9,11.1))*(1.0-smoothstep(0.3,0.9,fineFootprint));
    // Advected knots and strands stay supplied continuously, not whole-beam flashes.
    float modulation=(0.80+0.45*knots)*(0.85+0.25*fine)*(0.80+0.20*helix);
    if(!valid) return vec3(0.0);
    float radius=jetRadius(height);
    float sheath=exp(-pow((eta-(0.70+0.06*helix))/0.20,2.0));
    float spine=0.18*exp(-pow(eta/0.25,2.0));
    float edge=1.0-smoothstep(0.90,JET_CACHE_PADDING,eta);
    float launch=smoothstep(JET_START,JET_START+0.30,height);
    float tail=1.0-smoothstep(0.60*JET_LENGTH,JET_LENGTH,height);
    float emissivity=JET_EMISSION_GAIN*(sheath+spine)*edge*launch*tail*modulation/max(radius,0.2);
    float shift=node.transfer.x;
    vec3 color=KelvinToRgb(clamp(100000.0*shift,8000.0,100000.0));
    // JetColor also has zero absorption. Cache dl is in the emitter frame.
    return color*emissivity*min(pow(shift,3.0),6.0)*node.transfer.y;
}

ivec2 rayForPixel(ivec2 pixel) {
    return min(ivec2((vec2(pixel)+0.5)*uMapSize/uRadianceResolution),ivec2(uMapSize)-1);
}
void main() {
    ivec2 pixel=ivec2(gl_FragCoord.xy);
    ivec2 ray=rayForPixel(pixel);
    RayNode raySky=readSky(ray);
    bool escaped=(int(round(raySky.positionTime.w))%4)==0;
    vec3 escapeDirection=escaped ? normalize(raySky.positionTime.xyz)
        : sceneDirection(mapToPlane((vec2(ray)+0.5)/uMapSize));
    vec3 sky=(escaped ? 1.0 : 0.0)*background(escapeDirection);
    // Quad-wide guards keep every derivative at the same fixed material slot.
    ivec2 quadBase=pixel-(pixel%2);
    RayNode qa=readSky(rayForPixel(quadBase));
    RayNode qb=readSky(rayForPixel(quadBase+ivec2(1,0)));
    RayNode qc=readSky(rayForPixel(quadBase+ivec2(0,1)));
    RayNode qd=readSky(rayForPixel(quadBase+ivec2(1,1)));
    bool evaluateDisk=max(max(qa.transfer.z,qb.transfer.z),max(qc.transfer.z,qd.transfer.z))>0.5;
    bool evaluateJet=max(max(qa.transfer.w,qb.transfer.w),max(qc.transfer.w,qd.transfer.w))>0.5;
    vec3 jetLight[6]; float jetLag[6]; float jetTransmission[6];
    for(int j=0;j<6;++j) {
        jetLight[j]=vec3(0.0);jetLag[j]=-1e10;jetTransmission[j]=1.0;
        if(j<uJetNodeCount && evaluateJet) {
            RayNode node=readNode(ray,uNodeCount+j);
            jetLight[j]=jetEmission(node);
            jetLag[j]=node.positionTime.w;
        }
    }
    vec4 accumulated=vec4(0.0);
    if(evaluateDisk) {
        for(int i=0;i<12;++i) {
            if(i>=uNodeCount) break;
            RayNode node=readNode(ray,i);
            vec4 cloud=volumeEmission(node);
            accumulated+=(1.0-accumulated.a)*cloud;
            // Exact front/back ordering for an optically thin jet: only disk
            // samples nearer the observer attenuate a given jet contribution.
            // Derivative-dependent emissions were evaluated at fixed slots.
            for(int j=0;j<6;++j) {
                if(j>=uJetNodeCount) break;
                if(node.positionTime.w>jetLag[j]) jetTransmission[j]*=1.0-cloud.a;
            }
        }
    }
    vec3 color=accumulated.rgb+(1.0-accumulated.a)*sky;
    for(int j=0;j<6;++j) {
        if(j>=uJetNodeCount) break;
        color+=jetLight[j]*jetTransmission[j];
    }
    fragColor=vec4(max(color,vec3(0.0)),accumulated.a);
}
