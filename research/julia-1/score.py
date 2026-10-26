"""Summarise results.json. Run: .venv/bin/python score.py"""
import json
import sys

r = json.load(open(sys.argv[1] if len(sys.argv) > 1 else 'results.json'))


def pct(n, d):
    return f'{n}/{d} ({100 * n / d:.0f}%)' if d else '-'


def calib(pairs, cut):
    kept = [ok for ok, conf in pairs if conf >= cut]
    return f'conf>={cut}: {pct(sum(kept), len(kept))} correct, covers {pct(len(kept), len(pairs))}'


print('=== A. Disambiguation (is this word the codex entity?) ===')
D = r['disambiguation']
n = len(D)
for v in ('plain', 'codex', 'marked'):
    sense = sum(x[v]['pick'] == x['gold'] for x in D)
    binary = sum((x[v]['pick'] == 'entity') == (x['gold'] == 'entity') for x in D)
    print(f'{v:8} exact sense {pct(sense, n)} | entity-vs-not {pct(binary, n)}')
noul = sum((x['noul'] >= 0.5) == (x['gold'] == 'entity') for x in D)
print(f'noul     entity-vs-not {pct(noul, n)}')
consistent = sum(x['marked']['pick'] == x['marked_reversed']['pick'] for x in D)
print(f'marked: same answer with options reversed {pct(consistent, n)}')
rules = sum(x['rules'][0] == (x['gold'] == 'entity') for x in D)
print(f'rules    entity-vs-not {pct(rules, n)}')
fired = [x for x in D if x['rules'][1] != 'default']
print(f'rules confident on {pct(len(fired), n)}; correct there {pct(sum(x["rules"][0] == (x["gold"] == "entity") for x in fired), len(fired))}')
hybrid = sum(((x['rules'][0] if x['rules'][1] != 'default' else x['marked']['pick'] == 'entity') == (x['gold'] == 'entity')) for x in D)
print(f'hybrid (rules, else model) entity-vs-not {pct(hybrid, n)}')
lower = [x for x in D if x['target'][0].isupper() and not x['target'].isupper()]
amb = [x for x in lower if x['rules'][1] == 'default']
print(f'hard subset (capitalised, no rule fired): model {pct(sum((x["marked"]["pick"] == "entity") == (x["gold"] == "entity") for x in amb), len(amb))}, rules {pct(sum(x["rules"][0] == (x["gold"] == "entity") for x in amb), len(amb))}')
print(calib([((x['marked']['pick'] == 'entity') == (x['gold'] == 'entity'), x['marked']['conf']) for x in D], 0.8))
print(calib([((x['marked']['pick'] == 'entity') == (x['gold'] == 'entity'), x['marked']['conf']) for x in D], 0.9))
print('\nMisses (marked variant):')
for x in D:
    if (x['marked']['pick'] == 'entity') != (x['gold'] == 'entity'):
        print(f'  [{x["entity"]}] gold={x["gold"]:6} got={x["marked"]["pick"]:6} conf={x["marked"]["conf"]:.2f} rules={"entity" if x["rules"][0] else "other"}({x["rules"][1]})  {x["passage"]}')
print('Rules misses:')
for x in D:
    if x['rules'][0] != (x['gold'] == 'entity'):
        print(f'  [{x["entity"]}] gold={x["gold"]:6} rule={x["rules"][1]:22} model={x["marked"]["pick"]}  {x["passage"]}')

print('\n=== B1. Alias resolution (who does this mention refer to?) ===')
A = r['alias_resolve']
for v in ('codex', 'codex_aliases', 'codex_reversed'):
    print(f'{v:15} {pct(sum(x[v]["pick"] == x["gold"] for x in A), len(A))}')
print(f'order-consistent {pct(sum(x["codex"]["pick"] == x["codex_reversed"]["pick"] for x in A), len(A))}')
for x in A:
    if x['codex']['pick'] != x['gold'] or x['codex_aliases']['pick'] != x['gold']:
        print(f'  "{x["mention"]}" gold={x["gold"]} | codex={x["codex"]["pick"]} ({x["codex"]["conf"]:.2f}) | +aliases={x["codex_aliases"]["pick"]} ({x["codex_aliases"]["conf"]:.2f})')

print('\n=== B2. Same person? (noul) ===')
S = r['alias_same']
print(pct(sum((x['p'] >= 0.5) == x['gold'] for x in S), len(S)))
for x in S:
    print(f'  {"OK " if (x["p"] >= 0.5) == x["gold"] else "XX "} p={x["p"]:.2f} gold={x["gold"]!s:5} "{x["alias"]}" = "{x["person"]}"  {x["passage"]}')

print('\n=== B3. Relationship type (11 options) ===')
R = r['relationships']
print(f'top-1 {pct(sum(x["pick"] == x["gold"] for x in R), len(R))} | top-3 {pct(sum(x["gold"] in x["top3"] for x in R), len(R))} | reversed {pct(sum(x["reversed"]["pick"] == x["gold"] for x in R), len(R))} | order-consistent {pct(sum(x["pick"] == x["reversed"]["pick"] for x in R), len(R))}')
print(calib([(x['pick'] == x['gold'], x['conf']) for x in R], 0.5))
for x in R:
    print(f'  {"OK " if x["pick"] == x["gold"] else "XX "} {x["a"]}-{x["b"]}: gold={x["gold"]:9} got={x["pick"]:9} ({x["conf"]:.2f}) rev={x["reversed"]["pick"]}')

print('\n=== B3b. Direction (who is the parent/boss?) ===')
Dr = r['direction']
print(f'{pct(sum(x["pick"] == x["gold"] for x in Dr), len(Dr))} | reversed {pct(sum(x["reversed"]["pick"] == x["gold"] for x in Dr), len(Dr))}')
for x in Dr:
    print(f'  {"OK " if x["pick"] == x["gold"] else "XX "} {x["question"]} gold={x["gold"]} got={x["pick"]} ({x["conf"]:.2f}) rev={x["reversed"]["pick"]}')

print('\n=== B4. Speaker attribution ===')
Sp = r['speakers']
print(f'{pct(sum(x["pick"] == x["gold"] for x in Sp), len(Sp))} | reversed {pct(sum(x["reversed"]["pick"] == x["gold"] for x in Sp), len(Sp))}')
for x in Sp:
    print(f'  {"OK " if x["pick"] == x["gold"] else "XX "} "{x["line"]}" gold={x["gold"]} got={x["pick"]} ({x["conf"]:.2f}) rev={x["reversed"]["pick"]}')

print('\n=== B5. Present in scene vs only mentioned (noul) ===')
P = r['presence']
print(pct(sum((x['p'] >= 0.5) == x['gold'] for x in P), len(P)))
for x in P:
    print(f'  {"OK " if (x["p"] >= 0.5) == x["gold"] else "XX "} p={x["p"]:.2f} gold={x["gold"]!s:5} {x["person"]}: {x["passage"]}')

print('\n=== Latency (CPU, this Mac) ===')
print(json.dumps(r['latency'], indent=1))
