ARG NODE_VERSION=20.17.0

FROM node:${NODE_VERSION}-alpine

#ENV NODE_ENV production
#ENV BOT_NAME=chatList_bot_bez_zabot
#ENV STORAGE_LOCATION /home/node/app/storage/cl
#ENV TOKEN=

WORKDIR /home/node/app


# Копируем package.json и package-lock.json в контейнер
COPY ["package.json", "package-lock.json*", "./"]
# Устанавливаем зависимости
RUN npm install
# Копируем все остальные файлы проекта в контейнер
COPY . .
USER node
COPY --chown=node:node . .
#RUN --mount=type=bind,source=package.json,target=package.json \
#    --mount=type=bind,source=package-lock.json,target=package-lock.json \
#    --mount=type=cache,target=/root/.npm \
#    npm ci --omit=dev

#RUN mkdir -p /home/node/app/storage/cl && chown -R node:node /home/node/app/storage/cl
#EXPOSE 3333

CMD ["npm", "start"]