# Quillcast — Privacy Policy

_Last updated: 2026-06-07_

Quillcast is a Chrome extension that turns a YouTube video's transcript into text
assets (newsletter, blog post, tweet thread, video description). This policy
explains what data Quillcast handles and how.

## What we process

When you click a format button on a YouTube video, Quillcast reads:

- the **video's transcript/caption text** (from the page you are viewing), and
- the **video title and channel name** (used only as context for better output).

This information is sent to our server, which forwards it to the **OpenAI API**
to generate the text you requested. The generated text is returned to you and
shown in the panel. We do **not** store the transcript or the generated text.

To run the free tier and prevent abuse, our server also handles:

- a **random anonymous install ID** that the extension generates and stores
  locally (in `chrome.storage`). It is sent with each request so we can count how
  many free generations an install has used this month. It is not linked to your
  name, email, or identity.
- your **IP address**, used only transiently (a counter that expires within
  minutes) to limit request rate and stop automated abuse.

If you subscribe (see Payments), the extension also stores your **license key**
locally and sends it with requests so the server can verify your subscription.

## What we store

Our server keeps only:

- per-install **usage counts** (how many generations, by the anonymous install
  ID, for the current month) — to enforce the free limit, and
- a short-lived **license-validity cache** for paid users.

We do **not** store transcripts, generated text, video titles, channel names, or
any content you produce.

## What we do NOT do

- We do **not** collect your name, email (except through the payment provider if
  you choose to subscribe), browsing history, or other personal identifiers.
- We do **not** use analytics, advertising, or tracking cookies.
- We do **not** sell or share your data, except with the service providers below,
  solely to operate the service.

## Third-party processing

- **OpenAI (API):** transcript text and video title/channel are sent to OpenAI to
  generate the output. OpenAI does not use data submitted via its API to train its
  models. See https://openai.com/policies/privacy-policy and
  https://openai.com/policies/api-data-usage-policies
- **Lemon Squeezy (payments, if you subscribe):** subscriptions are handled by
  Lemon Squeezy as Merchant of Record. Your payment details (card, billing info)
  go to Lemon Squeezy and its processors — we never receive or store them. See
  https://www.lemonsqueezy.com/privacy
- **Vercel / Upstash (hosting & data store):** our server runs on Vercel and uses
  Upstash to store the usage counts described above.

## Permissions

- Access to `youtube.com` pages: needed to read the transcript of the video you
  are watching and to show the Quillcast panel.
- `storage`: to keep your anonymous install ID and (if you subscribe) license key
  on your device.
- Network access to our server: needed to send the transcript for generation.

Quillcast only acts when you click a button. It does not run generation in the
background.

## Payments

Paid subscriptions are processed by **Lemon Squeezy** (Merchant of Record). When
you subscribe, Lemon Squeezy issues a license key that you enter into the
extension. We store that key on your device and use it only to verify your
subscription with Lemon Squeezy. We do **not** receive or store your card details.

## Contact

Questions about this policy: **rlaalsxo1990@gmail.com**

## Changes

We may update this policy. Material changes will be reflected by the "Last
updated" date above.
