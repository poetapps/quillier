from julia import load_model
import cases as C
from eval import mark
for mo in (True, False):
    e = load_model('../../models/julia-1', device='cpu', strict_encoding=True, max_length=8192, head_length=512, marker_only_head=mo)
    ok = 0
    for entity, target, occ, passage, gold in C.DISAMBIG:
        info = C.ENTITIES[entity]
        a = e.predict(state=info['note'] + '\n\n' + mark(passage, target, occ), questions={'q': dict(type='choice',
            instructions=f'In this passage, what does the bracketed word [{target}] refer to?', criteria=info['senses'])})['answers']['q']
        ok += (a['choice'] == 'entity') == (gold == 'entity')
    print('marker_only_head', mo, ok, '/', len(C.DISAMBIG))

def yn(state, s):
    return round(e.predict(state=state, questions={'q': dict(type='noul', instructions=s)})['answers']['q']['noul'], 2)
def ch(state, q, opts):
    a = e.predict(state=state, questions={'q': dict(type='choice', instructions=q, criteria=opts)})['answers']['q']
    return a['choice'], round(a['max_probability'], 2)
print('trivial yes/no (want T,F,T,F,T,F):')
print(' ', yn('Tom is Margaret\'s son.', 'Margaret is Tom\'s mother.'), yn('Tom is Margaret\'s son.', 'Margaret is Tom\'s daughter.'))
print(' ', yn('It is raining heavily outside.', 'The weather is wet.'), yn('It is raining heavily outside.', 'The weather is dry and sunny.'))
print(' ', yn({'invoice_total': 500, 'po_total': 500}, 'The invoice total matches the purchase order total.'), yn({'invoice_total': 500, 'po_total': 900}, 'The invoice total matches the purchase order total.'))
topics = {'sports': 'Sports', 'business': 'Business and finance', 'science': 'Science and technology', 'world': 'World news and politics'}
print('topic (want sports, business, science):')
for s in ['The striker scored twice in the final ten minutes to win the cup.', 'Shares in the bank fell 8% after it missed quarterly earnings estimates.', 'Researchers sequenced the genome of a deep-sea worm that survives without oxygen.']:
    print(' ', ch(s, 'What is this text about?', topics))
mood = {'tense': 'Tense, frightening or suspenseful', 'calm': 'Calm, peaceful or quiet', 'joyful': 'Happy, joyful or celebratory', 'sad': 'Sad, grieving or melancholy'}
print('scene mood (want tense, calm, joyful, sad):')
for s in ['Something scraped against the cellar door. Eleanor held her breath and reached, very slowly, for the knife.',
          'The sea was flat and silver. Gulls drifted overhead, and somewhere below decks a man was humming.',
          'The whole village danced in the square until dawn, laughing and spilling wine on the cobbles.',
          'Margaret folded her husband\'s shirts one last time and laid them in the trunk, and then she sat on the bed and wept.']:
    print(' ', ch(s, 'What is the mood of this scene?', mood))
