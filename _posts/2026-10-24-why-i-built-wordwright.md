---
title: Why I built Wordwright
description: A tool to help me write more and better, and an experiment in designing AI that doesn't write for you.
---

This post is about Wordwright, a new tool I've built to help people (mostly me) write more and better.

I love writing.

I'm someone who thinks by writing. The process helps me to understand others’ perspectives, to explore the nuances of a topic, and to work out my own opinion. I also love the craft of it: from finding an evocative turn of phrase and the flow and rhythm that carries people along, to choosing exactly the correct punctuation mark.

One of my proudest moments, early in my career, was when my hero Tim Berners-Lee not only invited me to join the World Wide Web Consortium’s Technical Architecture Group, but in his email, explaining why he was inviting me, said, “You can write.”

I love writing, but it's also hard. I often wish that I could write more, but I go through phases where I can't think of anything to write about.

I don't want to miss things when I write – I don’t have to cover everything but if something’s left out I want it to be because of an explicit choice to scope it out. (Not a great motivation, but at least some of this is to avoid having my writing be criticised by others.)

I find it particularly hard to get writing over the line. The number of 90% done documents in my drafts folder is shocking and frustrating. This is probably exacerbated by the fact that when a draft has got to that stage, the thinking is done, and so is my motivation for writing in the first place.

Wordwright is designed to scratch my itch. In my experimentation using AI in the writing process (experimentation I think is essential to be informed and nuanced when I critique it), I have found five ways technology, including AI, can help me through some of these bumps.

1. **Inspiration:** identifying news stories, blog posts, social media threads and academic articles that can inspire a response when I can't think what to write about.
2. **Research:** finding examples, evidence and opinion that can help ground and challenge my intuition.
3. **Brainstorming:** exploring what it is I want to say on a topic and helping me to structure my argument.
4. **Critique:** reviewing my drafts to identify parts that are hard to follow, might be misinterpreted, or otherwise could be strengthened.
5. **Rephrasing:** unsticking me by giving me options for wording I find tricky – things like titles and opening and closing sentences.

What I don't find helpful is getting AI to write things for me. That removes the things I love about writing: the intellectual stretch of exploring ideas and the joy of exercising the craft of language.

I built Wordwright to support me to write more and better, but I also built it to investigate two things.

First, what is it like to develop software now? To be clear, I love coding as well, just as much as writing, but I wanted to test what it's like when you really lean into vibe coding. I'm going to write separately on that experience.

Second, how can you design AI-enabled applications to avoid problems like cognitive offloading, stereotyping and bias, slop production, or emotional reliance? There’s a common idea that we need friction in our interactions with AI, to save us from just following easy but ultimately unsatisfying paths – what does that look like in practice? And how does it feel?

Designing Wordwright, I developed the following principles:

- **Don't use AI when it's not necessary.** For example, finding things to write about is done through the old-fashioned route of subscribing to RSS feeds, not getting AI to search for new news.

- **Have AI ask the questions and capture the response.** During brainstorming, the AI is prompted to act as a coach, and to record your words so you have them for later.

- **Put in place artificial limits.** You can only ask for a critique three times. One of the problems with AI critiques is they can _always_ find something wrong. Writing is never perfect, and if you want to actually publish, that’s too hard a bar. So you get three critiques and then you’re told to publish.

- **Offer alternatives, not suggestions.** Treading a line between helpful rephrasing and inserting AI slop is a tricky one. In Wordwright you not only have to explain what you want the rephrasing to do – why you’re stuck – you have to choose which option(s) you want to adopt.

- **Provide challenge, not sycophancy.** This is one of the trickiest balancing acts. During research, we can deliberately get the AI to pick out conflicting articles. During review, I want constructive suggestions, not to be told either my writing is rubbish or that it’s amazing.

It is of course perfectly possible to shape your use of AI to behave in these ways, through your own prompts, configuration, and processes. But remembering to impose friction on yourself is hard; there's always the temptation to say _just this once_. It’s also convenient to have a place to capture intermediary results like ideas, notes and reading lists.

Wordwright is in private alpha right now. If you'd like to try it out – whether because you think it might help you to write, or because you want to see what the friction feels like – [drop me a line](mailto:jeni@wordwright.io).
