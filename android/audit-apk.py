"""Fail the release build if the APK omits or changes its verified offline inference assets."""
import argparse
import hashlib
import json
import sys
import zipfile
import re
from pathlib import Path, PurePosixPath


def check_manifest(data):
    if data.get('schemaVersion') != 1 or not isinstance(data.get('files'), list) or not data['files']:
        raise ValueError('Offline manifest must contain schemaVersion 1 and a nonempty files list')
    if not isinstance(data.get('revision'), str) or not re.fullmatch(r'[a-f0-9]{40}', data['revision']):
        raise ValueError('Offline model revision must be pinned to a full source commit')
    seen = set()
    for entry in data['files']:
        name = entry.get('path', '')
        if not isinstance(name, str) or not name or '\\' in name:
            raise ValueError(f'Invalid offline resource path: {name!r}')
        parts = PurePosixPath(name)
        if parts.is_absolute() or '..' in parts.parts or '.' in name.split('/') or name in seen:
            raise ValueError(f'Unsafe or duplicate offline resource path: {name}')
        seen.add(name)
        digest = entry.get('sha256', '')
        if not isinstance(digest, str) or len(digest) != 64 or any(c not in '0123456789abcdef' for c in digest):
            raise ValueError(f'Missing pinned SHA-256: {name}')
        if type(entry.get('bytes')) is not int or entry['bytes'] <= 0:
            raise ValueError(f'Invalid resource length: {name}')
    if not any(name.endswith('.onnx') for name in seen):
        raise ValueError('The CLIP ONNX graph must be listed')
    if not any(name.endswith('.wasm') for name in seen):
        raise ValueError('The WASM runtime must be listed')
    if not any(name.endswith(('.js', '.mjs')) for name in seen):
        raise ValueError('The JavaScript runtime must be listed')
    return data['files']


def hash_file(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def audit(apk, dist, model_root):
    if not apk.is_file() or not dist.is_dir() or not model_root.is_dir():
        raise ValueError('An APK file and its exact dist/offline-model source directories are required')
    source_manifest = model_root / 'offline-model-manifest.json'
    entries = check_manifest(json.loads(source_manifest.read_text(encoding='utf-8')))
    source = {}
    for source_root in [dist, model_root]:
        for path in source_root.rglob('*'):
            if not path.is_file():
                continue
            name = path.relative_to(source_root).as_posix()
            if name in source:
                raise ValueError(f'Duplicate source resource path in dist/offline-model: {name}')
            source[name] = path
    with zipfile.ZipFile(apk) as archive:
        members = archive.infolist()
        if len(members) != len({member.filename for member in members}):
            raise ValueError('Duplicate paths in APK ZIP')
        bad = archive.testzip()
        if bad is not None:
            raise ValueError(f'APK ZIP CRC failed: {bad}')
        web = {member.filename[len('assets/web/'):]: member for member in members
               if member.filename.startswith('assets/web/') and not member.is_dir()}
        missing = sorted(set(source) - set(web))
        extra = sorted(set(web) - set(source))
        if missing or extra:
            raise ValueError(f'Bundled website differs from dist/offline-model; missing={missing}, extra={extra}')
        web_bytes = 0
        for name, original in sorted(source.items()):
            if original.stat().st_size != web[name].file_size:
                raise ValueError(f'Bundled resource length differs from dist/offline-model: {name}')
            with original.open('rb') as left, archive.open(web[name]) as right:
                while True:
                    a = left.read(1024 * 1024)
                    b = right.read(1024 * 1024)
                    if a != b:
                        raise ValueError(f'Bundled resource bytes differ from dist/offline-model: {name}')
                    web_bytes += len(a)
                    if not a:
                        break
        for entry in entries:
            name = entry['path']
            if name not in web or web[name].file_size != entry['bytes']:
                raise ValueError(f'Offline resource missing or truncated in APK: {name}')
            digest = hashlib.sha256()
            with archive.open(web[name]) as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b''):
                    digest.update(block)
            if digest.hexdigest() != entry['sha256']:
                raise ValueError(f'Pinned SHA-256 does not match APK resource: {name}')
            if name.endswith(('.onnx', '.wasm')) and web[name].compress_type != zipfile.ZIP_STORED:
                raise ValueError(f'ONNX/WASM asset must be stored without ZIP compression: {name}')
        for name in ['index.html', 'photo-meal.js', 'photo-model-worker.js']:
            if name not in web:
                raise ValueError(f'Missing required application file: {name}')
    return {
        'apk': apk.name,
        'apkBytes': apk.stat().st_size,
        'apkSha256': hash_file(apk),
        'zipCrcValid': True,
        'zipMembers': len(members),
        'websiteFilesByteCompared': len(source),
        'websiteUncompressedBytes': web_bytes,
        'verifiedOfflineFiles': len(entries),
        'offlineAssetBytes': sum(entry['bytes'] for entry in entries),
        'onnxGraphs': sum(entry['path'].endswith('.onnx') for entry in entries),
        'wasmRuntimes': sum(entry['path'].endswith('.wasm') for entry in entries),
        'onnxAndWasmUncompressed': True,
        'scope': 'Archive integrity, complete website byte comparison, pinned offline resource hashes and compression; no device/runtime claim.',
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('apk', type=Path)
    parser.add_argument('--dist', type=Path, default=Path(__file__).resolve().parents[1] / 'dist')
    parser.add_argument('--model-root', type=Path, default=Path(__file__).resolve().parents[1] / 'offline-model')
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    result = audit(args.apk.resolve(), args.dist.resolve(), args.model_root.resolve())
    output = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(output, encoding='utf-8')
    print(output, end='')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError, zipfile.BadZipFile) as error:
        print(f'Offline APK audit failed: {error}', file=sys.stderr)
        raise SystemExit(1)
