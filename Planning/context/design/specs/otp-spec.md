# Mobile OTP and recovery contract

**Launch boundary:** In both Arabic and English, launch uses email + password sign-up, email verification and email password recovery. All mobile Phase 1/Phase 2 specifications below are retained for the later T014 increment: mobile signup, SMS verification/reset, recovery codes and S37-S39 are off at launch until company registration, sender approval and A14-A16. D20/D21 are unchanged; mobile completion is not a beta or paid-release prerequisite.

**OWNER DECIDED 2026-11-04.** Product direction only; A01-A16 still apply. A14-A16 gate mobile availability; A15 precedes every real-number send, including staff/pilot tests. Simulator only until A15. No implementation, publication or release approval is implied.

## Scope decision

- Phase 1: Saudi mobile + password sign-up, SMS verification instead of an email link, optional email; S14 mobile/email + password login preserves enrolled MFA. Sign-up verification alone never creates an SMS-only session. Existing email/password remains available.
- Phase 1 includes purpose-bound SMS password reset for verified mobiles. The owner accepts SMS risk for this purpose only. Reset never bypasses enrolled MFA: MFA remains required at next sign-in. Use enumeration-safe responses, notify all verified contact points after reset, revoke all other sessions and grant no signed-in session from reset.
- A number not verified for 12 months (proposed threshold) needs re-verification with independent account proof before reset. Changed or removed numbers cannot reset; invalidate their challenges/proofs. OTP-01..OTP-12 apply through [Security](../../technical/security.md#mobile-authentication-proposed-disabled-until-a14-a16): shared quotas, expiry, attempts, resend, replay and concurrency controls.
- Phone-only accounts receive 8 single-use recovery codes once after creation. Store only hashes; atomic redemption is bound to account/reset purpose. Regeneration from Account recovery requires fresh account proof and invalidates all old codes. These password-reset codes never replace enrolled MFA or its separate backup codes.
- Lost number plus no codes plus no email means no self-service recovery. Support never resets on claims alone. Accounts without email receive the persistent S28 add-email prompt.
- S28 add/change/remove requires fresh existing-account proof independent of the new number and separate mobile verification. Retain the old binding until replacement commits; do not remove the only usable identifier or working recovery path.
- Phase 2 SMS-code-only sign-in stays off/server-denied pending a separate owner risk decision and applicable A14-A16 evidence. National ID/Absher/Nafath, WhatsApp/voice, SMS as MFA, marketing and automatic merging remain excluded.
- Taqnyat first, Unifonic fallback behind the existing adapter; sender `MasterCV`. Company inputs: commercial registration, sender registration papers and written quotes from both providers. A15 still governs each route/purpose.

## Screens and recovery states

Use existing desktop/mobile components and [frame map](../figma-map.json) baselines. Additions below are spec targets for the publish lane, not verified live frames. Sending/checking/resending use Button loading states.

| Target                                   | Required contract                                                                                                                                                                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S15 · Forgot password: mobile            | Field «رقم الجوال أو البريد الإلكتروني» with a mobile value; button «إرسال الرمز»; link «استخدام رمز استرداد». Generic submission status discloses no account or verified-mobile existence.                                                                                |
| S15 · Forgot password: recovery code     | Mobile/email field plus «رمز الاسترداد»; button «متابعة». Error «تعذّر التحقّق. تأكّد من البيانات ورمز الاسترداد أو جرّب طريقة أخرى.» covers invalid/used codes and unknown accounts identically. Valid code grants a one-use continuation to S16, never a session.             |
| S38 · Verify mobile: password reset      | Heading «تحقّق لإعادة تعيين كلمة المرور»; purpose-bound OTP; correct code → S16 New password → S14 `password changed`.                                                                                                                                                      |
| S39 · Mobile verified: recovery codes    | 8 synthetic sample codes in isolated LTR groups, once after phone-only creation; «نسخ الرموز», «تنزيل الرموز»; required checkbox «حفظت الرموز في مكان آمن». Message «تظهر رموز الاسترداد مرة واحدة فقط. احفظها في مكان آمن.»; Continue disabled until checked, then → S04. |
| S28 · Account settings: add email prompt | Persistent row for accounts without email: «أضف بريدًا إلكترونيًا لاسترداد حسابك إذا فقدت رقم الجوال ورموز الاسترداد.»; «إضافة بريد إلكتروني».                                                                                                                                |
| Account recovery dialog/sheet            | Status of masked verified mobile, email and recovery codes remaining (or not set); «إنشاء رموز جديدة», «إضافة بريد إلكتروني». Fresh proof before regeneration; explain that old codes stop working. Never display stored codes again.                                     |
| S36 · Help and contact: SMS help         | Delayed SMS, wrong number, lost SIM, «لا ترسل رمز التحقّق لأي أحد». Add «إذا فقدت رقم الجوال ولم يكن لديك رموز استرداد أو بريد إلكتروني، فلا يمكنك استرداد الحساب بنفسك. لا يعيد الدعم تعيين كلمة المرور بناءً على الادعاءات وحدها.»                                             |

S37 retains Saudi LTR/+966 field, purpose notice, invalid-number/consent-required/send-failed/send-limited states. Create captures password, optional email and create-only terms; add/change follows independent proof. S38 retains wrong-code, expired, too-many-attempts, locked, resend-available, delayed, SMS-help, service-unavailable and additional-verification states. Challenge binds account/number/purpose; reset errors stay enumeration-safe.

S39 retains `account created`, `phone added`, `number changed` and independently proven `account access confirmed`; `signed in` is Phase 2 off. S02/S14 retain mobile-unavailable, password validation and MFA states. S28 retains verified/change-pending/removed/removal-blocked/recovery-setup-required states. S29/S30 require fresh purpose-bound proof; S30 keeps separate final deletion confirmation. Confirm account access uses existing password or approved passkey plus enrolled MFA; Remove mobile number protects the only identifier/recovery path.

## Transitions and fixtures

- Create: S02/S37 password-bearing registration → simulator → S38 → S39 `recovery codes` for phone-only accounts → saved acknowledgment → S04. Accounts with email retain account-created continuation.
- Password login: S14 → required MFA → S17. SMS reset: S15 mobile → simulator → S38 `password reset` → S16 → S14 `password changed`; next sign-in still requires password + enrolled MFA. Recovery code: S15 `recovery code` → S16 → same S14 outcome.
- Settings: S28 → Confirm account access → S37/S38 add/change → S39 → S28; eligible Remove uses its confirmation. Account recovery regeneration replaces the old set atomically and shows the new set once with the same save controls.
- Phase 2 only/off: S14 → S37 → S38 → S39 `signed in` → S17. SMS reset belongs to Phase 1.
- Simulator options يصل الرمز / يتأخر الرمز / لا يصل الرمز; heading «محاكاة الرسائل النصية»; note «للنموذج فقط، لا تُرسل رسالة فعلية». No production simulator, fixed code or bypass. S38 reset Change number returns to S15; create/settings returns to S37; Help opens S36.
- Synthetic fixtures: masked `+966 5X XXX XX42`, OTP `123456` inside simulator only. Recovery samples: `MCV-A1B2-C3D4`, `MCV-E5F6-G7H8`, `MCV-J1K2-L3M4`, `MCV-N5P6-Q7R8`, `MCV-S1T2-U3V4`, `MCV-W5X6-Y7Z8`, `MCV-B2D4-F6H8`, `MCV-K3M5-P7R9`. Samples establish no production format or entropy policy.
- AR/EN desktop/mobile share states, Latin digits and isolated LTR code/number runs. [Copy deck](../copy-deck.json) unpublished text uses `source: spec` with empty `nodeIds`. Locale review/publication remain outstanding; neither approves A14-A16.
