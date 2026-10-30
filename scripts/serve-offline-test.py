from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import unquote,urlsplit
import argparse,mimetypes
root=Path(__file__).resolve().parent.parent
p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=4173);p.add_argument('--fixture',type=Path,required=True);args=p.parse_args()
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        route=unquote(urlsplit(self.path).path)
        special={'/__offline-test':root/'tests/offline-recognition.html','/__offline-test.js':root/'tests/offline-recognition.js','/__fixture.jpg':args.fixture.resolve()}
        file=special.get(route)
        if file is None:
            rel=route.lstrip('/') or 'index.html'
            for base in [root/'dist',root/'offline-model']:
                candidate=(base/rel).resolve()
                if candidate.is_relative_to(base.resolve()) and candidate.is_file():file=candidate;break
        if file is None or not file.is_file():self.send_error(404);return
        mime={'.mjs':'application/javascript','.js':'application/javascript','.wasm':'application/wasm','.onnx':'application/octet-stream'}.get(file.suffix,mimetypes.guess_type(file.name)[0] or 'application/octet-stream')
        self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(file.stat().st_size));self.send_header('Cache-Control','no-store')
        self.send_header('Content-Security-Policy',"default-src 'self'; connect-src 'self' blob:; script-src 'self' blob: 'wasm-unsafe-eval'; worker-src 'self' blob:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'")
        self.end_headers()
        try:
            with file.open('rb') as stream:
                while chunk:=stream.read(1024*1024):self.wfile.write(chunk)
        except (ConnectionResetError,BrokenPipeError):pass
print(f'Offline-only recognition preview: http://127.0.0.1:{args.port}/__offline-test',flush=True)
ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()
