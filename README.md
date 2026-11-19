# Sirawise

Sirawise turns one master career record into tailored CVs, cover letters, and interview preparation. It starts with Arabic and supports English.

AI never invents facts. The user reviews and approves every change. Arabic and English documents stay separate.

Sirawise is in private development. It is not yet launched.

## Local development

Follow [the development guide](docs/development.md) to install the required tools, prepare Postgres, and start the app.

After the local database is ready, run `pnpm db:seed:demo` to create the sample workspace. The guide describes its account, safety limits, and reset command.

## Project structure

- `apps/web` contains the web app. `apps/server` contains the HTTP server. `apps/mobile` contains the retained native app.
- `packages` contains shared schemas, services, database access, document rendering, and UI components.
- `tooling` contains local development and test tools. `Planning` contains product decisions and the roadmap.

## Attribution and license

Sirawise is built on [Reactive Resume](https://github.com/reactive-resume/reactive-resume) by Amruth Pillai, under the MIT license.

Copyright (c) 2026 Amruth Pillai

The upstream copyright and permission notice remain in [LICENSE](LICENSE). Third-party license notices remain with their source files and distributed assets.
