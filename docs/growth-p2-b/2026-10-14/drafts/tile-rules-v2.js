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
export function tileId(cells,x,y){const type=cells[y][x];return type==='grass'?`grass-${grassVariant(x,y)}`:`${type}-${terrainMask(cells,x,y)}`;}
// Five corner shapes compose a complete 47-state blob set, with a shared 3px verge.
export function terrainInside(mask,x,y){
 const west=x<16,north=y<16,u=west?x:31-x,v=north?y:31-y;
 const a=north?0:2,b=west?3:1,d=north?(west?7:4):(west?6:5);
 const ca=!!(mask&(1<<a)),cb=!!(mask&(1<<b));
 if(ca&&cb)return !!(mask&(1<<d))||u*u+v*v>=9;
 if(ca)return u>=3;if(cb)return v>=3;
 return u>=3&&v>=3&&(u>=9||v>=9||(u-9)**2+(v-9)**2<=36);
}
