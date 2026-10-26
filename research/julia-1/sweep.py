"""Prompt-format sweep: give Julia-1 a fair shot with inputs shaped like its training data
(JSON state, sentence-style options, statement-style Boolean questions)."""
import json

from julia import load_model

import cases as C
from eval import mark, occurrences

engine = load_model('../../models/julia-1', device='cpu', strict_encoding=True, max_length=8192, head_length=512)


def choice(state, instructions, criteria):
    a = engine.predict(state=state, questions={'q': dict(type='choice', instructions=instructions, criteria=criteria)})['answers']['q']
    return a['choice'], a['max_probability']


def noul(state, statement, false, true):
    return engine.predict(state=state, questions={'q': dict(type='noul', instructions=statement,
                                                            criteria={'false': false, 'true': true})})['answers']['q']['noul']


# Sense descriptions that do not repeat the name itself (avoids pure word-overlap matching).
GENERIC = {
    'entity_character': "A person's name: it names a character in the story.",
    'entity_place': 'A place name: it names a town or city in the story.',
    'month': 'A month of the year (a date or time).',
    'season': 'A season of the year.',
    'word': 'An ordinary word, not a name (a verb, a common noun, or a title).',
    'place': 'A real-world place (a city, country or river), not the character.',
}


def generic_senses(entity):
    info = C.ENTITIES[entity]
    out = {'entity': GENERIC['entity_' + info['kind']]}
    for k in info['senses']:
        if k != 'entity':
            out[k] = GENERIC[k]
    return out


def disambiguation():
    variants = {k: [] for k in ('json_named', 'json_generic', 'json_generic_nonote', 'json_noul', 'json_noul_nonote')}
    for entity, target, occ, passage, gold in C.DISAMBIG:
        info = C.ENTITIES[entity]
        marked = mark(passage, target, occ)
        base = {'passage': marked, 'word': target, 'which_occurrence': 'the one in [brackets]'}
        with_note = {'story_notes': info['note'], **base}
        thing = 'the character' if info['kind'] == 'character' else 'the place'
        named = {k: ('It names ' + v) if k == 'entity' else 'It means ' + v for k, v in info['senses'].items()}
        g = gold == 'entity'
        pick, conf = choice(with_note, 'How is the bracketed word used in this passage?', named)
        variants['json_named'].append(((pick == 'entity') == g, conf, pick))
        pick, conf = choice(with_note, 'How is the bracketed word used in this passage?', generic_senses(entity))
        variants['json_generic'].append(((pick == 'entity') == g, conf, pick))
        pick, conf = choice(base, 'How is the bracketed word used in this passage?', generic_senses(entity))
        variants['json_generic_nonote'].append(((pick == 'entity') == g, conf, pick))
        statement = f'The bracketed word names {entity}, {thing} in the story.'
        false = 'The word is used in another sense here (a date, an ordinary word, or something else).'
        true = f'The word is the name of {thing} {entity}.'
        p = noul(with_note, statement, false, true)
        variants['json_noul'].append(((p >= 0.5) == g, max(p, 1 - p), p))
        p = noul(base, statement, false, true)
        variants['json_noul_nonote'].append(((p >= 0.5) == g, max(p, 1 - p), p))
    n = len(C.DISAMBIG)
    gold_entity = sum(g == 'entity' for *_, g in C.DISAMBIG)
    print(f'A. disambiguation  (n={n}, always-"entity" baseline {gold_entity}/{n})')
    for k, v in variants.items():
        said_entity = sum((x[2] == 'entity') if isinstance(x[2], str) else x[2] >= 0.5 for x in v)
        print(f'  {k:22} {sum(x[0] for x in v)}/{n}   said "entity" {said_entity}/{n}')
    return variants


def relationships():
    named = {k: v[0].upper() + v[1:] + '.' for k, v in C.RELATIONS.items()}
    ok = 0
    picks = []
    for a, b, passage, gold in C.RELATIONSHIPS:
        state = {'passage': passage, 'person_a': a, 'person_b': b}
        pick, conf = choice(state, 'How are person_a and person_b related, according to the passage?', named)
        ok += pick == gold
        picks.append(pick)
    print(f'B3. relationship JSON  {ok}/{len(C.RELATIONSHIPS)}   picks: {dict((p, picks.count(p)) for p in set(picks))}')
    # Binary per-relation checks: the most useful shape for an app ("is A B's parent?")
    checks = [
        ('Margaret had raised Tom alone since his father drowned.', 'Margaret is Tom\'s parent.', True),
        ('Margaret had raised Tom alone since his father drowned.', 'Tom is Margaret\'s parent.', False),
        ("Eleanor ruffled her little brother's hair. \"Tom, you're impossible.\"", 'Eleanor and Tom are siblings.', True),
        ("Eleanor ruffled her little brother's hair. \"Tom, you're impossible.\"", 'Eleanor and Tom are married.', False),
        ('Isabel and Reed had been married for three years, and the crew still gossiped about it.', 'Isabel and Reed are married.', True),
        ('Isabel and Reed had been married for three years, and the crew still gossiped about it.', 'Isabel and Reed are siblings.', False),
        ('Reed and Tom both reached for the rope at the same moment.', 'Reed and Tom are related by family.', False),
        ('Fenwick had taken Eleanor on as his apprentice when she was fifteen.', 'Fenwick taught Eleanor.', True),
        ('Fenwick had taken Eleanor on as his apprentice when she was fifteen.', 'Eleanor taught Fenwick.', False),
        ('Reed would have cheerfully thrown Fenwick overboard, and the feeling was entirely mutual.', 'Reed and Fenwick dislike each other.', True),
        ('Reed would have cheerfully thrown Fenwick overboard, and the feeling was entirely mutual.', 'Reed and Fenwick are friends.', False),
        ("Tom and Isabel had split up last winter and hadn't spoken since.", 'Tom and Isabel are currently a couple.', False),
        ("Tom and Isabel had split up last winter and hadn't spoken since.", 'Tom and Isabel used to be a couple.', True),
        ('Silas came home to his wife, Margaret, every evening at six.', 'Silas and Margaret are married.', True),
        ('Silas came home to his wife, Margaret, every evening at six.', 'Silas is Margaret\'s son.', False),
        ('Margaret paid Isabel two shillings a week to scrub the kitchen floors.', 'Margaret employs Isabel.', True),
        ('Margaret paid Isabel two shillings a week to scrub the kitchen floors.', 'Isabel employs Margaret.', False),
        ('Eleanor and Isabel had shared every secret since they were girls in the same village.', 'Eleanor and Isabel are close friends.', True),
        ('Eleanor and Isabel had shared every secret since they were girls in the same village.', 'Eleanor and Isabel are enemies.', False),
        ('"I\'m ashamed of you," Crane told his daughter. Isabel said nothing.', 'Crane is Isabel\'s father.', True),
    ]
    ok = 0
    rows = []
    for passage, statement, gold in checks:
        p = noul({'passage': passage}, statement, 'The passage does not support this statement.', 'The passage supports this statement.')
        ok += (p >= 0.5) == gold
        rows.append((gold, round(p, 2), statement))
    print(f'B3c. relationship yes/no statements  {ok}/{len(checks)}  (half are true)')
    for r in rows:
        print('    ', 'OK' if (r[1] >= 0.5) == r[0] else 'XX', r)


def aliases():
    ok = 0
    for alias, person, passage, gold in C.ALIAS_SAME:
        p = noul({'passage': passage}, f'"{alias}" and "{person}" are two names for the same person.',
                 'They are two different people.', 'Both names refer to one person.')
        ok += (p >= 0.5) == gold
    print(f'B2. same-person JSON  {ok}/{len(C.ALIAS_SAME)}')
    ok = 0
    for mention, passage, gold in C.ALIAS_RESOLVE:
        cast = {n: f'{n}.' for n in C.CAST}
        cast['other'] = 'Someone who is not one of the listed characters.'
        state = {'characters': C.CODEX_ALIASES.split('\n')[1:], 'passage': passage, 'mention': mention}
        pick, conf = choice(state, 'Which character does the mention refer to?', cast)
        ok += pick == ('other' if gold == C.OTHER else gold)
    print(f'B1. alias resolve JSON (+aliases)  {ok}/{len(C.ALIAS_RESOLVE)}  (chance ~1/8)')


def speakers():
    ok = 0
    for passage, line, names, gold in C.SPEAKERS:
        state = {'scene': passage, 'line': line}
        pick, conf = choice(state, 'Which character speaks this line of dialogue?', {n: f'{n} says it.' for n in names})
        ok += pick == gold
    print(f'B4. speakers JSON  {ok}/{len(C.SPEAKERS)}  (chance ~40%)')


def presence():
    ok = 0
    for person, passage, gold in C.PRESENCE:
        p = noul({'scene': passage, 'character': person}, f'{person} is physically present in this scene.',
                 f'{person} is only mentioned, remembered, or imagined.', f'{person} is physically there and taking part.')
        ok += (p >= 0.5) == gold
    print(f'B5. presence JSON  {ok}/{len(C.PRESENCE)}')


if __name__ == '__main__':
    v = disambiguation()
    json.dump({k: [list(x) for x in val] for k, val in v.items()}, open('sweep_disambiguation.json', 'w'))
    aliases()
    relationships()
    speakers()
    presence()
