# WhatsApp result delivery

The feature is implemented with the official WhatsApp Business Cloud API and remains off by default. Saving or correcting marks never sends a message. The teacher who created a test must open its marks sheet, review readiness, and confirm **Publish & send results**. A separate immutable batch is created for each marks version, so a corrected result uses the correction template and cannot overwrite the first message record.

Each student must have a primary guardian with an international WhatsApp number and recorded consent. The send is private and contains only that student's result. The screen blocks the whole batch until every roster student has a recorded result and an eligible primary contact.

## Meta setup

1. Create or connect the school's Meta Business account and WhatsApp Business Account. Register the school's sending number.
2. Create and obtain approval for two utility templates named by `WHATSAPP_RESULT_TEMPLATE` and `WHATSAPP_CORRECTION_TEMPLATE`.
3. Both templates must use six body variables in this order: guardian name, student name, subject, test name, test date, result (`marks / total`, `absent`, or `not attempted`). The correction template should clearly say that it replaces the earlier result.
4. Set the deployment secrets listed in `platform/.env.example`. Use a Graph API version supported by Meta; do not commit access tokens, verify tokens, or the app secret.
5. Configure the Meta webhook callback as `https://YOUR-SCHOOL-DOMAIN/api/whatsapp/webhook`, subscribe to message status updates, and use the same verify token as `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
6. Run the web process and a continuous `npm run whatsapp:worker` process against the same PostgreSQL database. Apply migrations and `scripts/runtime-grants.sql` first.
7. Test with Meta test recipients in staging. Confirm initial and corrected templates, consent withdrawal, sent/delivered/read/failed status updates, and one-student privacy before enabling the school number.

Only set `WHATSAPP_ENABLED=true` after these steps. A provider rejection is marked failed and can be retried by the teacher. A connection failure after submission is marked uncertain and is not automatically retried because Meta may already have accepted the message. Delivery and retry actions are audited; recipient and result snapshots are protected from later edits.
