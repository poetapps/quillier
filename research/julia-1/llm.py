"""Local LLM backend (Ollama) with the same choice/noul interface as Julia-1.

Asks for a single option letter and reads the first token's top log-probabilities, so each
answer comes with a probability spread over the options (one short decode, no free text).
"""
import json
import math
import os
import string
import urllib.request

MODEL = os.environ.get('MODEL', 'qwen3.5:0.8b')
THINK = os.environ.get('THINK') == '1'
URL = 'http://localhost:11434/api/chat'

SYSTEM = ('You are a careful reader helping a novelist keep track of their story. '
          'Read the passage and answer the question by choosing exactly one option. '
          'Base your answer only on the text you are given.')


def _render(state):
    if isinstance(state, str):
        return state
    return json.dumps(state, ensure_ascii=False, indent=1)


def _post(body):
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=600) as r:
        return json.load(r)


def _letters(n):
    return list(string.ascii_uppercase[:n])


def ask(state, question, descriptions):
    letters = _letters(len(descriptions))
    options = '\n'.join(f'{l}) {d}' for l, d in zip(letters, descriptions))
    prompt = f'{_render(state)}\n\nQuestion: {question}\n\nOptions:\n{options}\n\nAnswer with only the letter of the best option.'
    body = dict(model=MODEL, stream=False, think=THINK, logprobs=True, top_logprobs=20,
                messages=[dict(role='system', content=SYSTEM), dict(role='user', content=prompt)],
                options=dict(temperature=0, presence_penalty=0, num_predict=4096 if THINK else 1))
    r = _post(body)
    mass = dict.fromkeys(letters, 0.0)
    # With thinking on, the logprobs cover the reasoning too, so fall back to the final text.
    for pos in ([] if THINK else (r.get('logprobs') or [])[:1]):
        for t in pos.get('top_logprobs', []):
            tok = t['token'].strip().rstrip(')').strip()
            if tok in mass:
                mass[tok] += math.exp(t['logprob'])
    total = sum(mass.values())
    if total == 0:
        text = r['message']['content'].strip()
        pick = next((l for l in letters if text.startswith(l)), letters[0])
        probs = [1.0 if l == pick else 0.0 for l in letters]
    else:
        probs = [mass[l] / total for l in letters]
    return probs, r.get('total_duration', 0) / 1e6


def choice(state, instructions, criteria):
    keys = list(criteria)
    probs, ms = ask(state, instructions, list(criteria.values()))
    best = max(range(len(keys)), key=probs.__getitem__)
    return keys[best], probs[best], dict(zip(keys, probs)), ms


def noul(state, instructions, false, true):
    probs, ms = ask(state, instructions, [false, true])
    return probs[1], ms
