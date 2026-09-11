/* SPDX-License-Identifier: GPL-3.0-only
 * Adapted from baopinshui/NPGS, BlackHole_common.glsl
 * Upstream commit: 91305ca1661f18b60d6d33ed4616e4cd5b977b9f
 * Web adaptation: 2026-09-11. See ../vendor/npgs/README.md.
 * NPGS conventions: (x,y,z,t), signature (+++-), spin along +y,
 * distances in Schwarzschild radii (2GM/c^2 = 1, M = 0.5).
 * Exterior Kerr only: Q = 0, static camera, ingoing Kerr-Schild.
 */
const float CONST_M = 0.5;
const float EPSILON = 1e-6;
struct State { vec4 X; vec4 P; };


struct KerrGeometry {
    float r;
    float r2;
    float a2;
    float f;              
    vec3  grad_r;         
    vec3  grad_f;         
    vec4  l_up;           // l^u = (lx, ly, lz, -1)
    vec4  l_down;         // l_u = (lx, ly, lz, 1)
    float inv_r2_a2;
    float inv_den_f;      
    float num_f;          
};



float GetKeplerianAngularVelocity(float Radius, float Rs, float PhysicalSpinA, float PhysicalQ2) 
{
    float M = 0.5 * Rs; 
    float Mr_minus_Q2 = M * Radius - PhysicalQ2;
    if (Mr_minus_Q2 < 0.0) return 0.0;
    float sqrt_Term = sqrt(Mr_minus_Q2);
    float denominator = Radius * Radius + PhysicalSpinA * sqrt_Term;
    return sqrt_Term / max(EPSILON, denominator);
}

float KerrSchildRadius(vec3 p, float PhysicalSpinA, float r_sign) {
    float r_sign_len = r_sign * length(p);
    if (PhysicalSpinA == 0.0) return r_sign_len; 

    float a2 = PhysicalSpinA * PhysicalSpinA;
    float rho2 = dot(p.xz, p.xz); // x^2 + z^2
    float y2 = p.y * p.y;
    
    float b = rho2 + y2 - a2;
    float det = sqrt(b * b + 4.0 * a2 * y2);
    
    float r2;
    if (b >= 0.0) {
        r2 = 0.5 * (b + det);
    } else {
        r2 = (2.0 * a2 * y2) / max(1e-20, det - b);
    }
    return r_sign * sqrt(r2);
}

void ComputeGeometryScalars(vec3 X, float PhysicalSpinA, float PhysicalQ2, float fade, float r_sign, bool isOutgoing, out KerrGeometry geo) {
    geo.a2 = PhysicalSpinA * PhysicalSpinA;
    
    // 决定流入还是流出
    float dirSign = isOutgoing ? -1.0 : 1.0;
    
    if (PhysicalSpinA == 0.0) {
        geo.r = r_sign * length(X);
        geo.r2 = geo.r * geo.r;
        float inv_r = 1.0 / geo.r;
        float inv_r2 = inv_r * inv_r;
        
        // 乘上 dirSign
        geo.l_up = vec4(dirSign * X * inv_r, -1.0);
        geo.l_down = vec4(dirSign * X * inv_r, 1.0);
        
        geo.num_f = (2.0 * CONST_M * geo.r - PhysicalQ2);
        geo.f = (2.0 * CONST_M * inv_r - (PhysicalQ2) * inv_r2) * fade;
        
        geo.inv_r2_a2 = inv_r2; 
        geo.inv_den_f = inv_r2 * inv_r2; 
        return;
    }

    geo.r = KerrSchildRadius(X, PhysicalSpinA, r_sign);
    geo.r2 = geo.r * geo.r;
    float r3 = geo.r2 * geo.r;
    float z_coord = X.y; 
    float z2 = z_coord * z_coord;
    
    geo.inv_r2_a2 = 1.0 / (geo.r2 + geo.a2);
    
    // 修改处：向外/向内仅反转径向成分，保留自旋成分
    float lx = (dirSign * geo.r * X.x - PhysicalSpinA * X.z) * geo.inv_r2_a2;
    float ly = (dirSign * X.y) / geo.r;
    float lz = (dirSign * geo.r * X.z + PhysicalSpinA * X.x) * geo.inv_r2_a2;
    
    geo.l_up = vec4(lx, ly, lz, -1.0);
    geo.l_down = vec4(lx, ly, lz, 1.0); 
    
    geo.num_f = 2.0 * CONST_M * r3 - PhysicalQ2 * geo.r2;
    float den_f = geo.r2 * geo.r2 + geo.a2 * z2;
    geo.inv_den_f = 1.0 / max(1e-20, den_f);
    geo.f = (geo.num_f * geo.inv_den_f) * fade;
}

void ComputeGeometryGradients(vec3 X, float PhysicalSpinA, float PhysicalQ2, float fade, inout KerrGeometry geo) {
    float inv_r = 1.0 / geo.r;
    
    if (PhysicalSpinA == 0.0) {

        float inv_r2 = inv_r * inv_r;
        geo.grad_r = X * inv_r;
        float df_dr = (-2.0 * CONST_M + 2.0 * PhysicalQ2 * inv_r) * inv_r2 * fade;
        geo.grad_f = df_dr * geo.grad_r;
        return;
    }

    float inv_denom_grad = geo.r * geo.inv_den_f;
    
    geo.grad_r = vec3(
        X.x * geo.r2,
        X.y * (geo.r2 + geo.a2),
        X.z * geo.r2
    ) * inv_denom_grad;
    
    float z_coord = X.y;
    float z2 = z_coord * z_coord;
    
    float term_M  = -2.0 * CONST_M * geo.r2 * geo.r2 * geo.r;
    float term_Q  = 2.0 * PhysicalQ2 * geo.r2 * geo.r2;
    float term_Ma = 6.0 * CONST_M * geo.a2 * geo.r * z2;
    float term_Qa = -2.0 * PhysicalQ2 * geo.a2 * z2;
    
    float df_dr_num_reduced = term_M + term_Q + term_Ma + term_Qa;
    float df_dr = (geo.r * df_dr_num_reduced) * (geo.inv_den_f * geo.inv_den_f);
    
    float df_dy = -(geo.num_f * 2.0 * geo.a2 * z_coord) * (geo.inv_den_f * geo.inv_den_f);
    
    geo.grad_f = df_dr * geo.grad_r;
    geo.grad_f.y += df_dy;
    geo.grad_f *= fade;
}

vec4 RaiseIndex(vec4 P_cov, KerrGeometry geo) {
    // eta^uv = diag(1, 1, 1, -1)
    vec4 P_flat = vec4(P_cov.xyz, -P_cov.w); 

    float L_dot_P = dot(geo.l_up, P_cov);
    
    return P_flat - geo.f * L_dot_P * geo.l_up;
}

vec4 LowerIndex(vec4 P_contra, KerrGeometry geo) {
    // eta_uv = diag(1, 1, 1, -1)
    vec4 P_flat = vec4(P_contra.xyz, -P_contra.w);
    
    float L_dot_P = dot(geo.l_down, P_contra);
    
    return P_flat + geo.f * L_dot_P * geo.l_down;
}

vec4 GetInitialMomentum(
    vec3 RayDir,          
    vec4 X,               
    int  iObserverMode,   
    float universesign,
    float PhysicalSpinA,  
    float PhysicalQ2,      
    float GravityFade,
    bool isOutgoing
)
{
    KerrGeometry geo;
    ComputeGeometryScalars(X.xyz, PhysicalSpinA, PhysicalQ2, GravityFade, universesign,isOutgoing, geo);

    //确定观者四维速度 U_up 
    vec4 U_up;
    // Static Observer
    float g_tt = -1.0 + geo.f;
    float time_comp = 1.0 / sqrt(max(1e-9, -g_tt));
    U_up = vec4(0.0, 0.0, 0.0, time_comp);
    vec4 U_down = LowerIndex(U_up, geo);

    //构建平直空间参考基
    //主轴，径向
    vec3 m_r = -normalize(X.xyz);

    vec3 WorldUp = vec3(0.0, 1.0, 0.0);
    //副轴，环向或X。注意这个系只是中转，在极点强取方向不会改变视线朝向，只会改变畸变方向，而两极处在平行赤道面上正好没有畸变
    if (abs(dot(m_r, WorldUp)) > 0.999) {
        WorldUp = vec3(1.0, 0.0, 0.0);
    }
    vec3 m_phi = cross(WorldUp, m_r); 
    m_phi = normalize(m_phi);

    vec3 m_theta = cross(m_phi, m_r); 

    // 分解 RayDir 到这组基底
    float k_r     = dot(RayDir, m_r);
    float k_theta = dot(RayDir, m_theta);
    float k_phi   = dot(RayDir, m_phi);

    //构建弯曲时空物理基底

    vec4 e1 = vec4(m_r, 0.0);
    e1 += dot(e1, U_down) * U_up; 
    vec4 e1_d = LowerIndex(e1, geo);
    float n1 = sqrt(max(1e-9, dot(e1, e1_d)));
    e1 /= n1; e1_d /= n1;

    vec4 e2 = vec4(m_theta, 0.0);
    e2 += dot(e2, U_down) * U_up;
    e2 -= dot(e2, e1_d) * e1;
    vec4 e2_d = LowerIndex(e2, geo);
    float n2 = sqrt(max(1e-9, dot(e2, e2_d)));
    e2 /= n2; e2_d /= n2;

    vec4 e3 = vec4(m_phi, 0.0);
    e3 += dot(e3, U_down) * U_up;
    e3 -= dot(e3, e1_d) * e1;
    e3 -= dot(e3, e2_d) * e2;
    vec4 e3_d = LowerIndex(e3, geo);
    float n3 = sqrt(max(1e-9, dot(e3, e3_d)));
    e3 /= n3;



    vec4 P_up = U_up - (k_r * e1 + k_theta * e2 + k_phi * e3);

    // 返回协变动量 P_mu
    return LowerIndex(P_up, geo);
}

void ApplyHamiltonianCorrection(inout vec4 P, vec4 X, float E, float PhysicalSpinA, float PhysicalQ2, float fade, float r_sign, bool isOutgoing) {
    P.w = -E; 
    vec3 p = P.xyz;    
    
    KerrGeometry geo;
    // 增加入参 isOutgoing
    ComputeGeometryScalars(X.xyz, PhysicalSpinA, PhysicalQ2, fade, r_sign, isOutgoing, geo);
    
    float L_dot_p_s = dot(geo.l_up.xyz, p);
    float Pt = P.w; 
    
    float p2 = dot(p, p);
    float Coeff_A = p2 - geo.f * L_dot_p_s * L_dot_p_s;
    float Coeff_B = 2.0 * geo.f * L_dot_p_s * Pt;
    float Coeff_C = -Pt * Pt * (1.0 + geo.f);
    
    float disc = Coeff_B * Coeff_B - 4.0 * Coeff_A * Coeff_C;
    
    if (disc >= 0.0) {
        float sqrtDisc = sqrt(disc);
        float denom = 2.0 * Coeff_A;
        if (abs(denom) > 1e-9) {
            float k1 = (-Coeff_B + sqrtDisc) / denom;
            float k2 = (-Coeff_B - sqrtDisc) / denom;
            float dist1 = abs(k1 - 1.0);
            float dist2 = abs(k2 - 1.0);
            float k = (dist1 < dist2) ? k1 : k2;
            P.xyz *= mix(k, 1.0, clamp(abs(k - 1.0) / 0.1 - 1.0, 0.0, 1.0));
        }
    }
}

State GetDerivativesAnalytic(State S, float PhysicalSpinA, float PhysicalQ2, float fade, bool isOutgoing, inout KerrGeometry geo) {
    State deriv;
    
    ComputeGeometryGradients(S.X.xyz, PhysicalSpinA, PhysicalQ2, fade, geo);
    
    float l_dot_P = dot(geo.l_up.xyz, S.P.xyz) + geo.l_up.w * S.P.w;
    
    vec4 P_flat = vec4(S.P.xyz, -S.P.w); 
    deriv.X = P_flat - geo.f * l_dot_P * geo.l_up;
    
    vec3 grad_A = (-2.0 * geo.r * geo.inv_r2_a2) * geo.inv_r2_a2 * geo.grad_r;
    
    float dirSign = isOutgoing ? -1.0 : 1.0;
    
    // 引入 dirSign 进行导数修正
    float rx_az = dirSign * geo.r * S.X.x - PhysicalSpinA * S.X.z;
    float rz_ax = dirSign * geo.r * S.X.z + PhysicalSpinA * S.X.x;
    
    vec3 d_num_lx = dirSign * S.X.x * geo.grad_r; 
    d_num_lx.x += dirSign * geo.r; 
    d_num_lx.z -= PhysicalSpinA;
    vec3 grad_lx = geo.inv_r2_a2 * d_num_lx + rx_az * grad_A;
    
    vec3 grad_ly = dirSign * (geo.r * geo.inv_den_f) * vec3(-S.X.x * S.X.y, geo.r2 - S.X.y * S.X.y, -S.X.z * S.X.y);
    
    vec3 d_num_lz = dirSign * S.X.z * geo.grad_r;
    d_num_lz.z += dirSign * geo.r;
    d_num_lz.x += PhysicalSpinA;
    vec3 grad_lz = geo.inv_r2_a2 * d_num_lz + rz_ax * grad_A;
    
    vec3 P_dot_grad_l = S.P.x * grad_lx + S.P.y * grad_ly + S.P.z * grad_lz;
    
    vec3 Force = 0.5 * ( (l_dot_P * l_dot_P) * geo.grad_f + (2.0 * geo.f * l_dot_P) * P_dot_grad_l );
    
    deriv.P = vec4(Force, 0.0); 
    
    return deriv;
}

float GetIntermediateSign(vec4 StartX, vec4 CurrentX, float CurrentSign, float PhysicalSpinA) {
    if (StartX.y * CurrentX.y < 0.0) {
        float t = StartX.y / (StartX.y - CurrentX.y);
        float rho_cross = length(mix(StartX.xz, CurrentX.xz, t));
        if (rho_cross < abs(PhysicalSpinA)) {
            return -CurrentSign;
        }
    }
    return CurrentSign;
}

void StepGeodesicRK4_Optimized(
    inout vec4 X, inout vec4 P, 
    float E, float dt, 
    float PhysicalSpinA, float PhysicalQ2, float fade, float r_sign, 
    bool isOutgoing,     
    KerrGeometry geo0, 
    State k1
) {
    State s0; s0.X = X; s0.P = P;
    // k2 Step
    State s1; 
    s1.X = s0.X + 0.5 * dt * k1.X; 
    s1.P = s0.P + 0.5 * dt * k1.P;
    float sign1 = GetIntermediateSign(s0.X, s1.X, r_sign, PhysicalSpinA);
    KerrGeometry geo1;
    ComputeGeometryScalars(s1.X.xyz, PhysicalSpinA, PhysicalQ2, fade, sign1, isOutgoing, geo1);
    State k2 = GetDerivativesAnalytic(s1, PhysicalSpinA, PhysicalQ2, fade, isOutgoing, geo1);
    // k3 Step
    State s2; 
    s2.X = s0.X + 0.5 * dt * k2.X; 
    s2.P = s0.P + 0.5 * dt * k2.P;
    float sign2 = GetIntermediateSign(s0.X, s2.X, r_sign, PhysicalSpinA);
    KerrGeometry geo2;
    ComputeGeometryScalars(s2.X.xyz, PhysicalSpinA, PhysicalQ2, fade, sign2, isOutgoing, geo2);
    State k3 = GetDerivativesAnalytic(s2, PhysicalSpinA, PhysicalQ2, fade, isOutgoing, geo2);
    // k4 Step
    State s3; 
    s3.X = s0.X + dt * k3.X; 
    s3.P = s0.P + dt * k3.P;
    float sign3 = GetIntermediateSign(s0.X, s3.X, r_sign, PhysicalSpinA);
    KerrGeometry geo3;
    ComputeGeometryScalars(s3.X.xyz, PhysicalSpinA, PhysicalQ2, fade, sign3, isOutgoing, geo3);
    State k4 = GetDerivativesAnalytic(s3, PhysicalSpinA, PhysicalQ2, fade, isOutgoing, geo3);
    vec4 finalX = s0.X + (dt / 6.0) * (k1.X + 2.0 * k2.X + 2.0 * k3.X + k4.X);
    vec4 finalP = s0.P + (dt / 6.0) * (k1.P + 2.0 * k2.P + 2.0 * k3.P + k4.P);
    
    float finalSign = GetIntermediateSign(s0.X, finalX, r_sign, PhysicalSpinA);
    if(finalSign > 0.0) { 
        ApplyHamiltonianCorrection(finalP, finalX, E, PhysicalSpinA, PhysicalQ2, fade, finalSign, isOutgoing);
    }
    X = finalX;
    P = finalP;
}
