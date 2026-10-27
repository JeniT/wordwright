<script setup lang="ts">
import { RouterLink } from 'vue-router'
import HelpPage from '../components/HelpPage.vue'
</script>

<template>
  <HelpPage title="Terms of use">
    <div class="space-y-6">
      <p>
        These are the terms for using Wordwright. “We” means Jeni Tennison Consulting Ltd, trading
        as Wordwright. By creating an account you agree to them.
      </p>

      <section class="callout" aria-labelledby="t-short">
        <h2 id="t-short" class="mb-1 font-medium">In short</h2>
        <ul class="list-disc space-y-1 pl-5">
          <li>Wordwright is an alpha. It may change, break or end.</li>
          <li>What you write is yours. We don’t publish it or train an AI on it.</li>
          <li>You use your own AI key, and you pay your provider for it.</li>
          <li>You can delete your account at any time.</li>
        </ul>
      </section>

      <section aria-labelledby="t-alpha">
        <h2 id="t-alpha" class="mb-1 font-display text-xl font-semibold">This is an alpha</h2>
        <p>
          Wordwright is still being built, and only people we approve can use it. It may change,
          have faults or be unavailable at times.
        </p>
        <p class="mt-2">
          We may end it or remove an account. We will give reasonable notice and a chance to
          download your writing wherever we can. Keep a copy of anything you can’t afford to lose.
        </p>
      </section>

      <section aria-labelledby="t-who">
        <h2 id="t-who" class="mb-1 font-display text-xl font-semibold">Who can use it</h2>
        <p>
          Anyone can use Wordwright for their own writing, whatever their age. Give us true details
          and keep your password to yourself. Tell us if you think someone else has got into your
          account. You are responsible for what is done with it.
        </p>
      </section>

      <section aria-labelledby="t-yours">
        <h2 id="t-yours" class="mb-1 font-display text-xl font-semibold">Your writing is yours</h2>
        <p>
          What you write belongs to you, or to whoever owned it already. We claim no rights over it.
          You give us permission only to store it and show it to the people you share it with. You
          also let us send the parts you choose to your AI provider.
        </p>
        <p>
          If you hand over a draft to another user, they take ownership of it. They might share
          parts of it with their AI provider. Only hand over drafts to people you trust.
        </p>
        <p class="mt-2">We don’t publish it or train any AI on it. The words are yours.</p>
      </section>

      <section aria-labelledby="t-ai">
        <h2 id="t-ai" class="mb-1 font-display text-xl font-semibold">Your AI provider and key</h2>
        <ul class="list-disc space-y-1 pl-5">
          <li>
            Wordwright has no AI of its own. You use your own key from a provider such as Anthropic,
            and you pay the provider for the use of your AI through Wordwright.
          </li>
          <li>
            You agree the provider’s terms with it, not us. Check them, and that the key is yours to
            use. Make a key just for Wordwright, with a spending limit.
          </li>
          <li>
            When you press an AI button, the text it needs goes to your provider, usually outside
            the UK.
          </li>
          <li>
            In a publication with other members, conversations with AIs are shared. Each message
            sends the whole conversation to the provider of whoever sent it. That can include other
            members’ earlier messages.
          </li>
          <li>
            Providers require an adult to hold the account, so a young person needs an adult to hold
            the key.
          </li>
          <li>
            The AI can be wrong. Judge what it says yourself. We are not responsible for what a
            provider does with your text, or what it charges.
          </li>
        </ul>
        <p class="mt-2">
          See
          <RouterLink :to="{ name: 'help-privacy' }" class="link"
            >Your AI provider and privacy</RouterLink
          >
          for what to check.
        </p>
      </section>

      <section aria-labelledby="t-use">
        <h2 id="t-use" class="mb-1 font-display text-xl font-semibold">How to use it</h2>
        <p>Don’t:</p>
        <ul class="list-disc space-y-1 pl-5">
          <li>break the law, or use Wordwright to harass, deceive or threaten anyone</li>
          <li>send invitations or review requests to people who don’t want them</li>
          <li>
            try to get into other people’s accounts or writing, or to overload or interfere with the
            service
          </li>
          <li>share your account, or use someone else’s</li>
        </ul>
        <p class="mt-2">
          We may suspend or delete an account that breaks these rules. We will say why, unless the
          law stops us.
        </p>
      </section>

      <section aria-labelledby="t-sharing">
        <h2 id="t-sharing" class="mb-1 font-display text-xl font-semibold">Sharing with others</h2>
        <p>
          Members of a shared publication see its notes, drafts and conversations. A reviewer sees
          the draft they are asked to read. If you hand over a draft, the new editor gets to choose
          what is done with it. Share only with people you trust.
        </p>
      </section>

      <section aria-labelledby="t-others">
        <h2 id="t-others" class="mb-1 font-display text-xl font-semibold">
          Other people in your writing
        </h2>
        <p>
          Your writing may include information about other people. You decide why and how it is
          used, and we handle it only for you. Data protection law calls us your processor for it.
          We promise to:
        </p>
        <ul class="mt-2 list-disc space-y-1 pl-5">
          <li>only use it to run Wordwright for you, as you tell us through the app</li>
          <li>keep everyone who works with it bound to confidentiality</li>
          <li>keep it secure, and tell you without undue delay if it is lost or exposed</li>
          <li>
            only use the companies named in the
            <RouterLink :to="{ name: 'help-privacy-notice' }" class="link"
              >privacy notice</RouterLink
            >, under terms like these, and tell you before we add one
          </li>
          <li>
            help you answer questions from the people it is about, and delete it when you delete
            your account (backups clear within about 37 days)
          </li>
          <li>show you how we meet these promises, if you ask</li>
        </ul>
        <p class="mt-2">
          You promise to have a lawful reason to put it there. Don’t enter anything you couldn’t
          send to a trusted contractor.
        </p>
      </section>

      <section aria-labelledby="t-resp">
        <h2 id="t-resp" class="mb-1 font-display text-xl font-semibold">
          What we’re responsible for
        </h2>
        <p>
          We use reasonable care and skill. During the alpha Wordwright is free and comes as it is.
          We don’t promise it will be uninterrupted or free of faults.
        </p>
        <p class="mt-2">
          We are not liable for losses we couldn’t reasonably have foreseen, or for a provider does.
          Nothing here limits what the law says we owe you. That includes death or injury caused by
          negligence, fraud, your consumer rights and data protection law.
        </p>
      </section>

      <section aria-labelledby="t-law">
        <h2 id="t-law" class="mb-1 font-display text-xl font-semibold">Leaving, and changes</h2>
        <p>
          You can delete your account at any time in your account settings. Work you added to a
          publication that carries on without you stays there, as the deletion screen explains.
        </p>
        <p class="mt-2">
          We will email account holders before we change these terms in a way that matters. You may
          delete your account if you disagree with the new terms.
        </p>
        <p class="mt-2">
          The law of England and Wales applies, and its courts decide any dispute. If you live
          elsewhere in the UK, you may use your own courts. Send any questions to
          <a href="mailto:hello@wordwright.io" class="link">hello@wordwright.io</a>.
        </p>
      </section>

      <p class="text-sm text-ink-soft">Last updated: 26 October 2026.</p>
    </div>
  </HelpPage>
</template>
