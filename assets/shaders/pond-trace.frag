/* SPDX-License-Identifier: GPL-3.0-only
 * Pond Kerr experiment. Requires the unchanged NPGS Kerr helpers; attribution
 * and corresponding source/license: ../vendor/npgs/README.md and LICENSE.
 * Coordinates internally use Rs = 2GM/c², spin along +y, signature (+++-).
 * The cache stores only a ray's FIRST opaque photosphere hit. There is no
 * screen-space shadow mask, painted photon ring, or artificial rear image.
 */
uniform vec2 uMapSize;
uniform float uSpin;
uniform float uInclination;
uniform float uInner;
uniform float uOuter;
uniform float uThickness;
uniform float uSpan;
layout(location=0) out vec4 diskHit;
layout(location=1) out vec4 skyHit;

float surfaceDistance(vec3 position, float radius) {
    // Only the upper/lower photospheres radiate. The radial numerical limits
    // clip those surfaces; they are NOT luminous cylindrical inner/outer walls.
    return abs(position.y) - uThickness * radius;
}

vec4 emissionHit(vec4 x, vec4 p, float a) {
    float r = KerrSchildRadius(x.xyz, a, 1.0);
    // A prescribed circular velocity is used on the finite-height surface.
    // It is exact equatorial Kerr circular motion for thickness=0; the finite
    // height continuation is an approximation, not an off-plane geodesic.
    float omega = GetKeplerianAngularVelocity(r, 1.0, a, 0.0);
    vec4 velocity = vec4(omega * x.z, 0.0, -omega * x.x, 1.0);
    KerrGeometry geometry;
    ComputeGeometryScalars(x.xyz, a, 0.0, 1.0, 1.0, false, geometry);
    float norm = dot(velocity, LowerIndex(velocity, geometry));
    if (norm >= -1e-7) return vec4(0.0);
    velocity *= inversesqrt(-norm);
    // The camera tetrad initializes E_observer = 1, so g = 1 / (-p.u_emit).
    float frequency = -dot(p, velocity);
    if (frequency <= 0.0) return vec4(0.0);
    return vec4(2.0 * r, atan(x.x, x.z), 2.0 * x.w, 1.0 / frequency);
}

void main() {
    float a = 0.5 * uSpin;
    float horizon = 0.5 * (1.0 + sqrt(max(0.0, 1.0-uSpin*uSpin)));
    vec2 plane = (gl_FragCoord.xy / uMapSize - 0.5) * uSpan;
    plane.x *= uMapSize.x / uMapSize.y;
    float inclination = radians(uInclination);
    vec3 camera = 48.0 * vec3(0.0, cos(inclination), sin(inclination));
    vec3 up = vec3(0.0, sin(inclination), -cos(inclination));
    vec3 direction = normalize(-camera + vec3(plane.x,0.0,0.0) + plane.y*up);
    vec4 x = vec4(camera, 0.0);
    vec4 p = GetInitialMomentum(direction,x,0,1.0,a,0.0,1.0,false);
    float energy = -p.w;
    diskHit = vec4(0.0);
    skyHit = vec4(0.0);
    for (int iteration=0; iteration<640; ++iteration) {
        KerrGeometry geometry;
        ComputeGeometryScalars(x.xyz,a,0.0,1.0,1.0,false,geometry);
        if (geometry.r < horizon + 0.003 || any(isnan(x)) || any(isinf(x)) ||
            any(isnan(p)) || any(isinf(p))) return;
        State state; state.X=x; state.P=p;
        State derivative=GetDerivativesAnalytic(state,a,0.0,1.0,false,geometry);
        if (geometry.r>80.0 && dot(x.xyz,-derivative.X.xyz)>0.0) {
            skyHit=vec4(normalize(-derivative.X.xyz),1.0);
            return;
        }
        float speed=max(length(derivative.X.xyz),1e-6);
        float distanceToRing=length(vec2(x.y,length(x.xz)-abs(a)));
        float dt=0.16*min(distanceToRing/max(length(derivative.X),1e-6),
                         length(p)/max(length(derivative.P),1e-8));
        // Resolve surface crossings and winding near the critical curve.
        if (geometry.r<uOuter*1.25) dt=min(dt,0.15*max(1.0,geometry.r/4.0)/speed);
        dt=max(dt,1e-6);
        vec4 previousX=x, previousP=p;
        float before=surfaceDistance(x.xyz,geometry.r);
        StepGeodesicRK4_Optimized(x,p,energy,-dt,a,0.0,1.0,1.0,false,geometry,derivative);
        float nextR=KerrSchildRadius(x.xyz,a,1.0);
        float after=surfaceDistance(x.xyz,nextR);
        bool thinCross = uThickness<0.0001 && previousX.y*x.y<0.0;
        bool thickCross = uThickness>=0.0001 && before*after<0.0;
        // A coarse RK step can cross BOTH surfaces of a very thin disk. The
        // equatorial midpoint then supplies a guaranteed inside bracket.
        float planeDenominator=previousX.y-x.y;
        float equatorFraction=abs(planeDenominator)>1e-12?previousX.y/planeDenominator:0.5;
        bool crossedPlane=previousX.y*x.y<0.0;
        vec3 equatorPoint=mix(previousX.xyz,x.xyz,clamp(equatorFraction,0.0,1.0));
        float equatorRadius=KerrSchildRadius(equatorPoint,a,1.0);
        bool skippedBoth=uThickness>=0.0001 && before>0.0 && crossedPlane &&
                         equatorRadius>=uInner && equatorRadius<=uOuter;
        if (thinCross || thickCross || skippedBoth) {
            float fraction;
            if (thinCross) fraction=previousX.y/(previousX.y-x.y);
            else {
                // Eight bisections locate a photosphere; both orientations
                // are valid when a ray previously passed its radial cutout.
                float lo=0.0,hi=thickCross?1.0:equatorFraction;
                for(int j=0;j<8;++j) {
                    float mid=0.5*(lo+hi);
                    vec3 point=mix(previousX.xyz,x.xyz,mid);
                    if(surfaceDistance(point,KerrSchildRadius(point,a,1.0))*before>0.0)lo=mid;
                    else hi=mid;
                }
                fraction=0.5*(lo+hi);
            }
            vec4 hitX=mix(previousX,x,fraction);
            float hitR=KerrSchildRadius(hitX.xyz,a,1.0);
            if(hitR>=uInner*0.999 && hitR<=uOuter*1.001) {
                diskHit=emissionHit(hitX,mix(previousP,p,fraction),a);
                if(diskHit.w>0.0)return;
            }
        }
    }
    // Unresolved critical rays stay dark; do not invent an escape direction.
}
