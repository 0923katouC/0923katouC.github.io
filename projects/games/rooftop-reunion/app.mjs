import * as T from './vendor/three.module.min.js';
import { OrbitControls } from './vendor/OrbitControls.js';

if (new URLSearchParams(location.search).has('cover')) document.body.classList.add('cover-mode');
const $ = id => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const scene = new T.Scene();
scene.background = new T.Color('#b8cbd0');
scene.fog = new T.Fog('#b8cbd0', 110, 260);
const camera = new T.PerspectiveCamera(38, 1, .1, 500);
let renderer;
let dirty=true;
try { renderer = new T.WebGLRenderer({canvas:$('scene'),antialias:true,alpha:false}); }
catch { $('loading').textContent = '当前浏览器无法显示三维场景，请开启图形加速后重试。'; throw new Error('3D rendering unavailable'); }
renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.autoUpdate=false;
renderer.shadowMap.needsUpdate=true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
const controls = new OrbitControls(camera,renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = .08;
controls.minDistance = 8; controls.maxDistance = 145;
controls.maxPolarAngle = Math.PI*.48; controls.minPolarAngle = .08;
controls.screenSpacePanning = false;
controls.addEventListener('change',()=>{dirty=true;});
const sun = new T.DirectionalLight('#ffe4c7',3.1);sun.position.set(-35,65,35);sun.castShadow = true;
sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-55;sun.shadow.camera.right=55;sun.shadow.camera.top=55;sun.shadow.camera.bottom=-55;sun.shadow.camera.far=160;sun.shadow.normalBias=.05;scene.add(sun);
const ambient = new T.HemisphereLight('#c4e8ff','#605c7f',2.5);scene.add(ambient);
const fill = new T.DirectionalLight('#bdc6ff',1.5);fill.position.set(40,25,-25);scene.add(fill);
const envCanvas=document.createElement('canvas');envCanvas.width=512;envCanvas.height=256;
const eg=envCanvas.getContext('2d'),gradient=eg.createLinearGradient(0,0,0,256);
gradient.addColorStop(0,'#8da6c0');gradient.addColorStop(.45,'#e8e5db');gradient.addColorStop(.5,'#abb7bb');gradient.addColorStop(1,'#445568');eg.fillStyle=gradient;eg.fillRect(0,0,512,256);
const env=new T.CanvasTexture(envCanvas);env.mapping=T.EquirectangularReflectionMapping;env.colorSpace=T.SRGBColorSpace;
const pmrem=new T.PMREMGenerator(renderer);scene.environment=pmrem.fromEquirectangular(env).texture;env.dispose();pmrem.dispose();
const material = (color,metalness=0,roughness=.7,extra={}) => new T.MeshStandardMaterial({color,metalness,roughness,...extra});
const m={stone:material('#d3d0c4'),edge:material('#ece8db',.25,.4),chrome:material('#bacbd1',.78,.22),glass:material('#619b9f',.5,.18),darkGlass:material('#274e62',.5,.24),pink:material('#be8498',.3,.45),dark:material('#334952'),paving:material('#a2aca5'),wood:material('#a38977'),black:material('#182c3a'),green:material('#3b7864'),leaf:material('#5c9676'),pot:material('#d8b39d'),sofa:material('#849ca2'),wall:material('#dddacb'),blue:material('#66d8db',.2,.3,{emissive:'#2b8f9c',emissiveIntensity:.35}),purple:material('#a5a4de',.3,.3,{emissive:'#7f5bc3',emissiveIntensity:.3}),warm:material('#ffe9ab',0,.3,{emissive:'#ffc56c',emissiveIntensity:.35})};
const boxGeometry=new T.BoxGeometry(1,1,1);
function box(w,h,d,x,y,z,mat,parent=scene,rotation=0){const mesh=new T.Mesh(boxGeometry,mat);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);mesh.rotation.y=rotation;mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
function cylinder(r,h,x,y,z,mat,parent=scene,rTop=r){const mesh=new T.Mesh(new T.CylinderGeometry(rTop,r,h,24),mat);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
function rod(a,b,r,mat,parent=scene){const A=new T.Vector3(...a),B=new T.Vector3(...b),v=B.clone().sub(A);const mesh=cylinder(r,v.length(),0,0,0,mat,parent);mesh.position.copy(A.add(B).multiplyScalar(.5));mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.normalize());return mesh;}
function rounded(w,d,h,x,y,z,r,mat,parent=scene){const shape=new T.Shape();shape.moveTo(-w/2+r,-d/2);shape.lineTo(w/2-r,-d/2);shape.quadraticCurveTo(w/2,-d/2,w/2,-d/2+r);shape.lineTo(w/2,d/2-r);shape.quadraticCurveTo(w/2,d/2,w/2-r,d/2);shape.lineTo(-w/2+r,d/2);shape.quadraticCurveTo(-w/2,d/2,-w/2,d/2-r);shape.lineTo(-w/2,-d/2+r);shape.quadraticCurveTo(-w/2,-d/2,-w/2+r,-d/2);const geo=new T.ExtrudeGeometry(shape,{depth:h,bevelEnabled:false,curveSegments:6});geo.rotateX(-Math.PI/2);const mesh=new T.Mesh(geo,mat);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
function sign(text,w,h,x,y,z,{color='#e5f6df',bg='#173d4b',size=80,rotation=0,parent=scene}={}){const c=document.createElement('canvas');c.width=1024;c.height=Math.round(1024*h/w);const g=c.getContext('2d');g.fillStyle=bg;g.fillRect(0,0,c.width,c.height);g.fillStyle=color;g.font=`500 ${size}px "PingFang SC",sans-serif`;g.textAlign='center';g.textBaseline='middle';g.fillText(text,c.width/2,c.height/2,c.width-60);const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;const mesh=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:texture,side:T.DoubleSide}));mesh.position.set(x,y,z);mesh.rotation.y=rotation;parent.add(mesh);return mesh;}
const building=new T.Group();scene.add(building);
const roof=new T.Group();scene.add(roof);
const cinemaRoof=new T.Group();roof.add(cinemaRoof);
const interior=new T.Group();roof.add(interior);
// A stepped shopping centre with rounded corners, ribbon windows and sloping glass canopies.
rounded(44,36,1.2,0,-1,0,5,m.edge,building);
rounded(40,32,8.7,0,.2,0,4,m.stone,building);
rounded(32,25,7.8,0,8.9,0,3,m.stone,building);
for(const [w,d,levels,y0] of [[40,32,3,0],[32,25,3,8.6]]){
 for(let l=0;l<levels;l++){
  const y=y0+1.35+l*2.6;
  rounded(w+.25,d+.25,.22,0,y+1.3,0,3,m.chrome,building);
  for(let i=-Math.floor((w-8)/2.5);i<=Math.floor((w-8)/2.5);i++)for(const side of [-1,1])box(1.65,1.38,.08,i*1.25,y,side*(d/2+.025),((i+l)%4===0?m.glass:m.darkGlass),building);
  for(let i=-Math.floor((d-8)/2.5);i<=Math.floor((d-8)/2.5);i++)for(const side of [-1,1])box(.08,1.38,1.65,side*(w/2+.025),y,i*1.25,m.glass,building);
 }
}
// Full-height chrome ribs emphasize the old vision of the future.
for(const x of [-15,-10,-5,5,10,15]){box(.16,8.5,.2,x,4.6,16.05,m.edge,building);box(.14,7.3,.16,x,12.6,12.55,m.edge,building);}
for(const x of [-18.4,18.4]){
 cylinder(1.1,9,x,4.7,11.9,m.chrome,building);
 for(let l=0;l<5;l++)cylinder(1.17,.12,x,1.1+l*1.7,11.9,m.blue,building);
}
// Slanted canopy panels on the lower setback.
for(let i=-7;i<=7;i++){
 const canopy=box(2.25,.12,4.6,i*2.35,9.05,14.2,m.glass,building);canopy.rotation.x=.38;
 const rib=box(.09,.18,4.8,i*2.35-1.13,9.12,14.2,m.chrome,building);rib.rotation.x=.38;
}
for(const side of [-1,1])for(let j=-4;j<=4;j++){
 const canopy=box(4.0,.12,2.3,side*18,9.05,j*2.4,m.glass,building);canopy.rotation.z=-side*.4;
 const rib=box(4.15,.16,.08,side*18,9.12,j*2.4-1.1,m.chrome,building);rib.rotation.z=-side*.4;
}
// Two taller rear volumes, as in the overall massing sketch.
for(const [x,h,w] of [[-17.2,30,7.6],[17.5,25,6.3]]){
 rounded(w,9,h,x,0,-10.8,1.3,m.edge,building);
 for(let y=2;y<h-1;y+=2.6){
  box(w-.7,1.65,.12,x,y,-6.24,m.darkGlass,building);
  box(.13,1.65,7.7,x+w/2+.025,y,-10.8,m.glass,building);
  box(.13,1.65,7.7,x-w/2-.025,y,-10.8,m.glass,building);
  box(w+.22,.15,9.15,x,y+1.1,-10.8,m.chrome,building);
 }
 rounded(w+.4,9.4,.3,x,h,-10.8,1.4,m.chrome,building);
 cylinder(.10,5,x,h+2.5,-10.8,m.chrome,building);
 const orbit=new T.Mesh(new T.TorusGeometry(1.8,.1,8,50),m.purple);orbit.position.set(x,h+1.1,-10.8);orbit.rotation.x=Math.PI/2;building.add(orbit);
}
sign('M I L L E N N I U M',15,1.2,0,7.2,16.18,{size:65,parent:building});
sign('2000 · 新 世 纪 广 场',10,1.1,0,2.7,16.21,{size:62,color:'#abe5e3',parent:building});
box(8.6,4.2,.15,0,2.2,16.08,m.darkGlass,building);
for(let x=-4;x<=4;x+=1)box(.07,4.2,.2,x,2.2,16.18,m.chrome,building);
rounded(12,4,.25,0,4.8,16,1.5,m.chrome,building);
for(const x of [-5,5])cylinder(.23,4.5,x,2.3,17,m.chrome,building);
// The roof deck is built around a real recessed opening, not a painted rectangle.
const Y=18;
box(10.5,1.3,25,-10.75,17.35,0,m.paving,roof);box(10.5,1.3,25,10.75,17.35,0,m.paving,roof);
box(11,1.3,8.5,0,17.35,-8.25,m.paving,roof);box(11,1.3,7.5,0,17.35,8.75,m.paving,roof);
box(11,.18,9,0,16.8,.5,m.wood,roof);
for(let x=-5;x<=5;x+=.45)box(.025,.015,8.9,x,16.9,.5,m.edge,roof);
// Broad steps descend toward the central platform from the front.
for(let i=0;i<4;i++)box(9.6,.28*(i+1),.58,0,16.7+.14*(i+1),3.6+i*.58,m.edge,roof);
box(9,.5,.65,0,17.05,-3.4,m.sofa,roof);box(9,.7,.25,0,17.6,-3.7,m.sofa,roof);
box(.65,.5,4.6,-4.7,17.05,-.7,m.sofa,roof);box(.25,.7,4.6,-5.05,17.6,-.7,m.sofa,roof);
cylinder(1,.32,0,17.15,.1,m.chrome,roof);cylinder(.32,.55,0,16.92,.1,m.dark,roof);
for(const x of [-2.6,2.6]){cylinder(.6,.55,x,17.05,.6,m.pink,roof);}
// Tile joints on the outer deck.
for(let z=-11;z<=11;z+=1.8){box(9.8,.015,.026,-10.75,18.01,z,m.edge,roof);box(9.8,.015,.026,10.75,18.01,z,m.edge,roof);}
function railLine(x1,z1,x2,z2){rod([x1,Y+1.2,z1],[x2,Y+1.2,z2],.07,m.chrome,roof);rod([x1,Y+.5,z1],[x2,Y+.5,z2],.035,m.chrome,roof);const n=Math.ceil(Math.hypot(x2-x1,z2-z1)/1.3);for(let i=0;i<=n;i++){const x=x1+(x2-x1)*i/n,z=z1+(z2-z1)*i/n;rod([x,Y,z],[x,Y+1.25,z],.045,m.chrome,roof);}}
railLine(-15.6,-12,-15.6,12);railLine(-15.6,12,15.6,12);railLine(15.6,12,15.6,-12);railLine(-15.6,-12,15.6,-12);
// Private cinema along the back edge, with a roof that lifts away for inspection.
box(23,.25,7.4,-.4,18.13,-8.1,m.edge,interior);
box(23,3.5,.25,-.4,19.85,-11.7,m.wall,interior);
box(.25,3.5,7.4,-11.9,19.85,-8.1,m.wall,interior);box(.25,3.5,7.4,11.1,19.85,-8.1,m.wall,interior);
box(11.2,2.8,.15,-5.4,19.6,-4.45,m.darkGlass,cinemaRoof);box(7,2.8,.15,7.4,19.6,-4.45,m.glass,cinemaRoof);
for(const x of [-10.5,-8,-5.5,-3,5,7.5,10])box(.08,3,.2,x,19.6,-4.35,m.chrome,cinemaRoof);
box(2.7,2.75,.13,2.1,19.55,-4.43,m.glass,cinemaRoof);
box(.08,.9,.1,3.05,19.4,-4.28,m.warm,cinemaRoof);
rounded(24,8.2,.32,-.4,21.7,-8.1,1,m.chrome,cinemaRoof);
box(23,.14,.15,-.4,21.5,-3.92,m.purple,roof);
sign('天 台 见',9,1.5,-.6,22.45,-4.0,{color:'#dffbe5',bg:'#304f5e',size:118,parent:cinemaRoof});
sign('私人影吧  /  TONIGHT, AGAIN',7,.6,-.6,21.05,-4.28,{size:45,color:'#eadbc4',parent:cinemaRoof});
// Interior rooms and reception remain visible in the cutaway view.
box(.2,2.9,7,1.2,19.7,-8.1,m.wall,interior);
box(1.7,1,2.9,8.7,18.75,-6.4,m.pink,interior);
sign('天台见',1.5,.7,8.7,19.5,-4.94,{size:125,parent:interior});
const movie=sign('下 一 场 · 天 台 再 见',8,2.6,-5.3,20,-11.52,{color:'#c5e9df',bg:'#264560',size:65,parent:interior});
const movieSmall=sign('GOOD NIGHT',6,2.1,6.1,20,-11.52,{bg:'#555274',size:80,parent:interior});
for(const [x,z,w] of [[-7.5,-7,3],[-3.3,-7,3],[4.7,-7.8,3.8]]){
 box(w,.6,1.6,x,18.6,z,m.sofa,interior);box(w,.95,.3,x,19.15,z+.7,m.sofa,interior);
 for(const side of [-1,1])box(.3,.8,1.7,x+side*w/2,18.9,z,m.sofa,interior);
 box(w*.6,.5,.7,x,18.5,z-1.7,m.wood,interior);
}
// Swing on the left side of the courtyard.
for(const x of [-12.4,-8.3]){
 rod([x,18,-2],[x,21.8,-.5],.10,m.chrome,roof);rod([x,18,1],[x,21.8,-.5],.10,m.chrome,roof);
}
rod([-12.4,21.8,-.5],[-8.3,21.8,-.5],.13,m.pink,roof);
const swing=new T.Group();swing.position.set(-10.35,21.65,-.5);roof.add(swing);
for(const x of [-1.3,1.3])rod([x,0,0],[x,-2.8,0],.025,m.chrome,swing);
box(3,.18,1.1,0,-2.8,0,m.wood,swing);box(3,.75,.13,0,-2.4,.48,m.wood,swing);
// Stairwell at the front-right corner. An open tread flight connects the roof.
box(4.8,.25,5.7,11.5,18.12,8.25,m.edge,roof);
box(.18,3.1,5.7,13.8,19.6,8.25,m.wall,roof);box(4.8,3.1,.18,11.5,19.6,11.1,m.wall,roof);
const stairCap=box(5.3,.22,6.2,11.5,21.2,8.25,m.chrome,roof);stairCap.rotation.x=.07;
for(let i=0;i<10;i++)box(2.6,.18,.43,11.1,16.3+i*.19,5.8+i*.43,m.edge,roof);
sign('ROOF / 屋 顶',3.2,.65,11.5,20.5,5.16,{size:66,parent:roof});
rod([9.6,18.9,6],[9.6,20.5,10.1],.055,m.chrome,roof);
// Utility objects and small details give scale, without changing the sketch layout.
function plant(x,z,r=.7){cylinder(r,.8,x,18.4,z,m.pot,roof,r*.85);const foliage=new T.Mesh(new T.IcosahedronGeometry(r*1.2,1),m.leaf);foliage.position.set(x,19.2,z);foliage.scale.y=1.3;roof.add(foliage);}
for(const [x,z] of [[-14,9],[-14,5],[-14,-7],[6,9],[5,-4],[14,-3]])plant(x,z);
box(2.4,1.2,1.2,-10,18.6,8.5,m.dark,roof);
sign('S O D A',1.7,.8,-10,19.7,9.11,{bg:'#637f89',color:'#eff1bd',size:100,parent:roof});
for(const x of [7.4,10]){box(1.8,.8,1.3,x,18.4,-1.7,m.chrome,roof);const fan=new T.Mesh(new T.TorusGeometry(.48,.055,8,24),m.dark);fan.rotation.x=Math.PI/2;fan.position.set(x,18.84,-1.7);roof.add(fan);}
// Festoon lights spanning the terrace.
const bulbs=[];
for(let i=0;i<15;i++){
 const x=-13+i*1.85,y=21.5-Math.sin(i/14*Math.PI)*1.05;
 if(i<14){const nx=x+1.85,ny=21.5-Math.sin((i+1)/14*Math.PI)*1.05;rod([x,y,5.8],[nx,ny,5.8],.018,m.dark,roof);}
 const bulb=new T.Mesh(new T.SphereGeometry(.085,8,6),m.warm);bulb.position.set(x,y-.12,5.8);roof.add(bulb);bulbs.push(bulb);
}
for(const x of [-13,13])rod([x,18,5.8],[x,21.8,5.8],.055,m.chrome,roof);
const nightLights=[];
for(const [x,z,color] of [[0,-5,'#aa8af6'],[-8,3,'#ffcc94'],[9,6,'#78dad6']]){const l=new T.PointLight(color,0,24,2);l.position.set(x,21,z);scene.add(l);nightLights.push(l);}
// A quiet surrounding city, deliberately kept below the main building.
const ground=box(600,.3,600,0,-1.4,0,material('#9fadb1'));ground.receiveShadow=true;
const city=new T.Group();scene.add(city);
for(let i=0;i<44;i++){
 const a=i*2.399,r=55+(i%7)*12,x=Math.cos(a)*r,z=Math.sin(a)*r;
 const h=4+(i*7%17),w=6+(i%3)*3;
 box(w,h,w*.8,x,h/2-1.3,z,material(i%2?'#a5b9c0':'#bbc6c7'),city);
 box(w+.3,.3,w*.8+.3,x,h-1.2,z,m.edge,city);
}
for(const z of [-25,25])box(150,.04,8,0,-1.20,z,material('#6d8290'),city);
for(let x=-70;x<=70;x+=5)for(const z of [-25,25])box(2,.015,.14,x,-1.16,z,m.edge,city);
// Batch repeated cuboids while retaining independently movable groups.
function batch(group){for(const child of [...group.children])if(child.isGroup)batch(child);const sets=new Map();for(const child of [...group.children])if(child.isMesh&&child.geometry===boxGeometry){if(!sets.has(child.material))sets.set(child.material,[]);sets.get(child.material).push(child);}for(const [mat,items] of sets){if(items.length<2)continue;const mesh=new T.InstancedMesh(boxGeometry,mat,items.length);items.forEach((item,i)=>{item.updateMatrix();mesh.setMatrixAt(i,item.matrix);group.remove(item);});mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);}}
batch(building);batch(roof);batch(city);
const places={
 cinema:{no:'01 / 天台见',title:'把城市留在门外。',copy:'后侧的私人影吧。玻璃门后是接待台与两个放映空间。进入内部视角，屋顶和临天台的玻璃会移开，方便继续调整布局。',point:[0,23,-6.5],view:{position:[25,36,31],target:[0,18.7,-7]},action:'切换放映画面'},
 swing:{no:'02 / 秋千',title:'等下一阵风。',copy:'秋千放在天台左侧，和栏杆留出一段距离。先坐一会儿，电影还没开始。',point:[-10.4,21.7,-.5],view:{position:[-29,29,25],target:[-7,19,0]},action:'让秋千摇起来'},
 terrace:{no:'03 / 下凹平台',title:'低一点，安静一点。',copy:'中央的平台比外围低约一米，沿宽台阶走下去。围坐的沙发、圆桌和串灯，是这一版自由补上的停留空间。',point:[0,18.3,1],view:{position:[24,35,31],target:[0,17.5,1]}},
 stairs:{no:'04 / 楼梯入口',title:'再上一层，就到了。',copy:'右前方保留楼梯口的位置。商场里的喧闹到这里结束，前面是露天平台和影吧的灯。',point:[11.5,21,8.1],view:{position:[30,32,39],target:[7,18,5]}}
};
const views={building:{position:[65,51,77],target:[0,12,0]},roof:{position:[37,44,48],target:[0,17.5,0]},plan:{position:[0,76,.01],target:[0,17,0]},cinema:places.cinema.view};
let currentView='building',activePlace=null,transition=null,night=false,swinging=false,auto=false,showLabels=true,movieAlt=false;
const hotspots=[];
for(const [id,p] of Object.entries(places)){const button=document.createElement('button');button.type='button';button.className='hotspot';button.innerHTML=`<b>${p.no.slice(0,2)}</b>${id==='cinema'?'天台见':id==='swing'?'秋千':id==='terrace'?'下凹平台':'楼梯口'}`;button.setAttribute('aria-pressed','false');button.addEventListener('click',()=>selectPlace(id));$('hotspots').append(button);hotspots.push({id,button,position:new T.Vector3(...p.point)});}
function targetView(view){const dest=views[view]||places[view]?.view;if(!dest)return;const target=new T.Vector3(...dest.target),position=new T.Vector3(...dest.position);if(innerWidth<700)position.sub(target).multiplyScalar(1.25).add(target);transition={from:camera.position.clone(),targetFrom:controls.target.clone(),position,target,start:performance.now()};if(reduced.matches){camera.position.copy(position);controls.target.copy(target);transition=null;controls.update();}}
function setView(view){dirty=true;renderer.shadowMap.needsUpdate=true;currentView=view;cinemaRoof.visible=view!=='cinema';$('world').dataset.view=view;document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));targetView(view);if(view==='cinema')showPlace('cinema');else if(activePlace){activePlace=null;updateCard();}}
function showPlace(id){activePlace=id;updateCard();}
function selectPlace(id){dirty=true;renderer.shadowMap.needsUpdate=true;cinemaRoof.visible=id!=='cinema';currentView=id==='cinema'?'cinema':'roof';$('world').dataset.view=currentView;document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===currentView)));targetView(id);showPlace(id);}
function updateCard(){const p=places[activePlace];$('place-no').textContent=p?.no||'00 / 抵达';$('place-title').textContent=p?.title||'最后一层，在露天。';$('place-copy').textContent=p?.copy||'沿着玻璃雨棚往上看。商场的屋顶，还有一家没打烊的私人影吧。';$('place-action').hidden=!p?.action;if(p?.action)$('place-action').textContent=activePlace==='swing'?(swinging?'让秋千停下来':'让秋千摇起来'):p.action;hotspots.forEach(h=>h.button.setAttribute('aria-pressed',String(h.id===activePlace)));}
$('place-action').onclick=()=>{dirty=true;if(activePlace==='swing'){swinging=!swinging;updateCard();}else{movieAlt=!movieAlt;movie.material.color.set(movieAlt?'#f2b9a4':'#ffffff');movieSmall.material.color.set(movieAlt?'#d5f49d':'#ffffff');$('place-action').textContent=movieAlt?'放映中 · 切回片头':'切换放映画面';}};
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
$('labels').onclick=()=>{dirty=true;showLabels=!showLabels;$('labels').setAttribute('aria-pressed',String(showLabels));};
$('orbit').onclick=()=>{auto=!auto;$('orbit').setAttribute('aria-pressed',String(auto));};
$('reset').onclick=()=>{auto=false;$('orbit').setAttribute('aria-pressed','false');setView('building');};
$('light').onclick=()=>{dirty=true;night=!night;document.body.classList.toggle('night',night);$('light').textContent=night?'切回傍晚':'切到蓝调夜晚';$('light').setAttribute('aria-pressed',String(night));scene.background.set(night?'#1a2e47':'#b8cbd0');scene.fog.color.copy(scene.background);sun.intensity=night?.18:3.1;ambient.intensity=night?.65:2.5;fill.intensity=night?.4:1.5;scene.environmentIntensity=night?.22:1;m.warm.emissiveIntensity=night?3:.35;m.purple.emissiveIntensity=night?2:.3;m.blue.emissiveIntensity=night?2:.35;nightLights.forEach(l=>l.intensity=night?55:0);};
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('world').requestFullscreen();}catch{$('place-copy').textContent='当前浏览器不支持全屏，仍可拖动和缩放场景。';}};
controls.addEventListener('start',()=>{transition=null;});
$('scene').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(e.key))return;e.preventDefault();if(e.key==='Home'){setView('building');return;}transition=null;const delta=camera.position.clone().sub(controls.target);const sph=new T.Spherical().setFromVector3(delta);if(e.key==='ArrowLeft')sph.theta-=.08;if(e.key==='ArrowRight')sph.theta+=.08;if(e.key==='ArrowUp')sph.phi=Math.max(.08,sph.phi-.08);if(e.key==='ArrowDown')sph.phi=Math.min(Math.PI*.48,sph.phi+.08);camera.position.copy(controls.target).add(new T.Vector3().setFromSpherical(sph));controls.update();});
function resize(){dirty=true;const w=$('world').clientWidth,h=$('world').clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
new ResizeObserver(resize).observe($('world'));resize();camera.position.set(...views.building.position);controls.target.set(...views.building.target);if(innerWidth<700)camera.position.sub(controls.target).multiplyScalar(1.3).add(controls.target);controls.update();
let last=0;
function frame(t){
 requestAnimationFrame(frame);
 if(document.hidden)return;
 const dt=Math.min((t-last)/1000,.05);last=t;
 if(transition){let f=Math.min(1,(t-transition.start)/1100);f=f*f*(3-2*f);camera.position.lerpVectors(transition.from,transition.position,f);controls.target.lerpVectors(transition.targetFrom,transition.target,f);if(f===1)transition=null;dirty=true;}
 if(auto&&!transition){const v=camera.position.clone().sub(controls.target);v.applyAxisAngle(new T.Vector3(0,1,0),dt*.12);camera.position.copy(controls.target).add(v);dirty=true;}
 if(swinging){swing.rotation.x=Math.sin(t*.0016)*.22;renderer.shadowMap.needsUpdate=true;dirty=true;}
 else if(Math.abs(swing.rotation.x)>.0001){swing.rotation.x*=.88;renderer.shadowMap.needsUpdate=true;dirty=true;}
 controls.update();
 if(!dirty)return;
 renderer.render(scene,camera);dirty=false;
 const rect=$('world').getBoundingClientRect();
 for(const h of hotspots){const p=h.position.clone().project(camera);h.button.hidden=!showLabels||p.z>1||p.z< -1||currentView==='building'||(innerWidth<700&&activePlace&&activePlace!==h.id);h.button.style.left=`${(p.x*.5+.5)*rect.width}px`;h.button.style.top=`${(-p.y*.5+.5)*rect.height}px`;}
}
$('world').dataset.ready='true';$('world').dataset.view='building';$('loading').hidden=true;requestAnimationFrame(frame);
renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();$('loading').hidden=false;$('loading').textContent='三维画面暂时中断，请刷新后继续。';});
// Preserve the renderer and controls when the browser restores this page from history.
window.addEventListener('pageshow',resize);
