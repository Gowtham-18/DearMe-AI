import { test } from "node:test";
import assert from "node:assert/strict";

import { composeJournal, isFragment, lastQuestion, statementFor, tidy, toFirstPerson } from "./journal-story";

const turn = (role: "user" | "assistant", content: string) => ({ role, content });

test("a fragmented session becomes one first-person piece", () => {
  const story = composeJournal("What's taking up the most space in your head right now?", [
    turn("user", "What I need right now is a deep sleep. I was tired from work today"),
    turn("assistant", "A whole day of that is draining. What part of work wore you out the most?"),
    turn("user", "I feel so sleepy at work and couldnt really focus much in meetings and couldnt bring tasks to completion"),
    turn("assistant", "That sounds heavy to carry. What's been the hardest part of it?"),
    turn("user", "The body pain and tiredness"),
  ]);
  assert.equal(story.opening, "What's taking up the most space in my head right now?");
  assert.deepEqual(story.paragraphs, [
    "What I need right now is a deep sleep. I was tired from work today. " +
      "I feel so sleepy at work and couldn't really focus much in meetings and couldn't bring tasks to completion. " +
      "The hardest part of it has been the body pain and tiredness.",
  ]);
});

test("tidy keeps your words and fixes capitals, contractions and full stops", () => {
  assert.equal(tidy("i cant sleep. im worried about tomorrow"), "I can't sleep. I'm worried about tomorrow.");
  assert.equal(tidy("Work was fine!\nhome was loud"), "Work was fine! Home was loud.");
  assert.equal(tidy("Is it me?"), "Is it me?");
});

test("toFirstPerson flips the companion's questions", () => {
  assert.equal(toFirstPerson("How are you feeling about your sister?"), "How am I feeling about my sister?");
  assert.equal(toFirstPerson("What drained you the most?"), "What drained me the most?");
  assert.equal(toFirstPerson("What do you think you are avoiding?"), "What do I think I am avoiding?");
  assert.equal(toFirstPerson("You said work. What's yours like?"), "I said work. What's mine like?");
});

test("short answers turn into statements that fit the question", () => {
  assert.equal(statementFor("What's been the hardest part?", "The deadline"), "The hardest part has been the deadline.");
  assert.equal(statementFor("What's your biggest worry?", "money"), "My biggest worry is money.");
  assert.equal(statementFor("What would you like to change?", "My sleep schedule"), "What I'd like to change is my sleep schedule.");
  assert.equal(statementFor("What do you need right now?", "Rest"), "What I need right now is rest.");
  assert.equal(statementFor("How are you feeling about it?", "anxious"), "I'm feeling anxious about it.");
  assert.equal(statementFor("How did the interview go?", "well"), "The interview went well.");
  assert.equal(statementFor("Who's been on your mind?", "Priya"), "Priya has been on my mind.");
  assert.equal(statementFor("Who could you talk to about this?", "my sister"), "Someone I could talk to about this is my sister.");
  assert.equal(statementFor("What drained you the most?", "meetings"), "What drained me the most was meetings.");
  assert.equal(statementFor("What's on your mind?", "Work stuff"), "What's on my mind is work stuff.");
  assert.equal(statementFor("Where do you feel it in your body?", "my shoulders"), null);
  // Names you've capitalised elsewhere keep their capital.
  assert.equal(statementFor("What's on your mind?", "Priya", new Set(["Priya"])), "What's on my mind is Priya.");
});

test("yes/no answers and unmatched questions become prose, never a question on the page", () => {
  const story = composeJournal(null, [
    turn("assistant", "Did taking a walk help at all?"),
    turn("user", "not really"),
    turn("assistant", "Where do you feel it in your body?"),
    turn("user", "my shoulders"),
    turn("assistant", "Is it still bothering you?"),
    turn("user", "a little"),
  ]);
  assert.deepEqual(story.paragraphs, [
    "Taking a walk didn't really help at all. Where I feel it in my body: my shoulders. It is still bothering me, a little.",
  ]);
  // "Show the questions" keeps your own words under each question.
  assert.equal(story.passages[0].answer, "Not really.");
});

test("the session from the screenshot reads as one entry", () => {
  const story = composeJournal("What drained your energy today, and what gave some of it back?", [
    turn("assistant", "What drained your energy today, and what gave some of it back?"),
    turn("user", "Just felt tired in general. Watching my favorite movie felt good."),
    turn("assistant", "Feeling tired like that can wear you down. What has been draining your energy lately?"),
    turn("user", "I am really not sure, my body is tired always. Even when I get enough sleep, nutrition from food."),
    turn("assistant", "That sounds exhausting. How has it been affecting your days – your energy, your plans, or your mood?"),
    turn("user", "Yes, it affects everything."),
    turn("assistant", "That's a lot to carry. What part of this worries you the most?"),
    turn("user", "When I can't do my office tasks with energy and enthusiasm and lack progress."),
    turn(
      "assistant",
      "That makes sense. Before you close the page, what's one small thing that could make tomorrow a little easier on your energy?"
    ),
    turn("user", "I think I'll go to bed early and take a short walk after lunch"),
    turn("assistant", "That sounds like a kind plan for yourself. Thank you for writing today. Your page is ready."),
  ]);
  const text = story.paragraphs.join(" ");
  assert.ok(!text.includes("?"), "no questions in the written entry");
  assert.ok(text.startsWith("I just felt tired in general."));
  assert.ok(text.includes("I am really not sure what has been draining my energy lately. My body is tired always."));
  assert.ok(text.includes("It affects everything: my energy, my plans and my mood."));
  assert.ok(text.includes("The part that worries me the most is when I can't do my office tasks"));
  assert.ok(!text.includes("bed early"), "the plan for tomorrow goes in the closing, not the story");
  assert.equal(story.closing?.sentence, "To make tomorrow a little easier on my energy, I'll go to bed early and take a short walk after lunch.");
  assert.equal(story.closing?.todo, "Go to bed early and take a short walk after lunch");
  assert.equal(story.closing?.todoSuggested, false);
  assert.match(story.closing?.affirmation ?? "", /rest|slow down/i);
});

test("thanks and goodbyes are left out; full sentences are kept as written", () => {
  const story = composeJournal("What went well today?", [
    turn("user", "I finally finished the report and my manager liked it"),
    turn("assistant", "That's a real win. What made it possible?"),
    turn("user", "thanks!"),
  ]);
  assert.deepEqual(story.paragraphs, ["I finally finished the report and my manager liked it."]);
});

test("free writing without a conversation is tidied paragraph by paragraph", () => {
  const story = composeJournal(null, [], "today was ok\n\nim proud i went to the gym");
  assert.deepEqual(story.paragraphs, ["Today was ok. I'm proud I went to the gym."]);
});

test("long sessions are split into readable paragraphs", () => {
  const long = "I spent most of the morning trying to untangle the release plan with the team and it kept slipping";
  const turns = [long, long, long, long].flatMap((text) => [turn("assistant", "What happened next?"), turn("user", text)]);
  assert.equal(composeJournal(null, turns).paragraphs.length, 2);
});

test("helpers", () => {
  assert.equal(isFragment("The body pain and tiredness"), true);
  assert.equal(isFragment("I was so tired"), false);
  assert.equal(lastQuestion("That sounds hard. What helped? Take your time."), "What helped?");
  assert.equal(lastQuestion("Thanks for sharing."), null);
});

test("answers are woven into the prompt they answer", () => {
  const heavy = composeJournal("What made you feel heavy today?", [turn("user", "I performed bad in interview")]);
  assert.deepEqual(heavy.paragraphs, ["I felt heavy today because I performed badly in the interview."]);
  assert.equal(heavy.openingJoined, true);

  const hard = composeJournal("What made today hard?", [
    turn("user", "my best friend didn't invite me to her birthday"),
    turn("assistant", "That sounds like it really hurt. What part of it hurt the most?"),
    turn("user", "Seeing the pictures"),
  ]);
  assert.deepEqual(hard.paragraphs, [
    "Today was hard because my best friend didn't invite me to her birthday. The part that hurt the most was seeing the pictures.",
  ]);

  assert.equal(
    composeJournal("What made you smile today?", [turn("user", "my dog")]).paragraphs[0],
    "My dog made me smile today."
  );
  assert.equal(
    composeJournal("What's one small thing that went right today?", [turn("user", "I finally went to the gym")]).paragraphs[0],
    "One small thing that went right today was that I finally went to the gym."
  );
});

test("open prompts keep the answer as written", () => {
  const story = composeJournal("How was your day?", [turn("user", "Long, but the evening walk helped.")]);
  assert.equal(story.openingJoined, false);
  assert.deepEqual(story.paragraphs, ["Long, but the evening walk helped."]);
  assert.equal(toFirstPerson("What made you feel heavy today?"), "What made me feel heavy today?");
});
