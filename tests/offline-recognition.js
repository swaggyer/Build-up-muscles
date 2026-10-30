'use strict';
document.querySelector('#run').onclick=async()=>{
 const out=document.querySelector('#result'),start=performance.now();out.textContent='正在读取本机模型…';
 const worker=new Worker('/photo-model-worker.js',{type:'module'});
 worker.onerror=e=>{out.dataset.status='failed';out.textContent='Worker error: '+e.message;worker.terminate();};
 worker.onmessage=({data:m})=>{if(m.type==='progress')out.textContent='本机资源加载：'+(m.data.file||m.data.status);if(m.type==='error'){out.dataset.status='failed';out.textContent=JSON.stringify(m,null,2);worker.terminate();}if(m.type==='result'){const pass=m.offline===true&&m.result[0].label==='an apple';out.dataset.status=pass?'passed':'failed';out.textContent=JSON.stringify({status:pass?'passed':'failed',offline:m.offline,elapsedSeconds:Math.round((performance.now()-start)/1000),result:m.result},null,2);worker.terminate();}};
 const photo=await (await fetch('/__fixture.jpg',{cache:'no-store'})).blob();worker.postMessage({id:1,photo,labels:['an apple','a banana','a bowl of rice','a glass of milk','a person','a document']});
};
