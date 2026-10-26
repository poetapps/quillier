"""Extra name-disambiguation variant: bracket the exact occurrence, but leave out the codex note
(the note primed models toward "character"). Run: MODEL=qwen3.5:4b [FEWSHOT=1] .venv/bin/python names_variants.py"""
import os

import cases as C
import llm
from eval import mark

if os.environ.get('FEWSHOT') == '1':
    import llm_fewshot as backend
else:
    backend = llm

ok = 0
misses = []
for entity, target, occ, passage, gold in C.DISAMBIG:
    senses = C.ENTITIES[entity]['senses']
    pick, conf, _, _ = backend.choice(mark(passage, target, occ),
                                      f'In this passage, what does the bracketed word [{target}] refer to?', senses)
    right = (pick == 'entity') == (gold == 'entity')
    ok += right
    if not right:
        misses.append(f'  {gold:6} got {pick:6} ({conf:.2f})  {passage}')
print(f'{llm.MODEL}{" fewshot" if backend is not llm else ""}: brackets, no note  {ok}/{len(C.DISAMBIG)}')
print('\n'.join(misses))
