# Image for uniswap-watch. Build from the repo root, which holds the package.json and yarn.lock it installs:
#   docker build -f uniswap-watch/Dockerfile .
#
# The solver's image cannot run it: the solver build compiles only the repo root (tsconfig includes *.ts), so
# uniswap-watch never reaches dist, and tsx - how `yarn uni:watch` runs it - is a dev dependency that a production
# install leaves out. This mirrors the solver's runtime stage and adds tsx instead of a build.
FROM node:22-alpine

WORKDIR /workspace

RUN apk add --no-cache git

COPY package.json yarn.lock ./
RUN yarn install --production --ignore-scripts \
  && yarn cache clean \
  && npm install -g pm2 tsx \
  && npm cache clean --force

COPY uniswap-watch/index.ts ./uniswap-watch/index.ts

# index.ts opens ./swaps.db next to itself, so the working copy of the database lives in this directory.
WORKDIR /workspace/uniswap-watch

CMD ["pm2-runtime", "start", "index.ts", "--name", "uniswap-watch", "--interpreter", "tsx", \
     "--output", "/workspace/logs/uniswap-watch-out.log", \
     "--error", "/workspace/logs/uniswap-watch-error.log"]
