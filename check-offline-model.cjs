'use strict';
// These tests execute the shipped Worker with a controlled library/manifest.
// They cover configuration and failure recovery, not WASM inference; the real
// offline-recognition browser test separately verifies the packaged model.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, 'dist/photo-model-worker.js'), 'utf8');
const lock = JSON.parse(fs.readFileSync(path.join(__dirname, 'scripts/food-model-lock.json'), 'utf8'));
const modelPath = 'models/Xenova/clip-vit-base-patch32/onnx/model_quantized.onnx';
const models = lock.modelFiles.filter(file => file.path.endsWith('.onnx'));
assert.equal(models.length, 1, 'Ship one combined CLIP model, not duplicate text/vision models.');
assert.equal(models[0].path, modelPath);
assert.equal(models[0].bytes, 153695702);
assert.equal(models[0].sha256, '0898a3facfdb27f0a041e57649b4989cfd094e4a0040d6ae75ed69917dfc7328');
assert.equal(lock.packages.find(p => p.name === '@huggingface/transformers').version, '3.8.1');
const imported = source.match(/await import\((['"])([^'"]+)\1\)/);
assert.ok(imported, 'Test must intercept the actual Worker library import.');
assert.equal(imported[2], './vendor/food-model/transformers.min.js');
const script = source.replace('import.meta.url', '__workerURL').replace(imported[0], 'await __loadLibrary()');
const manifest = () => ({ schemaVersion: 1, modelId: lock.modelId, revision: lock.revision, files: lock.modelFiles });
const plain = v => JSON.parse(JSON.stringify(v));
function harness({ origin = 'https://appassets.androidplatform.net', bundle = manifest(), fetchError = false, failInference = false } = {}) {
  const messages = [], calls = [], fetches = [], images = [], predictions = [];
  const env = { backends: { onnx: { wasm: {} } } };
  let loads = 0;
  const context = {
    URL, Set, Error, __workerURL: `${origin}/assets/www/photo-model-worker.js`, self: {},
    postMessage: m => messages.push(plain(m)),
    fetch: async (url, options) => { fetches.push({ url: String(url), options }); if (fetchError) throw Error('offline'); return { ok: bundle !== null, json: async () => bundle }; },
    __loadLibrary: async () => {
      loads++;
      return { env, RawImage: { fromBlob: async blob => { images.push(blob); return { actualImage: blob }; } }, pipeline: async (...args) => {
        calls.push(args);
        args[2].progress_callback({ status: 'ready', file: modelPath });
        return async (...input) => { predictions.push(input); if (failInference) throw Error('decode failed'); return [{ label: 'an apple', score: 0.98 }]; };
      } };
    }
  };
  vm.createContext(context); vm.runInContext(script, context, { filename: 'actual-photo-model-worker.js' });
  return { messages, calls, fetches, images, predictions, env, loads: () => loads,
    run: (id = 1) => context.self.onmessage({ data: { id, photo: 'fixture-blob', labels: ['an apple', 'a banana'] } }) };
}
(async () => {
  const h = harness(); await h.run();
  assert.equal(h.calls.length, 1);
  const [task, model, options] = h.calls[0];
  assert.equal(task, 'zero-shot-image-classification'); assert.equal(model, lock.modelId);
  assert.equal(options.revision, lock.revision); assert.equal(options.dtype, 'q8'); assert.equal(options.device, 'wasm');
  assert.equal(options.local_files_only, true); assert.equal(h.env.allowRemoteModels, false);
  assert.equal(h.env.allowLocalModels, true); assert.equal(h.env.useBrowserCache, false);
  assert.equal(h.env.localModelPath, 'https://appassets.androidplatform.net/assets/www/models/');
  assert.equal(h.env.backends.onnx.wasm.wasmPaths, 'https://appassets.androidplatform.net/assets/www/vendor/food-model/');
  assert.equal(h.env.backends.onnx.wasm.numThreads, 1); assert.equal(h.env.backends.onnx.wasm.proxy, false);
  assert.equal(h.fetches[0].url, 'https://appassets.androidplatform.net/assets/www/offline-model-manifest.json');
  assert.equal(h.fetches[0].options.cache, 'no-store'); assert.equal(h.images[0], 'fixture-blob');
  assert.deepEqual(plain(h.predictions[0][1]), ['an apple', 'a banana']);
  assert.equal(h.messages.at(-1).type, 'result'); assert.equal(h.messages.at(-1).offline, true);
  assert.equal(h.messages.at(-1).id, 1); assert.equal(h.messages.at(-1).result[0].label, 'an apple');
  await h.run(2); assert.equal(h.loads(), 1, 'Reuse the loaded model for the next meal.');
  assert.equal(h.messages.at(-1).id, 2);
  const invalid = [null, { ...manifest(), revision: 'wrong' }, { ...manifest(), modelId: 'other/model' }, { ...manifest(), files: [] }, { ...manifest(), files: lock.modelFiles.filter(f => f.path !== modelPath) }];
  for (const bundle of invalid) {
    const bad = harness({ bundle }); await bad.run();
    assert.equal(bad.messages.at(-1).code, 'bundle-missing'); assert.equal(bad.loads(), 0, 'Invalid app bundle must fail before any model library/remote fallback.');
  }
  const absent = harness({ fetchError: true }); await absent.run(); assert.equal(absent.messages.at(-1).code, 'bundle-missing');
  const fail = harness({ failInference: true }); await fail.run(); assert.equal(fail.messages.at(-1).type, 'error'); await fail.run(3); assert.equal(fail.loads(), 2, 'A failed load/inference must be retryable.');
  const web = harness({ origin: 'https://example.test', bundle: null }); await web.run();
  assert.equal(web.env.allowRemoteModels, true, 'Hosted web fallback remains explicit when the optional bundle is absent.');
  assert.equal(web.calls[0][2].local_files_only, false);
  console.log('PASS: offline Worker configuration, combined model lock, app fail-closed branches, image/label routing, reuse and retry. This contract test does not replace real offline WASM inference.');
})().catch(error => { console.error(error); process.exitCode = 1; });
