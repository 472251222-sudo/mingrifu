import React from 'react';

// Lightweight botanical renderer: each completion adds a pair of leaves.
// Branches and flowers accumulate from the same reversible completion count.
export function LivingTree({growth,feedback}) {
  const count=Math.min(growth,80);
  const height=70+Math.min(count,40)*3;
  const top=240-height;
  const leaves=Array.from({length:count},(_,i)=>{
    const side=i%2===0?-1:1;
    const level=Math.floor(i/2);
    const y=226-(level%10)*Math.min(17,height/8);
    const spread=25+((level*17)%65);
    return {x:250+side*spread,y,side,origin:y+20+(level%3)*6};
  });
  return <svg className={`living-tree ${feedback?'new-growth':''}`} viewBox="90 25 320 250" role="img" aria-label={growth===0?'土壤里的一颗种子':`生命之树，${growth*2} 片行动新叶，${Math.floor(growth/5)} 次开花里程碑`}>
    <ellipse cx="250" cy="248" rx="115" ry="15" fill="#d8e2c9"/>
    <ellipse cx="250" cy="249" rx="78" ry="7" fill="#c3d1b4" opacity=".55"/>
    {growth===0?<><ellipse cx="250" cy="238" rx="8" ry="5" fill="#927750"/><path d="M232 246l12-4 7 3 13-4" stroke="#a5b394" fill="none"/></>:<>
      <path d={`M250 245 Q244 ${240-height/2} 251 ${top}`} fill="none" stroke="#796d4c" strokeWidth={3+Math.min(count,32)*.22} strokeLinecap="round"/>
      <path d="M250 241 Q239 248 224 249 M250 241 Q262 248 278 249" fill="none" stroke="#796d4c" strokeWidth="3" strokeLinecap="round"/>
      {leaves.map((leaf,i)=><g key={i} className={i===count-1?'latest-leaves':''}>
        <path d={`M250 ${Math.max(top+10,leaf.origin)} Q${250+leaf.side*20} ${leaf.y+12} ${leaf.x} ${leaf.y}`} fill="none" stroke="#829065" strokeWidth={1.3+Math.min(count,20)*.035} strokeLinecap="round"/>
        <g transform={`translate(${leaf.x} ${leaf.y}) rotate(${leaf.side*32})`}>
          <path d="M0 0 C-25 -1 -28 -20 -23 -25 C-5 -25 3 -13 0 0" fill={i%3===0?'#4f7644':'#779557'}/>
          <path d="M0 0 C25 -1 28 -20 23 -25 C5 -25 -3 -13 0 0" fill={i%3===0?'#8ca965':'#a0b77b'}/>
          <path d="M0 0L-19 -20 M0 0L19 -20" stroke="#d9e7bf" strokeWidth=".7" fill="none"/>
        </g>
        {(i+1)%5===0&&<g className="tree-flower" transform={`translate(${leaf.x} ${leaf.y-10})`}>
          {[0,72,144,216,288].map(angle=><ellipse key={angle} cy="-5" rx="3.7" ry="6" fill="#efd2b5" transform={`rotate(${angle})`}/>)}
          <circle r="3" fill="#c79c52"/>
        </g>}
      </g>)}
    </>}
  </svg>;
}
