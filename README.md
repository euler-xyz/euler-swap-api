# Instalation

Install npm packages
```
pnpm i
```

Copy `.env.template` to `.env` and set configuration. Alternatively use:
```
pnpm run doppler:syncdev # local development
pnpm run doppler:syncstg # staging
pnpm run doppler:syncprd # production
```

# Running

Dev server
```
pnpm run dev
```

Prod
```
pnpm run build
pnpm run start
```

# Lint
```
pnpm run lint       # check
pnpm run lint:fix   # fix
```

DOC
- install/run
- config

- quoters
- strategies
- pipeline
- routing override

