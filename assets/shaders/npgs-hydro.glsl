/* SPDX-License-Identifier: GPL-3.0-only
 * Reconstructed GRSPH density photospheres. Finite density thresholds are an
 * unresolved-photosphere proxy, not an opacity/atmosphere solution.
 */
uniform highp sampler3D uCoreHydro;
uniform highp sampler3D uCoreHeat;
uniform highp sampler3D uFlowHydro;
uniform highp sampler3D uFlowHeat;
uniform vec3 uCoreMin;
uniform vec3 uCoreMax;
uniform vec3 uFlowMin;
uniform vec3 uFlowMax;
uniform float uCoreIso;

bool inHydroBox(vec3 x, vec3 lo, vec3 hi) {
    return all(greaterThanEqual(x,lo)) && all(lessThanEqual(x,hi));
}
vec4 coreAt(vec3 x) {
    return inHydroBox(x,uCoreMin,uCoreMax) ? texture(uCoreHydro,(x-uCoreMin)/(uCoreMax-uCoreMin)) : vec4(0.0);
}
vec4 flowAt(vec3 x) {
    return inHydroBox(x,uFlowMin,uFlowMax) ? texture(uFlowHydro,(x-uFlowMin)/(uFlowMax-uFlowMin)) : vec4(0.0);
}
float hydroSurfaceField(vec3 x) {
    return coreAt(x).x/uCoreIso;
}
vec2 hydroBoxInterval(vec3 start,vec3 chord,vec3 lo,vec3 hi) {
    float entry=0.0,exitPoint=1.0;
    for(int axis=0;axis<3;++axis) {
        if(abs(chord[axis])<1e-9) {
            if(start[axis]<lo[axis] || start[axis]>hi[axis]) return vec2(2.0,-1.0);
        } else {
            vec2 hit=vec2(lo[axis]-start[axis],hi[axis]-start[axis])/chord[axis];
            entry=max(entry,min(hit.x,hit.y)); exitPoint=min(exitPoint,max(hit.x,hit.y));
        }
    }
    return vec2(entry,exitPoint);
}
float hydroCoreIntersection(vec3 start,vec3 end) {
    vec3 chord=end-start;
    vec2 range=hydroBoxInterval(start,chord,uCoreMin,uCoreMax);
    if(range.x>range.y) return 2.0;
    float begin=range.x,finish=range.y;
    vec3 voxel=(uCoreMax-uCoreMin)/vec3(textureSize(uCoreHydro,0));
    float spacing=max(0.004,0.6*min(voxel.x,min(voxel.y,voxel.z)));
    int samples=clamp(int(ceil(length(chord)*(finish-begin)/spacing)),2,40);
    float previous=begin;
    if(hydroSurfaceField(start+chord*previous)>=1.0) return previous;
    for(int i=1;i<=40;++i) {
        if(i>samples) break;
        float current=mix(begin,finish,float(i)/float(samples));
        if(hydroSurfaceField(start+chord*current)>=1.0) {
            float left=previous,right=current;
            for(int refine=0;refine<7;++refine) {
                float middle=0.5*(left+right);
                if(hydroSurfaceField(start+chord*middle)>=1.0) right=middle;else left=middle;
            }
            return right;
        }
        previous=current;
    }
    return 2.0;
}
float hydroStepLimit(vec3 x,float speed,float stepSize) {
    vec3 lo=min(uCoreMin,uFlowMin),hi=max(uCoreMax,uFlowMax);
    float distanceToGas=length(max(max(lo-x,x-hi),vec3(0.0)));
    return min(stepSize,(0.08+0.15*distanceToGas)/max(speed,1e-6));
}
vec3 hydroNormal(vec3 x,bool core) {
    vec3 lo=core?uCoreMin:uFlowMin,hi=core?uCoreMax:uFlowMax;
    vec3 size=core?vec3(textureSize(uCoreHydro,0)):vec3(textureSize(uFlowHydro,0));
    vec3 delta=(hi-lo)/size;
    vec3 gradient;
    for(int axis=0;axis<3;++axis) {
        vec3 offset=vec3(0.0);offset[axis]=delta[axis];
        float a=hydroSurfaceField(x+offset);
        float b=hydroSurfaceField(x-offset);
        gradient[axis]=-(a-b)/(2.0*delta[axis]);
    }
    return gradient;
}
