"""The environment claim is checked, not merely written in a document.

If the declared Python floor or the pinned dependency versions drift, this
fails instead of the documentation quietly becoming wrong.
"""
import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
DECLARED_FLOOR = (3, 12)


def declared_floor():
    text = (ROOT / 'pyproject.toml').read_text()
    match = re.search(r'requires-python\s*=\s*">=([0-9]+)\.([0-9]+)', text)
    assert match, 'pyproject.toml must declare requires-python'
    return int(match.group(1)), int(match.group(2))


def test_running_interpreter_meets_the_declared_floor():
    assert sys.version_info[:2] >= DECLARED_FLOOR, (
        f'Python {sys.version_info.major}.{sys.version_info.minor} is below the declared floor '
        f'{DECLARED_FLOOR[0]}.{DECLARED_FLOOR[1]}')
    assert sys.version_info[:2] >= declared_floor()


def test_installed_dependency_versions_match_the_pins():
    from importlib.metadata import version
    pins = {}
    for line in (ROOT / 'requirements.txt').read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '==' not in line:
            continue
        name, _, wanted = line.partition('==')
        pins[name.strip().lower()] = wanted.strip()
    for name, wanted in pins.items():
        installed = version(name)
        assert installed == wanted, f'{name}: installed {installed}, pinned {wanted}'


def test_the_python_39_candidate_lane_is_marked_as_unverified():
    text = (ROOT / 'requirements-py39-candidate.txt').read_text()
    assert 'NOT VERIFIED' in text
    assert '3.12+' in text, 'the deviation must point at the supported lane'


def test_the_source_parses_on_the_oldest_declared_syntax():
    """No syntax newer than the assignment floor may creep into the source."""
    import ast
    for path in sorted((ROOT / 'fiberlab').glob('*.py')):
        source = path.read_text()
        ast.parse(source, feature_version=(3, 9))
