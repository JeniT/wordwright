# Email: provider-neutral SMTP; sent after responding; zero-setup default

`SmtpMailer` (nodemailer) works with any provider, so choosing Resend/Postmark/SES is configuration, not code.
`MAIL_TRANSPORT=console` is the default so local development needs no provider; `file` lets e2e tests read the
"inbox"; production refuses anything but `smtp`. Reset emails are sent in the background: awaiting the mail server
would make "this address has an account" observable through response time or a 500 when mail is down. The cost is
that a delivery failure isn't visible to the user, so it is logged (user id + SMTP error code, never the link) and
the SMTP connection is verified at startup.
