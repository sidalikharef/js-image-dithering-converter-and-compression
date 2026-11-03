import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkerRequest, validateWorkerRequest, validateWorkerResponse, serializeWorkerError} from '../src/workers/worker-protocol.mjs';
import {runWorkerOperation} from '../src/workers/image-worker.mjs';
import {JobScheduler} from '../src/workers/job-scheduler.mjs';
import {EXPORT_FORMATS, encodeCanvas, detectExportCapabilities} from '../src/export/formats.mjs';
import {findClosestTargetSize, parseTargetBytes} from '../src/export/target-size.mjs';
import {safeOutputFilename} from '../src/export/filename.mjs';
import {BatchQueue} from '../src/batch/batch-queue.mjs';
import {createStoredZip} from '../src/batch/zip-writer.mjs';
import {ResourceManager} from '../src/utilities/resource-manager.mjs';
import {createPerformanceTimer} from '../src/utilities/performance-metrics.mjs';
import {createImageProcessor} from '../src/workers/worker-client.mjs';

test('worker protocol validates versioned requests and rejects invalid jobs',()=>{
  const message=createWorkerRequest('preview-1','process-image',{width:1,height:1});
  assert.equal(validateWorkerRequest(message),message);
  assert.equal(validateWorkerResponse({version:1,jobId:'preview-1',type:'job-completed'},'preview-1'),true);
  assert.equal(validateWorkerResponse({version:1,jobId:'old',type:'job-completed'},'preview-1'),false);
  assert.throws(()=>validateWorkerRequest({...message,version:2}),{code:'PROTOCOL_VERSION'});
  assert.throws(()=>validateWorkerRequest({...message,jobId:''}),{code:'INVALID_JOB_ID'});
  assert.throws(()=>validateWorkerRequest({...message,type:'run-anything'}),{code:'UNKNOWN_OPERATION'});
  assert.deepEqual(serializeWorkerError(Object.assign(new Error('bad input'),{code:'INVALID_IMAGE'})),
    {code:'INVALID_IMAGE',message:'bad input'});
});

test('worker operation reuses the registered monochrome engine and returns transferable pixels',()=>{
  const input=Uint8ClampedArray.from([0,0,0,255,255,255,255,255]);
  const result=runWorkerOperation({type:'process-image',payload:{
    width:2,height:1,buffer:input.buffer,mode:'monochrome',algorithm:'bayer',options:{threshold:128}
  }});
  assert.equal(result.width,2);
  assert.equal(result.height,1);
  assert.equal(result.buffer.byteLength,8);
  assert.ok(result.processingMs>=0);
});

test('worker rejects malformed pixel dimensions with an actionable code',()=>{
  assert.throws(()=>runWorkerOperation({type:'process-image',payload:{
    width:2,height:2,buffer:new ArrayBuffer(4),mode:'monochrome',algorithm:'bayer',options:{}
  }}),{code:'INVALID_IMAGE'});
});

test('worker initialization errors fall back to the existing engine on the main thread',async()=>{
  class FailingWorker{
    addEventListener(type,callback){if(type==='error')queueMicrotask(()=>callback({message:'worker init failed'}));}
    postMessage(){}
    terminate(){}
  }
  const modes=[];
  const client=createImageProcessor({WorkerClass:FailingWorker,onExecutionMode:mode=>modes.push(mode)});
  const input={width:1,height:1,data:Uint8ClampedArray.from([0,0,0,255])};
  const job=client.submit('process-image',{
    width:input.width,height:input.height,buffer:input.data.buffer,
    mode:'monochrome',algorithm:'bayer',options:{threshold:128}
  },{id:'fallback-test'});
  const result=await job.promise;
  assert.equal(result.width,1);
  assert.equal(result.buffer.byteLength,4);
  assert.deepEqual(modes,['worker','main-thread-fallback']);
});

test('worker cancellation terminates the dedicated worker and rejects as abort',async()=>{
  class PendingWorker{
    addEventListener(){}
    postMessage(){}
    terminate(){this.terminated=true;}
  }
  const client=createImageProcessor({WorkerClass:PendingWorker});
  const job=client.submit('get-capabilities',{}, {id:'cancel-test'});
  assert.equal(job.cancel(),true);
  await assert.rejects(job.promise,{name:'AbortError'});
});

test('job scheduler applies bounded concurrency, prioritizes queued jobs, and isolates failures',async()=>{
  const scheduler=new JobScheduler({concurrency:1});
  const order=[];
  let release;
  const blocker=scheduler.submit({id:'blocker',run:()=>new Promise(resolve=>{release=resolve;})});
  await new Promise(resolve=>setImmediate(resolve));
  const low=scheduler.submit({id:'low',priority:'low',run:()=>{order.push('low');}});
  const high=scheduler.submit({id:'high',priority:'high',run:()=>{order.push('high');}});
  release();
  await Promise.all([blocker.promise,low.promise,high.promise]);
  assert.deepEqual(order,['high','low']);
  const failed=scheduler.submit({id:'failure',run:()=>{throw new Error('isolated');}});
  const completed=scheduler.submit({id:'survivor',run:()=>42});
  assert.equal((await failed.promise).state,'failed');
  assert.deepEqual(await completed.promise,{state:'completed',value:42});
});

test('job scheduler cancels queued and running jobs and honors an AbortSignal',async()=>{
  const scheduler=new JobScheduler({concurrency:1});
  let started;
  const startedPromise=new Promise(resolve=>{started=resolve;});
  const running=scheduler.submit({id:'running',run:({signal})=>new Promise((resolve,reject)=>{
    started();
    signal.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError')),{once:true});
  })});
  await startedPromise;
  const queued=scheduler.submit({id:'queued',run:()=>assert.fail('cancelled queued job ran')});
  assert.equal(queued.cancel(),true);
  assert.equal((await queued.promise).state,'cancelled');
  running.cancel();
  assert.equal((await running.promise).state,'cancelled');
});

test('format encoding validates actual MIME types, quality and unsupported formats',async()=>{
  assert.equal(EXPORT_FORMATS.png.quality,false);
  const mockCanvas={toBlob(callback,type){callback(new Blob(['pixels'],{type}));}};
  assert.equal((await encodeCanvas(mockCanvas,'png')).type,'image/png');
  await assert.rejects(encodeCanvas(mockCanvas,'bad'),{code:'UNSUPPORTED_FORMAT'});
  const noAvif={toBlob(callback){callback(new Blob(['png'],{type:'image/png'}));}};
  await assert.rejects(encodeCanvas(noAvif,'avif'),{code:'UNSUPPORTED_ENCODER'});
  await assert.rejects(encodeCanvas(mockCanvas,'webp',2),{code:'INVALID_QUALITY'});
  const unsupported={toBlob(callback){callback(new Blob(['png'],{type:'image/png'}));}};
  await assert.rejects(encodeCanvas(unsupported,'webp'),{code:'UNSUPPORTED_ENCODER'});
  const capabilities=await detectExportCapabilities(()=>mockCanvas);
  assert.equal(capabilities.formats.png,true);
});

test('target-size search measures all bounded qualities and handles non-monotonic sizes',async()=>{
  const sizes=[120,80,150,90,110];
  const seen=[];
  const result=await findClosestTargetSize(async quality=>{
    seen.push(quality);
    return {size:sizes[seen.length-1]};
  },{targetBytes:100,minQuality:.1,maxQuality:.9,attempts:5});
  assert.equal(result.bytes,110);
  assert.equal(result.compliant,false);
  assert.equal(result.attempts,5);
  assert.equal(seen.length,5);
  assert.equal(parseTargetBytes(2,'MiB'),2*1024*1024);
  assert.throws(()=>parseTargetBytes(0,'KiB'),RangeError);
  await assert.rejects(findClosestTargetSize(async()=>({size:1}),{
    targetBytes:1,attempts:2,signal:AbortSignal.abort()
  }),{name:'AbortError'});
});

test('safe filenames normalize paths, extensions, Unicode, and collisions',()=>{
  const names=new Set();
  assert.equal(safeOutputFilename('../photo.png','webp',names),'photo.webp');
  assert.equal(safeOutputFilename('photo.jpg','webp',names),'photo (2).webp');
  assert.equal(safeOutputFilename('café.png','png',names),'café.png');
  assert.throws(()=>safeOutputFilename('file','exe'),RangeError);
});

test('batch queue enforces bounds, retries failures, cancellation, and aggregates real output sizes',async()=>{
  const attempts=new Map();
  const queue=new BatchQueue({concurrency:1,processItem:async item=>{
    const attempt=(attempts.get(item.name)??0)+1;attempts.set(item.name,attempt);
    if(item.name==='bad.png'&&attempt===1)throw new Error('decode failed');
    return new Blob(['rendered'],{type:'image/png'});
  }});
  const [good,bad]=queue.add([{name:'good.png',size:10},{name:'bad.png',size:20}],{format:'png'});
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(queue.summary().completed,1);
  assert.equal(queue.summary().failed,1);
  assert.equal(queue.retry(bad.id),true);
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(queue.summary().completed,2);
  assert.equal(queue.summary().outputBytes,16);
  assert.equal(queue.items.find(item=>item.id===good.id).status,'completed');
  const cancelled=queue.add([{name:'cancel.png',size:1}],{format:'png'})[0];
  queue.cancel(cancelled.id);
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(queue.items.find(item=>item.id===cancelled.id).status,'cancelled');
  assert.throws(()=>queue.add([{name:'large',size:201*1024*1024}],{format:'png'}),/200 MiB/);
});

test('batch queue pauses scheduling and can cancel the whole queue',async()=>{
  let release;
  const queue=new BatchQueue({concurrency:1,processItem:()=>new Promise(resolve=>{release=resolve;})});
  queue.pause();
  const items=queue.add([{name:'one.webp',size:1},{name:'two.webp',size:1}],{format:'webp'});
  assert.equal(queue.summary().queued,2);
  queue.resume();
  await new Promise(resolve=>setImmediate(resolve));
  queue.cancel();
  release(new Blob(['x']));
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(queue.summary().cancelled,2);
  assert.ok(items.every(item=>queue.items.find(value=>value.id===item.id)));
});

test('stored ZIP emits UTF-8 filenames, CRC-bearing entries, and rejects unsafe duplicates',async()=>{
  const zip=await createStoredZip([
    {name:'output 1.png',data:new Blob(['first'])},
    {name:'café.webp',data:new TextEncoder().encode('second')}
  ]);
  const bytes=new Uint8Array(await zip.arrayBuffer());
  const view=new DataView(bytes.buffer);
  assert.equal(view.getUint32(0,true),0x04034B50);
  assert.equal(view.getUint16(6,true)&0x0800,0x0800);
  assert.equal(zip.type,'application/zip');
  const content=new TextDecoder().decode(bytes);
  assert.match(content,/output 1\.png/);
  assert.match(content,/café\.webp/);
  assert.equal(view.getUint32(bytes.length-22,true),0x06054B50);
  await assert.rejects(createStoredZip([{name:'../unsafe.png',data:new Uint8Array()}]),/safe leaf/);
  await assert.rejects(createStoredZip([
    {name:'dup.png',data:new Uint8Array()},
    {name:'DUP.png',data:new Uint8Array()}
  ]),/Duplicate ZIP/);
});

test('resource manager releases object URLs, closeable images, and workers',()=>{
  const manager=new ResourceManager();
  const url=manager.createObjectURL(new Blob(['asset']));
  let closed=0,terminated=0;
  const image={close(){closed++;}};
  const worker={terminate(){terminated++;}};
  manager.trackClosable(image);manager.trackWorker(worker);
  manager.clear();
  assert.equal(closed,1);assert.equal(terminated,1);
  assert.deepEqual(manager.counts,{objectURLs:0,closables:0,workers:0});
  assert.equal(typeof url,'string');
});

test('performance timer records measured named stages',()=>{
  let time=0;
  const timer=createPerformanceTimer(()=>time);
  timer.start('decode');time+=4;assert.equal(timer.end('decode'),4);
  time+=3;
  assert.deepEqual(timer.snapshot(),{durationMs:7,stages:{decode:4}});
});
