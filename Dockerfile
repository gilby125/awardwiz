FROM node:18

WORKDIR /usr/src/awardwiz
COPY . .

RUN npm install
RUN npm run build

EXPOSE 2222
CMD ["node", "dist/server.js"]
