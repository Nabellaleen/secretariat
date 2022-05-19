FROM node:lts

WORKDIR /app

RUN chown node:node /app

# just copy the required files for npm i
COPY package.json package-lock.json .
RUN npm install

COPY --chown=node . .

USER node

EXPOSE 8100

RUN npm run build
