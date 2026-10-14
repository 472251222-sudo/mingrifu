// Reuse the original assertions, redirecting only module URLs and report I/O.
// Pass a NEW output directory; historical evidence is never overwritten.
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
if(!process.argv[2])throw Error('Provide a new output directory');
const output=resolve(process.argv[2]);if(existsSync(output))throw Error('Output directory already exists');mkdirSync(output,{recursive:true});
const original=resolve(root,'docs/growth-p2-b/2026-10-14/verify_assets.mjs'),raw=readFileSync(original,'utf8');
let source=raw.replace(/from '\.\.\/\.\.\/\.\.\/src\/([^']+)'/g,(_,tail)=>'from '+JSON.stringify(pathToFileURL(resolve(root,'src',tail)).href));
source=source.replace('createRequire(import.meta.url)','createRequire('+JSON.stringify(pathToFileURL(original).href)+')').replace("const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../../..')",'const here='+JSON.stringify(output)+',root='+JSON.stringify(root));
writeFileSync(resolve(output,'execution.json'),JSON.stringify({originalScript:'docs/growth-p2-b/2026-10-14/verify_assets.mjs',sha256:createHash('sha256').update(raw).digest('hex'),redirectedOutput:output},null,2));
await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
