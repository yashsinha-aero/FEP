# FEP IITK

Local React frontend and Express/SQLite backend for the Foreign Exposure
Programme portal.

## Run locally

### Prerequisites

- Node.js 20 or newer
- npm

### 1. Clone the repository

```bash
git clone https://github.com/yashsinha-aero/FEP.git
cd FEP
```

### 2. Install dependencies

The frontend and backend have separate dependency manifests:

```bash
npm install
cd server
npm install
cd ..
```

### 3. Configure the backend

Create the local server environment file:

```bash
cp server/.env.example server/.env
```

Set a long, random `JWT_SECRET` in `server/.env`. The server can run with an
empty SMTP configuration during local development; emails are printed to the
server console.

Set `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` to provision the first
administrator. There are no default administrator credentials. The server
requires a `JWT_SECRET` of at least 32 characters and will refuse to start
without it.

### 4. Start the backend

In one terminal:

```bash
npm run server:dev
```

The API runs at `http://localhost:5001`. On its first start, it creates the
SQLite database at `server/data/fep.db` and seeds the initial admin account
using `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` if those variables are
configured.

### 5. Start the frontend

In a second terminal, from the repository root:

```bash
npm start
```

Open `http://localhost:3000`. The development server uses the root path;
production builds are configured for `/fep/`.

## Restoring the private migrated data

On your current machine, the migrated users and projects are already stored in
`server/data/fep.db`. That database is local-only and is not included in the
GitHub repository. A fresh clone on another machine therefore starts with an
empty database.

To restore the same migrated data on another machine:

1. Securely copy these files into `imported/`:
   - `accounts.json`
   - `users_cleaned.json`
   - `projects.json`
2. Put the Firebase SCRYPT parameters in `server/.env`.
3. Run the importer from the repository root:

```bash
node server/scripts/import_data.js
```

The importer is idempotent and preserves Firebase password hashes. After the
import succeeds, the JSON export files can be removed from that machine; the
data is stored in `server/data/fep.db`. Keep a private backup of both the
exports and database.

Alternatively, you can securely copy your existing `server/data/fep.db` to the
other machine instead of repeating the import. Do not upload that database to
the public repository because it contains private user data.

Do not commit `.env`, files under `imported/`, or files under `server/data/`.

If imported Firebase users need to log in, set the exact Firebase SCRYPT
parameters in `server/.env`. Keep the signer key private and provision it
through a secure channel; it is intentionally not included in
`server/.env.example`.

## Useful commands

```bash
npm test          # Frontend tests
npm run build     # Production frontend build
npm run server    # Start backend without file watching
```

For backend integration tests, start the backend first and run:

```bash
cd server
TEST_PROFESSOR_PASSWORD='...' TEST_STUDENT_PASSWORD='...' npm test
```

The command also needs `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` from
the server environment. The two test account passwords are supplied only for
the test run and are not stored in the repository.

## Local data migration

Firebase exports in `imported/` and the SQLite database in `server/data/` are
local-only and are intentionally excluded from Git. To populate a fresh local
database, place the private Firebase exports in `imported/`, configure
`server/.env` using `server/.env.example`, and run:

```bash
node server/scripts/import_data.js
```

The importer preserves Firebase SCRYPT password hashes and imports user
profiles and projects. The database continues to work after the source export
files are removed; those files are only required to repeat the migration.

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm run dev`

Starts the backend server locally.

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.
