# Product backlog

These features are off in production. Each one needs an owner decision before it is turned on.
The code gate is `deferredFeatures` in `packages/schema/src/personal-tools.ts`, unless the item names another place.

## Features off in code

- [ ] AI chat assistant (`assistant`). Free-form chat with the AI. The CV import and review AI is already on.
- [ ] Public CV links (`publicSharing`). Share a CV through a public web address.
- [ ] Job search (`jobSearch`).
- [ ] Interview practice (`interviews`).
- [ ] Integrations (`integrations`). Connections to outside services.
- [ ] Bring your own AI key (`byok`). Users add their own AI provider key.
- [ ] Developer API and MCP access (`userApi`). Google sign-in is the only allowed route in this group.
- [ ] Career automation (`careerAutomation`).

## Features off for other reasons

- [ ] Word (.docx) download. It shows as not available until it passes the A05 quality gate.
- [ ] Payments with Moyasar. The merchant account, offer and fees need approval first.

## Turned on

- [x] Cover letters and job applications board. Turned on in production on 2026-11-20 with `PERSONAL_CAREER_TOOLS_RELEASE_APPROVED=true` in the server environment.
