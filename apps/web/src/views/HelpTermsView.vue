<script setup lang="ts">
import { RouterLink } from 'vue-router'
import HelpPage from '../components/HelpPage.vue'
</script>

<template>
  <HelpPage title="Terms of use">
    <div class="space-y-6">
      <p class="text-ink-soft">
        These are the terms on which Jeni Tennison Consulting Ltd (“we”) lets you use Wordwright. By
        creating an account you agree to them. They are meant to be read.
      </p>

      <section aria-labelledby="t-alpha">
        <h2 id="t-alpha" class="mb-1 font-display text-xl font-semibold">This is an alpha</h2>
        <p>
          Wordwright is still being built, and only people we approve can use it. It may change,
          have faults or be unavailable, and we may end it or remove an account, giving you
          reasonable notice and a chance to download your writing wherever we can. Keep a copy of
          anything you can’t afford to lose: the download in your account settings gives you your
          writing as Markdown files.
        </p>
      </section>

      <section aria-labelledby="t-who">
        <h2 id="t-who" class="mb-1 font-display text-xl font-semibold">Who can use it</h2>
        <p>
          Anyone can use Wordwright for their own writing, whatever their age. You must give us true
          details, keep your password to yourself, and tell us if you think someone else has got
          into your account. You are responsible for what is done with it.
        </p>
      </section>

      <section aria-labelledby="t-yours">
        <h2 id="t-yours" class="mb-1 font-display text-xl font-semibold">Your writing is yours</h2>
        <p>
          What you write belongs to you (or to whoever owns it already). We claim no rights over it.
          You give us only permission to store it, show it to the people you share it with, and send
          the parts you choose to your AI provider, so that Wordwright can work. We do not publish
          it, use it to train any AI, or write any of it for you. The AI points and asks. The words
          are yours.
        </p>
      </section>

      <section aria-labelledby="t-ai">
        <h2 id="t-ai" class="mb-1 font-display text-xl font-semibold">Your AI provider and key</h2>
        <ul class="list-disc space-y-1 pl-5">
          <li>
            Wordwright has no AI of its own. You use your own key from an AI provider, such as
            Anthropic, and you pay the provider for what the key is used for.
          </li>
          <li>
            You agree the provider’s terms with it, not us. Check them, and that your key is yours
            to use. Use a key made just for Wordwright, with a spending limit.
          </li>
          <li>
            When you press an AI button, the text it needs is sent to your provider, usually outside
            the UK. In a publication with other members, a brainstorm sends the whole shared
            conversation, including other members’ messages, to the provider of whoever sends the
            next message.
          </li>
          <li>
            We try to make the AI useful, but it can be wrong. Judge what it says yourself. We are
            not responsible for what a provider does with your text, or for what it charges.
          </li>
          <li>
            Providers require the account holder to be an adult, so a young person needs an adult to
            hold the key.
          </li>
        </ul>
        <p class="mt-2">
          <RouterLink :to="{ name: 'help-privacy' }" class="link"
            >Privacy and your writing</RouterLink
          >
          says what to check.
        </p>
      </section>

      <section aria-labelledby="t-use">
        <h2 id="t-use" class="mb-1 font-display text-xl font-semibold">How to use it</h2>
        <p>Please don’t:</p>
        <ul class="list-disc space-y-1 pl-5">
          <li>break the law, or use Wordwright to harass, deceive or threaten anyone;</li>
          <li>send invitations or review requests to people who don’t want them;</li>
          <li>
            try to get into other people’s accounts or writing, or to overload or interfere with the
            service;
          </li>
          <li>share your account, or use someone else’s.</li>
        </ul>
        <p class="mt-2">
          We may suspend or delete an account that does. We will say why, unless the law stops us.
        </p>
      </section>

      <section aria-labelledby="t-sharing">
        <h2 id="t-sharing" class="mb-1 font-display text-xl font-semibold">Sharing with others</h2>
        <p>
          Members of a publication can see its notes, drafts and conversations, and a reviewer sees
          the draft they are asked to read. Share only with people you trust, and only what you may
          share. If you invite someone, you are responsible for having a good reason to, and we send
          the invitation for you.
        </p>
      </section>

      <section aria-labelledby="t-others">
        <h2 id="t-others" class="mb-1 font-display text-xl font-semibold">
          Other people’s information in your writing
        </h2>
        <p>
          Your writing may include personal information about other people. For that information you
          decide why and how it is used, and we handle it only for you. Under UK data protection law
          that makes us your processor, and we promise to:
        </p>
        <ul class="mt-2 list-disc space-y-1 pl-5">
          <li>use it only to run Wordwright for you, and as you tell us through the app;</li>
          <li>keep everyone who works with it bound to confidentiality;</li>
          <li>keep it secure, and tell you without undue delay if it is lost or exposed;</li>
          <li>
            use only the processors listed in the
            <RouterLink :to="{ name: 'help-privacy-notice' }" class="link"
              >privacy notice</RouterLink
            >, under terms like these, and tell you before we add one;
          </li>
          <li>
            help you answer requests from the people it is about, and delete it when you delete the
            account (backups clear within about 37 days);
          </li>
          <li>show you what we have done to meet these promises, if you ask.</li>
        </ul>
        <p class="mt-2">
          You promise to have a lawful reason to put it there, and not to enter anything you
          couldn’t send to a trusted contractor. For your account itself (your name and email
          address), we are the one who decides, as the privacy notice says.
        </p>
      </section>

      <section aria-labelledby="t-end">
        <h2 id="t-end" class="mb-1 font-display text-xl font-semibold">Leaving</h2>
        <p>
          You can delete your account at any time in your account settings. Work you added to a
          publication that carries on without you stays there, as the deletion screen explains.
        </p>
      </section>

      <section aria-labelledby="t-resp">
        <h2 id="t-resp" class="mb-1 font-display text-xl font-semibold">
          What we’re responsible for
        </h2>
        <p>
          We use reasonable care and skill, but we give Wordwright as it is, free of charge during
          the alpha, and do not promise that it will be uninterrupted or free of faults. We are not
          liable for losses we could not reasonably have foreseen, or for a provider’s acts. Nothing
          here limits what we owe you by law, including for death or injury caused by negligence,
          for fraud, or for your rights as a consumer or under data protection law.
        </p>
      </section>

      <section aria-labelledby="t-law">
        <h2 id="t-law" class="mb-1 font-display text-xl font-semibold">Changes and the law</h2>
        <p>
          We will tell account holders by email before we change these terms in a way that matters,
          and you may delete your account if you disagree. The law of England and Wales applies, and
          its courts can decide any dispute, although if you live elsewhere in the UK you may use
          your own courts. Questions:
          <a href="mailto:hello@wordwright.io" class="link">hello@wordwright.io</a>.
        </p>
      </section>

      <p class="text-sm text-ink-soft">Last updated: 26 October 2026.</p>
    </div>
  </HelpPage>
</template>
