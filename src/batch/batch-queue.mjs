import {safeOutputFilename} from '../export/filename.mjs';

const TERMINAL = new Set(['completed','failed','cancelled']);

export class BatchQueue {
  #items = new Map();
  #queue = [];
  #running = 0;
  #paused = false;
  #sequence=0;

  constructor({concurrency=2, processItem, onChange=()=>{}, maxItems=100}={}) {
    if(!Number.isInteger(concurrency)||concurrency<1||concurrency>4)throw new RangeError('Batch concurrency must be from 1 to 4.');
    if(typeof processItem!=='function')throw new TypeError('A batch item processor is required.');
    this.concurrency=concurrency;this.processItem=processItem;this.onChange=onChange;this.maxItems=maxItems;
  }

  get items(){return [...this.#items.values()];}

  add(files, settings={}) {
    if(!Array.isArray(files))throw new TypeError('Batch files must be an array.');
    if(this.#items.size+files.length>this.maxItems)throw new RangeError(`A batch is limited to ${this.maxItems} images.`);
    const queuedBytes=this.items.reduce((sum,item)=>sum+item.size,0);
    const addedBytes=files.reduce((sum,file)=>sum+(Number(file?.size)||0),0);
    if(queuedBytes+addedBytes>200*1024*1024)throw new RangeError('A batch is limited to 200 MiB of source images.');
    const used=new Set(this.items.map(item=>item.outputName.toLocaleLowerCase()));
    const added=files.map((file,index)=>{
      if(!file || typeof file.name!=='string' || !Number.isFinite(file.size))throw new TypeError('Invalid batch image file.');
      const id=`batch-${++this.#sequence}`;
      const item={id,file,name:file.name,size:file.size,status:'queued',progress:null,output:null,error:null,
        outputName:safeOutputFilename(file.name,settings.format ?? 'webp',used),settings:{...settings}};
      this.#items.set(id,item);this.#queue.push(item);this.#publish(item);return item;
    });
    this.#pump();
    return added;
  }

  pause(){this.#paused=true;}
  resume(){this.#paused=false;this.#pump();}

  cancel(id) {
    if(id===undefined){
      this.#paused=false;
      for(const item of this.#queue.splice(0))this.#set(item,'cancelled');
      for(const item of this.#items.values())if(item.status==='running'){item.controller.abort('Batch cancelled.');}
      return;
    }
    const item=this.#items.get(id);
    if(!item||TERMINAL.has(item.status))return false;
    if(item.status==='queued'){this.#queue=this.#queue.filter(queued=>queued!==item);this.#set(item,'cancelled');}
    else item.controller.abort('Item cancelled.');
    return true;
  }

  retry(id) {
    const item=this.#items.get(id);
    if(!item||item.status!=='failed')return false;
    item.error=null;item.progress=null;item.controller=null;item.status='queued';
    this.#queue.push(item);this.#publish(item);this.#pump();return true;
  }

  summary() {
    const items=this.items;
    const count=status=>items.filter(item=>item.status===status).length;
    const inputBytes=items.reduce((sum,item)=>sum+item.size,0);
    const completed=items.filter(item=>item.status==='completed'&&item.output);
    const outputBytes=completed.reduce((sum,item)=>sum+(item.output?.blob?.size??item.output?.size??0),0);
    return {total:items.length,queued:count('queued'),running:count('running'),completed:count('completed'),
      failed:count('failed'),cancelled:count('cancelled'),inputBytes,outputBytes,
      savedBytes:inputBytes-outputBytes,savedPercent:inputBytes?((inputBytes-outputBytes)/inputBytes)*100:null};
  }

  #set(item,status,details={}){item.status=status;Object.assign(item,details);this.#publish(item);}
  #publish(){this.onChange(this.items,this.summary());}

  #pump(){
    while(!this.#paused&&this.#running<this.concurrency&&this.#queue.length){
      const item=this.#queue.shift();item.controller=new AbortController();this.#running++;this.#set(item,'running');
      Promise.resolve().then(()=>this.processItem(item,{signal:item.controller.signal,
        onProgress:progress=>{if(item.status==='running'){item.progress=progress;this.#publish();}}}))
        .then(output=>item.controller.signal.aborted?this.#set(item,'cancelled') :
          this.#set(item,'completed',{output,progress:{completed:1,total:1}}))
        .catch(error=>item.controller.signal.aborted?this.#set(item,'cancelled') :
          this.#set(item,'failed',{error:error instanceof Error?error:new Error(String(error))}))
        .finally(()=>{this.#running--;this.#pump();});
    }
  }
}
