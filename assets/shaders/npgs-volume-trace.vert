/* SPDX-License-Identifier: GPL-3.0-only
 * Finite-height disk cache on numerically integrated Kerr null geodesics.
 * Compile after the shared SCENE and npgs-kerr.glsl; capture the uvec4
 * varyings with interleaved transform feedback and rasterizer discard.
 * SCENE supplies volumeHalfHeight(r), CAMERA, and the disk/ray constants.
 *
 * Two deterministic walks per ray: measure occupied intervals, then place
 * ordered front-biased midpoint quadrature nodes in each interval. Every
 * passage keeps a fixed half of the slots, including on single-passage rays.
 * At most two occupied passages are retained. More distant passages are
 * explicitly flagged as truncated; sky/horizon tracing still continues.
 * Circular off-equatorial emitters are a pressure-supported kinematic
 * prescription, not off-equatorial geodesics or a GRMHD fluid solution.
 */
#ifndef NODE_COUNT
#define NODE_COUNT 8
#endif

uniform vec2 uMapSize;
uniform int uRayOffset;

flat out highp uvec4 vNode0;
flat out highp uvec4 vNode1;
flat out highp uvec4 vNode2;
flat out highp uvec4 vNode3;
flat out highp uvec4 vNode4;
flat out highp uvec4 vNode5;
#if NODE_COUNT > 6
flat out highp uvec4 vNode6;
flat out highp uvec4 vNode7;
#endif
#if NODE_COUNT > 8
flat out highp uvec4 vNode8;
flat out highp uvec4 vNode9;
flat out highp uvec4 vNode10;
flat out highp uvec4 vNode11;
#endif
flat out highp uvec4 vSky;

const int MAX_VOLUME_PASSAGES = 2;
const int MAX_VOLUME_STEPS = 560;
vec4 nodePosition[NODE_COUNT];
vec4 nodeMaterial[NODE_COUNT];
float passageLength[MAX_VOLUME_PASSAGES];
int passageNodes[MAX_VOLUME_PASSAGES];
int passageBase[MAX_VOLUME_PASSAGES];

uvec4 packVolumeRecord(vec4 a, vec4 b) {
    // Bit-exact half packing into integer storage; never send packed bit
    // patterns through a float color target, where NaN canonicalization
    // could corrupt them.
    return uvec4(packHalf2x16(a.xy), packHalf2x16(a.zw),
                 packHalf2x16(b.xy), packHalf2x16(b.zw));
}

float volumeSupportMargin(vec4 x) {
    float r=KerrSchildRadius(x.xyz,PHYSICAL_A,1.0);
    return min(min(r-DISK_INNER,DISK_OUTER-r),
               1.05*volumeHalfHeight(r)-abs(x.y));
}

bool volumeRadiation(vec4 x, vec4 p, out float emitEnergy) {
    emitEnergy = 0.0;
    float heightBound = 1.05 * volumeHalfHeight(DISK_OUTER);
    if (abs(x.y) > heightBound ||
        dot(x.xyz,x.xyz) > DISK_OUTER*DISK_OUTER +
                            PHYSICAL_A*PHYSICAL_A + heightBound*heightBound) return false;
    KerrGeometry geo;
    ComputeGeometryScalars(x.xyz,PHYSICAL_A,0.0,1.0,1.0,false,geo);
    if (geo.r <= DISK_INNER || geo.r >= DISK_OUTER ||
        abs(x.y) >= 1.05 * volumeHalfHeight(geo.r)) return false;
    float omega = GetKeplerianAngularVelocity(geo.r,1.0,PHYSICAL_A,0.0);
    vec3 v = omega * vec3(x.z,0.0,-x.x);
    float lv = 1.0 + dot(geo.l_down.xyz,v);
    float normalization = 1.0 - dot(v,v) - geo.f*lv*lv;
    // Do not turn a spacelike velocity into an emitting fluid by clamping.
    if (normalization <= 1e-7) return false;
    vec4 u = vec4(v,1.0) * inversesqrt(normalization);
    emitEnergy = -dot(p,u);
    return emitEnergy > 1e-7 && !isnan(emitEnergy) && !isinf(emitEnergy);
}

// Shift at an already selected node, without the conservative support test:
// the quantile lies inside a small accepted integration cell. Boundary
// interpolation can move it into the nonemitting 5% cache padding.
float volumeFrequencyShift(vec4 x, vec4 p) {
    KerrGeometry geo;
    ComputeGeometryScalars(x.xyz,PHYSICAL_A,0.0,1.0,1.0,false,geo);
    float omega = GetKeplerianAngularVelocity(max(geo.r,DISK_INNER),1.0,PHYSICAL_A,0.0);
    vec3 v = omega * vec3(x.z,0.0,-x.x);
    float lv = 1.0 + dot(geo.l_down.xyz,v);
    float normalization = 1.0 - dot(v,v) - geo.f*lv*lv;
    if (normalization <= 1e-7) return 0.0;
    vec4 u = vec4(v,1.0) * inversesqrt(normalization);
    float energy = -dot(p,u);
    return energy > 1e-7 ? 1.0/energy : 0.0;
}

void main() {
    gl_Position = vec4(0.0,0.0,0.0,1.0);
    gl_PointSize = 1.0;
    for (int i=0;i<NODE_COUNT;++i) {
        nodePosition[i] = vec4(0.0);
        nodeMaterial[i] = vec4(0.0);
    }
    for (int i=0;i<MAX_VOLUME_PASSAGES;++i) {
        passageLength[i] = 0.0;
        passageNodes[i] = 0;
        passageBase[i] = 0;
    }
    int width = int(uMapSize.x);
    int rayIndex = gl_VertexID + uRayOffset;
    vec2 pixel = vec2(float(rayIndex % width),float(rayIndex / width)) + 0.5;
    vec2 plane = mapToPlane(pixel/uMapSize);
    vec4 initialX = vec4(CAMERA,0.0);
    vec4 initialP = GetInitialMomentum(sceneDirection(plane),initialX,0,1.0,
                                       PHYSICAL_A,0.0,1.0,false);
    float energy = -initialP.w;
    vec4 escapedSky = vec4(0.0);
    float status = 2.0; // 0 escaped, 1 captured, 2 step limit, 3 invalid state.
    bool truncated = false;
    int passages = 0;
    int writtenNodes = 0;

    for (int walk=0;walk<2;++walk) {
        if (walk == 1 && passages == 0) break;
        vec4 x = initialX, p = initialP;
        bool wasInside = false;
        int passage = -1;
        int nextNode = 0;
        float lengthInPassage = 0.0;

        for (int stepIndex=0;stepIndex<MAX_VOLUME_STEPS;++stepIndex) {
            KerrGeometry geo;
            ComputeGeometryScalars(x.xyz,PHYSICAL_A,0.0,1.0,1.0,false,geo);
            if (any(isnan(x)) || any(isinf(x)) || any(isnan(p)) || any(isinf(p))) {
                if (walk == 0) status = 3.0;
                break;
            }
            if (geo.r < HORIZON+0.012) {
                if (walk == 0) status = 1.0;
                break;
            }
            State state; state.X=x; state.P=p;
            State k1 = GetDerivativesAnalytic(state,PHYSICAL_A,0.0,1.0,false,geo);
            if (geo.r > 90.0 && dot(x.xyz,-k1.X.xyz) > 0.0) {
                if (walk == 0) {
                    escapedSky = vec4(normalize(-k1.X.xyz),1.0);
                    status = 0.0;
                }
                break;
            }
            float ringDistance = length(vec2(x.y,length(x.xz)-PHYSICAL_A));
            float dt = 0.22*min(ringDistance/max(length(k1.X),1e-6),
                                length(p)/max(length(k1.P),1e-8));
            if (geo.r < 24.0) dt = min(dt,0.55/max(length(k1.X.xyz),1e-6));
            // Restrict the geodesic chord near the emitting support. Further
            // midpoint subdivision resolves interval entry/exit at <=.12 Rs.
            if (geo.r < DISK_OUTER+1.5)
                dt = min(dt,0.32/max(length(k1.X.xyz),1e-6));
            dt = max(dt,1e-6);
            vec4 previousX=x, previousP=p;
            StepGeodesicRK4_Optimized(x,p,energy,-dt,PHYSICAL_A,0.0,
                                      1.0,1.0,false,geo,k1);
            if (any(isnan(x)) || any(isinf(x)) || any(isnan(p)) || any(isinf(p))) {
                if (walk == 0) status = 3.0;
                break;
            }
            vec3 chord = x.xyz-previousX.xyz;
            int pieces = clamp(int(ceil(length(chord)/0.12)),1,8);
            for (int piece=0;piece<8;++piece) {
                if (piece >= pieces) break;
                float midpoint = (float(piece)+0.5)/float(pieces);
                vec4 midX=mix(previousX,x,midpoint), midP=mix(previousP,p,midpoint);
                float emitEnergy;
                bool inside = volumeRadiation(midX,midP,emitEnergy);
                float cellStart=float(piece)/float(pieces);
                float cellEnd=float(piece+1)/float(pieces);
                // Clip an accepted cell to the support at interval entry/exit.
                // This prevents short grazing intervals from placing all their
                // quadrature nodes just outside the actual volume boundary.
                if (inside) {
                    bool clipped=false;
                    if (volumeSupportMargin(mix(previousX,x,cellStart)) <= 0.0) {
                        float outside=cellStart, accepted=midpoint;
                        for (int b=0;b<5;++b) {
                            float trial=0.5*(outside+accepted);
                            if (volumeSupportMargin(mix(previousX,x,trial)) > 0.0) accepted=trial;
                            else outside=trial;
                        }
                        cellStart=accepted;clipped=true;
                    }
                    if (volumeSupportMargin(mix(previousX,x,cellEnd)) <= 0.0) {
                        float accepted=midpoint, outside=cellEnd;
                        for (int b=0;b<5;++b) {
                            float trial=0.5*(outside+accepted);
                            if (volumeSupportMargin(mix(previousX,x,trial)) > 0.0) accepted=trial;
                            else outside=trial;
                        }
                        cellEnd=accepted;clipped=true;
                    }
                    if (clipped) {
                        float center=0.5*(cellStart+cellEnd);
                        inside=volumeRadiation(mix(previousX,x,center),mix(previousP,p,center),emitEnergy);
                    }
                }
                if (inside && !wasInside) {
                    ++passage;
                    nextNode=0;
                    lengthInPassage=0.0;
                    if (walk == 0) {
                        if (passage < MAX_VOLUME_PASSAGES) passages=passage+1;
                        else truncated=true;
                    }
                }
                if (inside && passage < MAX_VOLUME_PASSAGES) {
                    // Invariant rest-frame path element for a photon:
                    // dl_emit = (-p_mu u^mu) |d lambda|, with E_observer=1.
                    float dl = emitEnergy*dt*(cellEnd-cellStart);
                    if (walk == 0) passageLength[passage] += dl;
                    else {
                        float endLength=lengthInPassage+dl;
                        for (int j=0;j<NODE_COUNT;++j) {
                            if (nextNode >= passageNodes[passage]) break;
                            float q0=float(nextNode)/float(passageNodes[passage]);
                            float q1=float(nextNode+1)/float(passageNodes[passage]);
                            float binStart=passageLength[passage]*q0*q0;
                            float binEnd=passageLength[passage]*q1*q1;
                            float nodeWeight=binEnd-binStart;
                            float target=0.5*(binStart+binEnd);
                            if (target > endLength) break;
                            float subfraction=clamp((target-lengthInPassage)/max(dl,1e-9),0.0,1.0);
                            float fraction=mix(cellStart,cellEnd,subfraction);
                            vec4 sampleX=mix(previousX,x,fraction);
                            vec4 sampleP=mix(previousP,p,fraction);
                            ApplyHamiltonianCorrection(sampleP,sampleX,energy,PHYSICAL_A,0.0,1.0,1.0,false);
                            float shift=volumeFrequencyShift(sampleX,sampleP);
                            int slot=passageBase[passage]+nextNode;
                            if (slot < NODE_COUNT && shift > 0.0 && !isnan(shift) && !isinf(shift)) {
                                nodePosition[slot]=sampleX;
                                nodeMaterial[slot]=vec4(shift,nodeWeight,float(passage),1.0);
                                ++writtenNodes;
                            }
                            ++nextNode;
                        }
                        lengthInPassage=endLength;
                    }
                }
                wasInside=inside;
            }
            if (walk == 1 && writtenNodes >= passages*(NODE_COUNT/2)) break;
        }

        if (walk == 0 && passages > 0) {
            // Never reallocate foreground slots when a background passage
            // changes length or appears. Empty passage slots remain invalid.
            // Bin edges q^2 concentrate samples in each passage's front layer;
            // every node retains its actual unequal comoving path weight.
            for (int i=0;i<MAX_VOLUME_PASSAGES;++i) {
                passageBase[i]=i*(NODE_COUNT/2);
                passageNodes[i]=i < passages ? NODE_COUNT/2 : 0;
            }
        }
    }

    float totalLength=0.0;
    for (int i=0;i<MAX_VOLUME_PASSAGES;++i) totalLength+=passageLength[i];
    vNode0=packVolumeRecord(nodePosition[0],nodeMaterial[0]);
    vNode1=packVolumeRecord(nodePosition[1],nodeMaterial[1]);
    vNode2=packVolumeRecord(nodePosition[2],nodeMaterial[2]);
    vNode3=packVolumeRecord(nodePosition[3],nodeMaterial[3]);
    vNode4=packVolumeRecord(nodePosition[4],nodeMaterial[4]);
    vNode5=packVolumeRecord(nodePosition[5],nodeMaterial[5]);
#if NODE_COUNT > 6
    vNode6=packVolumeRecord(nodePosition[6],nodeMaterial[6]);
    vNode7=packVolumeRecord(nodePosition[7],nodeMaterial[7]);
#endif
#if NODE_COUNT > 8
    vNode8=packVolumeRecord(nodePosition[8],nodeMaterial[8]);
    vNode9=packVolumeRecord(nodePosition[9],nodeMaterial[9]);
    vNode10=packVolumeRecord(nodePosition[10],nodeMaterial[10]);
    vNode11=packVolumeRecord(nodePosition[11],nodeMaterial[11]);
#endif
    vSky=packVolumeRecord(escapedSky,vec4(totalLength,float(passages),
                                         float(writtenNodes),status+(truncated ? 4.0 : 0.0)));
}
