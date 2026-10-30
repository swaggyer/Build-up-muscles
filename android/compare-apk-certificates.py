"""Compare apksigner output without exposing keystores or changing installation behavior."""
import argparse
import json
import re
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('current', type=Path)
parser.add_argument('previous', type=Path)
parser.add_argument('--report', type=Path, required=True)
parser.add_argument('--notes', type=Path, required=True)
args = parser.parse_args()

def certificates(path):
    result = sorted(set(re.findall(r'Signer #\d+ certificate SHA-256 digest:\s*([a-fA-F0-9]{64})', path.read_text(encoding='utf-8'))))
    if not result:
        raise SystemExit('No verified signer certificate SHA-256 digest in ' + str(path))
    return [item.lower() for item in result]

current, previous = certificates(args.current), certificates(args.previous)
compatible = current == previous
report = {'baselineTag': 'android-v0.1.3', 'currentSignerSha256': current, 'baselineSignerSha256': previous,
          'supportsInPlaceUpdateFromBaseline': compatible,
          'scope': 'Both APK signatures are checked by apksigner before comparing their complete signer certificate sets.'}
args.report.parent.mkdir(parents=True, exist_ok=True)
args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
notes = ('\n与0.1.3的安装签名一致，可由Android系统确认覆盖更新；更新前仍请妥善保留本机记录。\n' if compatible else
         '\n此包与旧0.1.3签名不同，Android无法直接覆盖安装。请保留旧应用和其中的记录，不要盲目卸载；先核实记录迁移方案后再处理。自本次起CI复用固定缓存的试用签名，降低后续签名变化。\n')
args.notes.write_text(notes, encoding='utf-8')
print(json.dumps(report, ensure_ascii=False))
