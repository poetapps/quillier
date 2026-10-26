"""Side-by-side headline numbers for every results*.json. Run: .venv/bin/python compare.py"""
import glob
import json


def pct(n, d):
    return f'{100 * n / d:.0f}%'


def ent(pick):
    return pick == 'entity'


def headline(r):
    D = r['disambiguation']
    gold = [x['gold'] == 'entity' for x in D]
    row = {}
    row['names: plain'] = pct(sum(ent(x['plain']['pick']) == g for x, g in zip(D, gold)), len(D))
    row['names: marked+note'] = pct(sum(ent(x['marked']['pick']) == g for x, g in zip(D, gold)), len(D))
    row['names: yes/no'] = pct(sum((x['noul'] >= 0.5) == g for x, g in zip(D, gold)), len(D))
    row['names: rules+plain'] = pct(sum(((x['rules'][0] if x['rules'][1] != 'default' else ent(x['plain']['pick'])) == g)
                                        for x, g in zip(D, gold)), len(D))
    A = r['alias_resolve']
    row['alias: who is it'] = pct(sum(x['codex']['pick'] == x['gold'] for x in A), len(A))
    row['alias: who (+aliases)'] = pct(sum(x['codex_aliases']['pick'] == x['gold'] for x in A), len(A))
    S = r['alias_same']
    row['alias: same person'] = pct(sum((x['p'] >= 0.5) == x['gold'] for x in S), len(S))
    R = r['relationships']
    row['relation type'] = pct(sum(x['pick'] == x['gold'] for x in R), len(R))
    row['relation (reversed)'] = pct(sum(x['reversed']['pick'] == x['gold'] for x in R), len(R))
    Dr = r['direction']
    row['relation direction'] = pct(sum(x['pick'] == x['gold'] for x in Dr), len(Dr))
    Sp = r['speakers']
    row['who speaks'] = pct(sum(x['pick'] == x['gold'] for x in Sp), len(Sp))
    P = r['presence']
    row['present vs mentioned'] = pct(sum((x['p'] >= 0.5) == x['gold'] for x in P), len(P))
    lat = r['latency']
    row['median ms'] = f"{lat.get('median_ms', lat.get('single_ms_median')):.0f}"
    return row


files = sorted(glob.glob('results*.json'))
names = [f.replace('results-', '').replace('results', 'julia-1').replace('.json', '') or 'julia-1' for f in files]
rows = [headline(json.load(open(f))) for f in files]
keys = list(rows[0])
print('| task | ' + ' | '.join(names) + ' |')
print('|---|' + '---:|' * len(names))
for k in keys:
    print(f'| {k} | ' + ' | '.join(r[k] for r in rows) + ' |')
