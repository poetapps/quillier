"""Export research/julia-1/cases.py to cases.json for the Node harness. Run: python3 export_cases.py"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'julia-1'))
import cases as C  # noqa: E402

# Structured cast parsed from CODEX_ALIASES (the harness re-renders it and checks it matches).
cast = []
for line in C.CODEX_ALIASES.split('\n')[1:]:
    m = re.match(r'- (.+?) \(also called (.+?)\): (.+)$', line)
    cast.append(dict(name=m.group(1), aliases=m.group(2).split(', '), note=m.group(3)))
assert [c['name'] for c in cast] == C.CAST

out = dict(
    ENTITIES=C.ENTITIES,
    DISAMBIG=C.DISAMBIG,
    CAST=C.CAST,
    CAST_STRUCTURED=cast,
    OTHER=C.OTHER,
    CODEX=C.CODEX,
    CODEX_ALIASES=C.CODEX_ALIASES,
    ALIAS_RESOLVE=C.ALIAS_RESOLVE,
    ALIAS_SAME=C.ALIAS_SAME,
    RELATIONS=C.RELATIONS,
    RELATIONSHIPS=C.RELATIONSHIPS,
    DIRECTION=C.DIRECTION,
    SPEAKERS=C.SPEAKERS,
    PRESENCE=C.PRESENCE,
)
with open(os.path.join(HERE, 'cases.json'), 'w') as f:
    json.dump(out, f, indent=1, ensure_ascii=False)
print({k: len(v) for k, v in out.items() if isinstance(v, (list, dict))})
