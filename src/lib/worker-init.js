export async function _GSPS2PDF( dataStruct,
                                   responseCallback,
                                   progressCallback,
                                   statusUpdateCallback){
  const worker = new Worker(
    new URL('./background-worker.js', "http://localhost:5173/pdf-toolbox/public/"),
    {type: 'module'}
  );
  worker.postMessage({ data: dataStruct, target: 'wasm'});
  return new Promise((resolve, reject)=>{
    const listener = (e) => {
      resolve(e.data)
      worker.removeEventListener('message', listener)
      setTimeout(()=> worker.terminate(), 0);
    }
    worker.addEventListener('message', listener);
  })

}



