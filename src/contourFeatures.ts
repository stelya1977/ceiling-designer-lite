import type {GeometryPoint as P} from './measuredGeometry'
export type CornerRound={corner:number;radius:string}
export type SideArc={side:number;rise:string;direction:'out'|'in'}
export type Cutout={id:string;kind:'rectangle'|'circle';along:string;inward:string;width:string;height:string}
export type Features={rounds?:CornerRound[];arcs?:SideArc[];cutouts?:Cutout[]}
type Segment={a:P;b:P;r?:number;theta?:number;c?:P}
export type ContourResult={ok:true;outline:Segment[];holes:Segment[][];centers:P[];base:P[];area:number;perimeter:number;outerPerimeter:number}|{ok:false;reason:string}
const eps=1e-8
const add=(a:P,b:P):P=>({x:a.x+b.x,y:a.y+b.y}), sub=(a:P,b:P):P=>({x:a.x-b.x,y:a.y-b.y}), mul=(a:P,k:number):P=>({x:a.x*k,y:a.y*k}), dot=(a:P,b:P)=>a.x*b.x+a.y*b.y, cross=(a:P,b:P)=>a.x*b.y-a.y*b.x, norm=(a:P)=>Math.hypot(a.x,a.y), dist=(a:P,b:P)=>norm(sub(a,b)), unit=(a:P)=>mul(a,1/norm(a)), left=(a:P):P=>({x:-a.y,y:a.x}), letter=(i:number)=>String.fromCharCode(65+i)
const pos=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)&&n>0&&n<=1000?n:0}
const signed=(p:P[])=>p.reduce((s,a,i)=>s+cross(a,p[(i+1)%p.length]),0)/2
const fail=(reason:string):ContourResult=>({ok:false,reason})
export function hasFeatures(f:Features){return !!(f.rounds?.length||f.arcs?.length||f.cutouts?.length)}
const straight=(a:P,b:P):Segment=>({a,b})
function sample(segs:Segment[]):P[]{const p:P[]=[];for(const s of segs){p.push(s.a);if(s.r&&s.theta&&s.c){const start=Math.atan2(s.a.y-s.c.y,s.a.x-s.c.x);const step=Math.min(Math.PI/24,2*Math.acos(Math.max(-1,1-0.0005/s.r)));const n=Math.min(512,Math.max(2,Math.ceil(Math.abs(s.theta)/step)));for(let i=1;i<n;i++){const t=start+s.theta*i/n;p.push(add(s.c,{x:s.r*Math.cos(t),y:s.r*Math.sin(t)}))}}}return p}
function on(a:P,b:P,p:P){return Math.abs(cross(sub(b,a),sub(p,a)))<eps&&dot(sub(p,a),sub(p,b))<=eps}
function hit(a:P,b:P,c:P,d:P){const ab=sub(b,a),cd=sub(d,c),u=cross(ab,sub(c,a)),v=cross(ab,sub(d,a)),w=cross(cd,sub(a,c)),z=cross(cd,sub(b,c));return (u*v<0&&w*z<0)||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b)}
function clean(p:P[]){return p.filter((v,i)=>dist(v,p[(i+p.length-1)%p.length])>eps)}
function simple(p:P[]){if(p.length<3||Math.abs(signed(p))<eps)return false;for(let i=0;i<p.length;i++)for(let j=i+2;j<p.length;j++){if(i===0&&j===p.length-1)continue;if(hit(p[i],p[(i+1)%p.length],p[j],p[(j+1)%p.length]))return false}return true}
function inside(p:P,poly:P[]){let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if(on(a,b,p))return false;if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)yes=!yes}return yes}
function near(a:P,b:P,c:P){const d=sub(b,a),t=Math.max(0,Math.min(1,dot(sub(c,a),d)/Math.max(eps,dot(d,d))));return dist(c,add(a,mul(d,t)))}
function overlap(a:P[],b:P[]){for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++){const p=a[i],q=a[(i+1)%a.length],r=b[j],s=b[(j+1)%b.length];if(hit(p,q,r,s)||near(p,q,r)<0.002||near(r,s,p)<0.002)return true}return false}
function metrics(s:Segment[]){return {area:Math.abs(s.reduce((a,v)=>a+cross(v.a,v.b)/2+(v.r&&v.theta?v.r*v.r*(v.theta-Math.sin(v.theta))/2:0),0)),perimeter:s.reduce((a,v)=>a+(v.r&&v.theta?v.r*Math.abs(v.theta):dist(v.a,v.b)),0)}}
export function buildContour(base:P[],f:Features):ContourResult{
 const n=base.length;if(n<3||n>12||base.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y))||!simple(base))return fail('Спочатку побудуй правильний базовий контур.')
 const winding=Math.sign(signed(base)), rounds=new Map<number,Segment>(),arcs=new Map<number,Segment>();const entry=base.slice(),exit=base.slice()
 for(const v of f.rounds||[]){const i=v.corner,r=pos(v.radius);if(!Number.isInteger(i)||i<0||i>=n||rounds.has(i)||!r)return fail('Вкажи додатний радіус для кожного заокруглення.')
  const p=base[i],u=unit(sub(p,base[(i+n-1)%n])),w=unit(sub(base[(i+1)%n],p)),theta=Math.atan2(cross(u,w),dot(u,w));if(Math.abs(theta)<eps||Math.abs(theta)>Math.PI-eps)return fail(`Кут ${letter(i)} не можна заокруглити.`)
  const t=r*Math.tan(Math.abs(theta)/2);if(t>=dist(p,base[(i+n-1)%n])-eps||t>=dist(p,base[(i+1)%n])-eps)return fail(`Завеликий радіус кута ${letter(i)}.`)
  const a=sub(p,mul(u,t)),b=add(p,mul(w,t)),c=add(a,mul(left(u),Math.sign(theta)*r));entry[i]=a;exit[i]=b;rounds.set(i,{a,b,c,r,theta})
 }
 for(const v of f.arcs||[]){const i=v.side,h=pos(v.rise);if(!Number.isInteger(i)||i<0||i>=n||arcs.has(i)||!h||!['out','in'].includes(v.direction))return fail('Вкажи стрілу прогину для кожної дуги.')
  const j=(i+1)%n,a=base[i],b=base[j],d=dist(a,b);if(rounds.has(i)||rounds.has(j))return fail(`Дуга ${letter(i)}${letter(j)} не може одночасно мати заокруглення на кінцях.`);if(h>d/2+eps)return fail(`Стріла дуги ${letter(i)}${letter(j)} не може перевищувати половину хорди.`)
  const direction=v.direction==='out'?1:-1,r=d*d/(8*h)+h/2,theta=4*Math.atan2(2*h,d)*winding*direction,bulge=mul(left(unit(sub(b,a))),-winding*direction),c=add(mul(add(a,b),0.5),mul(bulge,h-r));arcs.set(i,{a,b,r,theta,c})
 }
 const outline:Segment[]=[];for(let i=0;i<n;i++){const j=(i+1)%n,d=unit(sub(base[j],base[i]));if(dot(sub(entry[j],exit[i]),d)<=eps)return fail(`Заокруглення перекривають сторону ${letter(i)}${letter(j)}.`);outline.push(arcs.get(i)||straight(exit[i],entry[j]));if(rounds.has(j))outline.push(rounds.get(j)!)}
 const outer=clean(sample(outline));if(!simple(outer)||Math.sign(signed(outer))!==winding)return fail('Дуги або заокруглення перетинають контур. Перевір розміри.')
 const holes:Segment[][]=[],centers:P[]=[],holeSamples:P[][]=[];const along=unit(sub(base[1],base[0])),inward=mul(left(along),winding);const xy=(x:number,y:number)=>add(base[0],add(mul(inward,x),mul(along,y)))
 if((f.cutouts?.length||0)>6)return fail('Максимум 6 внутрішніх вирізів.')
 for(const [i,hole] of (f.cutouts||[]).entries()){const x=Number(hole.inward),y=Number(hole.along),w=pos(hole.width),h=pos(hole.height);if(!hole.inward?.trim()||!hole.along?.trim()||!Number.isFinite(x)||!Number.isFinite(y)||!w||(hole.kind==='rectangle'&&!h)||!['rectangle','circle'].includes(hole.kind))return fail(`Заповни розміри й відступи вирізу В${i+1}.`)
  let segs:Segment[],center:P;if(hole.kind==='rectangle'){const p=[xy(x,y),xy(x+w,y),xy(x+w,y+h),xy(x,y+h)];segs=p.map((v,j)=>straight(v,p[(j+1)%4]));center=xy(x+w/2,y+h/2)}else{center=xy(x,y);const r=w/2,a=add(center,{x:r,y:0}),b=add(center,{x:-r,y:0});segs=[{a,b,r,theta:Math.PI,c:center},{a:b,b:a,r,theta:Math.PI,c:center}]}
  const p=clean(sample(segs));if(!p.every(v=>inside(v,outer))||overlap(p,outer)||holeSamples.some(q=>overlap(p,q)||inside(p[0],q)||inside(q[0],p)))return fail(`Виріз В${i+1} виходить за контур, торкається його або іншого вирізу.`)
  holes.push(segs);centers.push(center);holeSamples.push(p)
 }
 const m=metrics(outline),hm=holes.map(metrics),area=m.area-hm.reduce((s,v)=>s+v.area,0);if(area<=eps)return fail('Площа вирізів перевищує площу стелі.')
 return {ok:true,outline,holes,centers,base,area,outerPerimeter:m.perimeter,perimeter:m.perimeter+hm.reduce((s,v)=>s+v.perimeter,0)}
}
export function contourDrawing(result:Extract<ContourResult,{ok:true}>,w=360,h=230,pad=30){
 const samples=[...sample(result.outline),...result.base];const minX=Math.min(...samples.map(p=>p.x)),maxX=Math.max(...samples.map(p=>p.x)),minY=Math.min(...samples.map(p=>p.y)),maxY=Math.max(...samples.map(p=>p.y));const scale=Math.min((w-pad*2)/Math.max(eps,maxX-minX),(h-pad*2)/Math.max(eps,maxY-minY));const p=(v:P)=>({x:w/2+(v.x-(minX+maxX)/2)*scale,y:h/2+(v.y-(minY+maxY)/2)*scale});const coord=(v:P)=>{const t=p(v);return `${t.x.toFixed(4)} ${t.y.toFixed(4)}`};const path=(s:Segment[])=>`M ${coord(s[0].a)} `+s.map(v=>v.r&&v.theta?`A ${(v.r*scale).toFixed(4)} ${(v.r*scale).toFixed(4)} 0 ${Math.abs(v.theta)>Math.PI+eps?1:0} ${v.theta>0?1:0} ${coord(v.b)}`:`L ${coord(v.b)}`).join(' ')+' Z';return {path:[result.outline,...result.holes].map(path).join(' '),points:result.base.map(p),centers:result.centers.map(p)}
}

export function containsContourPoint(result:Extract<ContourResult,{ok:true}>,point:P):boolean {
 return inside(point,clean(sample(result.outline)))&&!result.holes.some(h=>{const p=clean(sample(h));return inside(point,p)||p.some((v,i)=>near(v,p[(i+1)%p.length],point)<0.001)})
}
