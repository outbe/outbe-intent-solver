FROM node:22-alpine AS builder

WORKDIR /workspace

RUN apk add --no-cache git python3 make g++

COPY package.json yarn.lock ./
RUN yarn install --ignore-scripts

COPY . .
RUN yarn postinstall
RUN yarn build


FROM node:22-alpine AS runtime

WORKDIR /workspace

RUN apk add --no-cache git

COPY package.json yarn.lock ./
RUN yarn install --production --ignore-scripts \
  && yarn cache clean \
  && npm install pm2 -g \
  && npm cache clean --force

COPY --from=builder /workspace/dist ./dist
COPY --from=builder /workspace/ecosystem.config.cjs ./ecosystem.config.cjs

CMD ["pm2-runtime", "start", "ecosystem.config.cjs", "--env", "production"]
