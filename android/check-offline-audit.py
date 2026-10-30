"""Small synthetic archive tests for release integrity gates; these do not run a model."""
import hashlib
import importlib.util
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

spec = importlib.util.spec_from_file_location('offline_apk_audit', Path(__file__).with_name('audit-apk.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class OfflineArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.dist = self.root / 'dist'
        self.models = self.root / 'offline-model'
        self.dist.mkdir()
        self.models.mkdir()
        for name in ['index.html', 'photo-meal.js', 'photo-model-worker.js']:
            (self.dist / name).write_text('fixture-only:' + name, encoding='utf-8')
        self.files = [('vendor/runtime.mjs', b'fixture runtime', self.dist),
                      ('vendor/runtime.wasm', b'fixture wasm', self.dist),
                      ('models/clip/onnx/model_quantized.onnx', b'fixture graph', self.models)]
        entries = []
        for name, data, source in self.files:
            path = source / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            entries.append({'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
        self.manifest = {'schemaVersion': 1, 'revision': 'a' * 40, 'files': entries}
        self.write_manifest()
        self.apk = self.root / 'fixture.apk'

    def write_manifest(self):
        (self.models / 'offline-model-manifest.json').write_text(json.dumps(self.manifest), encoding='utf-8')

    def pack(self, missing=None, changed=None, compress_binary=False):
        with zipfile.ZipFile(self.apk, 'w') as archive:
            for source in [self.dist, self.models]:
                for path in source.rglob('*'):
                    if not path.is_file():
                        continue
                    name = path.relative_to(source).as_posix()
                    if name == missing:
                        continue
                    data = b'corrupt' if name == changed else path.read_bytes()
                    compression = zipfile.ZIP_DEFLATED if compress_binary or not name.endswith(('.onnx', '.wasm')) else zipfile.ZIP_STORED
                    archive.writestr('assets/web/' + name, data, compress_type=compression)

    def test_complete_single_graph_bundle(self):
        self.pack()
        result = module.audit(self.apk, self.dist, self.models)
        self.assertEqual(result['onnxGraphs'], 1)
        self.assertEqual(result['verifiedOfflineFiles'], 3)
        self.assertTrue(result['onnxAndWasmUncompressed'])

    def test_missing_graph_fails(self):
        self.pack(missing=self.files[-1][0])
        with self.assertRaisesRegex(ValueError, 'missing'):
            module.audit(self.apk, self.dist, self.models)

    def test_changed_runtime_fails(self):
        self.pack(changed=self.files[0][0])
        with self.assertRaisesRegex(ValueError, 'differs'):
            module.audit(self.apk, self.dist, self.models)

    def test_compressed_binary_fails(self):
        self.pack(compress_binary=True)
        with self.assertRaisesRegex(ValueError, 'without ZIP compression'):
            module.audit(self.apk, self.dist, self.models)

    def test_manifest_hash_mismatch_fails(self):
        self.manifest['files'][0]['sha256'] = '0' * 64
        self.write_manifest()
        self.pack()
        with self.assertRaisesRegex(ValueError, 'SHA-256'):
            module.audit(self.apk, self.dist, self.models)

    def test_unpinned_revision_fails(self):
        self.manifest['revision'] = 'main'
        with self.assertRaisesRegex(ValueError, 'pinned'):
            module.check_manifest(self.manifest)

    def test_duplicate_source_path_fails(self):
        (self.models / 'index.html').write_text('other copy', encoding='utf-8')
        self.pack()
        with self.assertRaisesRegex(ValueError, 'Duplicate source'):
            module.audit(self.apk, self.dist, self.models)


if __name__ == '__main__':
    unittest.main(verbosity=2)
