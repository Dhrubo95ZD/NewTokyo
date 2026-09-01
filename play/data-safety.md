# Google Play Data Safety answers

Use this as the source of truth when completing the Play Console form. Verify it again whenever a new SDK is added.

| Data type | Collected | Shared | Purpose | Optional | Deletion |
|---|---:|---:|---|---:|---|
| Email address | Yes | Service providers | Account management, authentication | No | In-app and web account deletion |
| User IDs | Yes | Service providers | Authentication, cloud save, multiplayer | No | In-app and web account deletion |
| Name / codename | Yes | Other players where displayed | Player profile and social systems | Codename required | Account deletion |
| User-generated content | Yes | Other players according to feature | Chat, mail, forums, families | Yes | Account deletion / moderation |
| App interactions | Yes | Service providers | Gameplay progress and online systems | No | Account deletion |
| Diagnostics | Yes | Service providers | Crash and error diagnosis | No | Account deletion where linked; operational retention may apply |

- Data is encrypted in transit.
- Account creation is required because this is an online persistent game.
- Users can request deletion in the app and at `https://dhrubo95zd.github.io/NewTokyo/delete-account.html`.
- The app does not sell data and contains no advertising SDK.
- Google and Supabase are service providers. The market-data provider receives server-originated symbol requests, not player personal data.
- Intended audience: adults 18+.

