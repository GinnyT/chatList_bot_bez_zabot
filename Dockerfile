ARG NODE_VERSION=18.18.2

FROM node:${NODE_VERSION}-alpine

ENV NODE_ENV production

ENV BOT_NAME chatlist_bot_bez_zabot

ENV STORAGE_LOCATION /home/node/app/storage/cl

#RUN mkdir -p /home/node/app/node_modules && chown -R node:node /home/node/app

WORKDIR /home/node/app

RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=package-lock.json,target=package-lock.json \
    --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

USER node

COPY --chown=node:node . .

RUN mkdir -p /home/node/app/storage/cl && chown -R node:node /home/node/app/storage/cl

EXPOSE 3333

CMD node start_bot.js