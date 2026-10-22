#!/usr/bin/env python3
"""Materialise npm packages from the local npm cache without a registry.

Useful on machines with no registry access: the cache still holds the exact
tarballs a previous install downloaded. This script resolves a dependency tree
from cached tarballs only and unpacks it into a node_modules directory.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import shutil
import sys
import tarfile
from pathlib import Path

CACHE = Path.home() / '.npm/_cacache'
TARBALL = re.compile(r'^https://registry\.npmjs\.org/(.+)/-/([^/]+)\.tgz$')


def _version(text):
    core, _, pre = text.partition('-')
    nums = [int(p) for p in core.split('.')[:3]]
    while len(nums) < 3:
        nums.append(0)
    return tuple(nums), pre


def _cmp(a, b):
    va, pa = _version(a)
    vb, pb = _version(b)
    if va != vb:
        return (va > vb) - (va < vb)
    if pa == pb:
        return 0
    if not pa:
        return 1
    if not pb:
        return -1
    return (pa > pb) - (pa < pb)


def _at_least(version, floor):
    va, _ = _version(version)
    fb, _ = _version(floor)
    if va > fb:
        return True
    if va < fb:
        return False
    return True


def _within(version, low, high):
    return _cmp(version, low) >= 0 and _cmp(version, high) <= 0


def satisfies(version, spec):
    """Resolve one semver range against a version string."""
    spec = (spec or '*').strip()
    if spec in ('', '*', 'x', 'latest'):
        return True
    for alternative in spec.split('||'):
        if all(_satisfies_one(version, part) for part in alternative.split() if part):
            return True
    return False


def _satisfies_one(version, part):
    part = part.strip()
    if not part:
        return True
    if part.startswith('^'):
        base = part[1:].strip()
        major, minor, patch = _version(base)[0]
        if major > 0:
            return _cmp(version, base) >= 0 and _cmp(version, f'{major + 1}.0.0') < 0
        if minor > 0:
            return _cmp(version, base) >= 0 and _cmp(version, f'0.{minor + 1}.0') < 0
        return _cmp(version, base) >= 0 and _cmp(version, f'0.0.{patch + 1}') < 0
    if part.startswith('~'):
        base = part[1:].strip()
        major, minor, _ = _version(base)[0]
        return _cmp(version, base) >= 0 and _cmp(version, f'{major}.{minor + 1}.0') < 0
    for operator in ('>=', '<=', '>', '<', '='):
        if part.startswith(operator):
            target = part[len(operator):].strip()
            if operator == '>=':
                return _cmp(version, target) >= 0
            if operator == '<=':
                return _cmp(version, target) <= 0
            if operator == '>':
                return _cmp(version, target) > 0
            if operator == '<':
                return _cmp(version, target) < 0
            return _cmp(version, target) == 0
    if re.match(r'^[\d*]', part):
        if part.count('.') == 2 and '*' not in part:
            return _cmp(version, part) == 0
        return _cmp(version, part) >= 0
    return True


def body_version(body):
    """The version the tarball itself declares, or None if it cannot be read."""
    try:
        with tarfile.open(body, 'r:gz') as archive:
            for member in archive.getmembers():
                parts = Path(member.name).parts
                if len(parts) == 2 and parts[0] == 'package' and parts[1] == 'package.json':
                    handle = archive.extractfile(member)
                    if handle is None:
                        return None
                    return json.loads(handle.read().decode('utf-8')).get('version')
    except (tarfile.TarError, OSError, ValueError):
        return None
    return None


def scan_cache():
    """Map (package name, version) to the cached tarball body path.

    A cache entry can point at the body of a different release, so every
    tarball is checked against the version inside its own manifest before it
    is offered. A mismatched body would otherwise install a package whose
    code does not match its version number.
    """
    index = CACHE / 'index-v5'
    if not index.exists():
        return {}
    found = {}
    for path in index.rglob('*'):
        if not path.is_file():
            continue
        try:
            text = path.read_text(errors='ignore')
        except OSError:
            continue
        for line in text.splitlines():
            if 'registry.npmjs.org' not in line or '.tgz' not in line:
                continue
            for blob in re.findall(r'\{.*\}', line):
                try:
                    entry = json.loads(blob)
                except ValueError:
                    continue
                key = entry.get('key', '')
                match = TARBALL.match(key.split('request-cache:')[-1])
                if not match:
                    continue
                name = match.group(1)
                version = match.group(2).rsplit('-', 1)[-1]
                integrity = entry.get('integrity', '')
                if not integrity.startswith('sha512-'):
                    continue
                digest = base64.b64decode(integrity[7:]).hex()
                body = CACHE / 'content-v2' / 'sha512' / digest[:2] / digest[2:4] / digest[4:]
                if not body.exists():
                    continue
                if body_version(body) != version:
                    continue
                found[(name, version)] = body
    return found


def pick(available, name, specs):
    """Highest cached version that satisfies every range asked for so far."""
    versions = sorted((v for (n, v) in available if n == name), key=lambda v: _version(v)[0])
    for version in reversed(versions):
        if all(satisfies(version, spec) for spec in specs):
            return version
    for version in reversed(versions):
        if any(satisfies(version, spec) for spec in specs):
            return version
    return None


def install(target: Path, available, wanted, report):
    """Install wanted packages (name -> range) into target/node_modules.

    node_modules is flat, so a package may only be present at one version.
    The ranges are collected first and the highest cached version that fits
    them all is installed once, instead of letting a later request overwrite
    an earlier one and leave a mixed directory behind.
    """
    root = target / 'node_modules'
    root.mkdir(parents=True, exist_ok=True)
    queue = [(name, spec) for name, spec in wanted.items()]
    ranges = {}
    chosen = {}
    failed = []
    processed = set()

    while queue:
        name, spec = queue.pop(0)
        if name in processed and spec in ranges.get(name, ()):
            continue
        ranges.setdefault(name, [])
        if spec not in ranges[name]:
            ranges[name].append(spec)
        version = pick(available, name, ranges[name])
        if version is None:
            failed.append((name, spec, 'no cached version'))
            processed.add(name)
            continue
        if chosen.get(name) == version:
            continue
        chosen[name] = version
        body = available[(name, version)]
        destination = root / name
        if destination.exists():
            shutil.rmtree(destination)
        destination.parent.mkdir(parents=True, exist_ok=True)
        with tarfile.open(body, 'r:gz') as archive:
            for member in archive.getmembers():
                parts = Path(member.name).parts
                if len(parts) < 2 or parts[0] != 'package':
                    continue
                member.name = str(Path(*parts[1:]))
                if member.name in ('', '.'):
                    continue
                archive.extract(member, destination)
        report.append(f'  + {name}@{version}')

        meta_path = destination / 'package.json'
        if not meta_path.exists():
            continue
        meta = json.loads(meta_path.read_text())
        for dependency, range_spec in (meta.get('dependencies') or {}).items():
            queue.append((dependency, range_spec))
        for dependency, range_spec in (meta.get('optionalDependencies') or {}).items():
            queue.append((dependency, range_spec))
    link_bins(root)
    return chosen, failed


def link_bins(root: Path):
    """Create node_modules/.bin entries so npm scripts can find the CLIs."""
    binaries = root / '.bin'
    binaries.mkdir(exist_ok=True)
    for package in root.iterdir():
        if package.name.startswith('.'):
            continue
        candidates = [package] if package.is_dir() and not package.name.startswith('@') else (
            list(package.iterdir()) if package.is_dir() else [])
        for candidate in candidates:
            meta_path = candidate / 'package.json'
            if not meta_path.exists():
                continue
            meta = json.loads(meta_path.read_text())
            entries = meta.get('bin') or {}
            if isinstance(entries, str):
                entries = {meta.get('name', candidate.name): entries}
            for command, relative in entries.items():
                script = candidate / relative
                if not script.exists():
                    continue
                link = binaries / command
                if link.exists() or link.is_symlink():
                    link.unlink()
                link.symlink_to(os.path.relpath(script, binaries))
                link.chmod(0o755)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('project', help='directory containing package.json')
    parser.add_argument('--packages', nargs='*', default=[], help='extra name@range pairs')
    args = parser.parse_args()

    project = Path(args.project).resolve()
    meta = json.loads((project / 'package.json').read_text())
    wanted = dict(meta.get('dependencies') or {})
    wanted.update(meta.get('devDependencies') or {})
    for item in args.packages:
        name, _, spec = item.partition('@')
        wanted[name] = spec or '*'

    print('scanning npm cache ...', flush=True)
    available = scan_cache()
    print(f'  {len(available)} cached tarballs', flush=True)
    report = []
    installed, failed = install(project, available, wanted, report)
    for line in report:
        print(line)
    if failed:
        print('\nnot available offline:')
        for name, spec, reason in failed:
            print(f'  - {name}@{spec}: {reason}')
    print(f'\ninstalled {len(installed)} packages into {project / "node_modules"}')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
