"""Start/reopen the course-local app; retain logs without tying it to a terminal."""
import argparse
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--stop', action='store_true')
parser.add_argument('--no-browser', action='store_true')
args = parser.parse_args()
port = int(os.environ.get('FIBERLAB_PORT', 5080))
url = f'http://127.0.0.1:{port}'
runtime = ROOT / '.runtime'
runtime.mkdir(exist_ok=True)
pid_file = runtime / 'server.pid'


def ready():
    try:
        with urllib.request.urlopen(url + '/api/health', timeout=2) as response:
            data = json.load(response)
            return data.get('application') == 'fiber-atlas' and data.get('status') == 'ok'
    except (OSError, ValueError):
        return False


if args.stop:
    if not pid_file.exists():
        sys.exit('Энэ launcher-ийн эхлүүлсэн серверийн PID олдсонгүй.')
    pid = int(pid_file.read_text())
    command = Path(f'/proc/{pid}/cmdline')
    if command.exists() and b'fiberlab.app' in command.read_bytes() and Path(f'/proc/{pid}/cwd').resolve() == ROOT:
        os.kill(pid, signal.SIGTERM)
        for _ in range(50):
            if not ready():
                break
            time.sleep(.1)
        print('Fiber Atlas сервер зогслоо.')
    else:
        print('Сервер аль хэдийн зогссон байна.')
    sys.exit(0)

if not ready():
    with (runtime / 'server.log').open('ab') as log:
        child = subprocess.Popen([sys.executable, '-m', 'fiberlab.app'], cwd=ROOT,
                                 stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                                 start_new_session=True)
    pid_file.write_text(str(child.pid))
    for _ in range(180):
        if ready():
            break
        if child.poll() is not None:
            sys.exit(f'Сервер ассангүй. Лог: {runtime / "server.log"}')
        time.sleep(.5)
    else:
        sys.exit(f'Сервер бэлтгэгдэж байна. Лог: {runtime / "server.log"}')

print(f'Fiber Atlas ажиллаж байна: {url}')
if not args.no_browser:
    subprocess.Popen(['xdg-open', url], stdin=subprocess.DEVNULL,
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
