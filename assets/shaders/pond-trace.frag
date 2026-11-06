/* SPDX-License-Identifier: GPL-3.0-only
 * Pond Kerr experiment. Requires the unchanged NPGS Kerr helpers; attribution
 * and corresponding source/license: ../vendor/npgs/README.md and LICENSE.
 * Coordinates internally use Rs = 2GM/c², spin along +y, signature (+++-).
 * The cache stops at a ray's FIRST entry into the opaque disk. Only an upper
 * or lower photosphere emits, including its tapered inner and outer lips.
 * There is no screen-space shadow mask, painted photon ring, or rear overlay.
 */
uniform vec2 uMapSize;
uniform float uCenterSpacing;
uniform float uSpin;
uniform float uInclination;
uniform float uInner;
uniform float uOuter;
uniform float uThickness;
uniform float uSpan;
layout(location=0) out vec4 diskHit;
layout(location=1) out vec4 skyHit;

// The opaque disk is the intersection of three quadratic solids. The cone
// sets its bulk half-height. The outer ellipsoid and inner hyperboloid close
// the two faces at their shared equatorial rims, without a vertical wall.
// xy: squared cylindrical radii at the rims; zw: inner/outer cap curvature.
vec4 rimShape(float a) {
    float h2=uThickness*uThickness, a2=a*a;
    float width=uOuter-uInner;
    float innerJoin=min(1.5*uInner,uInner+0.18*width);
    float outerJoin=uOuter-0.24*width;
    vec2 feet=vec2(uInner*uInner,uOuter*uOuter)+a2;
    // On the cone y = +/- h r, rho² = (1-h²)(r²+a²) exactly.
    float innerRho2=(1.0-h2)*(innerJoin*innerJoin+a2);
    float outerRho2=(1.0-h2)*(outerJoin*outerJoin+a2);
    return vec4(feet,h2*innerJoin*innerJoin/(innerRho2-feet.x),
                     h2*outerJoin*outerJoin/(feet.y-outerRho2));
}

void considerBoundaryRoot(float t, vec3 origin, vec3 delta, float a, vec4 rim,
                          int boundary, float derivative,
                          inout float first, inout int firstBoundary) {
    // Each quadratic is <=0 inside. Accept only a crossing into all three solids.
    if(t<0.0 || t>1.0 || t>=first || derivative>=0.0)return;
    vec3 p=origin+t*delta;
    float y2=p.y*p.y, rho2=dot(p.xz,p.xz), h2=uThickness*uThickness;
    float k=h2/(1.0-h2);
    vec3 distances=vec3(y2-k*rho2+h2*a*a,
                        y2+rim.w*(rho2-rim.y),
                        y2-rim.z*(rho2-rim.x));
    vec3 scales=vec3(y2+k*rho2+h2*a*a, y2+rim.w*(rho2+rim.y), y2+rim.z*(rho2+rim.x));
    if(any(greaterThan(distances,2e-5*scales)))return;
    first=t;firstBoundary=boundary;
}

void intersectBoundary(vec3 coefficients, vec3 origin, vec3 delta, float a, vec4 rim,
                       int boundary, inout float first, inout int firstBoundary) {
    float A=coefficients.x,B=coefficients.y,C=coefficients.z;
    if(abs(A)<1e-12) {
        if(abs(B)>1e-12)considerBoundaryRoot(-C/B,origin,delta,a,rim,boundary,B,first,firstBoundary);
        return;
    }
    float discriminant=B*B-4.0*A*C;
    if(discriminant<=0.0)return;
    float root=sqrt(discriminant);
    float q=-0.5*(B+(B>=0.0?root:-root));
    if(abs(q)<1e-20)return;
    float t0=q/A,t1=C/q;
    considerBoundaryRoot(t0,origin,delta,a,rim,boundary,2.0*A*t0+B,first,firstBoundary);
    considerBoundaryRoot(t1,origin,delta,a,rim,boundary,2.0*A*t1+B,first,firstBoundary);
}

void intersectOpaqueSegment(vec3 origin,vec3 delta,float a,vec4 rim,
                            out float first,out int boundary) {
    first=2.0;boundary=-1;
    // Polynomial coefficients of y² and rho² along this segment. Both roots
    // matter at grazing angles, even if neither endpoint is inside.
    vec3 y2=vec3(delta.y*delta.y,2.0*origin.y*delta.y,origin.y*origin.y);
    vec3 rho2=vec3(dot(delta.xz,delta.xz),2.0*dot(origin.xz,delta.xz),dot(origin.xz,origin.xz));
    float h2=uThickness*uThickness;
    vec3 cone=y2-(h2/(1.0-h2))*rho2;cone.z+=h2*a*a;
    vec3 outer=y2+rim.w*rho2;outer.z-=rim.w*rim.y;
    vec3 inner=y2-rim.z*rho2;inner.z+=rim.z*rim.x;
    intersectBoundary(cone,origin,delta,a,rim,0,first,boundary);
    intersectBoundary(outer,origin,delta,a,rim,1,first,boundary);
    intersectBoundary(inner,origin,delta,a,rim,2,first,boundary);
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

// Centered screen-plane position for a ray-cache UV (0..1). Concentrate rays
// on the thin lensed arcs while preserving both ends of the field of view.
vec2 screenPlane(vec2 cacheCoord,float span) {
    vec2 grid=2.0*cacheCoord-1.0;
    return 0.5*span*grid*(uCenterSpacing+(1.0-uCenterSpacing)*abs(grid));
}

void main() {
    float a = 0.5 * uSpin;
    float horizon = 0.5 * (1.0 + sqrt(max(0.0, 1.0-uSpin*uSpin)));
    vec2 plane = screenPlane(gl_FragCoord.xy/uMapSize,uSpan);
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
    vec4 rim=rimShape(a);
    // Most rays finish early; allow extra turns close to a fast-spinning hole.
    for (int iteration=0; iteration<2048; ++iteration) {
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
        StepGeodesicRK4_Optimized(x,p,energy,-dt,a,0.0,1.0,1.0,false,geometry,derivative);
        float nextR=KerrSchildRadius(x.xyz,a,1.0);
        float fraction=2.0;
        int boundary=-1;
        if(uThickness<0.0001) {
            if(previousX.y*x.y<0.0) {
                fraction=previousX.y/(previousX.y-x.y);boundary=0;
            }
        } else {
            vec3 delta=x.xyz-previousX.xyz;
            float reach=2.0*length(delta);
            float minY=previousX.y*x.y<=0.0?0.0:min(abs(previousX.y),abs(x.y));
            // Conservative proximity rejection avoids solving quadratics in
            // the far sky. The factor2 bounds exterior Kerr radial stretch.
            if(min(geometry.r,nextR)-reach<=uOuter &&
               max(geometry.r,nextR)+reach>=uInner &&
               minY<=uThickness*(max(geometry.r,nextR)+reach))
                intersectOpaqueSegment(previousX.xyz,delta,a,rim,fraction,boundary);
        }
        if (boundary>=0 && fraction<=1.0) {
            vec4 hitX=mix(previousX,x,fraction);
            float hitR=KerrSchildRadius(hitX.xyz,a,1.0);
            if(hitR>=uInner*0.999 && hitR<=uOuter*1.001) {
                diskHit=emissionHit(hitX,mix(previousP,p,fraction),a);
                skyHit.w=-float(boundary); // Distinguish the two lips on debug readback.
                return;
            }
        }
    }
    skyHit.w=-3.0; // Iteration limit, distinct from a captured ray in debug readback.
}
