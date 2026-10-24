/* SPDX-License-Identifier: GPL-3.0-only
 * Pond Kerr experiment. Requires the unchanged NPGS Kerr helpers; attribution
 * and corresponding source/license: ../vendor/npgs/README.md and LICENSE.
 * Coordinates internally use Rs = 2GM/c², spin along +y, signature (+++-).
 * The cache stops at a ray's FIRST entry into the opaque disk. Only an upper
 * or lower photosphere emits; truncated radial walls absorb with no emission.
 * There is no screen-space shadow mask, painted photon ring, or rear overlay.
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
    // Signed outside measure of the whole opaque annulus. A ray entering a
    // radial wall must stop rather than see through to the back of a sheet.
    return max(abs(position.y) - uThickness * radius,
               max(uInner - radius, radius - uOuter));
}

void considerBoundaryRoot(float t, vec3 origin, vec3 delta, float a,
                          int boundary, float derivative,
                          inout float first, inout int firstBoundary) {
    const float tieTolerance=0.00002;
    if(t<0.0 || t>1.0 || t>first+tieTolerance)return;
    // Deterministic ties at the shared rim choose the absorbing radial wall.
    if(abs(t-first)<=tieTolerance && firstBoundary>0 && boundary==0)return;
    // For the inner ellipsoid we enter the annulus by LEAVING the ellipsoid;
    // for the outer ellipsoid and the two photospheres we enter their inside.
    if(boundary==2 ? derivative<=0.0 : derivative>=0.0)return;
    vec3 point=origin+t*delta;
    float r=KerrSchildRadius(point,a,1.0);
    float tolerance=0.00003*max(r,1.0);
    if(surfaceDistance(point,r)>tolerance)return;
    first=t;firstBoundary=boundary;
}

void intersectBoundary(vec3 coefficients, vec3 origin, vec3 delta, float a,
                       int boundary, inout float first, inout int firstBoundary) {
    float A=coefficients.x,B=coefficients.y,C=coefficients.z;
    if(abs(A)<1e-12) {
        if(abs(B)>1e-12)considerBoundaryRoot(-C/B,origin,delta,a,boundary,B,first,firstBoundary);
        return;
    }
    float discriminant=B*B-4.0*A*C;
    if(discriminant<0.0)return;
    float root=sqrt(discriminant);
    // The q form avoids subtracting nearly equal numbers at a grazing rim.
    float q=-0.5*(B+(B>=0.0?root:-root));
    if(abs(q)<1e-20)return;
    float firstRoot=q/A,secondRoot=C/q;
    considerBoundaryRoot(firstRoot,origin,delta,a,boundary,
                         2.0*A*firstRoot+B,first,firstBoundary);
    considerBoundaryRoot(secondRoot,origin,delta,a,boundary,
                         2.0*A*secondRoot+B,first,firstBoundary);
}

void intersectOpaqueSegment(vec3 origin,vec3 delta,float a,
                            out float first,out int boundary) {
    first=2.0;boundary=-1;
    float h2=uThickness*uThickness;
    float k=h2/(1.0-h2);
    // |y|=h*r_KS is this quadratic on a line segment. It can have TWO roots
    // even when both endpoints and the equatorial crossing are outside the
    // truncated volume; endpoint sign tests miss those short grazing chords.
    vec3 photosphere=vec3(delta.y*delta.y-k*dot(delta.xz,delta.xz),
        2.0*(origin.y*delta.y-k*dot(origin.xz,delta.xz)),
        origin.y*origin.y-k*dot(origin.xz,origin.xz)+h2*a*a);
    intersectBoundary(photosphere,origin,delta,a,0,first,boundary);
    // Constant Kerr radius is an oblate ellipsoid. The same existing opaque,
    // non-emitting radial truncations are included so rays cannot tunnel
    // through a rim and accidentally reveal a rear photosphere.
    for(int wall=1;wall<=2;++wall) {
        float radius=wall==1?uOuter:uInner;
        vec3 inverseAxes=vec3(1.0/(radius*radius+a*a),1.0/(radius*radius),
                              1.0/(radius*radius+a*a));
        vec3 ellipsoid=vec3(dot(delta*delta,inverseAxes),
            2.0*dot(origin*delta,inverseAxes),dot(origin*origin,inverseAxes)-1.0);
        intersectBoundary(ellipsoid,origin,delta,a,wall,first,boundary);
    }
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
                intersectOpaqueSegment(previousX.xyz,delta,a,fraction,boundary);
        }
        if (boundary>=0 && fraction<=1.0) {
            vec4 hitX=mix(previousX,x,fraction);
            float hitR=KerrSchildRadius(hitX.xyz,a,1.0);
            if(boundary>0) {
                // A radial truncation is opaque but has no modeled rim
                // emissivity. -1 distinguishes rim occlusion in tests;
                // the radiance shader treats it as black, never as sky.
                skyHit=vec4(0.0,0.0,0.0,-1.0);
                return;
            }
            if(hitR>=uInner*0.999 && hitR<=uOuter*1.001) {
                diskHit=emissionHit(hitX,mix(previousP,p,fraction),a);
                return;
            }
        }
    }
    // Unresolved critical rays stay dark; do not invent an escape direction.
}
