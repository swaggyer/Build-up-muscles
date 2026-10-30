/* Android reads bundled files only. Images never leave the device. */
const ROOT=new URL('./',import.meta.url),MODEL_ID='Xenova/clip-vit-base-patch32';
const REVISION='6b7c523703ae26e39be4b03774966f8571c7f523';
const IS_APP=ROOT.hostname==='appassets.androidplatform.net';
let classifierPromise,RawImage;
async function bundledModel(){
  let response;
  try{response=await fetch(new URL('offline-model-manifest.json',ROOT),{cache:'no-store'});}catch{}
  if(response?.ok){
    if(!IS_APP&&response.headers?.get('content-type')?.includes('text/html'))return false;
    let m;try{m=await response.json();}catch{if(!IS_APP)return false;throw Object.assign(Error('Invalid offline bundle'),{code:'bundle-missing'});}
    if(m.schemaVersion!==1||m.modelId!==MODEL_ID||m.revision!==REVISION||!Array.isArray(m.files))throw Object.assign(Error('Invalid offline bundle'),{code:'bundle-missing'});
    const files=new Set(m.files.map(f=>f.path));
    for(const f of ['onnx/model_quantized.onnx','config.json','tokenizer.json','preprocessor_config.json'])if(!files.has('models/'+MODEL_ID+'/'+f))throw Object.assign(Error('Incomplete offline bundle'),{code:'bundle-missing'});
    return true;
  }
  if(IS_APP)throw Object.assign(Error('Install the complete updated application'),{code:'bundle-missing'});
  return false;
}
async function getClassifier(id){
  if(!classifierPromise)classifierPromise=(async()=>{
    const offline=await bundledModel();
    const library=await import('./vendor/food-model/transformers.min.js');
    const {pipeline,env}=library;RawImage=library.RawImage;
    env.allowLocalModels=offline;env.allowRemoteModels=!offline;
    env.localModelPath=new URL('models/',ROOT).href;
    env.useBrowserCache=!offline;
    env.backends.onnx.wasm.wasmPaths=new URL('vendor/food-model/',ROOT).href;
    env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.proxy=false;
    const classifier=await pipeline('zero-shot-image-classification',MODEL_ID,{revision:REVISION,dtype:'q8',device:'wasm',local_files_only:offline,progress_callback:data=>postMessage({type:'progress',id,data,offline})});
    return {classifier,offline};
  })();
  return classifierPromise;
}
self.onmessage=async event=>{
  const {id,photo,labels}=event.data;
  try{
    const {classifier,offline}=await getClassifier(id);postMessage({type:'ready',id,offline});
    const image=await RawImage.fromBlob(photo);
    const result=await classifier(image,labels,{hypothesis_template:'This is a photo of {}.'});
    postMessage({type:'result',id,result,offline});
  }catch(error){classifierPromise=null;postMessage({type:'error',id,code:error?.code||'model-load',message:String(error?.message||error)});}
};
