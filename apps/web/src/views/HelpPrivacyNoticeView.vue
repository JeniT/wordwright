<script setup lang="ts">
import { RouterLink } from 'vue-router'
import HelpPage from '../components/HelpPage.vue'
import NewTabLink from '../components/NewTabLink.vue'
</script>

<template>
  <HelpPage title="Privacy notice">
    <div class="space-y-6">
      <p class="text-ink-soft">
        This says what Wordwright keeps about you, why, who else handles it, and what you can ask us
        to do. We keep little, and we never sell it or use it for advertising.
      </p>

      <section aria-labelledby="pn-who">
        <h2 id="pn-who" class="mb-1 font-display text-xl font-semibold">Who we are</h2>
        <p>
          Wordwright is run by Jeni Tennison Consulting Ltd, which decides why and how your account
          details are used. We are registered with the Information Commissioner’s Office (ICO),
          reference ZB302880. Write to us at
          <a href="mailto:hello@wordwright.io" class="link">hello@wordwright.io</a>.
        </p>
      </section>

      <section aria-labelledby="pn-hold">
        <h2 id="pn-hold" class="mb-1 font-display text-xl font-semibold">What we keep</h2>
        <ul class="list-disc space-y-1 pl-5">
          <li>
            <strong>Your account:</strong> your name, username, email address, when you signed up,
            and a scrambled form of your password, or the identifier Google gives us if you sign in
            with Google. We need these to give you the service you signed up for.
          </li>
          <li>
            <strong>Your writing:</strong> your publications, ideas, notes, articles, drafts,
            comments and conversations with your AI. It may mention other people. We keep it for
            you, as set out in the
            <RouterLink :to="{ name: 'help-terms' }" class="link">terms</RouterLink>, and read it
            only if you ask us for help or the law requires it.
          </li>
          <li>
            <strong>Your devices:</strong> for each place you are signed in, a label such as “Safari
            on macOS” and the times you used it. We do not store your IP address. Our web server may
            log it briefly when something goes wrong.
          </li>
          <li>
            <strong>Your AI key:</strong> encrypted, so that the AI buttons can use it for you.
          </li>
          <li>
            <strong>Records that keep the service safe:</strong> a log of the owner’s decisions on
            accounts (with no name or email once an account is gone), the usernames that were once
            used so nobody else takes them, and short-lived server logs that hold no writing, keys
            or email addresses.
          </li>
        </ul>
        <p class="mt-2">
          We have no analytics, advertising or tracking, and we make no automated decisions about
          you.
        </p>
      </section>

      <section aria-labelledby="pn-why">
        <h2 id="pn-why" class="mb-1 font-display text-xl font-semibold">Why we may use it</h2>
        <p>
          Almost everything is needed to give you the service, which the law calls a contract. The
          rest we keep for security and to stop abuse, which the law calls legitimate interests. We
          have weighed that against your interests, and keep only what is needed. We never ask for
          your consent because we never rely on it.
        </p>
      </section>

      <section aria-labelledby="pn-email">
        <h2 id="pn-email" class="mb-1 font-display text-xl font-semibold">Emails we send</h2>
        <p>
          Only emails about your account or that you or another person asked us to send: confirming
          your address, resetting a password, a decision on your account, a warning before an unused
          account is deleted, invitations, review requests and handovers. We send no newsletters and
          no promotions. If a member invites you, you can decline from the email and block that
          person, or everyone.
        </p>
      </section>

      <section aria-labelledby="pn-ai">
        <h2 id="pn-ai" class="mb-1 font-display text-xl font-semibold">
          Your AI provider and your writing
        </h2>
        <p>
          We have no AI of our own. When you press an AI button, the text that feature needs goes
          from our server to the AI provider you chose (Anthropic today), using your own key. This
          happens only when you press the button. Anthropic usually handles it in the United States,
          outside the UK, and under the agreement you made with it, not ours. We keep no copy except
          a conversation with your AI that you can see and delete.
        </p>
        <p class="mt-2">
          In a publication with other members, a conversation with your AI is shared, so each
          message you send sends the whole conversation so far, including earlier messages from
          other members. Comments, and anything a reviewer writes, are never sent to an AI. Don’t
          enter anything you couldn’t send to a trusted contractor. Read
          <RouterLink :to="{ name: 'help-privacy' }" class="link"
            >Privacy and your writing</RouterLink
          >
          for what to check with your provider.
        </p>
      </section>

      <section aria-labelledby="pn-others">
        <h2 id="pn-others" class="mb-1 font-display text-xl font-semibold">
          Who else handles your data
        </h2>
        <ul class="list-disc space-y-1 pl-5">
          <li><strong>UpCloud</strong> hosts the site, the database and backups, in London.</li>
          <li>
            <strong>Scaleway</strong> (France) sends our emails, so it sees your email address and
            the email. It also keeps encrypted backups.
          </li>
          <li>
            <strong>Gandi</strong> (France) runs our web address and passes mail sent to
            hello@wordwright.io on to us.
          </li>
          <li>
            <strong>Google</strong>, if you sign in with Google. It tells us your name, email
            address and an account identifier, under its own privacy policy.
          </li>
          <li><strong>Your AI provider</strong>, as above.</li>
        </ul>
        <p class="mt-2">
          UpCloud, Scaleway and Gandi act only on our instructions, under data processing agreements
          with us. France is covered by UK adequacy regulations, so moving data there needs no extra
          safeguards. We share your data with nobody else, unless the law requires it.
        </p>
      </section>

      <section aria-labelledby="pn-long">
        <h2 id="pn-long" class="mb-1 font-display text-xl font-semibold">How long we keep it</h2>
        <ul class="list-disc space-y-1 pl-5">
          <li>
            <strong>Your account and writing:</strong> until you delete your account. During the
            alpha we do not delete accounts for being unused, except one that was never confirmed by
            email, which goes after 14 days.
          </li>
          <li><strong>Sign-in on a device:</strong> 30 days, or until you sign out.</li>
          <li>
            <strong>Links in emails:</strong> an hour for a password reset, 24 hours for the rest.
            Invitations last 7 days.
          </li>
          <li>
            <strong>Backups:</strong> 14 days on the server and 30 days off-site (plus 7 days for an
            older version). Deleted data can stay in a backup for up to about 37 days. It is not put
            back, and if we ever have to restore a backup we delete it again.
          </li>
          <li>
            <strong>Email records:</strong> Scaleway deletes the content of an email soon after it
            is delivered, but keeps a record of who it went to for as long as our sending address is
            in use. Deleting your account does not remove your address from these records. Ask us
            and we will ask Scaleway to remove it.
          </li>
        </ul>
      </section>

      <section aria-labelledby="pn-rights">
        <h2 id="pn-rights" class="mb-1 font-display text-xl font-semibold">Your rights</h2>
        <p>
          You can ask to see what we hold about you, to correct it, to delete it, to limit how we
          use it, to object to it, and to take your data elsewhere. Most of this you can do
          yourself:
        </p>
        <ul class="mt-2 list-disc space-y-1 pl-5">
          <li>Change your name, email address and username in your account details.</li>
          <li>Download your writing as Markdown files in your account settings.</li>
          <li>
            Delete your account in your account settings. It takes effect straight away. You choose
            whether your display name stays on work in publications that carry on without you, or
            shows as “a former member”.
          </li>
          <li>Remove your AI key whenever you like.</li>
        </ul>
        <p class="mt-2">
          The download does not yet include everything we hold about you, such as comments about
          your writing. For anything else, or if you can’t sign in, write to
          <a href="mailto:hello@wordwright.io" class="link">hello@wordwright.io</a>. We reply within
          one month.
        </p>
      </section>

      <section aria-labelledby="pn-children">
        <h2 id="pn-children" class="mb-1 font-display text-xl font-semibold">Young people</h2>
        <p>
          Wordwright is open to writers of any age, and we don’t ask how old you are. We keep no
          more about a young person than about an adult. Nobody can find or contact you through
          Wordwright unless you or another member invites them. You, or a parent or carer, can ask
          us to delete an account at any time. The AI features need a key from an AI provider, and
          providers require the account holder to be an adult.
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
        We will change this notice when what we do changes, and tell account holders by email about
        anything important. Last updated: 26 October 2026.
      </p>
    </div>
  </HelpPage>
</template>
