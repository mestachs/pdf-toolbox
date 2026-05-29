export async function _GSPS2PDF(dataStruct) {
  const worker = new Worker(
    new URL(import.meta.env.BASE_URL + "background-worker.js", window.location.href),
    { type: "module" }
  );
  worker.postMessage({ data: dataStruct, target: "wasm" });
  return new Promise((resolve, reject) => {
    const listener = (e) => {
      resolve(e.data);
      worker.removeEventListener("message", listener);
      setTimeout(() => worker.terminate(), 0);
    };
    worker.addEventListener("message", listener);
  });
}
