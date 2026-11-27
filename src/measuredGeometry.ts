// All measurement constraints are in metres; drawing coordinates are independent of units.
export type GeometryPoint = { x: number; y: number }
export type GeometryResult = { ok: true; points: GeometryPoint[]; area: number; maxError: number } | { ok: false; reason: string }
export const MEASUREMENT_TOLERANCE = 0.005 // 5 mm; never silently accept larger discrepancies.
const eps = 1e-10
const cross = (a: GeometryPoint,b: GeometryPoint,c: GeometryPoint) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)
const distance = (a: GeometryPoint,b: GeometryPoint) => Math.hypot(a.x-b.x,a.y-b.y)
const signedArea = (p: GeometryPoint[]) => p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a.x*b.y-b.x*a.y},0)/2
const positive = (v: unknown) => { const n=Number(v); return Number.isFinite(n)&&n>0?n:0 }
const fail = (reason:string):GeometryResult => ({ok:false,reason})
const letter=(i:number)=>String.fromCharCode(65+i)
const label=(i:number,j:number)=>`${letter(i)}–${letter(j)}`
function intersects(a:GeometryPoint,b:GeometryPoint,c:GeometryPoint,d:GeometryPoint) {
  const u=cross(a,b,c),v=cross(a,b,d),w=cross(c,d,a),z=cross(c,d,b)
  const on=(p:GeometryPoint,q:GeometryPoint,r:GeometryPoint)=>Math.abs(cross(p,q,r))<=eps&&r.x>=Math.min(p.x,q.x)-eps&&r.x<=Math.max(p.x,q.x)+eps&&r.y>=Math.min(p.y,q.y)-eps&&r.y<=Math.max(p.y,q.y)+eps
  return ((u>eps&&v< -eps||u< -eps&&v>eps)&&(w>eps&&z< -eps||w< -eps&&z>eps))||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b)
}
function simple(p:GeometryPoint[]) {
  if(p.some((a,i)=>!Number.isFinite(a.x)||!Number.isFinite(a.y)||distance(a,p[(i+1)%p.length])<=eps))return false
  if(Math.abs(signedArea(p))<=eps)return false
  // Reject folded-back adjacent edges, but allow straight, non-overlapping intermediate vertices.
  for(let i=0;i<p.length;i++) {const a=p[(i+p.length-1)%p.length],b=p[i],c=p[(i+1)%p.length];if(Math.abs(cross(a,b,c))<=eps&&(a.x-b.x)*(c.x-b.x)+(a.y-b.y)*(c.y-b.y)>eps)return false}
  for(let i=0;i<p.length;i++)for(let j=i+1;j<p.length;j++){
    if(j===i+1||(i===0&&j===p.length-1))continue
    if(intersects(p[i],p[(i+1)%p.length],p[j],p[(j+1)%p.length]))return false
  }
  return true
}
export function fitDrawing(points:GeometryPoint[],w=360,h=230,pad=28):GeometryPoint[] {
  if(!points.length)return []
  const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y))
  const scale=Math.min((w-2*pad)/Math.max(eps,maxX-minX),(h-2*pad)/Math.max(eps,maxY-minY))
  return points.map(p=>({x:w/2+(p.x-(minX+maxX)/2)*scale,y:h/2+(p.y-(minY+maxY)/2)*scale}))
}
export function rectangleDrawing(length:unknown,width:unknown,w=360,h=230) {
  const l=positive(length)||1,b=positive(width)||1
  return fitDrawing([{x:0,y:b},{x:0,y:0},{x:l,y:0},{x:l,y:b}],w,h,30)
}
// Match sketch rotation without changing any measured distance or mirroring its winding.
function orient(points:GeometryPoint[],sketch:GeometryPoint[]) {
  const center=(p:GeometryPoint[])=>({x:p.reduce((s,v)=>s+v.x,0)/p.length,y:p.reduce((s,v)=>s+v.y,0)/p.length})
  const c=center(points),s=center(sketch);let dot=0,det=0
  points.forEach((p,i)=>{const x=p.x-c.x,y=p.y-c.y,u=sketch[i].x-s.x,v=sketch[i].y-s.y;dot+=x*u+y*v;det+=x*v-y*u})
  const angle=Math.atan2(det,dot),co=Math.cos(angle),si=Math.sin(angle)
  return points.map(p=>({x:(p.x-c.x)*co-(p.y-c.y)*si,y:(p.x-c.x)*si+(p.y-c.y)*co}))
}
// Construct a measured polygon via a non-crossing combinatorial triangulation.
// The sketch selects the side of each measured triangle, including concave folds.
// Every supplied distance, not only the triangulation edges, is checked.
export function solveMeasuredPolygon(sides:readonly (string|number)[],diagonals:Record<string,string|number>,sketch:GeometryPoint[]):GeometryResult {
  const n=sides.length
  if(n<3||n>12||sketch.length!==n)return fail('Потрібен контур із 3–12 кутів.')
  if(!simple(sketch))return fail('Спочатку виправ ескіз: контур не має перетинатися або складатися назад.')
  const lengths=Array.from({length:n},()=>Array(n).fill(0) as number[])
  const set=(a:number,b:number,v:number)=>{lengths[a][b]=lengths[b][a]=v}
  for(let i=0;i<n;i++){const d=positive(sides[i]);if(!d)return fail(`Введи довжину сторони ${label(i,(i+1)%n)}.`);set(i,(i+1)%n,d)}
  for(const [k,v] of Object.entries(diagonals||{})){
    if(!/^[A-Z]-[A-Z]$/.test(k))continue
    const a=k.charCodeAt(0)-65,b=k.charCodeAt(2)-65,d=positive(v)
    if(a>=0&&b<n&&b-a>1&&!(a===0&&b===n-1)&&d)set(a,b,d)
  }
  // Triangle inequality is checked even for redundant measured triangles.
  for(let a=0;a<n;a++)for(let b=a+1;b<n;b++)for(let c=b+1;c<n;c++){
    const x=lengths[a][b],y=lengths[b][c],z=lengths[a][c]
    if(x&&y&&z&&Math.max(x,y,z)>x+y+z-Math.max(x,y,z)+MEASUREMENT_TOLERANCE)return fail(`Не сходиться трикутник ${letter(a)}${letter(b)}${letter(c)}. Перевір заміри.`)
  }
  type Tree={i:number;j:number;k:number;left:Tree|null;right:Tree|null}
  const cache=new Map<string,Tree[]>()
  function trees(i:number,j:number):Tree[] {
    const key=`${i}:${j}`;if(cache.has(key))return cache.get(key)!
    const result:Tree[]=[]
    if(lengths[i][j])for(let k=i+1;k<j;k++){
      const a=lengths[i][k],b=lengths[k][j],c=lengths[i][j]
      if(!a||!b||a+b<=c+eps||a+c<=b+eps||b+c<=a+eps)continue
      if(Math.abs(cross(sketch[i],sketch[j],sketch[k]))<=eps)continue
      const left=k===i+1?[null]:trees(i,k),right=j===k+1?[null]:trees(k,j)
      for(const l of left)for(const r of right)result.push({i,j,k,left:l,right:r})
    }
    cache.set(key,result);return result
  }
  const options=trees(0,n-1)
  if(!options.length)return fail('Недостатньо сумісних діагоналей для розбиття на трикутники. Додай контрольні діагоналі або виправ ескіз/розміри.')
  let smallestError=Infinity, worstLabel=''
  for(const tree of options){
    const points:GeometryPoint[]=Array(n);points[0]={x:0,y:0};points[n-1]={x:lengths[0][n-1],y:0}
    function place(t:Tree|null):boolean {
      if(!t)return true
      const {i,j,k}=t,a=points[i],b=points[j],d=distance(a,b),r=lengths[i][k],s=lengths[j][k]
      const x=(r*r-s*s+d*d)/(2*d),h2=r*r-x*x
      if(!Number.isFinite(h2)||h2<=eps)return false
      const h=Math.sqrt(h2)*Math.sign(cross(sketch[i],sketch[j],sketch[k])),ux=(b.x-a.x)/d,uy=(b.y-a.y)/d
      points[k]={x:a.x+x*ux-h*uy,y:a.y+x*uy+h*ux}
      return place(t.left)&&place(t.right)
    }
    if(!place(tree)||!simple(points)||Math.sign(signedArea(points))!==Math.sign(signedArea(sketch)))continue
    // Preserve local concave/convex orientation when it is clear in the sketch.
    // Ignore near-straight corners: an approximate sketch often contains small angular errors.
    let same=true
    for(let i=0;i<n;i++){
      const a=(i+n-1)%n,b=(i+1)%n
      const norm=(p:GeometryPoint[])=>cross(p[a],p[i],p[b])/(distance(p[a],p[i])*distance(p[i],p[b]))
      const sketchTurn=norm(sketch),actualTurn=norm(points)
      if(Math.abs(sketchTurn)>0.12&&Math.abs(actualTurn)>0.12&&Math.sign(sketchTurn)!==Math.sign(actualTurn)){same=false;break}
    }
    if(!same)continue
    let error=0,worst=''
    for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)if(lengths[i][j]){
      const e=Math.abs(distance(points[i],points[j])-lengths[i][j]);if(e>error){error=e;worst=label(i,j)}
    }
    if(error<smallestError){smallestError=error;worstLabel=worst}
    if(error<=MEASUREMENT_TOLERANCE+eps)return {ok:true,points:orient(points,sketch),area:Math.abs(signedArea(points)),maxError:error}
  }
  if(Number.isFinite(smallestError))return fail(`Розміри не сходяться: ${worstLabel}, розбіжність ${(smallestError*100).toFixed(2)} см (допуск 0,5 см). Перевір діагоналі.`)
  return fail('За цими розмірами не виходить простий контур із формою ескізу. Перевір ескіз, сторони та діагоналі.')
}

export type ReferenceResult = Extract<GeometryResult,{ok:false}> | (Extract<GeometryResult,{ok:true}> & {reference:GeometryPoint})
export function pointInside(p:GeometryPoint,poly:GeometryPoint[]):boolean {
  let yes=false
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[j],b=poly[i]
    if(Math.abs(cross(a,b,p))<=eps&&p.x>=Math.min(a.x,b.x)-eps&&p.x<=Math.max(a.x,b.x)+eps&&p.y>=Math.min(a.y,b.y)-eps&&p.y<=Math.max(a.y,b.y)+eps)return false
    if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)yes=!yes
  }
  return yes
}
// Locate the two possible intersections of A0 and B0, in sketch coordinates.
// Prefer the interior side of AB if both points happen to be inside a concave sketch.
export function previewReference(ab:unknown,a0:unknown,b0:unknown,sketch:GeometryPoint[]):GeometryPoint|null {
  const d=positive(ab),a=positive(a0),b=positive(b0)
  if(!d||!a||!b||sketch.length<3||!simple(sketch))return null
  const x=(a*a-b*b+d*d)/(2*d),h2=a*a-x*x
  if(!Number.isFinite(h2)||h2< -eps)return null
  const A=sketch[0],B=sketch[1],ux=(B.x-A.x)/d,uy=(B.y-A.y)/d,h=Math.sqrt(Math.max(0,h2))*Math.sign(signedArea(sketch))
  const choices=[h,-h].map(y=>({x:A.x+x*ux-y*uy,y:A.y+x*uy+y*ux}))
  return choices.find(p=>pointInside(p,sketch))||null
}
// Reconstruct the ring using triangles 0AB, 0BC, ... . Enumerate both turns
// around the reference, rather than assuming every radial segment is inside
// or that all polar angles increase (neither holds for general concave rooms).
export function solveReferencePolygon(sides:readonly (string|number)[],radials:Record<string,string|number>,diagonals:Record<string,string|number>,sketch:GeometryPoint[]):ReferenceResult {
  const bad=(reason:string):ReferenceResult=>({ok:false,reason}),n=sides.length
  if(n<3||n>12||sketch.length!==n||!simple(sketch))return bad('Виправ ескіз: контур має бути простим, з 3–12 точок.')
  const r=Array.from({length:n},(_,i)=>positive(radials[letter(i)])),d=sides.map(positive)
  for(let i=0;i<n;i++){if(!d[i])return bad(`Внеси ${label(i,(i+1)%n)}.`);if(!r[i])return bad(`Внеси ${letter(i)}0.`)}
  const ang:number[]=[]
  for(let i=0;i<n;i++){
    const a=r[i],b=r[(i+1)%n],c=d[i]
    if(c>a+b+eps||c<Math.abs(a-b)-eps)return bad(`Не сходиться трикутник 0${letter(i)}${letter((i+1)%n)}.`)
    ang.push(Math.acos(Math.max(-1,Math.min(1,(a*a+b*b-c*c)/(2*a*b)))))
  }
  const winding=Math.sign(signedArea(sketch)),origin={x:0,y:0},candidates:{points:GeometryPoint[];reference:GeometryPoint;area:number;error:number;score:number}[]=[]
  const sc={x:sketch.reduce((s,p)=>s+p.x,0)/n,y:sketch.reduce((s,p)=>s+p.y,0)/n},sketchScale=Math.sqrt(sketch.reduce((s,p)=>s+distance(p,sc)**2,0)/n)
  const extra:{i:number;j:number;d:number}[]=[]
  for(const [k,v] of Object.entries(diagonals||{}))if(/^[A-Z]-[A-Z]$/.test(k)){
    const i=k.charCodeAt(0)-65,j=k.charCodeAt(2)-65,len=positive(v)
    if(i>=0&&j<n&&j-i>1&&!(i===0&&j===n-1)&&len)extra.push({i,j,d:len})
  }
  let minError=Infinity
  for(let mask=0;mask<(1<<(n-1));mask++){
    const points:GeometryPoint[]=[{x:r[0],y:0}];let angle=0
    for(let i=0;i<n-1;i++){angle+=ang[i]*((mask>>i)&1?1:-1);points.push({x:r[i+1]*Math.cos(angle),y:r[i+1]*Math.sin(angle)})}
    let error=Math.abs(distance(points[n-1],points[0])-d[n-1]);if(error>MEASUREMENT_TOLERANCE+eps)continue
    if(!simple(points)||Math.sign(signedArea(points))!==winding||!pointInside(origin,points))continue
    for(const c of extra)error=Math.max(error,Math.abs(distance(points[c.i],points[c.j])-c.d))
    minError=Math.min(minError,error);if(error>MEASUREMENT_TOLERANCE+eps)continue
    // Match measured outline to the sketch by translation, rotation and uniform scale.
    // Keep the sketch's clearly convex/concave corners to avoid incorrect fold choices.
    let same=true
    for(let i=0;i<n;i++){
      const a=(i+n-1)%n,b=(i+1)%n,norm=(p:GeometryPoint[])=>cross(p[a],p[i],p[b])/(distance(p[a],p[i])*distance(p[i],p[b]))
      const u=norm(sketch),v=norm(points);if(Math.abs(u)>0.12&&Math.abs(v)>0.12&&Math.sign(u)!==Math.sign(v)){same=false;break}
    }
    if(!same)continue
    const center={x:points.reduce((s,p)=>s+p.x,0)/n,y:points.reduce((s,p)=>s+p.y,0)/n}
    let dot=0,det=0
    points.forEach((p,i)=>{const x=p.x-center.x,y=p.y-center.y,u=sketch[i].x-sc.x,v=sketch[i].y-sc.y;dot+=x*u+y*v;det+=x*v-y*u})
    const rot=Math.atan2(det,dot),co=Math.cos(rot),si=Math.sin(rot),transform=(p:GeometryPoint)=>({x:(p.x-center.x)*co-(p.y-center.y)*si,y:(p.x-center.x)*si+(p.y-center.y)*co})
    const fitted=points.map(transform),scale=Math.sqrt(fitted.reduce((s,p)=>s+p.x*p.x+p.y*p.y,0)/n)
    const score=Math.sqrt(fitted.reduce((s,p,i)=>s+(p.x/scale-(sketch[i].x-sc.x)/sketchScale)**2+(p.y/scale-(sketch[i].y-sc.y)/sketchScale)**2,0)/n)
    if(candidates.some(c=>c.points.every((p,i)=>distance(p,fitted[i])<1e-7)&&distance(c.reference,transform(origin))<1e-7))continue
    candidates.push({points:fitted,reference:transform(origin),area:Math.abs(signedArea(points)),error,score})
  }
  if(!candidates.length)return bad(Number.isFinite(minError)&&minError>MEASUREMENT_TOLERANCE?`Контрольні діагоналі не сходяться (розбіжність ${(minError*100).toFixed(2)} см).`:'Не вдалося замкнути контур із точкою 0 усередині. Перевір сторони, відстані від 0 та форму ескізу.')
  candidates.sort((a,b)=>a.score-b.score||a.error-b.error)
  if(candidates.length>1&&candidates[1].score-candidates[0].score<0.04)return bad('Є кілька можливих контурів. Уточни ескіз або додай контрольну діагональ між кутами.')
  const c=candidates[0];return {ok:true,points:c.points,reference:c.reference,area:c.area,maxError:c.error}
}
