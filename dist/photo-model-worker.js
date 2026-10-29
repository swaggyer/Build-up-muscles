/* Runs in a local module Worker. Only model/library downloads use the network. */
let classifierPromise;
let RawImage;
async function getClassifier() {
  if (!classifierPromise) {
    classifierPromise = (async () => {
      const library = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1');
      const { pipeline, env } = library;
      RawImage = library.RawImage;
      env.allowLocalModels = false;
      // A normal static Site has no cross-origin isolation or SharedArrayBuffer.
      env.backends.onnx.wasm.numThreads = 1;
      env.backends.onnx.wasm.proxy = false;
      return pipeline('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32', {
        dtype: 'q8', device: 'wasm',
        progress_callback: data => postMessage({ type: 'progress', data })
      });
    })();
  }
  return classifierPromise;
}
self.onmessage = async event => {
  const { id, photo, labels } = event.data;
  try {
    const classifier = await getClassifier();
    postMessage({ type: 'ready', id });
    const image = await RawImage.fromBlob(photo);
    const result = await classifier(image, labels, { hypothesis_template: 'This is a photo of {}.' });
    postMessage({ type: 'result', id, result });
  } catch (error) {
    classifierPromise = null;
    postMessage({ type: 'error', id, message: String(error && error.message || error) });
  }
};
