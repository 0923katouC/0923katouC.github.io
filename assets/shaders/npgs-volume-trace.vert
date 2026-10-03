/* SPDX-License-Identifier: GPL-3.0-only
 * Disk and bipolar jet quadrature on the SAME numerical Kerr null rays.
 * Prefix SCENE, standalone npgs-jet.glsl, then npgs-kerr.glsl.
 * Disk slots are unchanged: two fixed half-banks, front-biased q^2 bins.
 * Jet slots follow: two fixed half-banks, uniform bins for thin emission.
 * Each node packs only xyz,tLag,g,dl_emit (three uint words); its bank
 * identifies the material and dl>0 identifies a valid node.
 * Four sky/diagnostic words follow all nodes, then zero padding to uvec4.
 */
#ifndef NODE_COUNT
#define NODE_COUNT 12
#endif
#ifndef JET_NODE_COUNT
#define JET_NODE_COUNT 6
#endif
#ifndef PACKET_TEXELS
#define PACKET_TEXELS ((3*(NODE_COUNT+JET_NODE_COUNT)+7)/4)
#endif
uniform vec2 uMapSize;
uniform int uRayOffset;
flat out highp uvec4 vPack0;
flat out highp uvec4 vPack1;
flat out highp uvec4 vPack2;
flat out highp uvec4 vPack3;
flat out highp uvec4 vPack4;
flat out highp uvec4 vPack5;
flat out highp uvec4 vPack6;
flat out highp uvec4 vPack7;
flat out highp uvec4 vPack8;
#if PACKET_TEXELS > 9
flat out highp uvec4 vPack9;
#endif
#if PACKET_TEXELS > 10
flat out highp uvec4 vPack10;
#endif
#if PACKET_TEXELS > 11
flat out highp uvec4 vPack11;
#endif
#if PACKET_TEXELS > 12
flat out highp uvec4 vPack12;
#endif
#if PACKET_TEXELS > 13
flat out highp uvec4 vPack13;
#endif
#if PACKET_TEXELS > 14
flat out highp uvec4 vPack14;
#endif
const int MAX_VOLUME_PASSAGES=2; // independently for disk and jet
const int MAX_VOLUME_STEPS=560;
const int TOTAL_NODE_COUNT=NODE_COUNT+JET_NODE_COUNT;
const int SKY_WORD_OFFSET=3*TOTAL_NODE_COUNT;
uint cacheWords[4*PACKET_TEXELS];
float passageLength[4]; // disk 0,1; jet 0,1

void writePackedNode(int slot,vec4 x,float shift,float lengthInEmitterFrame) {
    cacheWords[3*slot]=packHalf2x16(x.xy);
    cacheWords[3*slot+1]=packHalf2x16(x.zw);
    cacheWords[3*slot+2]=packHalf2x16(vec2(shift,lengthInEmitterFrame));
}
uvec4 packet(int index) {
    int base=4*index;
    return uvec4(cacheWords[base],cacheWords[base+1],cacheWords[base+2],cacheWords[base+3]);
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

float componentSupportMargin(int kind,vec4 x) {
    return kind==0 ? volumeSupportMargin(x) : jetSupportMargin(x.xyz);
}
bool componentRadiation(int kind,vec4 x,vec4 p,out float emitEnergy) {
    if(kind==0) return volumeRadiation(x,p,emitEnergy);
    emitEnergy=0.0;
    if(jetSupportMargin(x.xyz)<=0.0) return false;
    vec4 u=jetEmitterVelocity(x.xyz);
    if(u.w<=0.0) return false;
    emitEnergy=-dot(p,u);
    return emitEnergy>1e-7 && !isnan(emitEnergy) && !isinf(emitEnergy);
}
float componentFrequencyShift(int kind,vec4 x,vec4 p) {
    if(kind==0) return volumeFrequencyShift(x,p);
    vec4 u=jetEmitterVelocity(x.xyz);
    float energy=-dot(p,u);
    return u.w>0.0 && energy>1e-7 ? 1.0/energy : 0.0;
}

void main() {
    gl_Position=vec4(0.0,0.0,0.0,1.0);
    gl_PointSize=1.0;
    for(int i=0;i<4*PACKET_TEXELS;++i) cacheWords[i]=0u;
    for(int i=0;i<4;++i) passageLength[i]=0.0;
    int width=int(uMapSize.x);
    int rayIndex=gl_VertexID+uRayOffset;
    vec2 pixel=vec2(float(rayIndex%width),float(rayIndex/width))+0.5;
    vec2 plane=mapToPlane(pixel/uMapSize);
    vec4 initialX=vec4(CAMERA,0.0);
    vec4 initialP=GetInitialMomentum(sceneDirection(plane),initialX,0,1.0,
                                     PHYSICAL_A,0.0,1.0,false);
    float energy=-initialP.w;
    vec3 escapedDirection=vec3(0.0);
    int statusBase=2; // 0 escape, 1 captured, 2 step budget, 3 invalid
    bool truncated[2];
    int passages[2],writtenNodes[2];
    for(int kind=0;kind<2;++kind) {
        truncated[kind]=false;passages[kind]=0;writtenNodes[kind]=0;
    }

    for(int walk=0;walk<2;++walk) {
        if(walk==1 && passages[0]+passages[1]==0) break;
        vec4 x=initialX,p=initialP;
        bool wasInside[2];
        int passage[2],nextNode[2];
        float lengthInPassage[2];
        for(int kind=0;kind<2;++kind) {
            wasInside[kind]=false;passage[kind]=-1;nextNode[kind]=0;lengthInPassage[kind]=0.0;
        }
        for(int stepIndex=0;stepIndex<MAX_VOLUME_STEPS;++stepIndex) {
            KerrGeometry geo;
            ComputeGeometryScalars(x.xyz,PHYSICAL_A,0.0,1.0,1.0,false,geo);
            if(any(isnan(x)) || any(isinf(x)) || any(isnan(p)) || any(isinf(p))) {
                if(walk==0) statusBase=3;
                break;
            }
            if(geo.r<HORIZON+0.012) {
                if(walk==0) statusBase=1;
                break;
            }
            State state;state.X=x;state.P=p;
            State k1=GetDerivativesAnalytic(state,PHYSICAL_A,0.0,1.0,false,geo);
            if(geo.r>90.0 && dot(x.xyz,-k1.X.xyz)>0.0) {
                if(walk==0) {escapedDirection=normalize(-k1.X.xyz);statusBase=0;}
                break;
            }
            float ringDistance=length(vec2(x.y,length(x.xz)-PHYSICAL_A));
            float dt=0.22*min(ringDistance/max(length(k1.X),1e-6),length(p)/max(length(k1.P),1e-8));
            if(geo.r<24.0) dt=min(dt,0.55/max(length(k1.X.xyz),1e-6));
            if(geo.r<DISK_OUTER+1.5) dt=min(dt,0.32/max(length(k1.X.xyz),1e-6));
            // Both jet support (|y|<14) and disk lie inside the existing
            // r<24 step limiter. Keep the accepted disk's RK step sequence;
            // subdivision below resolves BOTH supports in <=.12 Rs cells.
            dt=max(dt,1e-6);
            vec4 previousX=x,previousP=p;
            StepGeodesicRK4_Optimized(x,p,energy,-dt,PHYSICAL_A,0.0,1.0,1.0,false,geo,k1);
            if(any(isnan(x)) || any(isinf(x)) || any(isnan(p)) || any(isinf(p))) {
                if(walk==0) statusBase=3;
                break;
            }
            int pieces=clamp(int(ceil(length(x.xyz-previousX.xyz)/0.12)),1,8);
            for(int piece=0;piece<8;++piece) {
                if(piece>=pieces) break;
                float midpoint=(float(piece)+0.5)/float(pieces);
                vec4 midX=mix(previousX,x,midpoint),midP=mix(previousP,p,midpoint);
                for(int kind=0;kind<2;++kind) {
                    float emitEnergy;
                    bool inside=componentRadiation(kind,midX,midP,emitEnergy);
                    float cellStart=float(piece)/float(pieces);
                    float cellEnd=float(piece+1)/float(pieces);
                    if(inside) {
                        bool clipped=false;
                        if(componentSupportMargin(kind,mix(previousX,x,cellStart))<=0.0) {
                            float outside=cellStart,accepted=midpoint;
                            for(int b=0;b<5;++b) {
                                float trial=0.5*(outside+accepted);
                                if(componentSupportMargin(kind,mix(previousX,x,trial))>0.0) accepted=trial;
                                else outside=trial;
                            }
                            cellStart=accepted;clipped=true;
                        }
                        if(componentSupportMargin(kind,mix(previousX,x,cellEnd))<=0.0) {
                            float accepted=midpoint,outside=cellEnd;
                            for(int b=0;b<5;++b) {
                                float trial=0.5*(outside+accepted);
                                if(componentSupportMargin(kind,mix(previousX,x,trial))>0.0) accepted=trial;
                                else outside=trial;
                            }
                            cellEnd=accepted;clipped=true;
                        }
                        if(clipped) {
                            float center=0.5*(cellStart+cellEnd);
                            inside=componentRadiation(kind,mix(previousX,x,center),mix(previousP,p,center),emitEnergy);
                        }
                    }
                    if(inside && !wasInside[kind]) {
                        ++passage[kind];nextNode[kind]=0;lengthInPassage[kind]=0.0;
                        if(walk==0) {
                            if(passage[kind]<MAX_VOLUME_PASSAGES) passages[kind]=passage[kind]+1;
                            else truncated[kind]=true;
                        }
                    }
                    if(inside && passage[kind]<MAX_VOLUME_PASSAGES) {
                        int segment=2*kind+passage[kind];
                        float dl=emitEnergy*dt*(cellEnd-cellStart);
                        if(walk==0) passageLength[segment]+=dl;
                        else {
                            int count=kind==0 ? NODE_COUNT/2 : JET_NODE_COUNT/2;
                            float endLength=lengthInPassage[kind]+dl;
                            for(int j=0;j<TOTAL_NODE_COUNT;++j) {
                                if(nextNode[kind]>=count) break;
                                float q0=float(nextNode[kind])/float(count);
                                float q1=float(nextNode[kind]+1)/float(count);
                                float binStart=passageLength[segment]*q0;
                                float binEnd=passageLength[segment]*q1;
                                // Preserve the disk's previous multiplication
                                // order as well as its q^2 quadrature rule.
                                if(kind==0) {binStart*=q0;binEnd*=q1;}
                                float target=0.5*(binStart+binEnd);
                                if(target>endLength) break;
                                float fraction=mix(cellStart,cellEnd,clamp((target-lengthInPassage[kind])/max(dl,1e-9),0.0,1.0));
                                vec4 sampleX=mix(previousX,x,fraction);
                                vec4 sampleP=mix(previousP,p,fraction);
                                ApplyHamiltonianCorrection(sampleP,sampleX,energy,PHYSICAL_A,0.0,1.0,1.0,false);
                                float shift=componentFrequencyShift(kind,sampleX,sampleP);
                                int slot=(kind==0 ? 0 : NODE_COUNT)+passage[kind]*count+nextNode[kind];
                                if(shift>0.0 && !isnan(shift) && !isinf(shift)) {
                                    writePackedNode(slot,sampleX,shift,binEnd-binStart);
                                    ++writtenNodes[kind];
                                }
                                ++nextNode[kind];
                            }
                            lengthInPassage[kind]=endLength;
                        }
                    }
                    wasInside[kind]=inside;
                }
            }
            int expected=passages[0]*(NODE_COUNT/2)+passages[1]*(JET_NODE_COUNT/2);
            if(walk==1 && writtenNodes[0]+writtenNodes[1]>=expected) break;
        }
    }
    float flags=float(statusBase)+(truncated[0] ? 4.0 : 0.0)+(truncated[1] ? 8.0 : 0.0);
    cacheWords[SKY_WORD_OFFSET]=packHalf2x16(escapedDirection.xy);
    cacheWords[SKY_WORD_OFFSET+1]=packHalf2x16(vec2(escapedDirection.z,flags));
    cacheWords[SKY_WORD_OFFSET+2]=packHalf2x16(vec2(passageLength[0]+passageLength[1],passageLength[2]+passageLength[3]));
    cacheWords[SKY_WORD_OFFSET+3]=packHalf2x16(vec2(float(writtenNodes[0]),float(writtenNodes[1])));
    vPack0=packet(0);vPack1=packet(1);vPack2=packet(2);vPack3=packet(3);
    vPack4=packet(4);vPack5=packet(5);vPack6=packet(6);vPack7=packet(7);vPack8=packet(8);
#if PACKET_TEXELS > 9
    vPack9=packet(9);
#endif
#if PACKET_TEXELS > 10
    vPack10=packet(10);
#endif
#if PACKET_TEXELS > 11
    vPack11=packet(11);
#endif
#if PACKET_TEXELS > 12
    vPack12=packet(12);
#endif
#if PACKET_TEXELS > 13
    vPack13=packet(13);
#endif
#if PACKET_TEXELS > 14
    vPack14=packet(14);
#endif
}
