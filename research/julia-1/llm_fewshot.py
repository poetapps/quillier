"""Few-shot variant of llm.py: prepends 3-4 worked examples for the task being asked.

The examples use names and sentences that do not appear in cases.py.
"""
import llm

# Each example: (state, question, options, answer letter)
EXAMPLES = {
    'names': [
        ('June knelt beside the fire and fed it another log.', 'In this passage, what does the word "June" refer to?',
         ['June, a character in the story (a person)', 'the month of June'], 'A'),
        ('The wedding is set for the second week of June.', 'In this passage, what does the word "June" refer to?',
         ['June, a character in the story (a person)', 'the month of June'], 'B'),
        ('"Faith is all we have left now," the priest said.', 'In this passage, what does the word "Faith" refer to?',
         ['Faith, a character in the story (a person)', 'the ordinary word "faith" (belief or trust)'], 'B'),
        ('Faith slammed the door behind her and ran.', 'In this passage, what does the word "Faith" refer to?',
         ['Faith, a character in the story (a person)', 'the ordinary word "faith" (belief or trust)'], 'A'),
    ],
    'resolve': [
        ('Characters in this story:\n- Ada Lowe: a lighthouse keeper.\n- Ben Lowe: Ada\'s grown son, a fisherman.\n- Clara Finch: the village schoolteacher.\n\n'
         'Passage:\nThe keeper climbed the stairs at dusk to light the lamp.', 'In the passage, who does "The keeper" refer to?',
         ['Ada Lowe', 'Ben Lowe', 'Clara Finch', 'someone else (not one of these characters)'], 'A'),
        ('Characters in this story:\n- Ada Lowe: a lighthouse keeper.\n- Ben Lowe: Ada\'s grown son, a fisherman.\n- Clara Finch: the village schoolteacher.\n\n'
         'Passage:\nClara waved to Ada. She was carrying a basket of eggs up the cliff path.', 'In the passage, who does "She" refer to?',
         ['Ada Lowe', 'Ben Lowe', 'Clara Finch', 'someone else (not one of these characters)'], 'C'),
    ],
    'same': [
        ('Clara and the teacher walked home together.', 'Based on this passage, are "Clara" and "the teacher" the same person?',
         ['No, they are two different people', 'Yes, both names refer to the same person'], 'A'),
        ('Benjamin, whom everyone called Ben, mended nets on the quay.', 'Based on this passage, are "Ben" and "Benjamin" the same person?',
         ['No, they are two different people', 'Yes, both names refer to the same person'], 'B'),
    ],
    'relation': [
        ("Ada's son Ben wrote home every Sunday.", 'What is the relationship between Ada and Ben in this passage?', None, 'parent'),
        ('Clara and Ben had grown up in the same orphanage and trusted each other completely.',
         'What is the relationship between Clara and Ben in this passage?', None, 'friends'),
        ('Ben had loved Clara once, but she left him for a sailor years ago.',
         'What is the relationship between Ben and Clara in this passage?', None, 'former'),
        ('Ada and Clara passed each other on the cliff path without a word.',
         'What is the relationship between Ada and Clara in this passage?', None, 'none'),
    ],
    'speaker': [
        ('Ada set down the lamp.\n"Is it him?" Clara asked.\n"I can\'t tell from here."\n"Then go and look."',
         'Who speaks the line "I can\'t tell from here."?', ['Ada', 'Clara'], 'A'),
        ('Ada set down the lamp.\n"Is it him?" Clara asked.\n"I can\'t tell from here."\n"Then go and look."',
         'Who speaks the line "Then go and look."?', ['Ada', 'Clara'], 'B'),
    ],
    'presence': [
        ('Ada wondered what Ben was doing in the city tonight.',
         'Is Ben physically present in this scene (not just mentioned, remembered, or imagined)?',
         ['Ben is only mentioned, remembered, or imagined', 'Ben is physically there in the scene'], 'A'),
        ('Ben poured Ada a cup of tea and sat down across from her.',
         'Is Ada physically present in this scene (not just mentioned, remembered, or imagined)?',
         ['Ada is only mentioned, remembered, or imagined', 'Ada is physically there in the scene'], 'B'),
    ],
}


def task_of(question):
    q = question.lower()
    if 'relationship between' in q:
        return 'relation'
    if 'physically present' in q:
        return 'presence'
    if 'speaks the line' in q:
        return 'speaker'
    if 'same person' in q:
        return 'same'
    if q.startswith('in the passage, who does'):
        return 'resolve'
    if 'refer to' in q:
        return 'names'
    return None


def _prompt(state, question, descriptions):
    letters = llm._letters(len(descriptions))
    options = '\n'.join(f'{l}) {d}' for l, d in zip(letters, descriptions))
    return f'{llm._render(state)}\n\nQuestion: {question}\n\nOptions:\n{options}\n\nAnswer with only the letter of the best option.'


def messages_for(state, question, descriptions):
    msgs = [dict(role='system', content=llm.SYSTEM)]
    task = task_of(question)
    for ex_state, ex_q, ex_opts, ex_answer in EXAMPLES.get(task, []):
        if ex_opts is None:  # relationship examples share the test's option list
            ex_opts = descriptions
            ex_answer = llm._letters(len(descriptions))[list(_RELATION_KEYS).index(ex_answer)]
        msgs += [dict(role='user', content=_prompt(ex_state, ex_q, ex_opts)), dict(role='assistant', content=ex_answer)]
    msgs.append(dict(role='user', content=_prompt(state, question, descriptions)))
    return msgs


_RELATION_KEYS = None


def choice(state, instructions, criteria):
    global _RELATION_KEYS
    if task_of(instructions) == 'relation':
        _RELATION_KEYS = list(criteria)
    return llm.choice(state, instructions, criteria)


def noul(state, instructions, false, true):
    return llm.noul(state, instructions, false, true)


# Route llm.ask through the few-shot message builder.
_original_post = llm._post


def _post(body):
    user = body['messages'][-1]['content']
    head, _, rest = user.partition('\n\nQuestion: ')
    question, _, rest = rest.partition('\n\nOptions:\n')
    opts_block = rest.split('\n\nAnswer with only')[0]
    descriptions = [line[3:] for line in opts_block.split('\n')]
    body = dict(body, messages=messages_for(head, question, descriptions))
    return _original_post(body)


llm._post = _post
