FROM node:22-alpine

WORKDIR /workspace
RUN apk add --no-cache git python3 make g++
COPY package.json yarn.lock ./
RUN yarn install --ignore-scripts
COPY . .
RUN yarn postinstall
RUN yarn build
RUN npm install pm2 -g

CMD [ "pm2-runtime", "start", "ecosystem.config.cjs", "--env", "production" ]
