FROM node:20

WORKDIR /app


COPY package.json .

RUN yarn


COPY . .

EXPOSE 1337

ENV NODE_ENV=production

RUN yarn build

CMD ["yarn", "start"]