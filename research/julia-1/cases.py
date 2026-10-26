"""Hand-written test cases for evaluating Julia-1 on Draftwell's entity questions.

All passages are original. Gold labels were written before running the model.
"""

# ---------------------------------------------------------------------------
# A. Is this word the registered entity, or an ordinary word / month / place?
# ---------------------------------------------------------------------------

# Registered codex entities whose names are also common words.
# senses: option id -> description shown to the model. The first sense is the entity itself.
ENTITIES = {
    'May': dict(kind='character', note='May Hollis is a character in this story.', senses={
        'entity': 'May, a character in the story (a person)',
        'month': 'the month of May',
        'word': 'the ordinary word "may" (might, or is allowed to)'}),
    'April': dict(kind='character', note='April is a character in this story.', senses={
        'entity': 'April, a character in the story (a person)',
        'month': 'the month of April'}),
    'Will': dict(kind='character', note='Will Archer is a character in this story.', senses={
        'entity': 'Will, a character in the story (a person)',
        'word': 'the ordinary word "will" (future tense, a legal will, or willpower)'}),
    'Hope': dict(kind='character', note='Hope is a character in this story.', senses={
        'entity': 'Hope, a character in the story (a person)',
        'word': 'the ordinary word "hope" (a feeling or a wish)'}),
    'Grace': dict(kind='character', note='Grace Pell is a character in this story.', senses={
        'entity': 'Grace, a character in the story (a person)',
        'word': 'the ordinary word "grace" (elegance, a prayer before meals, or a title like Your Grace)'}),
    'Rose': dict(kind='character', note='Rose is a character in this story.', senses={
        'entity': 'Rose, a character in the story (a person)',
        'word': 'the ordinary word "rose" (a flower, or the past tense of rise)'}),
    'Mark': dict(kind='character', note='Mark is a character in this story.', senses={
        'entity': 'Mark, a character in the story (a person)',
        'word': 'the ordinary word "mark" (a sign, a stain, a target, or to note something)'}),
    'Florence': dict(kind='character', note='Florence is a character in this story.', senses={
        'entity': 'Florence, a character in the story (a person)',
        'place': 'the city of Florence in Italy'}),
    'Jordan': dict(kind='character', note='Jordan is a character in this story.', senses={
        'entity': 'Jordan, a character in the story (a person)',
        'place': 'the country or the river Jordan'}),
    'Summer': dict(kind='character', note='Summer is a character in this story.', senses={
        'entity': 'Summer, a character in the story (a person)',
        'season': 'the season of summer'}),
    'Reading': dict(kind='place', note='Reading is a town where part of this story takes place.', senses={
        'entity': 'Reading, the town (a place in the story)',
        'word': 'the ordinary word "reading" (reading books or text)'}),
    'Bath': dict(kind='place', note='Bath is a city where part of this story takes place.', senses={
        'entity': 'Bath, the city (a place in the story)',
        'word': 'an ordinary bath (washing in a tub)'}),
}

# (entity, target text as it appears, occurrence index of target among case-sensitive matches, passage, gold sense)
DISAMBIG = [
    # May
    ('May', 'May', 0, 'May pushed the door open and stepped into the rain.', 'entity'),
    ('May', 'May', 0, '"May I sit here?" the stranger asked.', 'word'),
    ('May', 'May', 0, 'We married in May, just before the floods.', 'month'),
    ('May', 'may', 0, 'She may not come back tonight.', 'word'),
    ('May', 'May', 0, '"May the road rise to meet you," Tom said, raising his glass.', 'word'),
    ('May', 'May', 0, 'By late May the orchard was white with blossom.', 'month'),
    ('May', 'May', 0, 'Tom handed the letter to May and waited.', 'entity'),
    ('May', 'May', 0, "May's hands were shaking as she read it.", 'entity'),
    ('May', 'May', 0, 'May? Are you there?', 'entity'),
    ('May', 'May', 0, 'May never forgave him for that winter.', 'entity'),
    ('May', 'May', 0, '"May she rest in peace," whispered the priest.', 'word'),
    ('May', 'May', 1, 'The fair came every May, and every May Tom lost money on it.', 'month'),
    ('May', 'May', 0, '"Come here, May," her mother called.', 'entity'),
    ('May', 'May', 0, 'It was the first of May when the soldiers came.', 'month'),
    ('May', 'May', 0, 'May and Tom reached the bridge at dusk.', 'entity'),
    ('May', 'May', 0, 'May had been the worst month of her life.', 'month'),
    ('May', 'May', 0, 'May had been crying; her eyes were red.', 'entity'),
    ('May', 'MAY', 0, 'MAY 14 — Rain again. No word from Tom.', 'month'),
    ('May', 'may', 0, 'Whatever you may think of her, she kept her word.', 'word'),
    # April
    ('April', 'April', 0, 'April smiled and closed the book.', 'entity'),
    ('April', 'April', 0, 'April was wet and miserable that year.', 'month'),
    ('April', 'April', 0, 'In April the river flooded the lower fields.', 'month'),
    ('April', 'April', 0, 'April ran to the gate when she heard the horses.', 'entity'),
    # Will
    ('Will', 'Will', 0, 'Will tossed the keys onto the table.', 'entity'),
    ('Will', 'Will', 0, '"Will you marry me?"', 'word'),
    ('Will', 'Will', 0, '"Will you stop that, Will?" she snapped.', 'word'),
    ('Will', 'Will', 1, '"Will you stop that, Will?" she snapped.', 'entity'),
    ('Will', 'will', 0, "His father's will left everything to the church.", 'word'),
    ('Will', 'Will', 0, 'Will had never seen the sea.', 'entity'),
    ('Will', 'Will', 0, 'Will it rain tomorrow, do you think?', 'word'),
    ('Will', 'Will', 0, 'She said she will wait for Will by the gate.', 'entity'),
    ('Will', 'Will', 0, 'Will Archer was not a patient man.', 'entity'),
    ('Will', 'Will', 0, '"Will he come back?" she asked.', 'word'),
    # Hope
    ('Hope', 'Hope', 0, 'Hope found the key under the mat.', 'entity'),
    ('Hope', 'Hope', 0, 'Hope is a dangerous thing in a place like this.', 'word'),
    ('Hope', 'hope', 0, 'There was no hope left in the village.', 'word'),
    ('Hope', 'Hope', 0, 'Tom looked at Hope and smiled.', 'entity'),
    ('Hope', 'hope', 0, "I hope you know what you're doing.", 'word'),
    ('Hope', 'Hope', 0, 'Hope? Hope, wake up!', 'entity'),
    ('Hope', 'Hope', 0, 'Hope was fading as the sun went down.', 'word'),
    ('Hope', 'Hope', 0, 'Hope was shivering as the sun went down.', 'entity'),
    # Grace
    ('Grace', 'Grace', 0, 'Grace poured the tea without a word.', 'entity'),
    ('Grace', 'grace', 0, "He moved with a dancer's grace.", 'word'),
    ('Grace', 'Grace', 0, '"Your Grace," the steward said, bowing low.', 'word'),
    ('Grace', 'grace', 0, 'They said grace before supper.', 'word'),
    ('Grace', 'Grace', 0, 'Grace and her brother left at dawn.', 'entity'),
    ('Grace', 'Grace', 0, 'Grace under pressure was never his strength.', 'word'),
    # Rose
    ('Rose', 'Rose', 0, 'Rose rose early, as she always did.', 'entity'),
    ('Rose', 'rose', 0, 'He brought her a single red rose.', 'word'),
    ('Rose', 'rose', 0, 'The sun rose over the hills.', 'word'),
    ('Rose', 'Rose', 0, 'Rose climbed the hill behind the house.', 'entity'),
    ('Rose', 'Rose', 0, 'Rose petals covered the path to the chapel.', 'word'),
    ('Rose', 'Rose', 0, 'Rose said nothing for a long time.', 'entity'),
    # Mark
    ('Mark', 'Mark', 0, "Mark my words, he'll be back.", 'word'),
    ('Mark', 'Mark', 0, 'Mark knocked twice and waited.', 'entity'),
    ('Mark', 'mark', 0, 'The arrow missed its mark.', 'word'),
    ('Mark', 'mark', 0, 'Her wet glass left a mark on the table.', 'word'),
    ('Mark', 'Mark', 0, '"Mark the date on the calendar," she told him.', 'word'),
    # Florence
    ('Florence', 'Florence', 0, 'Florence had never liked her cousin.', 'entity'),
    ('Florence', 'Florence', 0, 'They spent the winter in Florence, among the old churches.', 'place'),
    ('Florence', 'Florence', 0, 'Florence was cold and wet that year, and the river rose high.', 'place'),
    ('Florence', 'Florence', 0, 'Florence was cold and silent all through dinner.', 'entity'),
    ('Florence', 'Florence', 0, 'Tom wrote to Florence every week, and she never once replied.', 'entity'),
    ('Florence', 'Florence', 0, 'The train to Florence left at nine.', 'place'),
    # Jordan
    ('Jordan', 'Jordan', 0, 'Jordan laughed and threw the ball back.', 'entity'),
    ('Jordan', 'Jordan', 0, 'They crossed the Jordan at first light.', 'place'),
    ('Jordan', 'Jordan', 0, 'The road to Jordan was closed after the border dispute.', 'place'),
    # Summer
    ('Summer', 'Summer', 0, 'Summer was the only one who believed him.', 'entity'),
    ('Summer', 'Summer', 0, 'Summer came late to the mountains that year.', 'season'),
    ('Summer', 'summer', 0, 'They spent the summer at the lake.', 'season'),
    ('Summer', 'Summer', 0, 'Summer pulled her coat tighter and kept walking.', 'entity'),
    # Reading (place)
    ('Reading', 'Reading', 0, 'They took the morning train to Reading.', 'entity'),
    ('Reading', 'Reading', 0, 'Reading was her only escape from that house.', 'word'),
    ('Reading', 'reading', 0, 'He spent the evening reading by the fire.', 'word'),
    ('Reading', 'Reading', 0, 'Reading was grey and crowded when they arrived.', 'entity'),
    # Bath (place)
    ('Bath', 'bath', 0, 'She drew a hot bath and sank into it.', 'word'),
    ('Bath', 'Bath', 0, "They moved to Bath for her mother's health.", 'entity'),
    ('Bath', 'Bath', 0, 'Bath was full of visitors that season.', 'entity'),
    ('Bath', 'Bath', 0, 'Bath time was the only quiet hour of the day.', 'word'),
]

# ---------------------------------------------------------------------------
# B. Aliases, relationships, dialogue and presence
# ---------------------------------------------------------------------------

CAST = ['Eleanor Ashby', 'Thomas Ashby', 'Margaret Ashby', 'Josiah Crane', 'Isabel Crane', 'Silas Reed', 'Abel Fenwick']
OTHER = 'someone else (not one of these characters)'

CODEX = """Characters in this story:
- Eleanor Ashby: ship's surgeon, unmarried, the main character.
- Thomas Ashby: Eleanor's younger brother, a new sailor.
- Margaret Ashby: Eleanor and Thomas's widowed mother.
- Josiah Crane: captain of the ship Heron.
- Isabel Crane: the captain's daughter.
- Silas Reed: first mate of the Heron.
- Abel Fenwick: an old physician, Eleanor's former teacher."""

CODEX_ALIASES = """Characters in this story:
- Eleanor Ashby (also called Nell, Miss Ashby, Ashby): ship's surgeon, unmarried, the main character.
- Thomas Ashby (also called Tom, Tommy, Ashby): Eleanor's younger brother, a new sailor.
- Margaret Ashby (also called Mrs. Ashby, Mother): Eleanor and Thomas's widowed mother.
- Josiah Crane (also called the Captain, the old man, Crane): captain of the ship Heron.
- Isabel Crane (also called Bel, Miss Crane): the captain's daughter.
- Silas Reed (also called Mr. Reed, Reed, the mate): first mate of the Heron.
- Abel Fenwick (also called the Doctor, Fenwick): an old physician, Eleanor's former teacher."""

# (mention, passage, gold cast member or OTHER)
ALIAS_RESOLVE = [
    ('Nell', 'Nell checked the bandage again. The boy would live, she decided.', 'Eleanor Ashby'),
    ('Tommy', '"Tommy, come away from the rail," his mother called.', 'Thomas Ashby'),
    ('Bel', 'Bel climbed onto a barrel to get a better look at the harbour.', 'Isabel Crane'),
    ('Mrs. Ashby', 'Mrs. Ashby had not left the house since the funeral.', 'Margaret Ashby'),
    ('Miss Ashby', '"Miss Ashby, the men are asking for you," said the bosun.', 'Eleanor Ashby'),
    ('Miss Crane', 'Miss Crane refused to stay below during the storm.', 'Isabel Crane'),
    ('Crane', 'Crane ordered the topsails reefed and went below.', 'Josiah Crane'),
    ('the surgeon', 'Reed and the surgeon argued over the rations for an hour. In the end, the surgeon won.', 'Eleanor Ashby'),
    ('the old man', '"Don\'t let the old man hear you say that," Reed warned the new hand.', 'Josiah Crane'),
    ('The Doctor', 'The Doctor had taught her everything she knew about setting bones.', 'Abel Fenwick'),
    ('her brother', 'Eleanor found her brother asleep in his hammock.', 'Thomas Ashby'),
    ("the girl's father", "Isabel hid behind the sail locker, but the girl's father found her anyway.", 'Josiah Crane'),
    ('The mate', 'The mate counted the casks twice before signing for them.', 'Silas Reed'),
    ('A stranger', 'A stranger in a grey coat watched them from the end of the dock.', OTHER),
    ('Young Ashby', 'Young Ashby had never been to sea before, and he was sick for three days.', 'Thomas Ashby'),
    ('Ashby', '"Ashby! Bring your kit!" the captain bellowed, and the surgeon came running.', 'Eleanor Ashby'),
    ('He', 'Tom found Reed by the wheel. He looked exhausted, so Tom sent him below to sleep.', 'Silas Reed'),
    ('she', 'Margaret watched Isabel fold the letter. When she finally sealed it, her hands were shaking.', 'Isabel Crane'),
    ('The widow', "The widow kept her late husband's coat on its hook by the door.", 'Margaret Ashby'),
    ('his old apprentice', 'Fenwick read the letter from his old apprentice twice before he put it down.', 'Eleanor Ashby'),
    ("the boy's", "Eleanor stitched the cut on the boy's arm while their mother held him still.", 'Thomas Ashby'),
]

# (alias, person, passage, gold True/False)
ALIAS_SAME = [
    ('Nell', 'Eleanor', '"Nell," her mother said softly. Eleanor didn\'t look up from her book.', True),
    ('the old man', 'Captain Crane', "Everyone aboard called Captain Crane 'the old man', though never to his face.", True),
    ('Bel', 'Eleanor', 'Bel and Eleanor sat together on the stern, watching the gulls.', False),
    ('Tommy', 'Tom', 'Tom (Tommy, to his mother) was seventeen that spring.', True),
    ('the surgeon', 'Miss Ashby', 'The surgeon and Miss Ashby were not on speaking terms that week.', False),
    ('the Doctor', 'Fenwick', 'Fenwick, whom the whole town simply called the Doctor, lived above the apothecary.', True),
    ('Reed', 'the captain', 'Reed, the first mate, and Crane, the captain, rarely agreed on anything.', False),
    ('Bel', 'Isabel', "Isabel signed every letter 'Bel', even the ones to the bank.", True),
    ('Mrs. Ashby', 'Eleanor', 'Mrs. Ashby poured the tea while her daughter, Eleanor, cut the bread.', False),
    ('Captain', 'Crane', '"Captain," said Reed. Crane turned from the rail.', True),
    ('the surgeon', 'Eleanor', 'Tom handed the letter to the surgeon — his sister, Eleanor.', True),
    ('the mate', 'Silas', 'Silas and the mate went ashore together.', False),
]

RELATIONS = {
    'siblings': 'siblings (brother or sister)',
    'parent': 'parent and child (including step-parents)',
    'spouses': 'married to each other',
    'romance': 'romantic interest or lovers (not married)',
    'former': 'former romantic partners or ex-spouses',
    'relative': 'other relatives (cousins, grandparents, in-laws, aunts, uncles)',
    'friends': 'friends',
    'rivals': 'enemies or rivals',
    'work': 'boss and worker, or commander and subordinate',
    'mentor': 'teacher or mentor and student',
    'none': 'no relationship is stated in this passage',
}

# (A, B, passage, gold relation)
RELATIONSHIPS = [
    ('Eleanor', 'Tom', "Eleanor ruffled her little brother's hair. \"Tom, you're impossible.\"", 'siblings'),
    ('Margaret', 'Tom', 'Margaret had raised Tom alone since his father drowned.', 'parent'),
    ('Reed', 'Crane', 'Reed saluted. "Orders, sir?" Crane didn\'t look up from the chart.', 'work'),
    ('Fenwick', 'Eleanor', 'Fenwick had taken Eleanor on as his apprentice when she was fifteen.', 'mentor'),
    ('Isabel', 'Reed', 'Isabel and Reed had been married for three years, and the crew still gossiped about it.', 'spouses'),
    ('Bel', 'Tom', 'Bel kissed Tom behind the chart house and made him swear to tell no one.', 'romance'),
    ('Reed', 'Fenwick', 'Reed would have cheerfully thrown Fenwick overboard, and the feeling was entirely mutual.', 'rivals'),
    ('Eleanor', 'Isabel', 'Eleanor and Isabel had shared every secret since they were girls in the same village.', 'friends'),
    ('Crane', 'Isabel', '"I\'m ashamed of you," Crane told his daughter. Isabel said nothing.', 'parent'),
    ('Reed', 'Tom', 'Reed and Tom both reached for the rope at the same moment.', 'none'),
    ('Reed', 'Eleanor', 'Reed had once been engaged to Eleanor, before the war changed everything between them.', 'former'),
    ('Margaret', 'Silas', 'Margaret had never approved of her son-in-law, Silas.', 'relative'),
    ('Tom', 'Margaret', '"Love you, Mum!" Tom called over his shoulder. Margaret waved from the doorway.', 'parent'),
    ('Margaret', 'Isabel', 'Margaret paid Isabel two shillings a week to scrub the kitchen floors.', 'work'),
    ('Eleanor', 'Fenwick', 'Eleanor and Fenwick applied for the same post at the hospital, and neither ever forgave the other for it.', 'rivals'),
    ('Tom', 'Reed', 'Whenever Tom was in trouble, it was Reed he went to first, and Reed never once turned him away.', 'friends'),
    ('Tom', 'Eleanor', 'Tom and Eleanor had the same red hair and the same stubborn chin as their mother.', 'siblings'),
    ('Fenwick', 'Isabel', 'Old Fenwick bounced his granddaughter Isabel on his knee.', 'relative'),
    ('Silas', 'Margaret', 'Silas came home to his wife, Margaret, every evening at six.', 'spouses'),
    ('Reed', 'Isabel', 'Reed wrote Isabel a dozen love letters and never found the courage to send one.', 'romance'),
    ('Crane', 'Tom', 'Crane had signed Tom on as a deck boy and worked him harder than any man aboard.', 'work'),
    ('Eleanor', 'Margaret', 'Eleanor had her mother\'s hands, Margaret always said — quick, and never still.', 'parent'),
    ('Isabel', 'Eleanor', "Isabel's mother and Eleanor's mother were sisters.", 'relative'),
    ('Tom', 'Isabel', "Tom and Isabel had split up last winter and hadn't spoken since.", 'former'),
    ('Fenwick', 'Reed', 'Fenwick had never met Reed and knew him only by reputation.', 'none'),
]

# (question, options in passage order, passage, gold)
DIRECTION = [
    ('Who is the parent?', ['Margaret', 'Tom'], 'Margaret had raised Tom alone since his father drowned.', 'Margaret'),
    ('Who is the parent?', ['Crane', 'Isabel'], '"I\'m ashamed of you," Crane told his daughter. Isabel said nothing.', 'Crane'),
    ('Who is the parent?', ['Tom', 'Margaret'], '"Love you, Mum!" Tom called over his shoulder. Margaret waved from the doorway.', 'Margaret'),
    ('Who is the parent?', ['Eleanor', 'Margaret'], 'Eleanor had her mother\'s hands, Margaret always said — quick, and never still.', 'Margaret'),
    ('Who is the teacher?', ['Fenwick', 'Eleanor'], 'Fenwick had taken Eleanor on as his apprentice when she was fifteen.', 'Fenwick'),
    ('Who is in command?', ['Reed', 'Crane'], 'Reed saluted. "Orders, sir?" Crane didn\'t look up from the chart.', 'Crane'),
    ('Who is the employer?', ['Margaret', 'Isabel'], 'Margaret paid Isabel two shillings a week to scrub the kitchen floors.', 'Margaret'),
    ('Who is in charge?', ['Crane', 'Tom'], 'Crane had signed Tom on as a deck boy and worked him harder than any man aboard.', 'Crane'),
]

SCENE_1 = '''Eleanor set her bag down on the table.
"You're late," Reed said.
"The tide was against us."
"The tide is always against you."
"Then perhaps you should stop waiting for me."'''

SCENE_2 = '''Tom burst into the cabin. "They've found the wreck!"
Crane looked up from his charts. "Where?"
"Off the north point. Bel saw it first."
Isabel shrugged. "I only had the glass because nobody else wanted it."'''

SCENE_3 = '''"Mother, please." Margaret turned away from her son and went on peeling potatoes.'''

SCENE_4 = '''"Hold the line!" shouted Crane.
"It won't hold, sir," said Reed, "not in this wind."
Eleanor said nothing; she was already cutting the rope.
"What are you doing?" Crane demanded.'''

# (passage, line, speaker options, gold)
SPEAKERS = [
    (SCENE_1, "You're late,", ['Eleanor', 'Reed'], 'Reed'),
    (SCENE_1, 'The tide was against us.', ['Eleanor', 'Reed'], 'Eleanor'),
    (SCENE_1, 'The tide is always against you.', ['Eleanor', 'Reed'], 'Reed'),
    (SCENE_1, 'Then perhaps you should stop waiting for me.', ['Eleanor', 'Reed'], 'Eleanor'),
    (SCENE_2, "They've found the wreck!", ['Tom', 'Crane', 'Isabel'], 'Tom'),
    (SCENE_2, 'Where?', ['Tom', 'Crane', 'Isabel'], 'Crane'),
    (SCENE_2, 'Off the north point. Bel saw it first.', ['Tom', 'Crane', 'Isabel'], 'Tom'),
    (SCENE_2, 'I only had the glass because nobody else wanted it.', ['Tom', 'Crane', 'Isabel'], 'Isabel'),
    (SCENE_3, 'Mother, please.', ['Margaret', 'Tom', 'Eleanor'], 'Tom'),
    (SCENE_4, 'Hold the line!', ['Crane', 'Reed', 'Eleanor'], 'Crane'),
    (SCENE_4, "It won't hold, sir,", ['Crane', 'Reed', 'Eleanor'], 'Reed'),
    (SCENE_4, 'What are you doing?', ['Crane', 'Reed', 'Eleanor'], 'Crane'),
]

# (person, passage, gold: physically present in the scene?)
PRESENCE = [
    ('Margaret', 'Eleanor thought about her mother all through the long night watch.', False),
    ('Margaret', 'Margaret held the lamp while Eleanor stitched the wound.', True),
    ('Eleanor', "Tom read his sister's letter again by candlelight.", False),
    ('Fenwick', '"Fenwick would have known what to do," Eleanor muttered, wishing the old man were here.', False),
    ('Fenwick', 'Fenwick leaned over her shoulder. "Deeper," he said. "Cut deeper."', True),
    ('Crane', 'The crew talked about Crane for hours after the funeral.', False),
    ('Crane', 'Crane stood at the wheel all night while the storm battered the Heron.', True),
    ("Isabel's father", "Isabel dreamed of her father's ship, white sails against a grey sky.", False),
    ('Tom', 'Reed handed Tom the rope and showed him how to tie the knot.', True),
]
