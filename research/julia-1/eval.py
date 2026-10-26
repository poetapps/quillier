"""Evaluate Julia-1 on Draftwell entity questions. Run: .venv/bin/python eval.py"""
import json
import re
import statistics
import time

import os

import cases as C

# BACKEND=julia (default) or BACKEND=llm MODEL=qwen3.5:0.8b
BACKEND = os.environ.get('BACKEND', 'julia')
latencies = []

if BACKEND == 'julia':
    from julia import load_model
    engine = load_model('../../models/julia-1', device='cpu', strict_encoding=True, max_length=8192, head_length=512)

    def ask(state, questions):
        t = time.perf_counter()
        result = engine.predict(state=state, questions=questions)['answers']
        latencies.append((time.perf_counter() - t) * 1000 / len(questions))
        return result

    def choice(state, instructions, criteria):
        a = ask(state, {'q': dict(type='choice', instructions=instructions, criteria=criteria)})['q']
        return a['choice'], a['max_probability'], a['probabilities']

    def noul(state, instructions, false, true):
        a = ask(state, {'q': dict(type='noul', instructions=instructions, criteria={'false': false, 'true': true})})['q']
        return a['noul']
else:
    import llm
    if BACKEND == 'llm-fewshot':
        import llm_fewshot as backend
    else:
        backend = llm

    def choice(state, instructions, criteria):
        pick, conf, probs, ms = backend.choice(state, instructions, criteria)
        latencies.append(ms)
        return pick, conf, probs

    def noul(state, instructions, false, true):
        p, ms = backend.noul(state, instructions, false, true)
        latencies.append(ms)
        return p


def reverse(d):
    return dict(reversed(list(d.items())))


# ---------------------------------------------------------------- rules baseline

MONTHS = {'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
          'October', 'November', 'December'}
SEASONS = {'Spring', 'Summer', 'Autumn', 'Fall', 'Winter'}
MODALS = {'May', 'Will', 'Can', 'Shall', 'Must', 'Might'}
SUBJECTS = {'i', 'we', 'you', 'he', 'she', 'they', 'it', 'the', 'this', 'that', 'there'}
TIME_PREP = {'in', 'of', 'early', 'late', 'mid', 'since', 'until', 'till', 'by', 'last', 'next', 'this',
             'every', 'through', 'during', 'throughout'}
SPEECH = {'said', 'asked', 'replied', 'whispered', 'called', 'shouted', 'told', 'muttered', 'cried', 'snapped'}


def occurrences(target, passage):
    return [m.start() for m in re.finditer(rf'(?<![A-Za-z]){re.escape(target)}(?![A-Za-z])', passage)]


def rules(entity, target, occ, passage):
    """Returns (is_entity, rule_name). rule_name 'default' means no rule was confident."""
    start = occurrences(target, passage)[occ]
    before, after = passage[:start], passage[start + len(target):]
    prev = (re.findall(r"[A-Za-z']+", before) or [''])[-1].lower()
    nxt = (re.findall(r"[A-Za-z']+|\d+", after) or [''])[0]
    sentence_start = not before.strip() or before.rstrip()[-1] in '.!?"“—'
    if target.islower():
        return False, 'lowercase'
    if nxt.isdigit():
        return False, 'date'
    if (entity in MONTHS or entity in SEASONS) and prev in TIME_PREP:
        return False, 'time-preposition'
    if after.startswith("'s"):
        return True, 'possessive'
    if prev in SPEECH or nxt.lower() in SPEECH:
        return True, 'speech-tag'
    if re.match(r'\s*[?!,]', after) and not sentence_start:
        return True, 'vocative'
    if sentence_start and entity in MODALS and nxt.lower() in SUBJECTS:
        return False, 'modal-question'
    if not sentence_start:
        return True, 'mid-sentence-capital'
    return True, 'default'


# ---------------------------------------------------------------- A. disambiguation

def mark(passage, target, occ):
    start = occurrences(target, passage)[occ]
    return passage[:start] + '[' + target + ']' + passage[start + len(target):]


def run_disambiguation():
    rows = []
    for entity, target, occ, passage, gold in C.DISAMBIG:
        info = C.ENTITIES[entity]
        senses = info['senses']
        multi = len(occurrences(target, passage)) > 1
        variants = {
            'plain': (passage, f'In this passage, what does the word "{target}" refer to?'),
            'codex': (info['note'] + '\n\n' + passage, f'In this passage, what does the word "{target}" refer to?'),
            'marked': (info['note'] + '\n\n' + mark(passage, target, occ),
                       f'In this passage, what does the bracketed word [{target}] refer to?'),
        }
        row = dict(entity=entity, target=target, occ=occ, passage=passage, gold=gold, multi=multi)
        for name, (state, question) in variants.items():
            pick, conf, probs = choice(state, question, senses)
            row[name] = dict(pick=pick, conf=conf, probs=probs)
        state, question = variants['marked']
        pick, conf, _ = choice(state, question, reverse(senses))
        row['marked_reversed'] = dict(pick=pick, conf=conf)
        thing = 'the character' if info['kind'] == 'character' else 'the place'
        p = noul(variants['marked'][0],
                 f'Does the bracketed word [{target}] refer to {entity}, {thing} in the story?',
                 'No, here it means something else (an ordinary word, a date, a season, or a different place or person)',
                 f'Yes, it refers to {senses["entity"]}')
        row['noul'] = p
        row['rules'] = rules(entity, target, occ, passage)
        rows.append(row)
    return rows


# ---------------------------------------------------------------- B. aliases & relationships

def cast_options(names, other=True):
    opts = {n: n for n in names}
    if other:
        opts['other'] = C.OTHER
    return opts


def run_alias_resolve():
    rows = []
    for mention, passage, gold in C.ALIAS_RESOLVE:
        gold_id = 'other' if gold == C.OTHER else gold
        row = dict(mention=mention, passage=passage, gold=gold_id)
        opts = cast_options(C.CAST)
        q = f'In the passage, who does "{mention}" refer to?'
        for name, codex in (('codex', C.CODEX), ('codex_aliases', C.CODEX_ALIASES)):
            pick, conf, _ = choice(codex + '\n\nPassage:\n' + passage, q, opts)
            row[name] = dict(pick=pick, conf=conf)
        pick, conf, _ = choice(C.CODEX + '\n\nPassage:\n' + passage, q, reverse(opts))
        row['codex_reversed'] = dict(pick=pick, conf=conf)
        rows.append(row)
    return rows


def run_alias_same():
    rows = []
    for alias, person, passage, gold in C.ALIAS_SAME:
        p = noul(passage, f'Based on this passage, are "{alias}" and "{person}" the same person?',
                 'No, they are two different people', 'Yes, both names refer to the same person')
        rows.append(dict(alias=alias, person=person, passage=passage, gold=gold, p=p))
    return rows


def run_relationships():
    rows = []
    for a, b, passage, gold in C.RELATIONSHIPS:
        q = f'What is the relationship between {a} and {b} in this passage?'
        pick, conf, probs = choice(passage, q, C.RELATIONS)
        rpick, rconf, _ = choice(passage, q, reverse(C.RELATIONS))
        top3 = sorted(probs, key=probs.get, reverse=True)[:3]
        rows.append(dict(a=a, b=b, passage=passage, gold=gold, pick=pick, conf=conf, top3=top3,
                         reversed=dict(pick=rpick, conf=rconf)))
    return rows


def run_direction():
    rows = []
    for question, names, passage, gold in C.DIRECTION:
        opts = {n: n for n in names}
        pick, conf, _ = choice(passage, question, opts)
        rpick, rconf, _ = choice(passage, question, reverse(opts))
        rows.append(dict(question=question, passage=passage, gold=gold, pick=pick, conf=conf,
                         reversed=dict(pick=rpick, conf=rconf)))
    return rows


def run_speakers():
    rows = []
    for passage, line, names, gold in C.SPEAKERS:
        opts = {n: n for n in names}
        q = f'Who speaks the line "{line}"?'
        pick, conf, _ = choice(passage, q, opts)
        rpick, rconf, _ = choice(passage, q, reverse(opts))
        rows.append(dict(line=line, gold=gold, pick=pick, conf=conf, reversed=dict(pick=rpick, conf=rconf)))
    return rows


def run_presence():
    rows = []
    for person, passage, gold in C.PRESENCE:
        p = noul(passage, f'Is {person} physically present in this scene (not just mentioned, remembered, or imagined)?',
                 f'{person} is only mentioned, remembered, or imagined', f'{person} is physically there in the scene')
        rows.append(dict(person=person, passage=passage, gold=gold, p=p))
    return rows


# ---------------------------------------------------------------- latency

def run_latency():
    info = C.ENTITIES['May']
    state = info['note'] + '\n\n' + mark('May had been crying; her eyes were red.', 'May', 0)
    q = dict(type='choice', instructions='In this passage, what does the bracketed word [May] refer to?',
             criteria=info['senses'])
    single = []
    for _ in range(30):
        t = time.perf_counter()
        engine.predict(state=state, questions={'q': q})
        single.append((time.perf_counter() - t) * 1000)
    rows = [dict(state=state, question=q['instructions'], options=list(q['criteria'].values()), type='choice')] * 64
    t = time.perf_counter()
    engine.logits(rows)
    batched = (time.perf_counter() - t) * 1000 / 64
    long_state = info['note'] + '\n\n' + ' '.join(['The rain kept falling on the orchard all afternoon.'] * 40) + \
        ' ' + mark('May had been crying; her eyes were red.', 'May', 0)
    para = []
    for _ in range(10):
        t = time.perf_counter()
        engine.predict(state=long_state, questions={'q': q})
        para.append((time.perf_counter() - t) * 1000)
    return dict(single_ms_median=statistics.median(single), batched_ms_per_question=batched,
                long_paragraph_ms_median=statistics.median(para),
                long_paragraph_tokens=len(engine.tokenizer(long_state)['input_ids']))


if __name__ == '__main__':
    t0 = time.time()
    out = dict(
        disambiguation=run_disambiguation(),
        alias_resolve=run_alias_resolve(),
        alias_same=run_alias_same(),
        relationships=run_relationships(),
        direction=run_direction(),
        speakers=run_speakers(),
        presence=run_presence(),
    )
    if BACKEND == 'julia':
        out['latency'] = run_latency()
        name = 'results.json'
    else:
        out['latency'] = dict(model=llm.MODEL, think=llm.THINK, median_ms=statistics.median(latencies),
                              p90_ms=sorted(latencies)[int(len(latencies) * 0.9)], questions=len(latencies))
        name = f'results-{llm.MODEL.replace(":", "-")}{"-think" if llm.THINK else ""}{"-fewshot" if BACKEND == "llm-fewshot" else ""}.json'
    out['wall_seconds'] = time.time() - t0
    with open(name, 'w') as f:
        json.dump(out, f, indent=1)
    print('done in', round(out['wall_seconds'], 1), 's')
