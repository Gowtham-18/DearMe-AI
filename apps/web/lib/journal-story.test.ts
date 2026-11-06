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

test("unmatched questions and yes/no answers stay as questions you asked yourself", () => {
  const story = composeJournal(null, [
    turn("assistant", "Did taking a walk help at all?"),
    turn("user", "not really"),
    turn("assistant", "Where do you feel it in your body?"),
    turn("user", "my shoulders"),
  ]);
  assert.deepEqual(story.paragraphs, ["Did taking a walk help at all? Not really. Where do I feel it in my body? My shoulders."]);
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
