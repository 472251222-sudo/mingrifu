// N,E,S,W,NE,SE,SW,NW. Diagonals only connect when both adjacent sides connect.
export const TILE_SIZE=32;
export const DIRECTIONS=[[0,-1],[1,0],[0,1],[-1,0],[1,-1],[1,1],[-1,1],[-1,-1]];
export function normalizeMask(mask){
 for(const [bit,a,b] of [[4,0,1],[5,1,2],[6,2,3],[7,3,0]])if(!(mask&(1<<a))||!(mask&(1<<b)))mask&=~(1<<bit);
 return mask;
}
export const BLOB_MASKS=[...new Set(Array.from({length:256},(_,n)=>normalizeMask(n)))].sort((a,b)=>a-b);
export function terrainMask(cells,x,y){
 const type=cells[y]?.[x];if(!type||type==='grass')return 0;
 let mask=0;DIRECTIONS.forEach(([dx,dy],i)=>{if(cells[y+dy]?.[x+dx]===type)mask|=1<<i});return normalizeMask(mask);
}
export function grassVariant(x,y){let n=Math.imul(x+13,374761393)^Math.imul(y+31,668265263);n=Math.imul(n^(n>>>13),1274126177);return (n>>>0)%8;}
export function tileId(cells,x,y){const type=cells[y][x];if(type==='grass')return `grass-${grassVariant(x,y)}`;const mask=terrainMask(cells,x,y),variant=type==='path'&&mask===5?grassVariant(x,y)%3:0;return `${type}-${mask}${variant?'-v'+variant:''}`;}
// Five corner shapes compose a complete 47-state blob set, with a shared 3px verge.
export function terrainInside(mask,x,y){
 const west=x<16,north=y<16,u=west?x:31-x,v=north?y:31-y;
 const a=north?0:2,b=west?3:1,d=north?(west?7:4):(west?6:5);
 const ca=!!(mask&(1<<a)),cb=!!(mask&(1<<b));
 if(ca&&cb)return !!(mask&(1<<d))||u*u+v*v>=9;
 const verge=t=>3+[0,1,0,-1][Math.floor(Math.min(t,31-t)/4)];
 if(ca)return u>=verge(y);if(cb)return v>=verge(x);
 return u>=verge(y)&&v>=verge(x)&&(u>=9||v>=9||(u-9)**2+(v-9)**2<=36);
}
