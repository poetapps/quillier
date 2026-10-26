// Story structures offered when starting a book and from the Outline's "Add a structure" menu.
// Every folder and beat comes with guidance meant to be written over, like the sample text in a Scrivener template.
//
// Content is Markdown kept flush-left inside the template literals (indentation would become part of the text),
// and each paragraph stays on one line so it reflows in the editor.

export const STRUCTURES = [
  {
    id: 'three-act',
    name: 'Three-Act Structure',
    summary: 'The classic shape: a setup, a long middle of mounting trouble, and a climax that settles it.',
    folders: [
      {
        title: 'Act One: Setup',
        content: `The first quarter or so of the book. It introduces your protagonist, their everyday life and what they want, then disrupts that life and pushes them into the main story.

Replace this text with what happens in this part of your story.`,
        beats: [
          {
            title: 'The Hook',
            content: `*The first page or two.*

Your opening needs to give the reader a reason to keep going. That might be a distinctive voice, a question they want answered, or your protagonist in the middle of doing something that shows who they are. It doesn’t need to be loud, only specific.

Ask yourself: What is the first thing that should make a reader curious? Why open on this moment rather than another?`,
          },
          {
            title: 'Setup',
            content: `*Roughly the first 10% of the book.*

Show your protagonist’s ordinary life before the story disturbs it: where they live, who matters to them, what they want and what is quietly wrong. Plant the people, places and problems that will pay off later, so the reader understands what is at stake when things change.

Ask yourself: What does your protagonist want at the start? What are they missing that they don’t yet see?`,
          },
          {
            title: 'Inciting Incident',
            content: `*About 10–12% of the way in.*

Something happens that upsets the balance of your protagonist’s life and starts the main story moving. It might be a meeting, a loss, a discovery or an offer. They may not act on it straight away, but after this point their old life can’t simply carry on as it was.

Ask yourself: What event sets your story in motion? Why can’t your protagonist ignore it?`,
          },
          {
            title: 'Plot Point One',
            content: `*About 25% of the way in.*

Your protagonist makes a decision, or has one forced on them, that commits them to the central conflict. This closes the setup and opens the middle of the book. Ideally it is hard to undo, so the reader knows there is no easy way back.

Ask yourself: What choice locks your protagonist into the story? What do they leave behind by making it?`,
          },
        ],
      },
      {
        title: 'Act Two: Confrontation',
        content: `The long middle, roughly 25–75% of the book. Your protagonist pursues their goal, meets growing resistance, and learns what the problem really is. Keep raising the stakes so the middle never stalls.

Replace this text with what happens in this part of your story.`,
        beats: [
          {
            title: 'Rising Action',
            content: `*From about 25% to 50%.*

Your protagonist works toward their goal and runs into obstacles that get steadily harder. They try things, some of which fail, and they meet the allies and opponents who will matter most. Each chapter should leave them in a different position from the one before.

Ask yourself: What are the main obstacles in your protagonist’s way? How does each one make the next harder?`,
          },
          {
            title: 'Midpoint',
            content: `*About 50% of the way in.*

A major turn in the middle of the book. It might be an apparent win, a painful defeat or a revelation that changes how your protagonist sees the problem. Often they stop reacting and start acting with purpose, and the stakes rise sharply from here.

Ask yourself: What changes at the halfway point? How does your protagonist’s approach shift because of it?`,
          },
          {
            title: 'Complications',
            content: `*From about 50% to 75%.*

Things get worse. Opponents push back harder, plans unravel, and your protagonist’s flaws and past choices start to cost them. Relationships may strain or break. The pressure here should feel like a direct result of what happened at the midpoint.

Ask yourself: What goes wrong for your protagonist in this stretch? Which of their own weaknesses makes it worse?`,
          },
          {
            title: 'Plot Point Two',
            content: `*About 75% of the way in.*

The lowest point, or a final piece of information, that sets up the ending. Your protagonist may seem to have lost everything, or may finally understand what they must do. Whatever happens here, it should send them toward the climax with no other options left.

Ask yourself: What is the worst moment for your protagonist? What realization or decision gets them moving again?`,
          },
        ],
      },
      {
        title: 'Act Three: Resolution',
        content: `The final quarter, roughly 75–100% of the book. Everything you have built comes to a head, the central conflict is decided, and the reader sees what the story has cost and changed.

Replace this text with what happens in this part of your story.`,
        beats: [
          {
            title: 'Climax',
            content: `*About 85–95% of the way in.*

Your protagonist faces the central conflict directly and it is settled, one way or the other. This should be the most intense stretch of the book, and the outcome should depend on choices your protagonist makes using what they have learned along the way.

Ask yourself: What is the final confrontation? What does your protagonist do here that they couldn’t have done at the start?`,
          },
          {
            title: 'Resolution',
            content: `*The last few chapters, about 95–100%.*

Show the aftermath. Tie up the threads that matter, let the reader see how your protagonist and their world have changed, and give the emotions of the climax room to settle. Keep it short enough that the ending doesn’t drag.

Ask yourself: What does your protagonist’s life look like now? What final moment do you want the reader to leave with?`,
          },
        ],
      },
    ],
  },
  {
    id: 'save-the-cat',
    name: 'Save the Cat!',
    summary: 'Blake Snyder’s fifteen-beat sheet, as adapted for novels by Jessica Brody, with a target for every stretch.',
    folders: [
      {
        title: 'Act One: Thesis',
        content: `Roughly the first 20% of the book. It shows your protagonist’s world as it is, including what is wrong with it and with them, and ends when they commit to changing it.

Replace this text with what happens in this part of your story.`,
        beats: [
          {
            title: 'Opening Image',
            content: `*The first page or chapter, about 0–1%.*

A single moment that captures your protagonist and their world before anything changes. It sets the tone and shows who this person is at the start, flaws included. It will be paired with the Final Image, so choose something you can echo or reverse at the end.

Ask yourself: What one moment best sums up your protagonist’s life as it is now? What does it reveal about what has to change?`,
          },
          {
            title: 'Theme Stated',
            content: `*About 5% of the way in.*

Early on, someone hints at the lesson your protagonist will need to learn by the end, often without either of them realizing its importance. It can be a passing remark, a piece of advice, or a criticism they brush off. Keep it light so it doesn’t read as a moral.

Ask yourself: What truth does your protagonist need to accept? Who could say it to them, and why would they dismiss it?`,
          },
          {
            title: 'Setup',
            content: `*From about 1% to 10%.*

Fill in your protagonist’s everyday life: home, work, friends, rivals and routines. Show what they want and the problems they are living with, especially the ones they don’t recognize. Introduce the people who will matter later, and let the reader sense that something has to give.

Ask yourself: What is broken in your protagonist’s life? What are they doing to avoid dealing with it?`,
          },
          {
            title: 'Catalyst',
            content: `*About 10% of the way in.*

An event knocks your protagonist out of their routine. It could be good news or bad, but it is something they can’t easily take back or ignore. Make it a clear, concrete happening rather than a slow realization, so the reader knows exactly when the story turned.

Ask yourself: What happens to your protagonist that changes their situation? Why does it arrive now?`,
          },
          {
            title: 'Debate',
            content: `*From about 10% to 20%.*

Your protagonist hesitates. They weigh what the catalyst means, worry about the risks, and maybe try to carry on as before or look for an easier way out. This stretch lets the reader feel the size of the choice in front of them before they make it.

Ask yourself: What does your protagonist fear about going forward? What finally tips the balance?`,
          },
        ],
      },
      {
        title: 'Act Two: Antithesis',
        content: `Roughly 20–80% of the book. Your protagonist enters a situation that is the reverse of their old life, goes after what they want, and is tested until they hit bottom.

Replace this text with what happens in this part of your story.`,
        beats: [
          {
            title: 'Break into Two',
            content: `*About 20% of the way in.*

Your protagonist chooses to act and steps into a new situation, leaving their old world behind. The choice should be theirs, even if circumstances pushed them toward it. Often they are going after the wrong goal, or the right goal for the wrong reasons, which sets up the trouble ahead.

Ask yourself: What does your protagonist decide to do? How is the world they enter different from the one they leave?`,
          },
          {
            title: 'B Story',
            content: `*About 22% of the way in.*

A new character or relationship enters, perhaps a love interest, friend, mentor or rival. This thread runs alongside the main plot and is usually where your protagonist’s inner change is worked out. The person at its center often helps them see the theme.

Ask yourself: Who does your protagonist grow close to in this new situation? What can this person show them that they can’t see alone?`,
          },
          {
            title: 'Fun and Games',
            content: `*From about 20% to 50%.*

This is the stretch many readers picked up the book for. Your protagonist explores the new situation and the central idea of your story plays out — the heist, the courtship, the haunting. Whether things go well or badly for them, give the reader what your blurb led them to expect.

Ask yourself: What is the most intriguing part of your premise? What does your protagonist try here, and how does it go?`,
          },
          {
            title: 'Midpoint',
            content: `*About 50% of the way in.*

A turning point that raises the stakes. Your protagonist reaches a high that looks like success or a low that looks like failure, and either way it isn’t the whole truth. Time pressure often arrives here, and the inner and outer stories begin to press on each other.

Ask yourself: Does your protagonist seem to be winning or losing at the halfway point? What makes the stakes higher from here?`,
          },
          {
            title: 'Bad Guys Close In',
            content: `*From about 50% to 75%.*

Pressure builds from outside and inside. Opponents regroup and push back, while your protagonist’s own flaws, doubts and bad habits start to damage their plans and relationships. Allies may drift away. The situation should tighten chapter by chapter.

Ask yourself: Who or what is working against your protagonist now? How are their own weaknesses making things worse?`,
          },
          {
            title: 'All Is Lost',
            content: `*About 75% of the way in.*

The worst moment so far. Your protagonist suffers a defeat that seems total: a plan collapses, a relationship breaks, something or someone is lost. It should feel like the end of their hopes, and it often strips away whatever they were leaning on instead of changing.

Ask yourself: What is the heaviest blow your protagonist could take here? What does it take from them?`,
          },
          {
            title: 'Dark Night of the Soul',
            content: `*From about 75% to 80%.*

Your protagonist reacts to the loss. They grieve, retreat or fall back on old habits, and the reader sees them at their lowest. This quieter stretch is where they slowly begin to face the truth they have been avoiding, which prepares them to try again.

Ask yourself: How does your protagonist respond to the loss? What do they finally understand about themselves?`,
          },
        ],
      },
      {
        title: 'Act Three: Synthesis',
        content: `Roughly the final 20% of the book. Your protagonist combines who they were at the start with what they have learned, and uses both to put things right.

Replace this text with what happens in this part of your story.`,
        beats: [
          {
            title: 'Break into Three',
            content: `*About 80% of the way in.*

A new idea, a piece of information or help from the B Story gives your protagonist a way forward. More importantly, they now accept the lesson hinted at in Theme Stated. They make a fresh choice, this time for the right reasons, and commit to the final push.

Ask yourself: What gives your protagonist the answer they need? How is this decision different from the one at Break into Two?`,
          },
          {
            title: 'Finale',
            content: `*From about 80% to 99%.*

Your protagonist puts a plan into action and confronts the central problem. It helps if the plan breaks down partway through, forcing them to find something in themselves they didn’t have at the start. By the end they have changed, and the world around them has too.

Ask yourself: What is your protagonist’s plan, and how does it fall apart? What do they do when it does?`,
          },
          {
            title: 'Final Image',
            content: `*The last page or chapter, about 99–100%.*

A closing moment that answers the Opening Image and shows how far your protagonist has come. Set the two side by side and the change should be plain to see. Keep it brief and concrete rather than explaining what it means.

Ask yourself: How can your last moment echo your first? What has changed for your protagonist between them?`,
          },
        ],
      },
    ],
  },
  {
    id: 'heros-journey',
    name: 'The Hero’s Journey',
    summary: 'Christopher Vogler’s twelve stages, after Joseph Campbell: your hero leaves home, is tested and returns.',
    folders: [
      {
        title: 'Departure',
        content: `Roughly the first quarter of the book. Your hero is shown at home, is summoned toward something larger, hesitates, gets help, and finally leaves the familiar behind.

Replace this text with what happens in this part of your story.`,
        beats: [
          {
            title: 'The Ordinary World',
            content: `*The opening chapters, about 0–10%.*

Show your hero’s everyday life before the adventure: their home, their routine, the people around them and what is missing. This gives the reader a baseline, so the strangeness and danger of what comes later stand out against it.

Ask yourself: What does a normal day look like for your hero? What do they lack, or long for, that they may not admit?`,
          },
          {
            title: 'The Call to Adventure',
            content: `*About 10% of the way in.*

Something invites or forces your hero toward a challenge beyond their usual life. It might be a message, a threat, a stranger or a discovery. It makes clear that things can’t stay as they are, and it hints at what is at stake if your hero does nothing.

Ask yourself: What arrives to pull your hero out of their ordinary life? What will happen if they don’t answer?`,
          },
          {
            title: 'Refusal of the Call',
            content: `*About 10–15% of the way in.*

Your hero hesitates or says no. Fear, duty, doubt or comfort holds them back, and the reader sees what they stand to lose. The refusal may last a line or several chapters, but it makes the eventual decision feel earned and shows the danger is real.

Ask yourself: Why doesn’t your hero want to go? What would make them change their mind?`,
          },
          {
            title: 'Meeting the Mentor',
            content: `*About 15–20% of the way in.*

Your hero gets guidance, encouragement or a useful gift from someone with more experience. The mentor might be a teacher, an elder, a book, a memory or even a rival. They can prepare your hero, but they can’t make the journey for them.

Ask yourself: Who or what helps your hero get ready? What do they give your hero that will matter later?`,
          },
          {
            title: 'Crossing the Threshold',
            content: `*About 25% of the way in.*

Your hero commits and leaves the familiar world for the unknown. This might be a literal journey or a change in circumstance, such as a new job, a secret uncovered or a line crossed. Once through, the rules are different and turning back is hard.

Ask yourself: What is the moment your hero truly commits? What makes the new world feel unlike home?`,
          },
        ],
      },
      {
        title: 'Initiation',
        content: `The middle half of the book, roughly 25–75%. Your hero learns how the new world works, gathers friends and makes enemies, faces their greatest trial, and earns something by surviving it.

Replace this text with what happens in this part of your story.`,
        beats: [
          {
            title: 'Tests, Allies and Enemies',
            content: `*From about 25% to 40%.*

Your hero adjusts to the new world. They face smaller challenges, learn how things work, and find out who can be trusted. Friendships, rivalries and alliances form here, and the reader sees your hero’s strengths and weaknesses under pressure.

Ask yourself: What does your hero have to learn to survive here? Who becomes a friend, and who turns against them?`,
          },
          {
            title: 'Approach to the Inmost Cave',
            content: `*From about 40% to 50%.*

Your hero and their allies prepare for the central danger, whether that is a place, a person or a confrontation they have been avoiding. Plans are made, tension builds and doubts return. It is a pause before the worst, and a chance to deepen relationships.

Ask yourself: What is your hero heading toward, and what do they fear most about it? How do they prepare?`,
          },
          {
            title: 'The Ordeal',
            content: `*About 50% of the way in.*

Your hero faces their greatest trial yet and comes close to failure, or even death, whether physical, emotional or symbolic. The reader should feel real doubt about whether they will come through. What happens here changes your hero in a lasting way.

Ask yourself: What is the hardest thing your hero must face in the middle of the book? What part of them doesn’t survive it?`,
          },
          {
            title: 'The Reward',
            content: `*From about 50% to 60%.*

Having survived, your hero gains something: an object, knowledge, a reconciliation or a new understanding of themselves. There may be a moment of celebration or rest. The reward often brings new problems with it, and it isn’t safely theirs yet.

Ask yourself: What does your hero win from the ordeal? Why might holding on to it be harder than getting it?`,
          },
        ],
      },
      {
        title: 'Return',
        content: `The final quarter, roughly 75–100% of the book. Your hero heads back toward the ordinary world, faces one last test that proves how much they have changed, and brings something of value home.

Replace this text with what happens in this part of your story.`,
        beats: [
          {
            title: 'The Road Back',
            content: `*About 75% of the way in.*

Your hero sets out to return or to finish the job, but the consequences of the ordeal catch up with them. There may be a pursuit, a fresh threat or a setback that renews the danger. They have to recommit to seeing the journey through.

Ask yourself: What pulls your hero toward home or the final conflict? What new danger follows them?`,
          },
          {
            title: 'The Resurrection',
            content: `*About 85–95% of the way in.*

The climax. Your hero faces a final, decisive test where everything is at stake, often for others as well as themselves. They must use all they have learned, and they come through transformed. This is the proof that the change in them is real.

Ask yourself: What final test forces your hero to show who they have become? Who else depends on the outcome?`,
          },
          {
            title: 'Return with the Elixir',
            content: `*The last chapters, about 95–100%.*

Your hero returns to the ordinary world, or settles into a new one, carrying something that matters: wisdom, a cure, love, freedom or simply experience. Show how their homecoming affects the people around them, and how different they are from the person the reader met at the start.

Ask yourself: What does your hero bring back? How has their ordinary world changed because of it?`,
          },
        ],
      },
    ],
  },
  {
    id: 'seven-point',
    name: 'Seven-Point Structure',
    summary: 'Dan Wells’s seven turning points. Plan the Resolution first, then work back to a Hook that is its opposite.',
    folders: [
      {
        title: 'Act One',
        content: `Roughly the first quarter of the book: your protagonist’s starting point and the event that sets the story moving. Dan Wells suggests planning the Resolution first, then working backwards to a Hook that shows your protagonist in the opposite state, so the whole book reads as a movement from one to the other.

Replace this text with what happens in this part of your story.`,
        beats: [
          {
            title: 'Hook',
            content: `*The opening chapters, about 0–5%.*

Show your protagonist in a state that is the opposite of where they will end up. If they finish brave, start them fearful; if they finish free, start them trapped. This gives the reader a clear starting point and something to measure the change against.

Ask yourself: How will your protagonist be different at the end? What does the opposite of that look like on the first page?`,
          },
          {
            title: 'Plot Turn One',
            content: `*About 20–25% of the way in.*

Something happens that introduces the central conflict and moves your protagonist out of their starting state. New ideas, people or pressures enter their world, and they begin to change. This is the event that sets them on the path toward the Resolution.

Ask yourself: What new conflict enters your protagonist’s life? How does it start to move them away from where they began?`,
          },
        ],
      },
      {
        title: 'Act Two',
        content: `The middle half of the book, roughly 25–75%. Pressure is applied, your protagonist shifts from reacting to acting, and then the pressure gets worse.

Replace this text with what happens in this part of your story.`,
        beats: [
          {
            title: 'Pinch Point One',
            content: `*About 35–40% of the way in.*

Apply pressure. Something goes wrong, often because the opposing force shows its strength, and your protagonist is pushed to respond. This is a good place to show the reader what your antagonist or central problem is capable of.

Ask yourself: How does the opposition make itself felt here? What does it force your protagonist to do?`,
          },
          {
            title: 'Midpoint',
            content: `*About 50% of the way in.*

Your protagonist stops simply reacting to events and starts acting on purpose. They make a decision, learn something crucial or commit to a goal, and from here they move toward the Resolution rather than merely away from the Hook.

Ask yourself: What makes your protagonist take charge at the halfway point? What do they now set out to do?`,
          },
          {
            title: 'Pinch Point Two',
            content: `*About 60–65% of the way in.*

Apply more pressure, harder than before. Plans fail, allies fall away or a source of help disappears, and your protagonist is left more alone. It should feel as though the opposition has the upper hand and the situation is close to hopeless.

Ask yourself: What is the worst thing that could happen to your protagonist now? What do they lose?`,
          },
        ],
      },
      {
        title: 'Act Three',
        content: `The final quarter, roughly 75–100% of the book. Your protagonist finds what they need to succeed, and the story arrives at the end state you planned first.

Replace this text with what happens in this part of your story.`,
        beats: [
          {
            title: 'Plot Turn Two',
            content: `*About 75–80% of the way in.*

Your protagonist gains the final piece they need to resolve the story: a realization, a skill, an ally or an object. Ideally it is something set up earlier, so it feels inevitable rather than convenient. With it, they can finally act decisively.

Ask yourself: What does your protagonist discover or obtain that makes the ending possible? Where did you plant it earlier in the book?`,
          },
          {
            title: 'Resolution',
            content: `*The climax and final chapters, about 90–100%.*

Everything has been building to this. Your protagonist confronts the central conflict and ends in the state that reverses the Hook. Because the whole structure works toward this point, it helps to know it before you plan anything else.

Ask yourself: What is the final state of your protagonist and their world? How clearly does it contrast with your opening?`,
          },
        ],
      },
    ],
  },
  {
    id: 'story-circle',
    name: 'Story Circle',
    summary: 'Dan Harmon’s eight steps: a loop out of the familiar world and back again, changed by the trip.',
    folders: [
      {
        title: 'The Familiar World',
        content: `Roughly the first quarter of the book. Your protagonist is somewhere they understand, and a desire for something more begins to stir.

Replace this text with what happens in this part of your story.`,
        beats: [
          {
            title: 'You',
            content: `*The opening chapters, about 0–10%.*

Introduce your protagonist where they feel at home, in a place and routine they know well. Let the reader get to know them before anything changes, so they care when it does. Show enough of their comfort to make leaving it meaningful.

Ask yourself: Where is your protagonist comfortable at the start? What does that comfort cost them?`,
          },
          {
            title: 'Need',
            content: `*About 10–20% of the way in.*

Your protagonist wants something they don’t have. It could be a goal they chase on purpose or a lack they feel without naming it. This desire drives the rest of the story, so make it specific enough that the reader can tell whether it has been met.

Ask yourself: What does your protagonist want? Is it what they really need, or only what they think they need?`,
          },
        ],
      },
      {
        title: 'The Unfamiliar World',
        content: `The middle half of the book, roughly 25–75%. Your protagonist goes somewhere strange to them, struggles to find their footing, and eventually gets hold of what they were after, though not for free.

Replace this text with what happens in this part of your story.`,
        beats: [
          {
            title: 'Go',
            content: `*About 25% of the way in.*

Your protagonist crosses into an unfamiliar situation in pursuit of what they want. It might be a new place, a new role, or a familiar setting turned strange by events. The point is that their old habits and knowledge no longer serve them as well.

Ask yourself: What step takes your protagonist out of their familiar world? What is different about where they arrive?`,
          },
          {
            title: 'Search',
            content: `*From about 25% to 50%.*

Your protagonist struggles to adapt. They are tested, make mistakes, gather allies and lose some illusions. Along the way the new world shapes them, and they pick up the skills and understanding they will need later.

Ask yourself: What does your protagonist have to learn or give up to get by here? What keeps getting in their way?`,
          },
          {
            title: 'Find',
            content: `*About 50% of the way in.*

Your protagonist gets what they were after, or something close to it. This can be a moment of triumph, but it often comes with a surprise: the thing they wanted isn’t quite what they expected, or getting it reveals a larger problem.

Ask yourself: What does your protagonist find at the center of the story? How is it different from what they imagined?`,
          },
          {
            title: 'Take',
            content: `*From about 50% to 75%.*

Getting what they wanted comes at a price, and now your protagonist pays it. They may lose something or someone, suffer a defeat, or have to give up part of who they were. This cost is what makes the journey matter.

Ask yourself: What does your protagonist’s success cost them? Is the price worth it to them?`,
          },
        ],
      },
      {
        title: 'Back Home',
        content: `The final quarter, roughly 75–100% of the book. Your protagonist returns to where they started and shows how the trip has changed them.

Replace this text with what happens in this part of your story.`,
        beats: [
          {
            title: 'Return',
            content: `*About 75% of the way in.*

Your protagonist heads back toward the familiar world, carrying what they gained and what they lost. The way home is rarely simple: there may be a final obstacle, a pursuit or a reckoning with what they left behind.

Ask yourself: What draws your protagonist back home? What stands in their way on the return?`,
          },
          {
            title: 'Change',
            content: `*The final chapters, about 85–100%.*

Your protagonist is back where they began, but they are not the same. Show how the journey has changed them, and how that change lets them deal with their old world in a new way. The reader should feel the circle close.

Ask yourself: How is your protagonist different from the person in the opening chapters? What can they do now that they couldn’t before?`,
          },
        ],
      },
    ],
  },
];
