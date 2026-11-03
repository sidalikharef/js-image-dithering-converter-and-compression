import {Worker} from 'node:worker_threads';
import {performance} from 'node:perf_hooks';
import {processImage} from '../src/engine/registry.mjs';

const sizes=[256,512,1024,2048].filter(size=>size<=Number(process.env.DITHERLAB_BENCH_MAX_SIZE??2048));
const iterations=Number(process.env.DITHERLAB_BENCH_ITERATIONS??3);
const algorithm='floyd-steinberg';
const workerUrl=new URL('./worker-task.mjs',import.meta.url);

function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

function makeImage(width,height){
  const data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const index=(y*width+x)*4;
    const value=(x*31+y*17+(x*y)%251)&255;
    data[index]=value;data[index+1]=(value*3)&255;data[index+2]=255-value;data[index+3]=255;
  }
  return {width,height,data};
}

function direct(image){
  const input={width:image.width,height:image.height,data:image.data.slice()};
  const start=performance.now();
  processImage(input,algorithm,{threshold:128,contrast:1,strength:1});
  return performance.now()-start;
}

function createWorker(){
  const worker=new Worker(workerUrl);
  const pending=new Map();
  worker.on('message',message=>{
    const item=pending.get(message.id);
    if(!item)return;
    pending.delete(message.id);
    message.error?item.reject(new Error(message.error)):item.resolve(message);
  });
  worker.on('error',error=>{
    for(const item of pending.values())item.reject(error);
    pending.clear();
  });
  return {
    worker,
    run(image,id){
      const buffer=image.data.slice().buffer;
      const started=performance.now();
      const promise=new Promise((resolve,reject)=>pending.set(id,{resolve,reject}));
      worker.postMessage({id,width:image.width,height:image.height,buffer,algorithm,mode:'monochrome',
        options:{threshold:128,contrast:1,strength:1}},[buffer]);
      return promise.then(result=>({...result,totalMs:performance.now()-started}));
    }
  };
}

console.log('Floyd–Steinberg · Node worker_threads (transfer included in end-to-end latency)');
console.log('Size | Main median ms | Worker compute median ms | Worker end-to-end median ms | repeated jobs/s');

for(const size of sizes){
  const image=makeImage(size,size);
  direct(image);
  const directTimes=[];
  for(let i=0;i<iterations;i++)directTimes.push(direct(image));
  const client=createWorker();
  const workerTimes=[],workerCompute=[];
  try{
    await client.run(image,`warmup-${size}`);
    for(let i=0;i<iterations;i++){
      const result=await client.run(image,`measure-${size}-${i}`);
      workerTimes.push(result.totalMs);workerCompute.push(result.processingMs);
    }
    const batchStart=performance.now();
    const batchCount=4;
    for(let index=0;index<batchCount;index++)await client.run(image,`batch-${size}-${index}`);
    const batchSeconds=(performance.now()-batchStart)/1000;
    console.log(`${size}×${size} | ${median(directTimes).toFixed(2)} | ${median(workerCompute).toFixed(2)} | ${median(workerTimes).toFixed(2)} | ${(batchCount/batchSeconds).toFixed(2)}`);
  }finally{await client.worker.terminate();}
}

const cancelWorker=new Worker(workerUrl);
await new Promise((resolve,reject)=>{
  cancelWorker.once('online',resolve);
  cancelWorker.once('error',reject);
});
const cancelBuffer=makeImage(2048,2048).data.buffer;
cancelWorker.postMessage({id:'cancellation-benchmark',width:2048,height:2048,buffer:cancelBuffer,
  mode:'monochrome',algorithm,options:{threshold:128,contrast:1,strength:1}},[cancelBuffer]);
await new Promise(resolve=>setTimeout(resolve,1));
const cancelRequested=performance.now();
await cancelWorker.terminate();
console.log(`Busy-worker cancellation-to-termination response: ${(performance.now()-cancelRequested).toFixed(2)} ms.`);
console.log('Worker timings include message scheduling and buffer transfer at end-to-end level; workers prioritize UI responsiveness, not guaranteed single-job speed.');
