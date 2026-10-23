#!/usr/bin/env python3
"""Rebuild package-lock.json from the installed tree and the npm cache.

npm cannot regenerate the lockfile offline when an optional binary for
another platform is not cached, yet the tree on disk is complete and was
installed from that very cache. This script writes the lockfile entries
from what is actually installed, taking each package's integrity hash from
the cache index so `npm ci` can still verify every download.
"""
from __future__ import annotations

import base64
import json
import re
import sys
from pathlib import Path

CACHE = Path.home() / '.npm/_cacache'
TARBALL = re.compile(r'^https://registry\.npmjs\.org/(.+)/-/([^/]+)\.tgz$')


def cache_integrity():
    """(name, version) -> integrity, for every tarball the npm cache holds.

    The key must include the version: the cache holds several releases of the
    same package, and a hash from another release makes npm reject the entry
    and go back to the registry.
    """
    index = CACHE / 'index-v5'
    found = {}
    for path in index.rglob('*'):
        if not path.is_file():
            continue
        try:
            text = path.read_text(errors='ignore')
        except OSError:
            continue
        for blob in re.findall(r'\{.*\}', text):
            if 'registry.npmjs.org' not in blob or '.tgz' not in blob:
                continue
            try:
                entry = json.loads(blob)
            except ValueError:
                continue
            key = entry.get('key', '')
            match = TARBALL.match(key.split('request-cache:')[-1])
            if not match:
                continue
            integrity = entry.get('integrity', '')
            version = match.group(2).rsplit('-', 1)[-1]
            if integrity:
                found[(match.group(1), version)] = integrity
    return found


def package_entries(root: Path):
    """Every installed package, keyed by its path inside node_modules."""
    entries = {}
    for manifest in root.rglob('package.json'):
        relative = manifest.relative_to(root)
        parts = relative.parts
        if parts[-1] != 'package.json' or len(parts) < 2:
            continue
        try:
            meta = json.loads(manifest.read_text())
        except (OSError, ValueError):
            continue
        name = meta.get('name')
        version = meta.get('version')
        if not name or not version:
            continue
        key = 'node_modules/' + '/'.join(parts[:-1])
        entry = {'version': version}
        for field in ('bin', 'engines', 'os', 'cpu', 'license',
                      'dependencies', 'peerDependencies', 'peerDependenciesMeta',
                      'optionalDependencies', 'funding', 'hasInstallScript'):
            if field in meta:
                entry[field] = meta[field]
        entries[key] = entry
    return entries


def local_lock_integrity():
    """(name, version) -> integrity, from any lockfile already on the machine.

    A package installed from a pnpm store, or a type-only package that was
    never downloaded here, still has its hash recorded in some other project's
    lockfile. The hash is the same everywhere, so it can be reused.
    """
    found = {}
    pnpm_pattern = re.compile(
        r"^\s*'?([@a-z0-9._/-]+)@([0-9][^':]*?)'?:\s*$\n\s*resolution:\s*\{integrity:\s*(sha\d+-[^}]+)\}", re.M)
    for lockfile in sorted(Path.home().glob('**/pnpm-lock.yaml')):
        if '.cache' in lockfile.parts or 'node_modules' in lockfile.parts:
            continue
        try:
            text = lockfile.read_text(errors='ignore')
        except OSError:
            continue
        for name, version, integrity in pnpm_pattern.findall(text):
            found.setdefault((name, version.strip()), integrity)
    for lockfile in sorted(Path.home().glob('**/package-lock.json')):
        if 'node_modules' in lockfile.parts:
            continue
        try:
            document = json.loads(lockfile.read_text())
        except (OSError, ValueError):
            continue
        for key, entry in (document.get('packages') or {}).items():
            name = key.rsplit('node_modules/', 1)[-1]
            version = entry.get('version')
            integrity = entry.get('integrity')
            if name and version and integrity:
                found.setdefault((name, version), integrity)
    return found


def cached_packument(name):
    """The registry document for a package, if the npm cache holds it."""
    index = CACHE / 'index-v5'
    encoded = name.replace('/', '%2f')
    for path in index.rglob('*'):
        if not path.is_file():
            continue
        try:
            text = path.read_text(errors='ignore')
        except OSError:
            continue
        if encoded not in text:
            continue
        for blob in re.findall(r'\{.*\}', text):
            if f'registry.npmjs.org/{encoded}"' not in blob:
                continue
            try:
                entry = json.loads(blob)
            except ValueError:
                continue
            if entry.get('key', '').split('request-cache:')[-1] != f'https://registry.npmjs.org/{encoded}':
                continue
            digest = base64.b64decode(entry['integrity'][7:]).hex()
            body = CACHE / 'content-v2' / 'sha512' / digest[:2] / digest[2:4] / digest[4:]
            try:
                return json.loads(body.read_text())
            except (OSError, ValueError):
                return None
    return None


def version_key(version):
    parts = version.split('-')[0].split('.')
    numbers = [int(part) if part.isdigit() else 0 for part in parts[:3]]
    while len(numbers) < 3:
        numbers.append(0)
    return tuple(numbers)


def resolve_missing(merged, integrity_by_name):
    """Add the packages the tree needs but does not have installed.

    Their metadata comes from the cached registry document, or — for a
    type-only package that was never downloaded here — from another
    project's lockfile. Either way the lockfile ends up pinning an exact
    version and hash for every dependency.
    """
    added = []
    known_versions = {}
    for name, version in integrity_by_name:
        known_versions.setdefault(name, []).append(version)
    for _ in range(6):
        wanted = {}
        for key, entry in merged.items():
            if not key:
                continue
            for field in ('dependencies', 'optionalDependencies'):
                for name, spec in (entry.get(field) or {}).items():
                    wanted.setdefault(name, []).append(spec)
        missing = {name: specs for name, specs in wanted.items()
                   if 'node_modules/' + name not in merged}
        if not missing:
            break
        progressed = False
        for name, specs in sorted(missing.items()):
            document = cached_packument(name)
            chosen, meta = None, {}
            if document:
                versions = document.get('versions', {})
                for version in sorted(versions, key=version_key, reverse=True):
                    if all(_range_ok(version, spec) for spec in specs):
                        chosen, meta = version, versions[version]
                        break
            if chosen is None:
                for version in sorted(known_versions.get(name, []), key=version_key, reverse=True):
                    if all(_range_ok(version, spec) for spec in specs):
                        chosen = version
                        break
            if chosen is None:
                continue
            entry = {'version': chosen}
            for field in ('bin', 'engines', 'os', 'cpu', 'license', 'dependencies',
                          'peerDependencies', 'peerDependenciesMeta',
                          'optionalDependencies', 'funding', 'hasInstallScript'):
                if field in meta:
                    entry[field] = meta[field]
            dist = meta.get('dist', {})
            entry['resolved'] = dist.get('tarball', f'https://registry.npmjs.org/{name}/-/{name}-{chosen}.tgz')
            integrity = dist.get('integrity') or integrity_by_name.get((name, chosen))
            if integrity:
                entry['integrity'] = integrity
            entry['dev'] = True
            merged['node_modules/' + name] = entry
            added.append(f'{name}@{chosen}')
            progressed = True
        if not progressed:
            break
    return added


def _range_ok(version, spec):
    """A small semver check, enough for the caret and tilde ranges npm uses."""
    spec = (spec or '*').strip()
    if spec in ('', '*', 'x', 'latest'):
        return True
    for alternative in spec.split('||'):
        if all(_one(version, part) for part in alternative.split() if part):
            return True
    return False


def _one(version, part):
    def compare(left, right):
        a, b = version_key(left), version_key(right)
        return (a > b) - (a < b)

    if part.startswith('^'):
        base = part[1:].strip()
        major, minor, patch = version_key(base)
        if major > 0:
            return compare(version, base) >= 0 and compare(version, f'{major + 1}.0.0') < 0
        if minor > 0:
            return compare(version, base) >= 0 and compare(version, f'0.{minor + 1}.0') < 0
        return compare(version, base) >= 0 and compare(version, f'0.0.{patch + 1}') < 0
    if part.startswith('~'):
        base = part[1:].strip()
        major, minor, _ = version_key(base)
        return compare(version, base) >= 0 and compare(version, f'{major}.{minor + 1}.0') < 0
    for operator in ('>=', '<=', '>', '<', '='):
        if part.startswith(operator):
            target = part[len(operator):].strip()
            if operator == '>=':
                return compare(version, target) >= 0
            if operator == '<=':
                return compare(version, target) <= 0
            if operator == '>':
                return compare(version, target) > 0
            if operator == '<':
                return compare(version, target) < 0
            return compare(version, target) == 0
    if re.match(r'^[\d*]', part):
        if part.count('.') == 2 and '*' not in part:
            return compare(version, part) == 0
        return compare(version, part) >= 0
    return True


def visible_version(merged, package_path, name):
    """The version of `name` that a package at `package_path` would see."""
    parts = package_path.split('/node_modules/')
    while parts:
        candidate = '/node_modules/'.join(parts + [name]) if parts != [''] else 'node_modules/' + name
        candidate = candidate.lstrip('/')
        if candidate in merged:
            return merged[candidate].get('version'), candidate
        parts = parts[:-1]
    if 'node_modules/' + name in merged:
        return merged['node_modules/' + name].get('version'), 'node_modules/' + name
    return None, None


def resolve_nested(merged, integrity_by_name):
    """Add the nested copies a real resolver would create.

    Two packages can need different major versions of the same dependency.
    npm nests the second one; a flat tree would not satisfy both ranges.
    """
    known = {}
    for name, version in integrity_by_name:
        known.setdefault(name, []).append(version)
    added = []
    for _ in range(8):
        progress = False
        for key in list(merged):
            if not key:
                continue
            required = list((merged[key].get('dependencies') or {}).items())
            optional = list((merged[key].get('optionalDependencies') or {}).items())
            for name, spec in required + optional:
                version, path = visible_version(merged, key, name)
                if version is not None and _range_ok(version, spec):
                    continue
                nested = f'{key}/node_modules/{name}'
                if nested in merged:
                    continue
                chosen = None
                for candidate in sorted(known.get(name, []), key=version_key, reverse=True):
                    if _range_ok(candidate, spec):
                        chosen = candidate
                        break
                if chosen is None:
                    continue
                merged[nested] = {
                    'version': chosen,
                    'resolved': f'https://registry.npmjs.org/{name}/-/{name}-{chosen}.tgz',
                    'integrity': integrity_by_name.get((name, chosen)),
                    'dev': True,
                }
                added.append(f'{nested}@{chosen}')
                progress = True
        if not progress:
            break
    return added


def main():
    project = Path(sys.argv[1] if len(sys.argv) > 1 else 'frontend').resolve()
    node_modules = project / 'node_modules'
    lock_path = project / 'package-lock.json'
    lock = json.loads(lock_path.read_text())
    package = json.loads((project / 'package.json').read_text())

    integrity_by_name = cache_integrity()
    for key, value in local_lock_integrity().items():
        integrity_by_name.setdefault(key, value)
    installed = package_entries(node_modules)

    merged = dict(lock.get('packages', {}))
    for key, entry in installed.items():
        name = entry.get('name') or key.rsplit('node_modules/', 1)[-1]
        resolved = f'https://registry.npmjs.org/{name}/-/{name.rsplit("/", 1)[-1]}-{entry["version"]}.tgz'
        entry['resolved'] = resolved
        if (name, entry['version']) in integrity_by_name:
            entry['integrity'] = integrity_by_name[(name, entry['version'])]
        merged[key] = entry

    root = merged.get('', {})
    root['name'] = package['name']
    root['version'] = package['version']
    root['license'] = package.get('license', root.get('license', 'UNLICENSED'))
    root['dependencies'] = package.get('dependencies', {})
    root['devDependencies'] = package.get('devDependencies', {})
    merged[''] = root

    added = resolve_missing(merged, integrity_by_name)
    for name in added:
        print(f'  + {name} (from the cached registry document)')
    for name in resolve_nested(merged, integrity_by_name):
        print(f'  + {name} (nested copy)')

    lock['name'] = package['name']
    lock['version'] = package['version']
    lock['lockfileVersion'] = 3
    lock['requires'] = True
    lock['packages'] = {key: merged[key] for key in sorted(merged, key=lambda k: (k != '', k))}
    lock_path.write_text(json.dumps(lock, indent=2, ensure_ascii=False) + '\n')

    missing = [key for key, entry in merged.items()
               if key and 'integrity' not in entry and not entry.get('link')]
    print(f'{len(merged) - 1} entries written; {len(missing)} without an integrity hash')
    for key in missing[:10]:
        print('  ', key)


if __name__ == '__main__':
    main()
