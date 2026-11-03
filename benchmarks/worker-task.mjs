import {parentPort} from 'node:worker_threads';
import {processImage} from '../src/engine/registry.mjs';
import {processColorImage} from '../src/engine/color/color-diffusion.mjs';

parentPort.on('message',message=>{
  try{
    const started=performance.now();
    const input={width:message.width,height:message.height,data:new Uint8ClampedArray(message.buffer)};
    const output=message.mode==='color'
      ? processColorImage(input,message.options)
      : processImage(input,message.algorithm,message.options);
    parentPort.postMessage({
      id:message.id,width:output.width,height:output.height,
      buffer:output.data.buffer,processingMs:performance.now()-started
    },[output.data.buffer]);
  }catch(error){
    parentPort.postMessage({id:message.id,error:error instanceof Error?error.message:String(error)});
  }
});
