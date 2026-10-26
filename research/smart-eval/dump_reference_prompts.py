"""Record every chat the research harness (eval.py, BACKEND=llm-fewshot) sends to Ollama, without
calling Ollama, so the Node harness can check its prompts are byte-identical.
Run: python3 dump_reference_prompts.py  ->  reference_prompts.json"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'julia-1'))
os.environ['BACKEND'] = 'llm-fewshot'

import llm_fewshot  # noqa: E402
import eval as E  # noqa: E402

captured = []


def fake_post(body):
    captured.append(body['messages'])
    return {'logprobs': [{'top_logprobs': [{'token': 'A', 'logprob': 0.0}]}], 'total_duration': 0,
            'message': {'content': 'A'}}


llm_fewshot._original_post = fake_post
E.run_disambiguation()
E.run_alias_resolve()
E.run_alias_same()
E.run_relationships()
E.run_direction()
E.run_speakers()
E.run_presence()
with open(os.path.join(HERE, 'reference_prompts.json'), 'w') as f:
    json.dump(captured, f, ensure_ascii=False)
print(len(captured), 'chats recorded')
