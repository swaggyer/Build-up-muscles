'use strict';
// Build-time downloads only. Android inference never reaches these remote URLs.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {pipeline}=require('node:stream/promises'),{Readable}=require('node:stream'),{createWriteStream}=require('node:fs');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),lock=require('./food-model-lock.json');
const runtimeOnly=process.argv.includes('--runtime-only'),verifyOnly=process.argv.includes('--verify');
const cache=path.join(root,'.cache/food-model-downloads'),bundle=path.join(root,'offline-model');
function safe(base,rel){const p=path.resolve(base,rel);if(!p.startsWith(base+path.sep))throw Error('Unsafe bundle path');return p;}
async function digest(file,algorithm='sha256',encoding='hex'){const hash=crypto.createHash(algorithm);for await(const bytes of require('node:fs').createReadStream(file))hash.update(bytes);return hash.digest(encoding);}
async function valid(file,entry){try{const stat=await fs.stat(file);if(entry.bytes!==undefined&&stat.size!==entry.bytes)return false;if(entry.sha256&&await digest(file)!==entry.sha256)return false;if(entry.integrity){const [algorithm,want]=entry.integrity.split('-',2);if(await digest(file,algorithm,'base64')!==want)return false;}if(entry.gitBlobSha1){const bytes=await fs.readFile(file);const got=crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');if(got!==entry.gitBlobSha1)return false;}return true;}catch{return false;}}
async function download(url,target,entry){if(await valid(target,entry))return;if(verifyOnly)throw Error('Missing or invalid '+target);await fs.mkdir(path.dirname(target),{recursive:true});let failure;
 for(let i=0;i<3;i++){const temporary=target+'.download';try{const response=await fetch(url,{signal:AbortSignal.timeout(600000)});if(!response.ok||!response.body)throw Error(`HTTP ${response.status} for ${url}`);await pipeline(Readable.fromWeb(response.body),createWriteStream(temporary));if(!await valid(temporary,entry))throw Error('Checksum/length mismatch for '+url);await fs.rename(temporary,target);return;}catch(error){failure=error;await fs.rm(temporary,{force:true});}}
 throw failure;}
(async()=>{
 const files=[];await fs.mkdir(cache,{recursive:true});
 for(const pkg of lock.packages){const archive=path.join(cache,`${pkg.name.replaceAll('/','-')}-${pkg.version}.tgz`);await download(pkg.url,archive,{integrity:pkg.integrity});const extracted=path.join(cache,pkg.name.replaceAll('/','-'));await fs.mkdir(extracted,{recursive:true});
  const missing=[];for(const f of pkg.files)if(!await valid(safe(path.join(root,'dist'),f.path),f))missing.push(f);
  if(missing.length){if(verifyOnly)throw Error('Runtime bundle is incomplete');execFileSync('tar',['-xzf',archive,'-C',extracted,...missing.map(f=>f.entry)],{stdio:'inherit'});for(const f of missing){const source=safe(extracted,f.entry);if(!await valid(source,f))throw Error('Invalid extracted runtime '+f.entry);const target=safe(path.join(root,'dist'),f.path);await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(source,target);}}
  files.push(...pkg.files.map(({path,bytes,sha256})=>({path,bytes,sha256})));
 }
 for(const f of lock.localFiles||[]){const source=safe(root,f.source);if(!await valid(source,f))throw Error('Missing runtime license');const target=safe(path.join(root,'dist'),f.path);await fs.copyFile(source,target);files.push({path:f.path,bytes:f.bytes,sha256:f.sha256});}
 if(runtimeOnly){console.log('Local recognition runtime verified.');return;}
 for(const f of lock.modelFiles){const target=safe(bundle,f.path);const url=`https://huggingface.co/${lock.modelId}/resolve/${lock.revision}/${f.sourcePath}?download=true`;console.log('Preparing '+f.sourcePath);await download(url,target,f);files.push({path:f.path,bytes:f.bytes,sha256:f.sha256||await digest(target)});}
 const manifest={schemaVersion:1,modelId:lock.modelId,revision:lock.revision,dtype:lock.dtype,files};await fs.mkdir(bundle,{recursive:true});await fs.writeFile(path.join(bundle,'offline-model-manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log('Verified offline bundle: '+files.length+' files, '+files.reduce((s,f)=>s+f.bytes,0)+' bytes.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
