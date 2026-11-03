export class ResourceManager {
  #urls=new Set();
  #closables=new Set();
  #workers=new Set();

  createObjectURL(blob) {
    const url=URL.createObjectURL(blob);this.#urls.add(url);return url;
  }
  revokeObjectURL(url) {
    if(this.#urls.delete(url))URL.revokeObjectURL(url);
  }
  trackClosable(value) {
    if(value&&typeof value.close==='function')this.#closables.add(value);
    return value;
  }
  releaseClosable(value) {
    if(this.#closables.delete(value))value.close();
  }
  trackWorker(worker){this.#workers.add(worker);return worker;}
  releaseWorker(worker){if(this.#workers.delete(worker))worker.terminate();}
  clear(){
    for(const url of this.#urls)URL.revokeObjectURL(url);
    for(const value of this.#closables)value.close();
    for(const worker of this.#workers)worker.terminate();
    this.#urls.clear();this.#closables.clear();this.#workers.clear();
  }
  get counts(){return {objectURLs:this.#urls.size,closables:this.#closables.size,workers:this.#workers.size};}
}
