<script setup lang="ts">
import { RouterLink } from 'vue-router'
import HelpPage from '../components/HelpPage.vue'
import NewTabLink from '../components/NewTabLink.vue'
</script>

<template>
  <HelpPage title="Privacy notice">
    <div class="space-y-6">
      <p>
        This says what Wordwright keeps about you, why, who else handles it, and what you can ask us
        to do. “We” means Jeni Tennison Consulting Ltd.
      </p>

      <section class="callout" aria-labelledby="pn-short">
        <h2 id="pn-short" class="mb-1 font-medium">In short</h2>
        <ul class="list-disc space-y-1 pl-5">
          <li>We keep little: your name, email address, username and what you write.</li>
          <li>We never sell it, advertise with it or track you.</li>
          <li>Your writing goes to your AI provider only when you press an AI button.</li>
          <li>You can download your writing and delete your account yourself.</li>
        </ul>
      </section>

      <section aria-labelledby="pn-who">
        <h2 id="pn-who" class="mb-1 font-display text-xl font-semibold">Who we are</h2>
        <p>
          We decide why and how your account details are used. We are registered with the
          Information Commissioner’s Office (ICO), reference ZB302880. Write to us at
          <a href="mailto:hello@wordwright.io" class="link">hello@wordwright.io</a>.
        </p>
      </section>

      <section aria-labelledby="pn-hold">
        <h2 id="pn-hold" class="mb-1 font-display text-xl font-semibold">What we keep</h2>
        <ul class="list-disc space-y-1 pl-5">
          <li>
            Your account: your name, username, email address and sign-up date. Also your password,
            stored so that we can check it but not read it back, or the identifier Google gives us.
          </li>
          <li>
            Your writing: your publications, ideas, notes, articles, drafts, comments and
            conversations with your AI. It may mention other people. We read it only if you ask us
            for help or the law requires it.
          </li>
          <li>
            Your devices: for each place you are signed in, a label such as “Safari on macOS” and
            the times you used it. We do not store your IP address. Our web server may log it
            briefly when something goes wrong.
          </li>
          <li>Your AI key, encrypted, so that the AI buttons can use it for you.</li>
          <li>
            Records that keep the service safe: the owner’s decisions on accounts, which hold no
            name or email once an account is gone, and usernames that were once used, so nobody else
            takes them. Also short-lived server logs, which hold no writing, keys or email
            addresses.
          </li>
        </ul>
        <p class="mt-2">We make no automated decisions about you.</p>
      </section>

      <section aria-labelledby="pn-why">
        <h2 id="pn-why" class="mb-1 font-display text-xl font-semibold">Why we may use it</h2>
        <p>
          We need almost all of it to give you the service you signed up for. The law calls this a
          contract.
        </p>
        <p class="mt-2">
          We keep the rest for security and to stop abuse. The law calls this legitimate interests.
          We have weighed it against your interests, and keep only what is needed.
        </p>
      </section>

      <section aria-labelledby="pn-email">
        <h2 id="pn-email" class="mb-1 font-display text-xl font-semibold">Emails we send</h2>
        <p>
          We email you only about your account, or when you or another person asked us to send
          something. That means confirming your address, resetting a password, a decision on your
          account, a warning before an unused account is deleted, invitations, review requests and
          handovers.
        </p>
        <p class="mt-2">
          We send no newsletters or promotions. If a member invites you, you can decline from the
          email, and block that person or everyone.
        </p>
      </section>

      <section aria-labelledby="pn-ai">
        <h2 id="pn-ai" class="mb-1 font-display text-xl font-semibold">Your AI provider</h2>
        <p>
          We have no AI of our own. When you press an AI button, the text that feature needs goes to
          the provider you chose (Anthropic today), using your own key.
        </p>
        <ul class="mt-2 list-disc space-y-1 pl-5">
          <li>It happens only when you press the button.</li>
          <li>
            Anthropic usually handles it in the United States, outside the UK, under the agreement
            you made with it, not ours.
          </li>
          <li>We keep no copy, except a conversation you can see and delete.</li>
          <li>
            In a publication with other members, a conversation with your AI is shared. Each message
            you send also sends the earlier messages, including other members’.
          </li>
          <li>Comments, and anything a reviewer writes, are never sent to an AI.</li>
        </ul>
        <p class="mt-2">
          Don’t enter anything you couldn’t send to a trusted contractor. See
          <RouterLink :to="{ name: 'help-privacy' }" class="link"
            >Your AI provider and privacy</RouterLink
          >
          for what to check with your provider.
        </p>
      </section>

      <section aria-labelledby="pn-others">
        <h2 id="pn-others" class="mb-1 font-display text-xl font-semibold">Who else handles it</h2>
        <ul class="list-disc space-y-1 pl-5">
          <li>UpCloud hosts the site, the database and backups, in London.</li>
          <li>
            Scaleway, in France, sends our emails, so it sees your email address and the email. It
            also keeps encrypted backups.
          </li>
          <li>
            Gandi, in France, runs our web address and passes mail sent to hello@wordwright.io on to
            us.
          </li>
          <li>
            Google, if you sign in with Google. It tells us your name, email address and an account
            identifier, under its own privacy policy.
          </li>
          <li>Your AI provider, as above.</li>
        </ul>
        <p class="mt-2">
          UpCloud, Scaleway and Gandi act only on our instructions, under written agreements with us
          (the law calls them processors). UK rules allow data to move to France without extra
          safeguards. We share your data with nobody else, unless the law requires it.
        </p>
      </section>

      <section aria-labelledby="pn-long">
        <h2 id="pn-long" class="mb-1 font-display text-xl font-semibold">How long we keep it</h2>
        <ul class="list-disc space-y-1 pl-5">
          <li>
            Your account and writing: until you delete your account. During the alpha, we delete an
            unused account only if it was never confirmed by email, after 14 days.
          </li>
          <li>Signing in on a device: 30 days, or until you sign out.</li>
          <li>
            Links in emails: an hour for a password reset, 24 hours for the rest. Invitations last 7
            days.
          </li>
          <li>
            Backups: 14 days on the server and 30 days off-site, plus 7 for an older version.
            Deleted data can stay in a backup for about 37 days. We never put it back. If we have to
            restore a backup, we delete it again.
          </li>
          <li>
            Email records: Scaleway deletes the content of an email soon after delivery. It keeps a
            record of who it went to for as long as our sending address is in use. Deleting your
            account does not remove your address from these records. Ask us and we will ask Scaleway
            to remove it.
          </li>
        </ul>
      </section>

      <section aria-labelledby="pn-rights">
        <h2 id="pn-rights" class="mb-1 font-display text-xl font-semibold">Your rights</h2>
        <p>
          You can ask to see what we hold about you, correct it, delete it, limit it, object to it
          and take it elsewhere. Most of this you can do yourself:
        </p>
        <ul class="mt-2 list-disc space-y-1 pl-5">
          <li>Change your name, email address and username in your account details.</li>
          <li>Download your writing as Markdown files in your account settings.</li>
          <li>
            Delete your account in your account settings. It takes effect straight away. You choose
            whether your name stays on work in publications that carry on without you, or shows as
            “a former member”.
          </li>
          <li>Remove your AI key whenever you like.</li>
        </ul>
        <p class="mt-2">
          The download leaves out some of what we hold about you, such as comments about your
          writing. For that, or if you can’t sign in, write to
          <a href="mailto:hello@wordwright.io" class="link">hello@wordwright.io</a>. We reply within
          one month.
        </p>
      </section>

      <section aria-labelledby="pn-children">
        <h2 id="pn-children" class="mb-1 font-display text-xl font-semibold">Young people</h2>
        <p>
          Wordwright is open to writers of any age, and we don’t ask how old you are. We keep no
          more about a young person than about an adult. Nobody can find or contact you unless you
          or another member invites them.
        </p>
        <p class="mt-2">
          You, or a parent or carer, can ask us to delete an account at any time. The AI features
          need a key from an AI provider, and providers require an adult to hold the account.
        </p>
      </section>

      <section aria-labelledby="pn-complain">
        <h2 id="pn-complain" class="mb-1 font-display text-xl font-semibold">If you’re unhappy</h2>
        <p>
          Tell us first, and we will try to put it right. You can also complain to the ICO at
          <NewTabLink href="https://ico.org.uk/make-a-complaint/" class="link"
            >ico.org.uk</NewTabLink
          >, or by calling 0303 123 1113.
        </p>
      </section>

      <p class="text-sm text-ink-soft">
        Last updated: 26 October 2026. We will email account holders about any important change.
      </p>
    </div>
  </HelpPage>
</template>
